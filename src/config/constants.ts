// src/config/constants.ts
// Constantes de configuración y guía oficial de normas clínicas para la app.

// ============================
// 1) Archivos de datos
// ============================
export const DATA_FILES = {
  NORMALS: 'normalPhrases.json',
  FINDINGS: 'findings.json',
  FUZZY: 'fuzzyLexicon.json', // <- nombre definitivo del léxico difuso
  PRESETS: 'presets.json',
};

// ============================
// 2) Detección de región/contraste en el dictado (palabras clave normalizadas)
// ============================
export const CHEST_KEYWORDS_NORM = [
  'torax', 'pulmon', 'mediastino', 'hiliar', 'supraclavicular',
  'axilar', 'pleural', 'enfisema', 'tepe', 'embol', 'pulmonar'
];

export const ABDOMEN_KEYWORDS_NORM = [
  'abdomen', 'hepat', 'hepatic', 'biliar', 'vesicula', 'renal',
  'rinon', 'suprarrenal', 'pancreas', 'esplen', 'pelvi', 'inguinal', 'peritoneo'
];

export const CONTRAST_POS_NORM = ['con contraste', 'contraste iv', 'contraste ev', 'contraste'];
export const CONTRAST_NEG_NORM = ['sin contraste'];

// ============================
// 3) Patrones/regEx útiles
// ============================
export const SENTENCE_SPLIT_REGEX = /[.\n]/g;
export const END_PUNCTUATION_REGEX = /[.:]$/;
export const NEGATIVE_PLEURA_REGEX = /\b(sin\s+derrame|sin\s+liquido\s+pleural)\b/i;

// ============================
// 4) Literales y prefijos de frases normales (para postproceso)
// ============================
export const NORMAL_LINES = {
  // Pulmón / Pleura
  LUNG_PREFIX: 'Parénquima pulmonar sin alteraciones',
  PLEURA_PREFIX: 'Espacios pleurales libres',

  // Suprarrenales
  ADRENALS_BOTH_PREFIX: 'Glándulas suprarrenales de tamaño y morfología normales',
  ADRENAL_RIGHT_NORMAL: 'Glándula suprarrenal derecha de tamaño y morfología normal.',
  ADRENAL_LEFT_NORMAL: 'Glándula suprarrenal izquierda de tamaño y morfología normal.',

  // Riñones
  KIDNEY_RIGHT_PREFIX: 'Riñón derecho de tamaño y morfología',
  KIDNEY_LEFT_PREFIX: 'Riñón izquierdo de tamaño y morfología',
  KIDNEYS_PLURAL: 'Riñones de tamaño y morfología normales.',

  // Vías urinarias
  URETER_RIGHT_PREFIX: 'No se observan lesiones focales ni dilatación de la vía urinaria derecha',
  URETER_LEFT_PREFIX: 'No se observan lesiones focales ni dilatación de la vía urinaria izquierda',
  URETERS_PLURAL: 'No se observan lesiones focales ni dilatación de las vías urinarias.',
};

// ============================
// 5) Cierre por defecto (coherente con templates.ts)
// ============================
export const DEFAULT_CLOSING_TEXT = 'Sin otros hallazgos.';

// ============================
// 6) Guía oficial de normas (texto íntegro)
// ============================

