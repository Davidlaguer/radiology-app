
// src/utils/postprocess.ts
// Postproceso avanzado: aplica las 11 normas oficiales y orden anatómico real (bucket sort).

import { DEFAULT_CLOSING_TEXT } from "../config/constants";

// ======================
// Tipos
// ======================
export interface PostprocessOptions {
  templateMode?: boolean;
  literals?: string[]; // frases normales activas (de la plantilla base filtrada)
}

// ======================
// Orden anatómico oficial
// ======================
const SECTION_ORDER = [
  "thorax.mediastino",
  "thorax.arteria_pulmonar",
  "thorax.parenquima",
  "pleura",
  "pared_toracica",

  "hepatobiliar.higado",
  "hepatobiliar.vasos",
  "hepatobiliar.via_biliar",
  "hepatobiliar.vesicula",

  "bazo",
  "pancreas",
  "suprarrenales",

  "rinones",
  "vias_urinarias",

  "adenopatias",
  "peritoneo",
  "tubo_digestivo",
  "vascular",
  "oseo",
  "pelvico",
  "otros",

  "cierre",
];

// ======================
// Utilidades internas
// ======================
function normalizeLite(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

// ----------------------
// Clasificador por sección
// ----------------------
function classifyLine(line: string, literals: string[] = []): string {
  const l = normalizeLite(line);

  // 1) Coincidencia por literales de la plantilla base (más preciso)
  for (const lit of literals) {
    const nlit = normalizeLite(lit);
    if (!nlit) continue;
    if (l.includes(nlit)) {
      // Mapeo por ancla semántica (frases normales conocidas)
      if (/mediastinic/.test(nlit)) return "thorax.mediastino";
      if (/arteria pulmonar/.test(nlit)) return "thorax.arteria_pulmonar";
      if (/parenquima pulmonar/.test(nlit)) return "thorax.parenquima";
      if (/espacios pleurales/.test(nlit)) return "pleura";
      if (/higado|higado de tamano|hepa/.test(nlit)) return "hepatobiliar.higado";
      if (/vena porta|suprahepatic|esplenoportal/.test(nlit)) return "hepatobiliar.vasos";
      if (/via biliar|coledoc/.test(nlit)) return "hepatobiliar.via_biliar";
      if (/vesicula biliar/.test(nlit)) return "hepatobiliar.vesicula";
      if (/bazo/.test(nlit)) return "bazo";
      if (/pancreas|wirsung/.test(nlit)) return "pancreas";
      if (/suprarrenal/.test(nlit)) return "suprarrenales";
      if (/rinon/.test(nlit)) return "rinones";
      if (/via urinaria/.test(nlit)) return "vias_urinarias";
      if (/adenopati/.test(nlit)) return "adenopatias";
      if (/peritoneo/.test(nlit)) return "peritoneo";
      if (/recto|engrosamiento rectal|colitis|diverticul/.test(nlit)) return "tubo_digestivo";
      if (/degenerativ|fractura/.test(nlit)) return "oseo";
      if (/prostata|ovario|utero/.test(nlit)) return "pelvico";
      if (/sin otros hallazgos/.test(nlit)) return "cierre";
    }
  }

  // 2) Heurística por keywords (fallback seguro)
  if (/mediast/.test(l)) return "thorax.mediastino";
  if (/arteria pulmonar|defecto de replecion|tep/.test(l)) return "thorax.arteria_pulmonar";
  if (/pulmon|nodul|vidrio|atelectas|enfisem/.test(l)) return "thorax.parenquima";
  if (/pleur/.test(l)) return "pleura";
  if (/higado|hepat|hepatico/.test(l)) return "hepatobiliar.higado";
  if (/porta|suprahepatic|esplenoportal/.test(l)) return "hepatobiliar.vasos";
  if (/coledoc|biliar/.test(l)) return "hepatobiliar.via_biliar";
  if (/vesicul|colecist/.test(l)) return "hepatobiliar.vesicula";
  if (/bazo|esplen/.test(l)) return "bazo";
  if (/pancreas|wirsung|pancreat/.test(l)) return "pancreas";
  if (/suprarrenal|adrenal/.test(l)) return "suprarrenales";
  if (/rinon|renal/.test(l)) return "rinones";
  if (/ureter|urinari/.test(l)) return "vias_urinarias";
  if (/adenopat/.test(l)) return "adenopatias";
  if (/peritoneo|mesenter/.test(l)) return "peritoneo";
  if (/colon|recto|sigma|diverticul|colitis|proctitis/.test(l)) return "tubo_digestivo";
  if (/ateromatosis|aorta|vascular/.test(l)) return "vascular";
  if (/fractura|osteol|degenerativ/.test(l)) return "oseo";
  if (/prostata|ovario|utero|endometr/.test(l)) return "pelvico";
  if (/post[-\s]?iq|cambios post|post[-\s]?operatori/.test(l)) return "otros";
  if (/sin otros hallazgos/.test(l)) return "cierre";

  return "otros";
}

// ----------------------
// Normas (6–10) compactas
// ----------------------
function mergeRenalPhrases(lines: string[]): string[] {
  // Si están las 4 frases "Riñón dcho/izdo normal + sin lesiones + sin dilatación"
  const rightNormal = /riñón derecho.*tamaño y morfolog/i;
  const leftNormal = /riñón izquierdo.*tamaño y morfolog/i;
  const rightNoDil = /vía urinaria derecha/i;
  const leftNoDil = /vía urinaria izquierda/i;

  const hasRight = lines.some((l) => rightNormal.test(l));
  const hasLeft = lines.some((l) => leftNormal.test(l));
  const hasRightNoDil = lines.some((l) => rightNoDil.test(l));
  const hasLeftNoDil = lines.some((l) => leftNoDil.test(l));

  if (hasRight && hasLeft && hasRightNoDil && hasLeftNoDil) {
    const filtered = lines.filter(
      (l) =>
        !rightNormal.test(l) &&
        !leftNormal.test(l) &&
        !rightNoDil.test(l) &&
        !leftNoDil.test(l)
    );
    filtered.push(
      "Riñones de tamaño y morfología normales. No se observan lesiones focales ni dilatación de las vías urinarias."
    );
    return filtered;
  }
  return lines;
}

function removeConflicts(lines: string[]): string[] {
  // Ejemplo: si hay hiperplasia suprarrenal, elimina la línea "suprarrenales normales"
  const hasHyper = lines.some((l) => /hiperplasia adrenal|hiperplasia suprarrenal/i.test(l));
  if (!hasHyper) return lines;
  return lines.filter(
    (l) =>
      !/glándulas suprarrenales de tamaño y morfolog/i.test(l)
  );
}

function replacePartial(lines: string[]): string[] {
  return lines.map((l) => {
    if (
      /no se observan lesiones focales/i.test(l) &&
      /(quiste|granuloma|microlitiasis)/i.test(l)
    ) {
      return l.replace(
        /no se observan lesiones focales/i,
        "No se observan otras lesiones focales"
      );
    }
    return l;
  });
}

function deduplicate(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const key = normalizeLite(l);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

function filterPulmonary(lines: string[]): string[] {
  // Si hay patología pulmonar clara, elimina "Parénquima pulmonar sin alteraciones…"
  const hasPath =
    /vidrio|atelectas|engrosamiento bronq|linfangitis|neumonitis|nódul|enfisem/i.test(
      lines.join(" ")
    );
  if (!hasPath) return lines;
  return lines.filter(
    (l) => !/parénquima pulmonar sin alteraciones/i.test(l)
  );
}

// ----------------------
// enforceTemplateMode → bucket sort por secciones
// ----------------------
function enforceTemplateMode(lines: string[], literals: string[] = []): string[] {
  const buckets: Record<string, string[]> = {};
  for (const key of SECTION_ORDER) buckets[key] = [];

  for (const line of lines) {
    const section = classifyLine(line, literals);
    (buckets[section] ??= []).push(line);
  }

  const ordered: string[] = [];
  for (const key of SECTION_ORDER) ordered.push(...buckets[key]);

  return ordered;
}

// ======================
// Función principal
// ======================
export function applyPostprocessNorms(
  lines: string[],
  options: PostprocessOptions = {}
): string[] {
  let result = [...lines];

  // Normas 6–10
  result = mergeRenalPhrases(result);
  result = removeConflicts(result);
  result = replacePartial(result);
  result = deduplicate(result);
  result = filterPulmonary(result);

  // Norma 11: modo plantilla (agrupación/orden anatómico real)
  if (options.templateMode) {
    result = enforceTemplateMode(result, options.literals || []);
  }

  // Garantizar cierre
  const closing = (DEFAULT_CLOSING_TEXT || "Sin otros hallazgos.").trim();
  if (!result.some((l) => normalizeLite(l) === normalizeLite(closing))) {
    result.push(closing);
  }

  return result;
}
