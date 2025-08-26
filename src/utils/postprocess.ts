// src/utils/postprocess.ts
// ============================================================
// Aplicación de normas de redacción/agrupación para informes TC
// a partir de un array de líneas ya generadas por tu pipeline.
// Este módulo NO inventa texto: solo ordena, agrupa y limpia.
// ============================================================

export type Line = string;

export interface PostprocessOptions {
  /** Activa la NORMA 11 (Modo plantilla: reordenar por orden anatómico) */
  modeTemplate?: boolean;
  /**
   * Permite redefinir los literales usados para detectar/agrupiar riñones y vías urinarias.
   * Si tus frases normales oficiales varían mínimamente, pásalas aquí.
   */
  literals?: Partial<typeof NORMAL_LINES>;
  /** Si true (por defecto), aplica la NORMA 10 (pleura/parénquima) para eliminar normales en conflicto. */
  pleuraParenchymaRule?: boolean;
  /**
   * Orden anatómico deseado (solo si modeTemplate = true).
   * Es una lista de "anclas" (cadenas) que se buscarán en cada línea para asignarles un índice y ordenar.
   * Si no se proporciona, se usa un orden por defecto razonable.
   */
  templateOrder?: string[];
  /** Normaliza el punto final de cada línea (añade punto si falta). Por defecto: true */
  normalizeEndPunctuation?: boolean;
}

/**
 * Literales de frases normales que usamos como “anclas”.
 * ¡Ajusta estos textos a la versión EXACTA que tengas en normalPhrases.json!
 */
export const NORMAL_LINES = {
  // Parénquima y pleura
  LUNG_PREFIX:
    'Parénquima pulmonar sin alteraciones a destacar. No se observan condensaciones de espacio aéreo ni nódulos pulmonares.',
  PLEURA_PREFIX: 'Espacios pleurales libres.',

  // Suprarrenales (para lateralidad y consistencia en algunos flujos)
  ADRENALS_BOTH_PREFIX: 'Glándulas suprarrenales de tamaño y morfología normales',
  ADRENAL_RIGHT_NORMAL: 'Glándula suprarrenal derecha de tamaño y morfología normal.',
  ADRENAL_LEFT_NORMAL: 'Glándula suprarrenal izquierda de tamaño y morfología normal.',

  // Riñones
  KIDNEY_RIGHT_PREFIX: 'Riñón derecho de tamaño y morfología normales.',
  KIDNEY_LEFT_PREFIX: 'Riñón izquierdo de tamaño y morfología normales.',
  KIDNEYS_PLURAL: 'Riñones de tamaño y morfología normales.',

  // Vías urinarias
  URETER_RIGHT_PREFIX:
    'No se observan lesiones focales ni dilatación de la vía urinaria derecha.',
  URETER_LEFT_PREFIX:
    'No se observan lesiones focales ni dilatación de la vía urinaria izquierda.',
  URETERS_PLURAL:
    'No se observan lesiones focales ni dilatación de las vías urinarias.',

  // Cierre por defecto
  DEFAULT_CLOSING_TEXT: 'Sin otros hallazgos.',
} as const;

// Utilidades internas ---------------------------------------

const stripAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const endsWithSentencePunct = (s: string) => /[.!?…]$/.test(s.trim());

const ensureFinalDot = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  if (endsWithSentencePunct(t)) return t;
  // Si termina en ":" no añadimos punto
  if (/:$/.test(t)) return t;
  return t + '.';
};

const uniqStable = (arr: Line[]) => {
  const seen = new Set<string>();
  const out: Line[] = [];
  for (const line of arr) {
    const key = line.trim();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(line);
    }
  }
  return out;
};

const defaultOrderAnchors: string[] = [
  // TÓRAX
  'Estructuras mediastínicas',
  'Arteria pulmonar',
  'No se observan signos de TEP central',
  'Adenopatías mediastínicas',
  'Adenopatías supraclaviculares',
  'Parénquima pulmonar',
  'Espacios pleurales',

  // ABDOMEN
  'Hígado de tamaño y morfología',
  'No se observan lesiones focales hepáticas',
  'Vena porta',
  'No se observa dilatación de la vía biliar',
  'Vesícula biliar',
  'Bazo de tamaño y morfología',
  'Páncreas de tamaño y morfología',
  'Glándulas suprarrenales de tamaño y morfología',
  'Riñón derecho',
  'No se observan lesiones focales ni dilatación de la vía urinaria derecha',
  'Riñón izquierdo',
  'No se observan lesiones focales ni dilatación de la vía urinaria izquierda',
  'No se observan adenopatías intraabdominales',
  'No se observan adenopatías pélvicas o inguinales',
  'No se observan colecciones, neumoperitoneo',
];

