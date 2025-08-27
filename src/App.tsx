
// src/App.tsx
import { useMemo, useState } from 'react';

// Datos estructurados de /src/data
import normalPhrases from './data/normalPhrases.json';
import findingsJson from './data/findings.json';
import fuzzyLexicon from './data/fuzzyLexicon.json';
import presets from './data/presets.json';

// Helpers de plantillas (TÍTULO/TÉCNICA/HALLAZGOS)
import {
  buildReportTitle,
  buildTechniqueBlock,
  buildHallazgosHeader,
  getSelectedRegions,
  getSelectedContrast,
  type RegionTag,
  type ContrastTag,
} from './prompts/templates';

// Postproceso (aplica normas 1–11 + agregaciones finales)
import { applyPostprocessNorms } from './utils/postprocess';

// Literales
import { DEFAULT_CLOSING_TEXT } from './config/constants';

// Modal component
import Modal from './components/Modal';

// =========================
// Tipos locales
// =========================
type NormalPhrase = {
  text: string;
  regions: string[];
  contrast: string[]; // 'SIEMPRE' | 'CON CONTRASTE' | 'SIN CONTRASTE'
};

type FindingEntry = {
  zona_anatomica: string;
  frase_normal: string; // puede ser "Null." en zona Otros
  hallazgos_patologicos: string[];
  hallazgos_adicionales: string[];
};

type FuzzyEntry = {
  frase_normal: string;
  hallazgo_oficial: string;
  sinonimos?: string[];
  errores_comunes?: string[];
  excluir?: string[];
};

// =========================
// Utilidades internas
// =========================

const SENTENCE_SPLIT = /[.]+|\n+/g;

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Construye catálogo de hallazgos → { tipo, zona, frase_normal }
function buildFindingCatalog(findingTable: FindingEntry[]) {
  const pathological = new Map<string, { zona: string; fraseNormal: string }>();
  const additional = new Map<string, { zona: string; fraseNormal: string }>();

  for (const row of findingTable) {
    const base = { zona: row.zona_anatomica, fraseNormal: row.frase_normal };
    for (const hp of row.hallazgos_patologicos || []) {
      pathological.set(normalize(hp), base);
    }
    for (const ha of row.hallazgos_adicionales || []) {
      additional.set(normalize(ha), base);
    }
  }
  return { pathological, additional };
}

// Construye diccionario fuzzy (sinónimo/errata) → hallazgo_oficial
function buildFuzzyIndex(fuzzyTable: FuzzyEntry[]) {
  const index = new Map<string, { oficial: string; excluir?: string[]; fraseNormal?: string }>();
  for (const e of fuzzyTable) {
    const target = e.hallazgo_oficial?.trim();
    if (!target) continue;

    const pack = { oficial: target, excluir: e.excluir, fraseNormal: e.frase_normal };
    index.set(normalize(target), pack);

    for (const s of e.sinonimos || []) index.set(normalize(s), pack);
    for (const err of e.errores_comunes || []) index.set(normalize(err), pack);
  }
  return index;
}

function contrastMatches(needed: string[], studyContrast: ContrastTag | null) {
  if (needed.includes('SIEMPRE')) return true;
  if (!studyContrast) return false;
  return needed.includes(studyContrast);
}

function regionsMatch(needed: string[], studyRegions: RegionTag[]) {
  const set = new Set(studyRegions);
  return needed.some(r => set.has(r as RegionTag));
}

/**
 * Filtra la PLANTILLA BASE de frases normales según etiquetas (región/contraste).
 */
function buildBaseTemplate(
  allNormals: NormalPhrase[],
  regions: RegionTag[],
  contrast: ContrastTag | null
) {
  const lines: string[] = [];
  for (const row of allNormals) {
    const okRegion = regionsMatch(row.regions, regions);
    const okContrast = contrastMatches(row.contrast, contrast);
    if (okRegion && okContrast) {
      lines.push(row.text.trim());
    }
  }
  return lines;
}

// Inserta "Sin otros hallazgos." si no existe ya
function ensureClosing(lines: string[]) {
  const closing = (DEFAULT_CLOSING_TEXT || 'Sin otros hallazgos.').trim();
  const has = lines.some(l => normalize(l) === normalize(closing));
  return has ? lines : [...lines, closing];
}

function ensureDot(s: string) {
  const t = s.trim();
  if (!t) return t;
  return /[.:]$/.test(t) ? t : `${t}.`;
}

/**
 * Deducción automática de etiquetas a partir de la primera frase del dictado.
 *
 * Ejemplos válidos:
 * - "TC de tórax con contraste"
 * - "TC toracoabdominal sin contraste"
 * - "TC de tórax y abdomen con contraste"
 * - "TC tórax abdomen con y sin contraste"  → prioriza "CON CONTRASTE" si aparece
 */
