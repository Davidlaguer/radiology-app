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
  type RegionTag,
  type ContrastTag,
} from './prompts/templates';

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

type LlmPlan = {
  replaces: Array<{ fraseNormal: string; texto: string }>;
  adds: Array<{ fraseNormal: string; textos: string[] }>;
  loose: string[];
  notes?: string[];
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

function ensureDot(s: string) {
  const t = s.trim();
  if (!t) return t;
  return /[.:]$/.test(t) ? t : `${t}.`;
}

// =========================
// Mapeos reducidos para LLM
// =========================
function buildMapsForLLM(findingTable: FindingEntry[], fuzzy: FuzzyEntry[]) {
  const pathologicalMap: Record<string, string> = {};
  const additionalMap: Record<string, string> = {};
  const fuzzyMap: Record<string, string> = {};

  for (const row of findingTable) {
    const fn = row.frase_normal?.trim();
    if (!fn) continue;
    for (const hp of row.hallazgos_patologicos || []) {
      const key = hp.trim();
      if (key) pathologicalMap[key] = fn;
    }
    for (const ha of row.hallazgos_adicionales || []) {
      const key = ha.trim();
      if (key) additionalMap[key] = fn;
    }
  }
  for (const e of fuzzy) {
    const target = e.hallazgo_oficial?.trim();
    if (!target) continue;
    const add = (v: string) => {
      const k = v.trim();
      if (!k) return;
      fuzzyMap[k] = target;
    };
    add(target);
    for (const s of e.sinonimos || []) add(s);
    for (const err of e.errores_comunes || []) add(err);
  }

  return { pathologicalMap, additionalMap, fuzzyMap };
}

// =========================
// Deducción de etiquetas desde 1ª frase
// =========================
function autoInferTagsFromFirstSentence(first: string): { regions: RegionTag[]; contrast: ContrastTag | null } {
  const n = normalize(first);
  const regions: RegionTag[] = [];
  if (/\btc\b.*torax|t[oó]rax/.test(n)) regions.push('TC-TORAX' as RegionTag);
  if (/\btc\b.*abdomen|abdomen/.test(n)) regions.push('TC-ABDOMEN' as RegionTag);
  if (!regions.length) {
    if (/torax|t[oó]rax/.test(n)) regions.push('TC-TORAX' as RegionTag);
    if (/abdomen/.test(n)) regions.push('TC-ABDOMEN' as RegionTag);
  }

  let contrast: ContrastTag | null = null;
  if (/con\s+contraste|contraste\s*ev/.test(n)) contrast = 'CON CONTRASTE' as ContrastTag;
  else if (/sin\s+contraste|simple/.test(n)) contrast = 'SIN CONTRASTE' as ContrastTag;

  return { regions, contrast };
}

// =========================
// Filtrado plantilla base
// =========================
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

// =========================
// Agrupación/secciones + formato líneas
// =========================

// Mapea frases normales exactas → clave de sección
const SECTION_BY_NORMAL: Record<string, string> = {
  // TÓRAX
  'Estructuras mediastínicas sin alteraciones significativas.': 'thorax.mediastino',
  'Arteria pulmonar de calibre normal.': 'thorax.mediastino',
  'No se observan signos de TEP central.': 'thorax.mediastino',
  'No se observan adenopatías mediastínicas o hiliares aumentadas de tamaño.': 'thorax.adenos.mediastino_hilio',
  'No se observan adenopatías supraclaviculares o axilares aumentadas de tamaño.': 'thorax.adenos.axil_supraclav',
  'Parénquima pulmonar sin alteraciones a destacar. No se observan condensaciones de espacio aéreo ni nódulos pulmonares.': 'thorax.parenquima',
  'Espacios pleurales libres.': 'thorax.pleura',

  // ABDOMEN
  'Hígado de tamaño y morfología normal y contornos lisos.': 'abd.higado',
  'No se observan lesiones focales hepáticas.': 'abd.higado',
  'Vena porta y ramas portales intrahepáticas permeables. Venas suprahepáticas y eje esplenoportal permeable.': 'abd.vasos_hepaticos',
  'No se observa dilatación de la vía biliar intra o extrahepática.': 'abd.via_biliar',
  'Vesícula biliar sin evidencia de litiasis en su interior, engrosamientos murales o signos inflamatorios agudos.': 'abd.vesicula',
  'Bazo de tamaño y morfología normal. No se observan lesiones focales.': 'abd.bazo_pancreas_adrenales',
  'Páncreas de tamaño y morfología normales. No se observa dilatación del conducto de Wirsung.': 'abd.bazo_pancreas_adrenales',
  'Glándulas suprarrenales de tamaño y morfología normales.': 'abd.bazo_pancreas_adrenales',
  'Riñón derecho de tamaño y morfología normales.': 'abd.renales',
  'No se observan lesiones focales ni dilatación de la vía urinaria derecha.': 'abd.renales',
  'Riñón izquierdo de tamaño y morfología normales.': 'abd.renales',
  'No se observan lesiones focales ni dilatación de la vía urinaria izquierda.': 'abd.renales',
  'No se observan adenopatías intraabdominales aumentadas de tamaño.': 'abd.adenos',
  'No se observan adenopatías pélvicas o inguinales aumentadas de tamaño.': 'abd.adenos',
  'No se observan colecciones, neumoperitoneo ni líquido libre intraabdominal.': 'abd.peritoneo'
};

// Orden de secciones
const SECTION_ORDER = [
  'thorax.mediastino',
  'thorax.adenos.mediastino_hilio',
  'thorax.adenos.axil_supraclav',
  'thorax.parenquima',
  'thorax.pleura',

  // ← Doble salto justo al pasar a hígado
  'abd.higado',
  'abd.vasos_hepaticos',
  'abd.via_biliar',
  'abd.vesicula',
  'abd.bazo_pancreas_adrenales',
  'abd.renales',
  'abd.adenos',
  'abd.peritoneo'
] as const;

function formatHallazgosWithSections(lines: string[]) {
  // Bucket lines por sección (desconocidas al final, antes del cierre)
  const buckets = new Map<string, string[]>();
  for (const key of SECTION_ORDER) buckets.set(key, []);
  const unknown: string[] = [];

  const closing = (DEFAULT_CLOSING_TEXT || 'Sin otros hallazgos.').trim();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (normalize(line) === normalize(closing)) continue; // añadimos al final
    const sec = SECTION_BY_NORMAL[line];
    if (sec && buckets.has(sec)) buckets.get(sec)!.push(line);
    else unknown.push(line);
  }

  // Reconstrucción con saltos:
  // - salto simple entre secciones en general
  // - doble salto SOLO entre 'thorax.pleura' → 'abd.higado'
  const parts: string[] = [];

  for (let i = 0; i < SECTION_ORDER.length; i++) {
    const sec = SECTION_ORDER[i];
    const arr = buckets.get(sec)!;
    if (!arr.length) continue;
    parts.push(arr.join(' '));

    const next = SECTION_ORDER[i + 1];
    if (sec === 'thorax.pleura' && next === 'abd.higado') {
      parts.push(''); // línea en blanco extra (doble salto)
    }
  }

  // Luego desconocidas (sueltos clasificados/añadidos que no referencian normal)
  if (unknown.length) parts.push(unknown.join(' '));

  // Cierre final
  parts.push(closing);

  // Unir con salto de línea. Los '' en parts introducen saltos extra.
  return parts.filter(p => p !== undefined).join('\n');
}

