
// src/utils/openaiClassify.ts
// Clasificador híbrido: local primero, OpenAI solo si no se reconoce.
// Requiere VITE_OPENAI_API_KEY y VITE_USE_OPENAI=1 en .env o Replit Secrets.

export type RegionTag = 'TC-TORAX' | 'TC-ABDOMEN';
export type ContrastTag = 'CON CONTRASTE' | 'SIN CONTRASTE';

export type LabeledFinding = {
  input_text: string;
  official_label: string | null;
  class_type: 'patologico' | 'adicional' | 'suelto';
  target_frase_normal: string | null;
  note?: string;
};

// Normalización rápida (actualmente no usada)
// function normalize(s: string) {
//   return s
//     .toLowerCase()
//     .normalize('NFD')
//     .replace(/\p{Diacritic}/gu, '')
//     .replace(/[^\p{L}\p{N}\s]/gu, '')
//     .replace(/\s+/g, ' ')
//     .trim();
// }

export async function classifyWithOpenAI(
  item: string,
  _regions: RegionTag[],
  _contrast: ContrastTag | null,
  findingsTable: any[],
  normalPhrases: any[],
  _fuzzyTable: any[],
  opts?: { model?: string }
): Promise<LabeledFinding> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  const useOpenAI = import.meta.env.VITE_USE_OPENAI === '1';

  if (!useOpenAI || !apiKey) {
    return {
      input_text: item,
      official_label: null,
      class_type: 'suelto',
      target_frase_normal: null,
      note: 'OpenAI desactivado.',
    };
  }

  const patologicos: string[] = [];
  const adicionales: string[] = [];
  for (const row of findingsTable) {
    patologicos.push(...(row.hallazgos_patologicos || []));
    adicionales.push(...(row.hallazgos_adicionales || []));
  }

  const posiblesFrases = normalPhrases.map((x: any) => x.text);

  const systemPrompt =
    `Eres un asistente que clasifica hallazgos radiológicos en español.\n` +
    `Catálogo permitido:\n` +
    `Patológicos: ${JSON.stringify(patologicos)}\n` +
    `Adicionales: ${JSON.stringify(adicionales)}\n` +
    `Frases normales posibles: ${JSON.stringify(posiblesFrases)}\n` +
    `Responde SOLO con JSON válido.\n` +
    `Esquema: { "input_text": "...", "official_label": string|null, "class_type": "patologico|adicional|suelto", "target_frase_normal": string|null }`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts?.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: item },
      ],
      response_format: {
        type: 'json_object'
      },
    }),
  });

  if (!res.ok) {
    return {
      input_text: item,
      official_label: null,
      class_type: 'suelto',
      target_frase_normal: null,
      note: `Error OpenAI: ${res.status}`,
    };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';

  try {
    return JSON.parse(text);
  } catch {
    return {
      input_text: item,
      official_label: null,
      class_type: 'suelto',
      target_frase_normal: null,
      note: 'Fallo parseo OpenAI',
    };
  }
}