function parseStudyTagsFromFirstSentence(first: string): {
  regions: RegionTag[];
  contrast: ContrastTag | null;
  labelString: string; // ej. "[TC-TORAX] [TC-ABDOMEN] [CON CONTRASTE]"
} {
  const n = normalize(first);

  // Debe contener "tc"
  if (!/\btc\b/.test(n)) {
    return { regions: [], contrast: null, labelString: '' };
  }

  // Regiones
  const regionsSet = new Set<RegionTag>();

  // TÓRAX
  if (/\btorax\b|\bt[oó]rax\b/.test(n)) {
    regionsSet.add('TC-TORAX' as RegionTag);
  }
  // ABDOMEN (incluye abdomen-pelvis / toracoabdominal / abdominopélvico)
  if (
    /\babdomen\b|\babdominal\b|\babdominopelv|abdomen y pelvis|abdomino[-\s]?p[eé]lvic/.test(n) ||
    /\btoracoabdominal\b/.test(n)
  ) {
    regionsSet.add('TC-ABDOMEN' as RegionTag);
  }

  // "toracoabdominal" → añade tórax si no estaba
  if (/\btoracoabdominal\b/.test(n)) {
    regionsSet.add('TC-TORAX' as RegionTag);
  }

  // Contraste
  let contrast: ContrastTag | null = null;
  if (/\bcon contraste\b|\bcon realce\b|\bcon iv\b/.test(n)) {
    contrast = 'CON CONTRASTE' as ContrastTag;
  }
  if (/\bsin contraste\b|\bsin iv\b|\bsin realce\b/.test(n)) {
    if (!contrast) contrast = 'SIN CONTRASTE' as ContrastTag;
  }

  // Label string sólo informativa
  const labelString =
    Array.from(regionsSet)
      .map(r => `[${r}]`)
      .concat(contrast ? [`[${contrast}]`] : [])
      .join(' ') || '';

  return { regions: Array.from(regionsSet), contrast, labelString };
}

/**
 * Separa el dictado en:
 *  - firstLine: primera frase (tipo de TC)
 *  - findingsList: el resto (hallazgos, como lista)
 */
function splitDictation(raw: string): { firstLine: string; findingsList: string[] } {
  const parts = (raw.match(SENTENCE_SPLIT) ? raw.split(SENTENCE_SPLIT) : [raw])
    .map(x => x.trim())
    .filter(Boolean);

  const firstLine = parts[0] || '';
  const findingsList = parts.slice(1);
  return { firstLine, findingsList };
}

