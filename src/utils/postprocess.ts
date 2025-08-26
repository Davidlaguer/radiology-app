
// src/utils/postprocess.ts
// Aplica las 11 normas oficiales de agrupación y redacción clínica.

import { DEFAULT_CLOSING_TEXT, NORMAL_LINES } from "../config/constants";

// =========================
// Tipos
// =========================
export type PostprocessOptions = {
  templateMode?: boolean; // activa la Norma 11
  literals?: typeof NORMAL_LINES; // opcional: literales personalizados
};

// =========================
// Función principal
// =========================
export function applyPostprocessNorms(
  lines: string[],
  options: PostprocessOptions = {}
): string[] {
  const literals = options.literals || NORMAL_LINES;
  let result = [...lines];

  // Norma 6 – Agrupación en plural de riñones y vías urinarias
  result = mergeRenalPhrases(result, literals);

  // Norma 7 – Eliminar frases normales en conflicto
  result = removeConflicts(result);

  // Norma 8 – Sustitución parcial en lesiones no sospechosas
  result = replacePartial(result);

  // Norma 9 – Agrupación de duplicados
  result = deduplicate(result);

  // Norma 10 – Bloque pleura / pulmón
  result = filterPulmonary(result, literals);

  // Norma 11 – Modo plantilla
  if (options.templateMode) {
    result = enforceTemplateMode(result);
  }

  // Norma 5 – Combinación completa (implícita en el flujo)
  result = ensureClosing(result);

  return result;
}

// =========================
// Helpers de normas
// =========================
function mergeRenalPhrases(lines: string[], literals: typeof NORMAL_LINES): string[] {
  const kidneyRight = lines.find(l => l.startsWith(literals.KIDNEY_RIGHT_PREFIX));
  const kidneyLeft = lines.find(l => l.startsWith(literals.KIDNEY_LEFT_PREFIX));
  const ureterRight = lines.find(l => l.startsWith(literals.URETER_RIGHT_PREFIX));
  const ureterLeft = lines.find(l => l.startsWith(literals.URETER_LEFT_PREFIX));

  const bothKidneys = kidneyRight && kidneyLeft;
  const bothUreters = ureterRight && ureterLeft;

  let out = [...lines];

  if (bothKidneys) {
    out = out.filter(l => !l.startsWith(literals.KIDNEY_RIGHT_PREFIX) && !l.startsWith(literals.KIDNEY_LEFT_PREFIX));
    out.push(literals.KIDNEYS_PLURAL);
  }

  if (bothUreters) {
    out = out.filter(l => !l.startsWith(literals.URETER_RIGHT_PREFIX) && !l.startsWith(literals.URETER_LEFT_PREFIX));
    out.push(literals.URETERS_PLURAL);
  }

  return out;
}

function removeConflicts(lines: string[]): string[] {
  // Norma 7 – Si hay hiperplasia y suprarrenales normales, eliminar la normal
  return lines.filter(l => {
    if (l.includes("Glándulas suprarrenales") && lines.some(x => x.match(/hiperplasia/i))) {
      return false;
    }
    return true;
  });
}

function replacePartial(lines: string[]): string[] {
  // Norma 8 – Sustituir "No se observan lesiones focales" → "No se observan otras lesiones focales"
  return lines.map(l => {
    if (l.includes("No se observan lesiones focales") && l.match(/quiste|microlitiasis|granuloma/i)) {
      return l.replace("No se observan lesiones focales", "No se observan otras lesiones focales");
    }
    return l;
  });
}

function deduplicate(lines: string[]): string[] {
  // Norma 9 – eliminar duplicados
  return Array.from(new Set(lines));
}

function filterPulmonary(lines: string[], literals: typeof NORMAL_LINES): string[] {
  // Norma 10 – Si hay patología pulmonar, eliminar la normal automática
  if (lines.some(l => l.match(/atelectasia|enfisema|vidrio/i))) {
    return lines.filter(l => !l.startsWith(literals.LUNG_PREFIX));
  }
  return lines;
}

function enforceTemplateMode(lines: string[]): string[] {
  // Norma 11 – Reordenar según estructura anatómica oficial
  // (simplificado: orden alfabético, puedes reemplazar con tu orden anatómico real)
  return [...lines].sort();
}

function ensureClosing(lines: string[]): string[] {
  const closing = DEFAULT_CLOSING_TEXT || "Sin otros hallazgos.";
  if (!lines.some(l => l.trim() === closing)) {
    return [...lines, closing];
  }
  return lines;
}

// Re-export existing functions for compatibility
export type Line = string;

export interface PostprocessOptions2 {
  modeTemplate?: boolean;
  literals?: Partial<typeof NORMAL_LINES>;
  pleuraParenchymaRule?: boolean;
  templateOrder?: string[];
  normalizeEndPunctuation?: boolean;
}

