// src/utils/formatter.ts
//
// Formateador final del bloque HALLAZGOS:
// - Clasifica cada línea en buckets anatómicos robustos.
// - Elimina frases normales que contradicen a un hallazgo del mismo bucket.
// - Reconstruye el bloque con el ORDEN y SALTOS EXACTOS que pediste:
//   · Doble salto solo entre "pleura" → "hígado" (y, fuera del bloque, tras TÍTULO/TECNICA/HALLAZGOS).
//   · Resto en salto simple.
// - Combina sub-bloques en una sola línea cuando procede (p.ej. mediastino+arteria+TEP; ganglios torácicos; bazo+páncreas+adrenales; riñones).
//
// Nota: trabaja sobre un array de frases "finales" (ya sustituidas/añadidas por tu pipeline).

type BucketKey =
  // TÓRAX
  | 'thorax.mediastino'
  | 'thorax.arteria'
  | 'thorax.tep'
  | 'thorax.adenos.med_hiliares'
  | 'thorax.adenos.axil_supraclav'
  | 'thorax.parenquima'
  | 'thorax.pleura'
  // ABDOMEN
  | 'liver.parenquima'
  | 'liver.vessels'
  | 'biliary.gb'
  | 'spa.bazo'
  | 'spa.pancreas'
  | 'spa.adrenales'
  | 'renal.der'
  | 'renal.izq'
  | 'abd.adenos'
  | 'pelvis.adenos'
  | 'peritoneo'
  // OTROS (sin plantilla)
  | 'otros';

const CLOSING_FALLBACK = 'Sin otros hallazgos.';

// Normalizador
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Clasificación por keywords seguras ---
function classifyLine(raw: string): BucketKey {
  const n = normalize(raw);

  // Cierre (lo manejamos fuera aquí; si llega, lo enviaremos al final)
  if (n === normalize(CLOSING_FALLBACK)) return 'otros';

  // Tórax
  if (/mediastin|hiliar/i.test(n) && /estructura|significativa|no se observan|adenopati/i.test(n)) {
    // Esta normal suele ir junto a arteria/TEP en G1, pero si es de adenos mediastino/hiliares
    if (/adenopat/i.test(n)) return 'thorax.adenos.med_hiliares';
    return 'thorax.mediastino';
  }
  if (/arteria pulmonar|calibre normal/i.test(n)) return 'thorax.arteria';
  if (/\btep\b|tromboembol|defecto de reple/i.test(n)) return 'thorax.tep';
  if (/supraclavicul|axilar/i.test(n)) return 'thorax.adenos.axil_supraclav';
  if (/parenquima pulmonar|condensacion|condensaciones|nodulos? pulmon/i.test(n) || /n[oó]dulo pulmon/i.test(n)) {
    return 'thorax.parenquima';
  }
  if (/pleural|pleura|derrame/i.test(n)) return 'thorax.pleura';

  // Hígado/vías
  if (/h[ií]gado|hep[aá]tic/i.test(n)) {
    // Venas/porta/esplenoportal
    if (/vena porta|suprahepat|esplenoportal|permeable/i.test(n)) return 'liver.vessels';
    // Vía biliar / vesícula pueden colarse aquí, filtramos abajo
    if (/via biliar|ves[ií]cula/i.test(n)) {
      return 'biliary.gb';
    }
    return 'liver.parenquima';
  }
  // Vía biliar + vesícula explícitas
  if (/via biliar|ves[ií]cula/i.test(n)) return 'biliary.gb';

  // Bazo / páncreas / adrenales
  if (/bazo/i.test(n)) return 'spa.bazo';
  if (/p[aá]ncreas|wirsung/i.test(n)) return 'spa.pancreas';
  if (/suprarrenal|adrenal/i.test(n)) return 'spa.adrenales';

  // Renal / vía urinaria
  if (/ri[nñ][oó]n derech|v[ií]a urinaria derech/i.test(n)) return 'renal.der';
  if (/ri[nñ][oó]n izquierd|v[ií]a urinaria izquierd/i.test(n)) return 'renal.izq';
  if (/ur[eé]ter|urotel/i.test(n)) {
    // No tenemos normal específica de uréter → dejamos que caiga en el bucket renal adecuado por contexto:
    if (/izquierd/i.test(n)) return 'renal.izq';
    if (/derech/i.test(n)) return 'renal.der';
    return 'renal.der'; // por defecto en renal
  }

  // Adenopatías abdomen/pelvis
  if (/adenopat[ií]as? intraabdominal|intra-abdominal/i.test(n)) return 'abd.adenos';
  if (/adenopat[ií]as? p[eé]lvic|inguinal/i.test(n)) return 'pelvis.adenos';

  // Peritoneo / colecciones / neumoperitoneo
  if (/coleccion|neumoperitoneo|l[ií]quido libre intraabdominal|ascitis/i.test(n)) return 'peritoneo';

  // OTROS (mama, tiroides, osteo, vascular extra, ciego, senos, etc.)
  if (/mama|marcador met[aá]lico|tiroid|bocio|columna|vertebr|lesiones [oó]seas|aortoiliac|aortoil[ií]ac|ciego|diverticul|senos? paranasal|sinusal|vejiga|pr[oó]stata/i.test(n)) {
    return 'otros';
  }

  // fallback
  return 'otros';
}

