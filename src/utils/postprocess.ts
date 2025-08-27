/* eslint-disable no-control-regex */

/**
 * Postproceso de líneas de HALLAZGOS:
 * - Reagrupa por secciones anatómicas reales
 * - Ordena las secciones en el orden clínico acordado
 * - Mantiene "Sin otros hallazgos." como cierre
 * - Formatea con saltos: doble SOLO entre pleura → hígado; resto simple
 *
 * La entrada típica son líneas sueltas con punto final.
 */

export type SectionKey =
  | 'thorax.mediastino'            // Estructuras mediastínicas...
  | 'thorax.vascular'              // Arteria pulmonar / TEP
  | 'thorax.ganglios'              // Adenopatías mediastínicas/hiliares/supraclav/axilares
  | 'thorax.parenquima'            // Parénquima pulmonar / nódulos / opacidades
  | 'thorax.pleura'                // Pleura

  | 'abd.hepatobiliar.higado'      // Hígado + lesiones focales hepáticas
  | 'abd.hepatobiliar.vasos'       // Vena porta / suprahepáticas / eje esplenoportal
  | 'abd.hepatobiliar.vias_ves'    // Vía biliar + vesícula (colelitiasis, barro, colangitis)

  | 'abd.bazo_pancreas_suprarrenal'
  | 'abd.renal_uro'
  | 'abd.ganglionar'
  | 'abd.peritoneo_mesenterio'

  | 'unknown'                      // Todo lo que no podamos clasificar

export interface PostprocessOptions {
  templateMode?: boolean; // cuando true, reagrupa y ordena todo (Norma 11)
  literalsBySection?: Partial<Record<SectionKey, string[]>>; // opcional: literales exactos -> sección
}

/** Orden clínico final de secciones dentro de HALLAZGOS */
export const SECTION_ORDER: SectionKey[] = [
  // TÓRAX
  'thorax.mediastino',
  'thorax.vascular',
  'thorax.ganglios',
  'thorax.parenquima',
  'thorax.pleura',

  // ABDOMEN
  'abd.hepatobiliar.higado',
  'abd.hepatobiliar.vasos',
  'abd.hepatobiliar.vias_ves',
  'abd.bazo_pancreas_suprarrenal',
  'abd.renal_uro',
  'abd.ganglionar',
  'abd.peritoneo_mesenterio',

  // Por si algo no encaja
  'unknown',
];

/* ------------------------ utilidades básicas ------------------------ */

export function ensureDot(s: string) {
  const t = s.trim();
  if (!t) return t;
  return /[.:]$/.test(t) ? t : `${t}.`;
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeKeepOrder<T>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of arr) {
    const key = typeof v === 'string' ? normalize(v) : JSON.stringify(v);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

function joinOneLine(lines: string[]): string {
  // Une frases en la misma línea separadas por espacio (ya llevan punto final)
  return lines.join(' ');
}

/* Extrae y aparta de un array las líneas que cumplan un regex */
function extractByRegex(lines: string[], rx: RegExp): string[] {
  const pick: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (rx.test(lines[i])) {
      pick.unshift(lines[i]);
      lines.splice(i, 1);
    }
  }
  return pick;
}

/* ------------------------ clasificación por secciones ------------------------ */

/** Mapa rápido de palabras clave → sección (fallback si no hay literal exacto) */
const KEYWORDS: Array<{ rx: RegExp; sec: SectionKey }> = [
  // Tórax: mediastino
  { rx: /\bmediast(i|í)n(ic|ic)a|mediast/i, sec: 'thorax.mediastino' },

  // Tórax: vascular
  { rx: /\barteria pulmonar|tep\b|tromboembolismo|defecto de repleci(?:o|ó)n/i, sec: 'thorax.vascular' },

  // Tórax: ganglios (mediastínicos, hiliares, supraclaviculares, axilares)
  { rx: /\b(adenopat(?:i|í)a|ganglio|ganglios).*(mediast|hiliar|supraclav|axilar)/i, sec: 'thorax.ganglios' },

  // Tórax: parénquima
  { rx: /\bpar(e|é)nquima|n[oó]dulo(s)? pulmonar|opacidad|vidrio|mosaico|consolidaci(?:o|ó)n|atelectasia|reticul/i, sec: 'thorax.parenquima' },

  // Tórax: pleura
  { rx: /\bpleur|derrame\b|pleurodesis|engrosamiento pleural/i, sec: 'thorax.pleura' },

  // Hígado
  { rx: /\bh[ií]gado|hep[aá]tic|hepato/i, sec: 'abd.hepatobiliar.higado' },

  // Vasos hepáticos
  { rx: /\bvena porta|suprahep[aá]ticas|esplenoportal/i, sec: 'abd.hepatobiliar.vasos' },

  // Vías biliares / vesícula
  { rx: /\b(v[ií]a biliar|col(e|é)doco|ves[ií]cula|colecist|barro biliar|sludge)\b/i, sec: 'abd.hepatobiliar.vias_ves' },

  // Bazo / páncreas / suprarrenales
  { rx: /\bbazo\b|esplen|p[aá]ncreas|wirsung|suprarrenal|adrenal/i, sec: 'abd.bazo_pancreas_suprarrenal' },

  // Renal y vía urinaria
  { rx: /\briñ(?:o|ó)n|rinon|v[ií]a(s)? urinaria|pielo|hidro|litiasis|microlitiasis|ureter/i, sec: 'abd.renal_uro' },

  // Ganglionar abdominal/pélvico/inguinal/retroperitoneal
  { rx: /\b(adenopat(?:i|í)a|ganglio|ganglios).*(retroperitone|para?a[oó]rtic|intraabdominal|p[ée]lvic|inguin)/i, sec: 'abd.ganglionar' },

  // Peritoneo / mesenterio
  { rx: /\bperitoneo|peritoneal|mesenterio|mesent[eé]ric|carcinomatosis|neumoperitoneo|colecci(?:o|ó)n|ascitis|grasa mesent/i, sec: 'abd.peritoneo_mesenterio' },
];