export const NORMAL_LINES2 = {
  LUNG_PREFIX:
    'Parénquima pulmonar sin alteraciones a destacar. No se observan condensaciones de espacio aéreo ni nódulos pulmonares.',
  PLEURA_PREFIX: 'Espacios pleurales libres.',
  ADRENALS_BOTH_PREFIX: 'Glándulas suprarrenales de tamaño y morfología normales',
  ADRENAL_RIGHT_NORMAL: 'Glándula suprarrenal derecha de tamaño y morfología normal.',
  ADRENAL_LEFT_NORMAL: 'Glándula suprarrenal izquierda de tamaño y morfología normal.',
  KIDNEY_RIGHT_PREFIX: 'Riñón derecho de tamaño y morfología normales.',
  KIDNEY_LEFT_PREFIX: 'Riñón izquierdo de tamaño y morfología normales.',
  KIDNEYS_PLURAL: 'Riñones de tamaño y morfología normales.',
  URETER_RIGHT_PREFIX:
    'No se observan lesiones focales ni dilatación de la vía urinaria derecha.',
  URETER_LEFT_PREFIX:
    'No se observan lesiones focales ni dilatación de la vía urinaria izquierda.',
  URETERS_PLURAL:
    'No se observan lesiones focales ni dilatación de las vías urinarias.',
  DEFAULT_CLOSING_TEXT: 'Sin otros hallazgos.',
} as const;

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
  'Estructuras mediastínicas',
  'Arteria pulmonar',
  'No se observan signos de TEP central',
  'Adenopatías mediastínicas',
  'Adenopatías supraclaviculares',
  'Parénquima pulmonar',
  'Espacios pleurales',
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

function hasPleuraPathology(lines: Line[], literals: typeof NORMAL_LINES2): boolean {
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

function hasLungParenchymaPathology(
  lines: Line[],
  literals: typeof NORMAL_LINES2
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

function groupKidneysAndUreters(lines: Line[], literals: typeof NORMAL_LINES2): Line[] {
  const out: Line[] = [];
  let hasRightKidneyNormal = false;
  let hasLeftKidneyNormal = false;
  let hasRightUreterNormal = false;
  let hasLeftUreterNormal = false;

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

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t === literals.KIDNEY_RIGHT_PREFIX) hasRightKidneyNormal = true;
    if (t === literals.KIDNEY_LEFT_PREFIX) hasLeftKidneyNormal = true;
    if (t === literals.URETER_RIGHT_PREFIX) hasRightUreterNormal = true;
    if (t === literals.URETER_LEFT_PREFIX) hasLeftUreterNormal = true;
  }

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

  for (const line of lines) {
    const t = line.trim();

    if (willGroupKidneys) {
      if (t === literals.KIDNEY_RIGHT_PREFIX || t === literals.KIDNEY_LEFT_PREFIX) {
        if (!out.includes(literals.KIDNEYS_PLURAL)) {
          out.push(literals.KIDNEYS_PLURAL);
        }
        continue;
      }
    }

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

function applyPleuraParenchymaRule(lines: Line[], literals: typeof NORMAL_LINES2): Line[] {
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

function reorderByTemplate(lines: Line[], anchors?: string[]): Line[] {
  const A = (anchors && anchors.length ? anchors : defaultOrderAnchors).map(stripAccents);

  const scored = lines.map((line, idx) => {
    const L = stripAccents(line);
    let score = A.length + idx;
    for (let i = 0; i < A.length; i++) {
      if (L.includes(A[i])) {
        score = i;
        break;
      }
    }
    return { line, idx, score };
  });

  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return scored.map((s) => s.line);
}

export function postprocessLines(
  rawLines: Line[],
  options: PostprocessOptions2 = {}
): Line[] {
  const literals = { ...NORMAL_LINES2, ...(options.literals ?? {}) };

  let lines = rawLines
    .map((s) => (options.normalizeEndPunctuation === false ? s.trim() : ensureFinalDot(s)))
    .filter((s) => s.trim().length > 0);

  lines = uniqStable(lines);

  if (options.pleuraParenchymaRule !== false) {
    lines = applyPleuraParenchymaRule(lines, literals);
  }

  lines = groupKidneysAndUreters(lines, literals);

  if (options.modeTemplate) {
    lines = reorderByTemplate(lines, options.templateOrder);
  }

  const closing = literals.DEFAULT_CLOSING_TEXT;
  const withoutClosing = lines.filter((l) => l.trim() !== closing);
  const hasClosing = lines.length !== withoutClosing.length;
  lines = withoutClosing;
  if (hasClosing) lines.push(closing);

  return lines;
}

export function buildFindingsBlock(lines: Line[]): string {
  return lines.join('\n');
}