// --- Detección de "normal negadora" para suprimir si hay patología en el bucket ---
const normalMatchersByBucket: Partial<Record<BucketKey, RegExp[]>> = {
  'thorax.mediastino': [/estructuras mediast/i],
  'thorax.arteria': [/arteria pulmonar de calibre normal/i],
  'thorax.tep': [/no se observan signos de tep|no.*defecto de reple/i],
  'thorax.adenos.med_hiliares': [/no se observan adenopat[ií]as mediast[ií]nicas|hiliares/i],
  'thorax.adenos.axil_supraclav': [/no se observan adenopat[ií]as supraclav|axilar/i],
  'thorax.parenquima': [/parenquima pulmonar sin alteraciones|no se observan condensaciones.*nodul/i],
  'thorax.pleura': [/espacios pleurales libres/i],
  'liver.parenquima': [/no se observan lesiones focales hep[aá]ticas/i],
  'liver.vessels': [/vena porta.*permeable|suprahepat|esplenoportal .* permeable/i],
  'biliary.gb': [/no se observa dilataci[oó]n de la v[ií]a biliar|ves[ií]cula biliar sin evidencia de litiasis/i],
  'spa.bazo': [/bazo de tama/i],
  'spa.pancreas': [/p[aá]ncreas de tama/i],
  'spa.adrenales': [/gl[aá]ndulas suprarrenales de tama/i],
  'renal.der': [/ri[nñ][oó]n derecho de tama|no se observan lesiones.*v[ií]a urinaria derecha/i],
  'renal.izq': [/ri[nñ][oó]n izquierdo de tama|no se observan lesiones.*v[ií]a urinaria izquierda/i],
  'abd.adenos': [/no se observan adenopat[ií]as intraabdominal/i],
  'pelvis.adenos': [/no se observan adenopat[ií]as p[eé]lvicas|inguinal/i],
  'peritoneo': [/no se observan colecciones|neumoperitoneo|l[ií]quido libre intraabdominal/i],
};

function looksPathologic(line: string): boolean {
  const n = normalize(line);
  // Palabras que tipifican patología (amplio pero seguro)
  return /adenopat|n[oó]dulo|derrame|opacidad|opacidades|consolidaci[oó]n|quiste|quistes|hemangioma|masa|engrosamiento|hipercapt|tromb|defecto de reple|ectasia|dilataci[oó]n|litiasis|microlitiasis|pielo|uretero|ascitis|colecci[oó]n|carcinomatosis|trabeculaci[oó]n|aortoiliac|aortoil[ií]ac|bocio|tiroid|mama|marcador met[aá]lico|oste|bl[aá]stica|vertebr|met[aá]stasi/i.test(
    n
  );
}

// Suprime normales que contradicen si en el bucket hay patología
function squashContradictoryNormals(lines: string[], bucket: BucketKey) {
  const hasPathology = lines.some(looksPathologic);
  if (!hasPathology) return lines;

  const matchers = normalMatchersByBucket[bucket] || [];
  if (!matchers.length) return lines;

  return lines.filter((l) => !matchers.some((rx) => rx.test(l)));
}