/**
 * Devuelve true si existe AL MENOS un hallazgo “no normal” en el bloque pleura,
 * es decir, cualquier línea que NO sea exactamente la frase normal de pleura pero contenga
 * términos pleurales frecuentes.
 */
function hasPleuraPathology(lines: Line[], literals: typeof NORMAL_LINES): boolean {
  const normal = literals.PLEURA_PREFIX.trim();
  const trig = [
    'derrame',
    'engrosamiento pleural',
    'engrosamientos pleurales',
    'pleurodesis',
    'calcificaciones pleurales',
    'placas pleurales',
    'líquido pleural',
    'liquido pleural',
  ];
  return lines.some((raw) => {
    const line = raw.trim();
    if (!line || line === normal) return false;
    const L = stripAccents(line);
    return trig.some((w) => L.includes(stripAccents(w)));
  });
}

/**
 * Devuelve true si existe AL MENOS un hallazgo “no normal” en el bloque parénquima,
 * es decir, cualquier línea que NO sea exactamente la frase normal de parénquima pero
 * contenga términos pulmonares patológicos frecuentes.
 */
function hasLungParenchymaPathology(
  lines: Line[],
  literals: typeof NORMAL_LINES
): boolean {
  const normal = literals.LUNG_PREFIX.trim();
  const trig = [
    'enfisema',
    'vidrio',
    'condensacion',
    'condensación',
    'nódulo',
    'nodulo',
    'nódulos',
    'nodulos',
    'masa',
    'metástasis',
    'metastasis',
    'linfangitis',
    'engrosamientos bronquiales',
    'broncopatía',
    'broncopatia',
    'opacidades',
    'patron intersticial',
    'patrón intersticial',
    'reticulacion',
    'reticulación',
    'engrosamientos septales',
  ];
  return lines.some((raw) => {
    const line = raw.trim();
    if (!line || line === normal) return false;
    const L = stripAccents(line);
    return trig.some((w) => L.includes(stripAccents(w)));
  });
}

/**
 * NORMA 6 — Agrupar en plural riñones y vías urinarias SI Y SOLO SI:
 * - están presentes las dos frases normales
 * - NO hay hallazgos patológicos que afecten a esas líneas
 */
function groupKidneysAndUreters(lines: Line[], literals: typeof NORMAL_LINES): Line[] {
  const out: Line[] = [];
  let hasRightKidneyNormal = false;
  let hasLeftKidneyNormal = false;
  let hasRightUreterNormal = false;
  let hasLeftUreterNormal = false;

  // Detectar si hay alguna línea que parezca patológica para riñón/vías
  const kidneyPathologyTriggers = [
    'atrofia',
    'nefrectom',
    'hipoplasia',
    'tumor',
    'masa renal',
    'pielonefritis',
    'litiasis',
    'quiste',
    'quistes',
    'cicatriz',
    'cicatrices',
    'aumentado de tamaño',
    'signos inflamatorios',
  ].map(stripAccents);

  const ureterPathologyTriggers = [
    'ectasia',
    'hidronefrosis',
    'dilatación de pelvis',
    'dilatacion de pelvis',
    'ureterohidronefrosis',
    'pelvis extrarrenal',
    'sindome de la union',
    'síndrome de la unión',
    'engrosamiento urotelial',
    'tumor de vías',
    'tumor de vias',
  ].map(stripAccents);

  // Recorremos y marcamos presencia de literales normales
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t === literals.KIDNEY_RIGHT_PREFIX) hasRightKidneyNormal = true;
    if (t === literals.KIDNEY_LEFT_PREFIX) hasLeftKidneyNormal = true;
    if (t === literals.URETER_RIGHT_PREFIX) hasRightUreterNormal = true;
    if (t === literals.URETER_LEFT_PREFIX) hasLeftUreterNormal = true;
  }

  // Comprobamos si hay patología que impida agrupar
  const textAll = lines.map((s) => stripAccents(s));
  const forbidKidneys =
    textAll.some((L) =>
      kidneyPathologyTriggers.some((w) => L.includes(w))
    ) === true;
  const forbidUreters =
    textAll.some((L) =>
      ureterPathologyTriggers.some((w) => L.includes(w))
    ) === true;

  const willGroupKidneys =
    hasRightKidneyNormal && hasLeftKidneyNormal && !forbidKidneys;
  const willGroupUreters =
    hasRightUreterNormal && hasLeftUreterNormal && !forbidUreters;

  // Construir resultado
  for (const line of lines) {
    const t = line.trim();

    // Agrupación de riñones
    if (willGroupKidneys) {
      if (t === literals.KIDNEY_RIGHT_PREFIX || t === literals.KIDNEY_LEFT_PREFIX) {
        // omitimos estas líneas, pero añadimos solo UNA vez la plural
        if (!out.includes(literals.KIDNEYS_PLURAL)) {
          out.push(literals.KIDNEYS_PLURAL);
        }
        continue;
      }
    }

    // Agrupación de vías urinarias
    if (willGroupUreters) {
      if (t === literals.URETER_RIGHT_PREFIX || t === literals.URETER_LEFT_PREFIX) {
        if (!out.includes(literals.URETERS_PLURAL)) {
          out.push(literals.URETERS_PLURAL);
        }
        continue;
      }
    }

    out.push(line);
  }

  return out;
}

