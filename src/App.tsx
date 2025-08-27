// src/App.tsx
import { useMemo, useState } from 'react';

// Datos estructurados de /src/data
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

// Postproceso (aplica normas 1–11 + agregaciones finales)
import { applyPostprocessNorms } from './utils/postprocess';

// Literales
import { DEFAULT_CLOSING_TEXT } from './config/constants';

// Modal component
import Modal from './components/Modal';

// Sistema híbrido de clasificación
import { classifyWithLLM } from './services/openaiClassifier';
import { buildCatalogSubset } from './utils/buildCatalogSubset';

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

/**
 * Llama a la API de OpenAI para clasificar una frase de hallazgo.
 *
 * @param inputText - La frase de hallazgo a clasificar.
 * @param regions - Las regiones anatómicas del estudio.
 * @param contrast - El tipo de contraste del estudio.
 * @param findingsCatalog - El catálogo completo de hallazgos conocidos.
 * @param normalPhrases - La lista de frases normales.
 * @param fuzzyLexicon - El léxico de sinónimos y erratas.
 * @returns Una promesa que se resuelve con la clasificación del hallazgo.
 */
async function classifyWithOpenAI(
  inputText: string,
  regions: RegionTag[],
  contrast: ContrastTag | null,
  findingsCatalog: FindingEntry[],
  normalPhrases: NormalPhrase[],
  fuzzyLexicon: FuzzyEntry[]
): Promise<{ class_type: 'patologico' | 'adicional' | 'suelto'; target_frase_normal?: string; input_text: string }> {

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const useOpenAI = import.meta.env.VITE_USE_OPENAI === '1';

  if (!useOpenAI || !apiKey) {
    // Si no se usa OpenAI, retorna como si fuera un hallazgo suelto
    return { class_type: 'suelto', input_text: inputText };
  }

  const prompt = `
Clasifica la siguiente frase de un informe de TC como 'patologico', 'adicional' o 'suelto'.
Si es 'patologico' o 'adicional', indica la frase normal más cercana del siguiente catálogo de hallazgos:

Catálogo de Hallazgos Patológicos:
${findingsCatalog.map(f => `- ${f.hallazgos_patologicos.join(', ')} (Zona: ${f.zona_anatomica}, Frase Normal: ${f.frase_normal})`).join('\n')}

Catálogo de Hallazgos Adicionales:
${findingsCatalog.map(f => `- ${f.hallazgos_adicionales.join(', ')} (Zona: ${f.zona_anatomica}, Frase Normal: ${f.frase_normal})`).join('\n')}

Léxico Fuzzy (sinónimos/erratas):
${fuzzyLexicon.map(f => `- ${f.hallazgo_oficial} (Sinónimos: ${f.sinonimos?.join(', ') || 'N/A'}, Erratas: ${f.errores_comunes?.join(', ') || 'N/A'})`).join('\n')}

Frases Normales por Región y Contraste:
${normalPhrases.filter(np => regionsMatch(np.regions, regions) && contrastMatches(np.contrast, contrast)).map(np => `- ${np.text} (Regiones: ${np.regions.join(', ')}, Contraste: ${np.contrast.join(', ')})`).join('\n')}

Frase a clasificar: "${inputText}"

Formato de respuesta JSON: {"class_type": "...", "target_frase_normal": "..."}
Si la frase no se corresponde con ningún hallazgo patológico o adicional, responde con {"class_type": "suelto"} y omite "target_frase_normal".
Responde SÓLO con el JSON.
`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2, // Baja temperatura para respuestas más deterministas
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, response.statusText);
      return { class_type: 'suelto', input_text: inputText }; // Fallback a suelto en caso de error
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error('OpenAI API returned no content.');
      return { class_type: 'suelto', input_text: inputText };
    }

    try {
      const result = JSON.parse(content);
      if (result.class_type === 'patologico' || result.class_type === 'adicional') {
        // Busca la frase normal correspondiente en los datos originales para asegurarte de que es válida
        const matchingNormalPhrase = normalPhrases.find(
          np => normalize(np.text) === normalize(result.target_frase_normal) &&
                 regionsMatch(np.regions, regions) &&
                 contrastMatches(np.contrast, contrast)
        );

        if (matchingNormalPhrase) {
          return { ...result, target_frase_normal: matchingNormalPhrase.text, input_text: inputText };
        } else {
          // Si la frase normal encontrada por la IA no coincide con los filtros de región/contraste, tratarla como suelta
          console.warn(`OpenAI returned a matching normal phrase "${result.target_frase_normal}" which does not match current study criteria. Treating as 'suelto'.`);
          return { class_type: 'suelto', input_text: inputText };
        }
      } else {
        return { ...result, input_text: inputText };
      }
    } catch (e) {
      console.error('Failed to parse OpenAI response JSON:', e, 'Response content:', content);
      return { class_type: 'suelto', input_text: inputText }; // Fallback a suelto si el JSON es inválido
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return { class_type: 'suelto', input_text: inputText }; // Fallback a suelto en caso de error de red/fetch
  }
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

  async function handleGenerate() {
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
      if (n.includes('valida frases normales')) continue;

      let mf: MappedFinding | null = null;

      // 1) exact match en tablas
      const hitPat = findingCatalog.pathological.get(n);
      if (hitPat) {
        mf = { tipo: 'patologico', zona: hitPat.zona, fraseNormal: hitPat.fraseNormal, texto: ensureDot(item) };
      }
      const hitAdd = findingCatalog.additional.get(n);
      if (!mf && hitAdd) {
        mf = { tipo: 'adicional', zona: hitAdd.zona, fraseNormal: hitAdd.fraseNormal, texto: ensureDot(item) };
      }

      // 2) fuzzy en fuzzyLexicon
      if (!mf) {
        const fz = fuzzyIndex.get(n);
        if (fz && !(fz.excluir || []).some(ex => normalize(ex) === n)) {
          const oficialN = normalize(fz.oficial);
          const hitPat2 = findingCatalog.pathological.get(oficialN);
          const hitAdd2 = findingCatalog.additional.get(oficialN);
          if (hitPat2) mf = { tipo: 'patologico', zona: hitPat2.zona, fraseNormal: hitPat2.fraseNormal, texto: ensureDot(fz.oficial) };
          else if (hitAdd2) mf = { tipo: 'adicional', zona: hitAdd2.zona, fraseNormal: hitAdd2.fraseNormal, texto: ensureDot(fz.oficial) };
        }
      }

      // 3) si sigue suelto → llama a nuestro sistema híbrido OpenAI
      if (!mf) {
        const subsetCatalog = buildCatalogSubset(item, findingCatalog);
        if (subsetCatalog.length > 0) {
          const llmRes = await classifyWithLLM(item, subsetCatalog);
          if (llmRes.tipo === 'patologico') {
            mf = { 
              tipo: 'patologico', 
              fraseNormal: llmRes.frase_normal || undefined, 
              texto: ensureDot(llmRes.texto_final) 
            };
          } else if (llmRes.tipo === 'adicional') {
            mf = { 
              tipo: 'adicional', 
              fraseNormal: llmRes.frase_normal || undefined, 
              texto: ensureDot(llmRes.texto_final) 
            };
          } else {
            mf = { tipo: 'suelto', texto: ensureDot(llmRes.texto_final) };
          }
        } else {
          // Sin catálogo disponible, marcar como suelto
          mf = { tipo: 'suelto', texto: ensureDot(item) };
        }
      }

      mapped.push(mf as MappedFinding);
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