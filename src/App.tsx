// src/App.tsx
import React, { useMemo, useState } from 'react';

// Datos estructurados
import normalPhrases from './data/normalPhrases.json';
import findingsJson from './data/findings.json';
import fuzzyLexicon from './data/fuzzyLexicon.json';

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

// Postproceso (aplica normas + formateo final)
import { applyPostprocessNorms, ensureDot } from './utils/postprocess';

// NUEVO: formateador final de hallazgos
import { formatHallazgos } from './utils/formatter';

// Literales/constantes
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
  frase_normal: string; // puede estar vacío o "No hay ninguna frase normal..."
  hallazgo_oficial: string;
  sinonimos?: string[];
  errores_comunes?: string[];
  excluir?: string[]; // términos a NO mapear
};

// =========================
// Utilidades internas
// =========================

const SENTENCE_SPLIT = /[.]+|\n+/g;

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD') // separa acentos
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
  // La frase se incluye si alguno de sus regions aparece en studyRegions
  const set = new Set(studyRegions);
  return needed.some(r => set.has(r as RegionTag));
}

/**
 * Filtra la PLANTILLA BASE de frases normales según etiquetas (región/contraste).
 * Mantiene SOLO las frases aplicables al estudio (obligatorio).
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
      lines.push(ensureDot(row.text.trim()));
    }
  }
  return lines;
}

// Inserta "Sin otros hallazgos." si no existe ya
function ensureClosing(lines: string[]) {
  const closing = (DEFAULT_CLOSING_TEXT || 'Sin otros hallazgos.').trim();
  const has = lines.some(l => normalize(l) === normalize(closing));
  return has ? lines : [...lines, ensureDot(closing)];
}

function splitTags(s: string): string[] {
  // admite formatos como "[TC-TORAX] [CON CONTRASTE]" o solo texto
  const inBrackets = Array.from(s.matchAll(/\[([^\]]+)\]/g)).map(m => m[1]);
  if (inBrackets.length) return inBrackets;
  return s.split(/[\s,;]+/).filter(Boolean);
}

/* =========================
   Clasificador de TIPO DE TC -> etiquetas
   Se usa la PRIMERA frase del dictado para generar las etiquetas automáticamente.
========================= */

function inferTagsFromFirstSentence(first: string): string[] {
  const t = normalize(first);

  const tags: string[] = [];

  // Región
  const isTorax   = /\btorax|t[oó]rax\b/.test(t);
  const isAbdomen = /\babdomen\b/.test(t);
  const isTAbd    = /\btorax.*abdomen|abdomen.*torax|t[oó]rax.*abdomen/.test(t);

  if (isTAbd) {
    tags.push('[TC-TORAX]', '[TC-ABDOMEN]');
  } else if (isTorax) {
    tags.push('[TC-TORAX]');
  } else if (isAbdomen) {
    tags.push('[TC-ABDOMEN]');
  }

  // Contraste
  const hasContrast =
    /\bcon contraste|contrastado|ev\.?|ev\b/.test(t);
  const noContrast =
    /\bsin contraste|simple\b/.test(t);

  if (hasContrast) tags.push('[CON CONTRASTE]');
  else if (noContrast) tags.push('[SIN CONTRASTE]');

  return tags;
}