export const NORMS_TEXT: string = `
GUÍA DE AGRUPACIÓN Y ORDEN ANATÓMICO PARA INFORMES TC (11 normas oficiales):
Esta guía define cómo organizar correctamente las frases normales y los hallazgos en el informe final. Debes seguir estas normas clínicas de redacción y agrupación:

✅ NORMA 1 – AGRUPACIÓN DE FRASES NORMALES
Mantén el orden anatómico clínico estándar.

Agrupa frases normales que pertenecen al mismo bloque anatómico.

Redacta el informe como texto continuo, sin encabezados.

Ejemplo – Informe de tórax y abdomen con contraste:

TECNICA:
Se realiza TC de tórax y abdomen con contraste ev.

HALLAZGOS:
Estructuras mediastínicas sin alteraciones significativas. Arteria pulmonar de calibre normal. No se observan signos de TEP central.
No se observan adenopatías mediastínicas o hiliares aumentadas de tamaño. No se observan adenopatías supraclaviculares o axilares aumentadas de tamaño.
Parénquima pulmonar sin alteraciones a destacar. No se observan condensaciones de espacio aéreo ni nódulos pulmonares.
Espacios pleurales libres.

Hígado de tamaño y morfología normal y contornos lisos. No se observan lesiones focales hepáticas.
Vena porta y ramas portales intrahepáticas permeables. Venas suprahepáticas y eje esplenoportal permeable.
No se observa dilatación de la vía biliar intra o extrahepática. Vesícula biliar sin evidencia de litiasis en su interior, engrosamientos murales o signos inflamatorios agudos.
Bazo de tamaño y morfología normal. No se observan lesiones focales. Páncreas de tamaño y morfología normales. No se observa dilatación del conducto de Wirsung. Glándulas suprarrenales de tamaño y morfología normales.
Riñón derecho de tamaño y morfología normales. No se observan lesiones focales ni dilatación de la vía urinaria derecha. Riñón izquierdo de tamaño y morfología normales. No se observan lesiones focales ni dilatación de la vía urinaria izquierda.
No se observan adenopatías intraabdominales aumentadas de tamaño. No se observan adenopatías pélvicas o inguinales aumentadas de tamaño.
No se observan colecciones, neumoperitoneo ni líquido libre intraabdominal.
Sin otros hallazgos.

✅ NORMA 2 – AÑADIR HALLAZGOS ADICIONALES DETRÁS DE LA FRASE NORMAL

Si un hallazgo adicional está relacionado con una frase normal, añádelo justo detrás de la frase normal.

Si hay otra frase normal inmediatamente después, el hallazgo adicional debe insertarse antes de ella.

Ejemplo:

Frase normal:
Estructuras mediastínicas sin alteraciones significativas.

Hallazgo adicional:
Bocio tiroideo.

Resultado:
Estructuras mediastínicas sin alteraciones significativas. Bocio tiroideo. Arteria pulmonar de calibre normal.

✅ NORMA 3 – REEMPLAZAR LA FRASE NORMAL POR HALLAZGO PATOLÓGICO

Si hay un hallazgo patológico, elimina la frase normal asociada y reemplázala por el hallazgo, en su misma posición.

Ejemplo:

Frase normal:
No se observan signos de TEP central.

Hallazgo patológico:
Se observan defectos de repleción en relación a TEP.

Resultado:
Se observan defectos de repleción en relación a TEP.

✅ NORMA 4 – PATOLOGÍA Y HALLAZGOS ADICIONALES EN LA MISMA ZONA

Si una frase normal tiene hallazgos patológicos y adicionales, primero se reemplaza por el hallazgo patológico, y luego se añaden los hallazgos adicionales.

Ejemplo:
Frase normal:
Estructuras mediastínicas sin alteraciones significativas.

Hallazgo patológico:
Desplazamiento mediastínico hacia la derecha.

Hallazgos adicionales:
Ateromatosis aortocoronaria calcificada. Bocio tiroideo.

Resultado:
Desplazamiento mediastínico hacia la derecha. Ateromatosis aortocoronaria calcificada. Bocio tiroideo. Arteria pulmonar de calibre normal.

✅ NORMA 5 – COMBINACIÓN COMPLETA

Si hay múltiples hallazgos (patológicos y adicionales) en distintas frases del mismo bloque anatómico, aplica todas las normas anteriores combinadas.

Respeta el orden original de frases normales.

Reemplaza donde toca, añade donde toca, y sigue el orden anatómico.

✅ NORMA 6 – AGRUPACIÓN EN PLURAL DE RIÑONES Y VÍAS URINARIAS

Si no hay hallazgos en:

“Riñón derecho de tamaño y morfología normales.”

“Riñón izquierdo de tamaño y morfología normales.”

“No se observan lesiones focales ni dilatación de la vía urinaria derecha.”

“No se observan lesiones focales ni dilatación de la vía urinaria izquierda.”

→ Puedes agruparlas así:
Riñones de tamaño y morfología normales.
No se observan lesiones focales ni dilatación de las vías urinarias.

⚠️ Solo está permitido si ninguna de estas frases tiene hallazgos asociados.
Si hay hallazgos, deben mantenerse por separado y aplicar las normas habituales.

✅ NORMA 7 – ELIMINACIÓN DE FRASES NORMALES EN CONFLICTO

Si un hallazgo patológico aparece en una región con frase normal (ej. “Glándulas suprarrenales normales” y luego “hiperplasia”), debes eliminar la frase normal y dejar solo el hallazgo. No pueden convivir.

✅ NORMA 8 – FRASES NORMALIZADAS DE SUSTITUCIÓN PARCIAL

Si hay un hallazgo no sospechoso (quiste, microlitiasis, granuloma…), sustituye “No se observan lesiones focales” por: “No se observan otras lesiones focales.”

✅ NORMA 9 – AGRUPACIÓN DE FRASES DUPLICADAS O REDUNDANTES

Si hay frases repetidas del mismo bloque (riñones, adenopatías, vías urinarias) sin hallazgos diferenciales, agrúpalas en plural. Ejemplo: “Riñones normales. No se observan lesiones focales ni dilatación de las vías urinarias.”

✅ NORMA 10 – BLOQUE DE PLEURA Y PARÉNQUIMA PULMONAR

Si hay atelectasias, enfisema, vidrio deslustrado o cualquier otro hallazgo en pulmones o pleura, elimina las frases normales automáticas de esos bloques. No deben aparecer.

✅ NORMA 11 – ACTIVACIÓN FORZADA DE AGRUPACIÓN POR MODO PLANTILLA

Cuando el dictado incluya la frase “valida frases normales”, además de insertar las frases normales, debes reordenar completamente el informe según la estructura anatómica oficial. Esto incluye: agrupación, pluralización, eliminación de contradicciones y aplicación de redacción profesional.
`;