// Orden fijo de grupos y combinación en una sola línea por grupo cuando aplica
const GROUPS: BucketKey[][] = [
  // G1: mediastino + arteria + TEP → 1 línea
  ['thorax.mediastino', 'thorax.arteria', 'thorax.tep'],
  // G2: ganglios mediast/hiliares + axil/supraclav → 1 línea
  ['thorax.adenos.med_hiliares', 'thorax.adenos.axil_supraclav'],
  // G3: parénquima → 1 línea
  ['thorax.parenquima'],
  // G4: pleura → 1 línea
  ['thorax.pleura'],
  // —— doble salto aquí ——
  // G5: hígado (parenquima) → 1 línea
  ['liver.parenquima'],
  // G6: vasos hepáticos → 1 línea
  ['liver.vessels'],
  // G7: vía biliar + vesícula → 1 línea
  ['biliary.gb'],
  // G8: bazo + páncreas + adrenales → 1 línea
  ['spa.bazo', 'spa.pancreas', 'spa.adrenales'],
  // G9: riñón derecho + izquierdo → 1 línea
  ['renal.der', 'renal.izq'],
  // G10: adenopatías abdo + pélvicas/inguinales → 1 línea
  ['abd.adenos', 'pelvis.adenos'],
  // G11: peritoneo/colecciones → 1 línea
  ['peritoneo'],
];

function joinSentencesInline(list: string[]): string | null {
  const trimmed = list.map((s) => s.trim()).filter(Boolean);
  if (!trimmed.length) return null;
  // Unimos frases en una sola línea separadas por espacio (cada frase ya trae su punto).
  return trimmed.join(' ');
}

export function formatHallazgos(
  inputLines: string[],
  opts?: { closingText?: string }
): string {
  const closingText = (opts?.closingText || CLOSING_FALLBACK).trim();

  // 1) Saca el cierre si viniera dentro
  const linesNoClosing = inputLines.filter((l) => normalize(l) !== normalize(closingText));

  // 2) Clasifica por buckets
  const buckets = new Map<BucketKey, string[]>();
  for (const l of linesNoClosing) {
    const b = classifyLine(l);
    const arr = buckets.get(b) || [];
    arr.push(l);
    buckets.set(b, arr);
  }

  // 3) Limpia contradictorias en cada bucket
  for (const [key, arr] of buckets) {
    buckets.set(key, squashContradictoryNormals(arr, key));
  }

  // 4) Ordena renal.der/renal.izq (derecho antes que izquierdo)
  for (const k of ['renal.der', 'renal.izq'] as BucketKey[]) {
    const arr = buckets.get(k);
    if (arr && arr.length > 1) {
      arr.sort((a, b) => {
        const ad = /derech/i.test(a) ? -1 : 0;
        const bd = /derech/i.test(b) ? -1 : 0;
        if (ad !== bd) return ad - bd;
        return a.localeCompare(b);
      });
      buckets.set(k, arr);
    }
  }

  // 5) Reconstruye en el orden fijado, combinando sub-buckets de cada grupo en 1 línea
  const out: string[] = [];
  for (let gi = 0; gi < GROUPS.length; gi++) {
    const group = GROUPS[gi];
    const merged: string[] = [];
    for (const sub of group) {
      const arr = buckets.get(sub);
      if (arr && arr.length) merged.push(...arr);
    }
    const line = joinSentencesInline(merged);
    if (line) out.push(line);

    // Inserta el doble salto EXACTO tras pleura → antes de hígado
    // pleura es G4 (índice 3). Después de procesar G4, insertamos una línea vacía adicional.
    if (gi === 3) out.push(''); // línea vacía = doble salto cuando hagamos join más abajo
  }

  // 6) "Otros" (sin plantilla) → justo antes del cierre
  const otros = buckets.get('otros') || [];
  if (otros.length) {
    // Junta en UNA línea, como venías observando en tus ejemplos finales
    const line = joinSentencesInline(otros);
    if (line) out.push(line);
  }

  // 7) Añade cierre
  out.push(closingText);

  // 8) Render: una línea vacía "" en el array equivale a un doble salto en el texto final.
  //    Para el resto: salto simple por línea.
  return out
    .map((l) => {
      if (l === '') return ''; // respetamos línea vacía (doble salto)
      return l;
    })
    .join('\n')
    // Compactamos triples saltos accidentales (por si acaso)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}