// =========================
// Front-end con drag y modo nocturno
// =========================
export default function App() {
  const [dictado, setDictado] = useState<string>('');
  const [report, setReport] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  
  // Estados para drag
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 1ª frase → etiquetas
  const firstSentence = useMemo(() => {
    const m = dictado.split(SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean);
    return m[0] || '';
  }, [dictado]);

  const { regions, contrast } = useMemo(
    () => autoInferTagsFromFirstSentence(firstSentence),
    [firstSentence]
  );

  const title = useMemo(() => buildReportTitle(regions, contrast), [regions, contrast]);
  const technique = useMemo(() => buildTechniqueBlock(regions, contrast), [regions, contrast]);

  // plantilla base por etiquetas
  const baseNormals = useMemo(
    () => buildBaseTemplate(normalPhrases as NormalPhrase[], regions, contrast),
    [regions, contrast]
  );

  async function handleGenerate() {
    try {
      setBusy(true);
      // separar items (ignorar primera frase de tipo TC)
      const items = (dictado.match(SENTENCE_SPLIT) ? dictado.split(SENTENCE_SPLIT) : [dictado])
        .map(x => x.trim())
        .filter(Boolean);

      const onlyFindings = items.slice(1); // desde el 2º en adelante
      const templateMode = onlyFindings.some(x => normalize(x).includes('valida frases normales'));
      const filtered = onlyFindings.filter(x => {
        const n = normalize(x);
        return n !== normalize('sin otros hallazgos') && !n.includes('valida frases normales');
      });

      const maps = buildMapsForLLM(findingsJson as FindingEntry[], fuzzyLexicon as FuzzyEntry[]);

      // Llamada al backend LLM
      const plan: LlmPlan = await fetch('/api/llm-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dictadoItems: filtered,
          baseNormals,
          maps,
          templateMode
        })
      }).then(r => r.json());

      // Aplicar plan sobre baseNormals
      let working = [...baseNormals];

      // REEMPLAZOS
      const repMap = new Map<string, string>();
      for (const r of plan.replaces || []) {
        repMap.set(r.fraseNormal, ensureDot(r.texto));
      }
      working = working.map(line => repMap.get(line) || line);

      // AÑADIDOS
      const addMap = new Map<string, string[]>();
      for (const a of plan.adds || []) {
        const list = addMap.get(a.fraseNormal) || [];
        list.push(...a.textos.map(ensureDot));
        addMap.set(a.fraseNormal, list);
      }
      working = working.flatMap(line => {
        const adds = addMap.get(line) || [];
        if (adds.length) return [line, ...adds];
        return [line];
      });

      // SUELTOS
      const loose = (plan.loose || []).map(ensureDot);
      const closing = (DEFAULT_CLOSING_TEXT || 'Sin otros hallazgos.').trim();
      const hasClosing = working.some(l => normalize(l) === normalize(closing));
      if (!hasClosing) working.push(closing);
      if (loose.length) {
        const idx = working.findIndex(l => normalize(l) === normalize(closing));
        if (idx === -1) working.push(...loose);
        else working.splice(idx, 0, ...loose);
      }

      // Formateo final con secciones y saltos pedidos
      const hallazgos = formatHallazgosWithSections(working);

      const finalText =
        `${title}\n\n` +
        `${technique}\n\n` +
        `${buildHallazgosHeader()}\n` +
        `${hallazgos}`;

      setReport(finalText);
      setShowModal(true);
    } catch (e) {
      console.error(e);
      setReport('Error generando el informe.');
      setShowModal(true);
    } finally {
      setBusy(false);
    }
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
            placeholder="Inserta aquí tu dictado..."
            value={dictado}
            onChange={(e) => setDictado(e.target.value)}
            rows={12}
          />

          <button
            className="generate-button"
            onClick={handleGenerate}
            disabled={busy}
          >
            {busy ? 'Generando…' : 'Generar informe'}
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