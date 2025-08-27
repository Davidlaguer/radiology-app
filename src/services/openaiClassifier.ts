// src/services/openaiClassifier.ts

export type CatalogItem = {
  oficial: string;
  tipo: "patologico" | "adicional" | "suelto";
  frase_normal: string | null;
};

export type ClassificationResult = {
  tipo: "patologico" | "adicional" | "suelto";
  frase_normal: string | null;
  texto_final: string;
};

export async function classifyWithLLM(
  hallazgo: string,
  catalogo: CatalogItem[]
): Promise<ClassificationResult> {
  const promptSystem = `
Eres un asistente de clasificación clínica.
Debes clasificar un hallazgo en una de estas categorías:
- "patologico": sustituye su frase normal asociada (obligatorio devolver frase_normal EXACTA de la lista si existe).
- "adicional": se añade detrás de su frase normal.
- "suelto": no hay frase normal asociada; va al final antes de "Sin otros hallazgos.".

REGLAS:
1. No inventes frases normales. Solo puedes elegir frase_normal de catalogo[].frase_normal.
2. Si ninguna aplica, responde tipo:"suelto" y frase_normal:null.
3. Si el hallazgo contradice una frase normal → tipo:"patologico".
4. Si es un matiz complementario → tipo:"adicional".
5. Devuelve solo JSON válido con las claves: tipo, frase_normal, texto_final.
  `;

  try {
    const apiKey = import.meta.env.VITE_OPENAI_KEY;
    if (!apiKey) {
      throw new Error("VITE_OPENAI_KEY no configurada");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: promptSystem },
          {
            role: "user",
            content: JSON.stringify({
              hallazgo,
              catalogo,
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.choices[0].message.content || "";
    return JSON.parse(raw) as ClassificationResult;
  } catch (e) {
    console.error("Error parseando JSON de OpenAI:", e);
    return { tipo: "suelto", frase_normal: null, texto_final: hallazgo };
  }
}