// src/App.tsx
import { useMemo, useState } from 'react';

// Datos estructurados
import normalPhrases from './data/normalPhrases.json';
import findingsJson from './data/findings.json';
import fuzzyLexicon from './data/fuzzyLexicon.json';
import presets from './data/presets.json';

// Helpers de plantillas
import {
  buildReportTitle,
  buildTechniqueBlock,
  buildHallazgosHeader,
  getSelectedRegions,
  getSelectedContrast,
  type RegionTag,
  type ContrastTag,
} from './prompts/templates';

// Postproceso y ensamblado del bloque “HALLAZGOS”
import { postprocessLines, buildFindingsBlock } from './utils/postprocess';

// Constantes
import { DEFAULT_CLOSING_TEXT } from './config/constants';

// UI
import Modal from './components/Modal';

// =========================
// Tipos
// =========================
type NormalPhrase = {
  text: string;
  regions: string[];
  contrast: string[];
};
type FindingEntry = {
  zona_anatomica: string;
  frase_normal: string;
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
// Utils
// =========================
const SENTENCE_SPLIT = /[.\n]+/g;

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
function buildBaseTemplate(
  allNormals: NormalPhrase[],
  regions: RegionTag[],
  contrast: ContrastTag | null
) {
  const lines: string[] = [];
  for (const row of allNormals) {
    const okRegion = regionsMatch(row.regions, regions);
    const okContrast = contrastMatches(row.contrast, contrast);
    if (okRegion && okContrast) lines.push(row.text.trim());
  }
  return lines;
}
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

// =========================
// App (popup compacto)
// =========================
export default function App() {
  // Estado
  const [labelsRaw, setLabelsRaw] = useState<string>('');     // etiquetas del estudio
  const [dictation, setDictation] = useState<string>('');     // dictado (de tu otra app, aquí pegado)
  const [forceTemplate, setForceTemplate] = useState<boolean>(false);
  const [report, setReport] = useState<string>('');
  const [openModal, setOpenModal] = useState<boolean>(false);

  // Derivados
  const regions = useMemo<RegionTag[]>(() => getSelectedRegions(splitTags(labelsRaw)), [labelsRaw]);
  const contrast = useMemo<ContrastTag | null>(() => getSelectedContrast(splitTags(labelsRaw)), [labelsRaw]);
  const technique = useMemo(() => buildTechniqueBlock(regions, contrast), [regions, contrast]);
  const title = useMemo(() => buildReportTitle(regions, contrast), [regions, contrast]);

  const findingCatalog = useMemo(() => buildFindingCatalog(findingsJson as FindingEntry[]), []);
  const fuzzyIndex = useMemo(() => buildFuzzyIndex(fuzzyLexicon as FuzzyEntry[]), []);

  function splitTags(s: string): string[] {
    const inBrackets = Array.from(s.matchAll(/\[([^\]]+)\]/g)).map(m => m[1]);
    if (inBrackets.length) return inBrackets;
    return s.split(/[\s,;]+/).filter(Boolean);
  }

  function handleGenerate() {
    // 1) plantilla base por etiquetas
    let baseLines = buildBaseTemplate(normalPhrases as NormalPhrase[], regions, contrast);

    // 2) parse dictado
    const rawItems = (dictation.match(SENTENCE_SPLIT) ? dictation.split(SENTENCE_SPLIT) : [dictation])
      .map(x => x.trim())
      .filter(Boolean);

    const forceByText = rawItems.some(x => normalize(x).includes('valida frases normales'));
    const templateMode = forceTemplate || forceByText;

    type MappedFinding = {
      tipo: 'patologico' | 'adicional' | 'suelto';
      zona?: string;
      fraseNormal?: string;
      texto: string;
      oficial?: string;
    };

    const mapped: MappedFinding[] = [];

    for (const item of rawItems) {
      const n = normalize(item);
      if (!n || n.includes('valida frases normales')) continue;

      let mf: MappedFinding | null = null;

      if (!mf) {
        const hitPat = findingCatalog.pathological.get(n);
        if (hitPat) mf = { tipo: 'patologico', zona: hitPat.zona, fraseNormal: hitPat.fraseNormal, texto: item };
      }
      if (!mf) {
        const hitAdd = findingCatalog.additional.get(n);
        if (hitAdd) mf = { tipo: 'adicional', zona: hitAdd.zona, fraseNormal: hitAdd.fraseNormal, texto: item };
      }
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
      if (!mf) mf = { tipo: 'suelto', texto: item };
      mapped.push(mf);
    }

    // 3) integrar
    let working = [...baseLines];
    const addQueueByNormal = new Map<string, string[]>();
    const replaceByNormal = new Map<string, string>();
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

    // reemplazos sobre base
    working = working
      .map(line => {
        const rep = replaceByNormal.get(line);
        return rep ? rep : line;
      })
      .filter(Boolean);

    // añadidos detrás de su frase normal
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

    // sueltos antes del cierre
    working = ensureClosing(working);
    if (looseFindings.length) {
      const closing = (DEFAULT_CLOSING_TEXT || 'Sin otros hallazgos.').trim();
      const idx = working.findIndex(l => normalize(l) === normalize(closing));
      if (idx === -1) working.push(...looseFindings);
      else working.splice(idx, 0, ...looseFindings);
    }

    // 4) postproceso + bloque hallazgos
    const finalLines = postprocessLines(working, { modeTemplate: templateMode });
    const hallazgosBlock = buildFindingsBlock(finalLines);

    const finalText =
      `${title}\n\n` +
      `${technique}\n\n` +
      `${buildHallazgosHeader()}\n` +
      `${hallazgosBlock}`;

    setReport(finalText);
    setOpenModal(true);
  }

  // UI: popup compacto (una sola columna, tamaño reducido)
  return (
    <div
      style={{
        width: 440,
        margin: '24px auto',
        padding: 12,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        border: '1px solid #e6e6e6',
        borderRadius: 12,
        background: '#fafafa',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>CT Report Helper</h1>
        <span style={{ fontSize: 11, color: '#888' }}>mini</span>
      </header>

      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <label style={{ fontWeight: 600, fontSize: 12 }}>Etiquetas del estudio</label>
          <input
            placeholder="[TC-TORAX] [CON CONTRASTE]  — o escribe: TC-TORAX CON CONTRASTE"
            value={labelsRaw}
            onChange={e => setLabelsRaw(e.target.value)}
            style={{ width: '100%', marginTop: 4, border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
          />
        </div>

        <div>
          <label style={{ fontWeight: 600, fontSize: 12 }}>Pega aquí el dictado</label>
          <textarea
            placeholder="Derrame pleural izquierdo. Quistes hepáticos. Valida frases normales."
            value={dictation}
            onChange={e => setDictation(e.target.value)}
            rows={5}
            style={{ width: '100%', marginTop: 4, border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#333' }}>
            <input
              type="checkbox"
              checked={forceTemplate}
              onChange={e => setForceTemplate(e.target.checked)}
            />
            <span>Forzar “valida frases normales”</span>
          </label>

          <button
            onClick={handleGenerate}
            style={{
              padding: '8px 12px',
              border: '1px solid #111',
              borderRadius: 10,
              cursor: 'pointer',
              background: '#111',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            Generar informe
          </button>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: '#888', display: 'flex', gap: 10 }}>
        <div>P: {Array.isArray(presets) ? presets.length : 0}</div>
        <div>N: {Array.isArray(normalPhrases) ? normalPhrases.length : 0}</div>
        <div>F: {Array.isArray(findingsJson) ? findingsJson.length : 0}</div>
        <div>Φ: {Array.isArray(fuzzyLexicon) ? fuzzyLexicon.length : 0}</div>
      </div>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Informe generado"
        width={760}
        footer={
          <>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(report);
              }}
              style={{ border: '1px solid #ddd', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}
            >
              Copiar
            </button>
            <button
              onClick={() => setOpenModal(false)}
              style={{ border: '1px solid #111', background: '#111', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 700 }}
            >
              Cerrar
            </button>
          </>
        }
      >
        <textarea
          readOnly
          value={report}
          rows={18}
          style={{ width: '100%', border: '1px solid #eee', borderRadius: 8, padding: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
        />
      </Modal>
    </div>
  );
}
