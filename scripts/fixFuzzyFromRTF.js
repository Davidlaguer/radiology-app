// scripts/fixFuzzyFromRTF.js
// ESM compatible (package.json tiene "type":"module")
// Uso: node scripts/fixFuzzyFromRTF.js src/data/fuzzyLexicon.rtf

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- helpers de decodificación ---
function decodeHexByteToLatin1(hex) {
  const n = parseInt(hex, 16);
  return Buffer.from([n]).toString('latin1');
}

// 1) EXTRAER primero el bloque [ ... ] del RTF crudo (sin tocar llaves/escapes)
function sliceJsonArrayFromRawRtf(rtfRaw) {
  const first = rtfRaw.indexOf('[');
  const last = rtfRaw.lastIndexOf(']');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No se encontró un array JSON delimitado por [ y ] dentro del RTF.');
  }
  return rtfRaw.slice(first, last + 1);
}

// 2) LIMPIEZAS sobre el slice (ya con [ ... ] dentro)
function cleanRtfArtifactsInsideSlice(slice) {
  let s = slice;

  // Decodificar \'xx (hex) -> latin1
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => decodeHexByteToLatin1(h));

  // Convertir \uNNNN? -> carácter unicode
  s = s.replace(/\\u(-?\d+)\??/g, (_m, num) => {
    const code = parseInt(num, 10);
    if (Number.isFinite(code) && code >= 0 && code <= 0x10FFFF) {
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    return '';
  });

  // Quitar controles RTF (palabras de control) dentro del slice, pero NO toques secuencias de escape de JSON tipo \" dentro de strings
  // (en tu RTF las comillas ya venían normales, el problema eran \{ \} y backslashes colgando).
  s = s.replace(/\\[a-zA-Z]+-?\d*\s*/g, ''); // \par, \fs24, etc.

  // Desescapar puntuación RTF usada para JSON
  // Muy importante: reponer llaves y corchetes escapados que pertenecen al JSON:
  s = s.replace(/\\\{/g, '{')
       .replace(/\\\}/g, '}')
       .replace(/\\\[/g, '[')
       .replace(/\\\]/g, ']')
       .replace(/\\,/g, ',')
       .replace(/\\:/g, ':');

  // Algunas exportaciones dejan barras invertidas solas al final de línea (continuaciones)
  // Elimina "\" al final de línea
  s = s.replace(/\\\s*$/gm, '');

  // Normalizar saltos y espacios
  s = s.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();

  // Si han quedado comillas escapadas \" que no son necesarias, las normalizamos.
  // (JSON admite \" dentro de strings, pero muchos RTF meten escapes extra fuera de strings.)
  // Estrategia conservadora: sólo reemplazar \" cuando NO sigue inmediatamente otra comilla o no estamos en \\"
  s = s.replace(/(^|[^\\])\\"/g, '$1"');

  return s;
}

function writePrettyJson(jsonStr, outPath) {
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    const snippet = jsonStr.slice(0, 500);
    throw new Error(
      `JSON.parse falló. Revisa si el RTF mantiene \\{ y \\} para los objetos.\n` +
      `Detalle: ${e.message}\nInicio del texto detectado:\n${snippet}\n...`
    );
  }
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error('Uso: node scripts/fixFuzzyFromRTF.js <ruta/al/fuzzyLexicon.rtf>');
    process.exit(1);
  }
  const absIn = path.isAbsolute(inPath) ? inPath : path.join(process.cwd(), inPath);
  if (!fs.existsSync(absIn)) {
    console.error(`No existe el archivo: ${absIn}`);
    process.exit(1);
  }

  const rtfRaw = fs.readFileSync(absIn, 'utf8');

  // NUEVO: primero recortar el bloque JSON en bruto (con \{ \})
  const sliced = sliceJsonArrayFromRawRtf(rtfRaw);

  // Luego limpiar/decodificar dentro del slice
  const cleaned = cleanRtfArtifactsInsideSlice(sliced);

  // Escribir como .json junto al input
  const outPath = path.join(
    path.dirname(absIn),
    path.basename(absIn).replace(/\.rtf$/i, '.json')
  );

  writePrettyJson(cleaned, outPath);

  console.log(`✅ Conversión completada:\n- Entrada: ${absIn}\n- Salida:  ${outPath}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