/**
 * Clasifica una línea a una sección anatómica.
 * - Primero intenta por literales exactos (si se pasan en options).
 * - Si no, usa KEYWORDS.
 */
export function classifyLine(
  line: string,
  literalsBySection?: PostprocessOptions['literalsBySection']
): SectionKey {
  const ln = line.trim();
  if (!ln) return 'unknown';

  if (literalsBySection) {
    for (const [sec, arr] of Object.entries(literalsBySection) as Array<[SectionKey, string[]]>) {
      if (!arr) continue;
      for (const lit of arr) {
        if (ln === lit.trim()) return sec;
      }
    }
  }

  for (const k of KEYWORDS) {
    if (k.rx.test(ln)) return k.sec;
  }
  return 'unknown';
}

/* ------------------------ núcleo de postproceso ------------------------ */

/**
 * Reagrupa/ordena líneas si templateMode está activo.
 * Devuelve SIEMPRE un array de líneas (con punto final).
 */
export function applyPostprocessNorms(
  lines: string[],
  opts: PostprocessOptions = {}
): string[] {
  const clean = dedupeKeepOrder(lines.map(ensureDot));

  // Separamos explícitamente el cierre
  const out = [...clean];
  let closing = '';
  for (let i = out.length - 1; i >= 0; i--) {
    if (/^Sin otros hallazgos\.$/i.test(out[i])) {
      closing = out[i];
      out.splice(i, 1);
      break;
    }
  }

  if (!opts.templateMode) {
    // Sin reagrupación: devolvemos tal cual + cierre si lo hubiera
    return closing ? [...out, closing] : out;
  }

  // ---- MODO PLANTILLA: bucket sort por secciones reales ----
  const buckets = new Map<SectionKey, string[]>();
  SECTION_ORDER.forEach(k => buckets.set(k, []));

  // Clasificar cada línea
  for (const l of out) {
    const sec = classifyLine(l, opts.literalsBySection);
    buckets.get(sec)!.push(l);
  }

  // Algunas normalizaciones dentro de grupos:
  // 1) Si en hígado se coló alguna frase vascular, muévela a "vasos"
  const spillToVessels = extractByRegex(buckets.get('abd.hepatobiliar.higado')!, /\b(vena porta|suprahep[aá]ticas|esplenoportal)\b/i);
  buckets.get('abd.hepatobiliar.vasos')!.push(...spillToVessels);

  // Ensamblado según SECTION_ORDER
  const regrouped: string[] = [];
  for (const key of SECTION_ORDER) {
    const arr = buckets.get(key)!;
    if (!arr.length) continue;
    regrouped.push(...arr);
  }

  // Añadimos el cierre al final, si existía
  if (closing) regrouped.push(closing);

  return regrouped;
}

/* ------------------------ formato final con SALTOS ------------------------ */

/**
 * Aplica el FORMATO de párrafos dentro de HALLAZGOS:
 *  - Párrafos (líneas unidas en la misma línea) en el orden clínico.
 *  - Salto simple entre párrafos, EXCEPTO doble entre:
 *      **pleura**  →  **hígado**
 *  - "Sin otros hallazgos." en línea propia al final.
 */
export function formatFindings(lines: string[]): string {
  // Aseguramos punto y sin duplicados triviales
  const clean = dedupeKeepOrder(lines.map(ensureDot));

  // Preparamos buckets para producir párrafos
  const bySection = new Map<SectionKey, string[]>();
  SECTION_ORDER.forEach(k => bySection.set(k, []));

  // Separa y retira el cierre si estuviera
  let hasClosing = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    if (/^Sin otros hallazgos\.$/i.test(clean[i])) {
      clean.splice(i, 1);
      hasClosing = true;
      break;
    }
  }

  // Clasifica (sin reordenar aquí; asumimos applyPostprocessNorms ya agrupó si templateMode)
  for (const l of clean) {
    const sec = classifyLine(l);
    bySection.get(sec)!.push(l);
  }

  // Construimos los "párrafos" (cada párrafo = líneas de una sección en misma línea)
  type Para = { section: SectionKey; text: string };
  const paras: Para[] = [];

  for (const sec of SECTION_ORDER) {
    const arr = bySection.get(sec)!;
    if (!arr.length) continue;
    paras.push({ section: sec, text: joinOneLine(arr) });
  }

  // Insertamos el cierre como último "párrafo" en línea propia
  if (hasClosing) paras.push({ section: 'unknown', text: 'Sin otros hallazgos.' });

  // Reglas de salto:
  // - Salto simple '\n' entre todos los párrafos
  // - EXCEPCIÓN: doble salto entre el párrafo cuya sección es 'thorax.pleura'
  //              y el siguiente (que será hígado si existe)
  let out = '';
  for (let i = 0; i < paras.length; i++) {
    out += paras[i].text;
    const isLast = i === paras.length - 1;
    if (isLast) break;

    const currentIsPleura = paras[i].section === 'thorax.pleura';
    if (currentIsPleura) {
      out += '\n\n'; // ← único doble salto dentro de HALLAZGOS
    } else {
      out += '\n';
    }
  }

  return out;
}