/* =========================
   Componente principal
========================= */
export default function App() {
  // UI popup simple: un solo textarea para dictado completo
  const [dictado, setDictado] = useState<string>('');
  const [report, setReport] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  
  // Estados para drag
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Índices secundarios
  const findingCatalog = useMemo(() => buildFindingCatalog(findingsJson as FindingEntry[]), []);
  const fuzzyIndex = useMemo(() => buildFuzzyIndex(fuzzyLexicon as FuzzyEntry[]), []);

  function handleGenerate() {
    // Separamos frases por punto/retorno
    const parts = (dictado.match(SENTENCE_SPLIT) ? dictado.split(SENTENCE_SPLIT) : [dictado])
      .map(x => x.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      setReport('');
      return;
    }

    // 1) La primera frase es el TIPO de TC → inferimos etiquetas
    const firstSentence = parts[0];
    const autoTags = inferTagsFromFirstSentence(firstSentence);
    const regions = getSelectedRegions(splitTags(autoTags.join(' ')));
    const contrast = getSelectedContrast(splitTags(autoTags.join(' ')));

    // 2) Plantilla base (frases normales) a partir de etiquetas
    let working = buildBaseTemplate(normalPhrases as NormalPhrase[], regions, contrast);

    // 3) Hallazgos: resto de frases (incluye posible "Valida frases normales")
    const rest = parts.slice(1);
    const forceTemplate = rest.some(x => /valida frases normales/i.test(x));

    // Parsear cada hallazgo y ubicarlo
    type MappedFinding = {
      tipo: 'patologico' | 'adicional' | 'suelto';
      zona?: string;
      fraseNormal?: string;
      texto: string;
      oficial?: string;
    };

    const mapped: MappedFinding[] = [];

    for (const raw of rest) {
      if (/valida frases normales/i.test(raw)) continue; // no es hallazgo

      const n = normalize(raw);
      if (!n) continue;

      let mf: MappedFinding | null = null;

      // exact match patológico
      const hitPat = findingCatalog.pathological.get(n);
      if (hitPat) {
        mf = { tipo: 'patologico', zona: hitPat.zona, fraseNormal: hitPat.fraseNormal, texto: ensureDot(raw) };
      }

      // exact match adicional
      if (!mf) {
        const hitAdd = findingCatalog.additional.get(n);
        if (hitAdd) {
          mf = { tipo: 'adicional', zona: hitAdd.zona, fraseNormal: hitAdd.fraseNormal, texto: ensureDot(raw) };
        }
      }

      // fuzzy
      if (!mf) {
        const fz = fuzzyIndex.get(n);
        if (fz && !(fz.excluir || []).some(ex => normalize(ex) === n)) {
          const oficialN = normalize(fz.oficial);
          const hitPat2 = findingCatalog.pathological.get(oficialN);
          const hitAdd2 = findingCatalog.additional.get(oficialN);
          if (hitPat2) {
            mf = { tipo: 'patologico', zona: hitPat2.zona, fraseNormal: hitPat2.fraseNormal, texto: ensureDot(fz.oficial), oficial: fz.oficial };
          } else if (hitAdd2) {
            mf = { tipo: 'adicional', zona: hitAdd2.zona, fraseNormal: hitAdd2.fraseNormal, texto: ensureDot(fz.oficial), oficial: fz.oficial };
          }
        }
      }

      // suelto
      if (!mf) mf = { tipo: 'suelto', texto: ensureDot(raw) };

      mapped.push(mf);
    }

    // 4) Integración sobre la plantilla
    const addQueueByNormal = new Map<string, string[]>(); // frase normal → [adicionales...]
    const replaceByNormal = new Map<string, string>();    // frase normal → patológico final
    const looseFindings: string[] = [];

    for (const mf of mapped) {
      if (mf.tipo === 'adicional' && mf.fraseNormal) {
        const list = addQueueByNormal.get(mf.fraseNormal) || [];
        list.push(mf.texto);
        addQueueByNormal.set(mf.fraseNormal, list);
      } else if (mf.tipo === 'patologico' && mf.fraseNormal) {
        replaceByNormal.set(mf.fraseNormal, mf.texto);
      } else if (mf.tipo === 'suelto') {
        looseFindings.push(mf.texto);
      }
    }

    // Reemplazos patológicos
    working = working
      .map(line => {
        const rep = replaceByNormal.get(line);
        return rep ? rep : line;
      })
      .filter(Boolean);

    // Adicionales detrás de su línea
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

    // Añadir sueltos antes de cierre
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

    // 5) Reagrupación/orden clínico si "Valida frases normales."
    working = applyPostprocessNorms(working, { templateMode: forceTemplate });

    // 6) FORMATO FINAL EXACTO DE BLOQUES / SALTOS
    const body = formatHallazgos(working, { closingText: DEFAULT_CLOSING_TEXT });

    // 7) Título y técnica
    const title = buildReportTitle(regions, contrast);
    const technique = buildTechniqueBlock(regions, contrast);

    const finalText =
      `${title}\n\n` +         // ← doble salto tras TÍTULO
      `${technique}\n\n` +     // ← doble salto tras TÉCNICA
      `${buildHallazgosHeader()}\n` + // "HALLAZGOS:" + salto simple
      `${body}`;

    setReport(finalText);
    setShowModal(true);
  }

  // Funciones para drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as Element).closest('.popup-title, .popup-icon')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Effects para drag
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  return (
    <div className={`app-container ${darkMode ? 'dark' : ''}`}>

      <div 
        className={`dictation-popup ${isDragging ? 'dragging' : ''}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`
        }}
      >
        <div 
          className="popup-header"
          onMouseDown={handleMouseDown}
        >
          <div className="popup-icon">📋</div>
          <h1 className="popup-title">GENERADOR DE INFORMES TC</h1>
          <button 
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Toggle theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="popup-content">
          <textarea
            className="dictation-textarea"
            placeholder="TC de tórax con contraste. Nódulo pulmonar... Valida frases normales."
            value={dictado}
            onChange={e => setDictado(e.target.value)}
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