// =========================
// Componente principal
// =========================
export default function App() {
  // Un único cuadro de texto para **todo** el dictado
  const [dictationRaw, setDictationRaw] = useState<string>('');
  const [report, setReport] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);

  // Índices (memo)
  const findingCatalog = useMemo(() => buildFindingCatalog(findingsJson as FindingEntry[]), []);
  const fuzzyIndex = useMemo(() => buildFuzzyIndex(fuzzyLexicon as FuzzyEntry[]), []);

  // 1) Separa primera frase (tipo de TC) vs resto (hallazgos como lista)
  const { firstLine, findingsList } = useMemo(() => splitDictation(dictationRaw), [dictationRaw]);

  // 2) Deducción de etiquetas desde primera frase
  const auto = useMemo(() => parseStudyTagsFromFirstSentence(firstLine), [firstLine]);

  // 3) Construcción de título y técnica usando helpers oficiales
  const regions = useMemo<RegionTag[]>(
    () => getSelectedRegions(auto.regions as string[]),
    [auto.regions]
  );
  const contrast = useMemo<ContrastTag | null>(
    () => getSelectedContrast(auto.contrast ? [auto.contrast] : []),
    [auto.contrast]
  );
  const technique = useMemo(() => buildTechniqueBlock(regions, contrast), [regions, contrast]);
  const title = useMemo(() => buildReportTitle(regions, contrast), [regions, contrast]);

  function handleGenerate() {
    // 0) Validaciones mínimas
    if (!firstLine.trim()) {
      setReport('⚠️ La primera frase debe indicar el tipo de TC (por ejemplo: "TC de tórax con contraste").');
      setShowModal(true);
      return;
    }

    // 1) Construir base de frases normales según etiquetas
    let baseLines = buildBaseTemplate(normalPhrases as NormalPhrase[], regions, contrast);

    // 2) Procesar hallazgos dictados (resto de frases)
    const rawItems = findingsList.map(x => x.trim()).filter(Boolean);

    // Detectar activación por texto: si la **última** frase incluye "valida frases normales"
    const last = rawItems[rawItems.length - 1] || '';
    const templateMode = /valida\s+frases\s+normales/i.test(last);
    const itemsForMapping = templateMode ? rawItems.slice(0, -1) : rawItems;

    // Normalizar y mapear cada hallazgo a {tipo, zona, fraseNormal, texto}
    type MappedFinding = {
      tipo: 'patologico' | 'adicional' | 'suelto';
      zona?: string;
      fraseNormal?: string;
      texto: string; // texto final a insertar
      oficial?: string; // el hallazgo oficial si proviene de fuzzy
    };

    const mapped: MappedFinding[] = [];

    for (const item of itemsForMapping) {
      const n = normalize(item);
      if (!n) continue;

      // 2.a) exact match en tablas
      let mf: MappedFinding | null = null;

      if (!mf) {
        // patológico exacto
        const hitPat = findingCatalog.pathological.get(n);
        if (hitPat) mf = { tipo: 'patologico', zona: hitPat.zona, fraseNormal: hitPat.fraseNormal, texto: item };
      }
      if (!mf) {
        // adicional exacto
        const hitAdd = findingCatalog.additional.get(n);
        if (hitAdd) mf = { tipo: 'adicional', zona: hitAdd.zona, fraseNormal: hitAdd.fraseNormal, texto: item };
      }

      // 2.b) fuzzy → mapear a oficial y volver a buscar en catálogo por oficial
      if (!mf) {
        const fz = fuzzyIndex.get(n);
        if (fz && !(fz.excluir || []).some(ex => normalize(ex) === n)) {
          const oficialN = normalize(fz.oficial);
          const hitPat = findingCatalog.pathological.get(oficialN);
          const hitAdd = findingCatalog.additional.get(oficialN);
          if (hitPat) mf = { tipo: 'patologico', zona: hitPat.zona, fraseNormal: hitPat.fraseNormal, texto: fz.oficial, oficial: fz.oficial };
          else if (hitAdd) mf = { tipo: 'adicional', zona: hitAdd.zona, fraseNormal: hitAdd.fraseNormal, texto: fz.oficial, oficial: fz.oficial };
        }
      }

      // 2.c) si no encaja en nada, queda como suelto (va antes del cierre)
      if (!mf) {
        mf = { tipo: 'suelto', texto: item };
      }

      mapped.push(mf);
    }

    // 3) Aplicar reglas de integración:
    //    - patológico reemplaza su frase normal
    //    - adicional se añade detrás de la frase normal SIN borrarla
    //    - suelto va justo antes de "Sin otros hallazgos."
    let working = [...baseLines];

    const addQueueByNormal = new Map<string, string[]>(); // frase normal → [adicionales...]
    const replaceByNormal = new Map<string, string>();    // frase normal → patológico final
    const looseFindings: string[] = [];

    for (const mf of mapped) {
      if (mf.tipo === 'adicional' && mf.fraseNormal) {
        const list = addQueueByNormal.get(mf.fraseNormal) || [];
        list.push(ensureDot(mf.texto));
        addQueueByNormal.set(mf.fraseNormal, list);
      } else if (mf.tipo === 'patologico' && mf.fraseNormal) {
        replaceByNormal.set(mf.fraseNormal, ensureDot(mf.texto));
      } else if (mf.tipo === 'suelto') {
        looseFindings.push(ensureDot(mf.texto));
      }
    }

    // 3.a) aplicar REEMPLAZOS patológicos sobre la base
    working = working
      .map(line => {
        const rep = replaceByNormal.get(line);
        return rep ? rep : line;
      })
      .filter(Boolean);

    // 3.b) aplicar AÑADIDOS detrás de su frase normal (si no fue reemplazada)
    working = working.flatMap(line => {
      const rep = replaceByNormal.get(line);
      if (rep) {
        const adds = addQueueByNormal.get(line) || [];
        return [rep, ...adds];
      } else {
        const adds = addQueueByNormal.get(line) || [];
        if (adds.length) return [line, ...adds];
        return [line];
      }
    });

    // 3.c) añadir hallazgos sueltos al final (antes de la frase de cierre)
    working = ensureClosing(working);
    if (looseFindings.length) {
      const closing = (DEFAULT_CLOSING_TEXT || 'Sin otros hallazgos.').trim();
      const idx = working.findIndex(l => normalize(l) === normalize(closing));
      if (idx === -1) {
        working.push(...looseFindings);
      } else {
        working.splice(idx, 0, ...looseFindings);
      }
    }

    // 4) MODO PLANTILLA (Norma 11) si la última frase era "Valida frases normales."
    working = applyPostprocessNorms(working, {
      templateMode: templateMode,
      // PASO CLAVE: pasar las frases normales activas como anclas semánticas
      literals: baseLines,
    });

    // 5) Construir salida con formato obligatorio
    const body = working.join(' ');
    const finalText =
      `${title}\n\n` +
      `${technique}\n\n` +
      `${buildHallazgosHeader()}\n` +
      `${body}`;

    setReport(finalText);
    setShowModal(true);
  }

  return (
    <div className="app-container">

      <div className="dictation-popup">
        <div className="popup-header">
          <div className="popup-icon">📋</div>
          <h1 className="popup-title">GENERADOR DE INFORMES TC</h1>
        </div>
        
        <div className="popup-content">
          <textarea
            className="dictation-textarea"
            placeholder="Inserta aquí tu dictado"
            value={dictationRaw}
            onChange={e => setDictationRaw(e.target.value)}
            rows={12}
          />
          
          <button
            className="generate-button"
            onClick={handleGenerate}
          >
            Generar informe
          </button>
        </div>
      </div>

      <Modal 
        open={showModal} 
        onClose={() => setShowModal(false)}
        title="Informe TC generado"
        width={800}
        footer={
          <button 
            className="btn-secondary" 
            onClick={() => setShowModal(false)}
          >
            Cerrar
          </button>
        }
      >
        <textarea
          className="report-textarea"
          readOnly
          value={report}
          rows={25}
        />
      </Modal>
    </div>
  );
}