/**
 * NORMA 10 — Si hay hallazgos en pulmones o pleura, eliminar las frases normales automáticas de esos bloques.
 */
function applyPleuraParenchymaRule(lines: Line[], literals: typeof NORMAL_LINES): Line[] {
  const pleuraBad = hasPleuraPathology(lines, literals);
  const lungBad = hasLungParenchymaPathology(lines, literals);
  if (!pleuraBad && !lungBad) return lines.slice();

  return lines.filter((raw) => {
    const t = raw.trim();
    if (!t) return false;
    if (pleuraBad && t === literals.PLEURA_PREFIX) return false;
    if (lungBad && t === literals.LUNG_PREFIX) return false;
    return true;
  });
}

/**
 * NORMA 11 — Reordenación “Modo plantilla”.
 * Dado un set de anclas (templateOrder), ordena las líneas según la primera
 * ancla que coincida (includes). Líneas sin ancla quedan al final,
 * manteniendo su orden relativo (estable).
 */
function reorderByTemplate(lines: Line[], anchors?: string[]): Line[] {
  const A = (anchors && anchors.length ? anchors : defaultOrderAnchors).map(stripAccents);

  const scored = lines.map((line, idx) => {
    const L = stripAccents(line);
    let score = A.length + idx; // por defecto: abajo, estable
    for (let i = 0; i < A.length; i++) {
      if (L.includes(A[i])) {
        score = i; // cuanto menor, antes aparece
        break;
      }
    }
    return { line, idx, score };
  });

  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return scored.map((s) => s.line);
}

/**
 * Aplica limpieza general y las normas solicitadas sobre el array de líneas.
 * Devuelve un NUEVO array.
 */
export function postprocessLines(
  rawLines: Line[],
  options: PostprocessOptions = {}
): Line[] {
  const literals = { ...NORMAL_LINES, ...(options.literals ?? {}) };

  // 1) Limpiar, normalizar espacios y opcionalmente el punto final
  let lines = rawLines
    .map((s) => (options.normalizeEndPunctuation === false ? s.trim() : ensureFinalDot(s)))
    .filter((s) => s.trim().length > 0);

  // 2) Quitar duplicados exactos (estables)
  lines = uniqStable(lines);

  // 3) NORMA 10 — pleura y parénquima
  if (options.pleuraParenchymaRule !== false) {
    lines = applyPleuraParenchymaRule(lines, literals);
  }

  // 4) NORMA 6 — agrupar riñones y vías urinarias
  lines = groupKidneysAndUreters(lines, literals);

  // 5) NORMA 11 — reordenar por anclaje anatómico si hace falta
  if (options.modeTemplate) {
    lines = reorderByTemplate(lines, options.templateOrder);
  }

  // 6) Garantizar que el cierre DEFAULT quede ÚNICO y al final si aparece
  const closing = literals.DEFAULT_CLOSING_TEXT;
  const withoutClosing = lines.filter((l) => l.trim() !== closing);
  const hasClosing = lines.length !== withoutClosing.length;
  lines = withoutClosing;
  if (hasClosing) lines.push(closing);

  return lines;
}

/**
 * Devuelve el bloque listo para renderizar bajo “HALLAZGOS:”
 * - Une cada línea con salto de línea real.
 * - No añade encabezados ni texto extra.
 */
export function buildFindingsBlock(lines: Line[]): string {
  return lines.join('\n');
}
