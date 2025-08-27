import type { Express } from "express";
import { createServer, type Server } from "http";
import { generateReportSchema } from "../shared/schema";
import { z } from "zod";

async function generateMedicalReportWithAI(dictation: string): Promise<string> {
  // Check if OpenAI API key is available
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is not configured");
  }

  try {
    // For now, we'll use a simple fetch approach until OpenAI package is properly installed
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o", // Using GPT-4o which is widely available
        messages: [
          {
            role: "system",
            content: "Eres un radiólogo experto que genera informes médicos profesionales en español siguiendo estándares médicos internacionales."
          },
          {
            role: "user",
            content: `Eres un radiólogo especialista en tomografía computarizada. Genera un informe médico profesional en español basado en los siguientes hallazgos dictados:

"${dictation}"

El informe debe seguir exactamente esta estructura:

TÉCNICA:
[Describe la técnica tomográfica utilizada, generalmente TC de tórax/abdomen con o sin contraste]

HALLAZGOS:
[Lista los hallazgos específicos mencionados en el dictado, organizados de manera clara]
[Incluye hallazgos normales relevantes si no se mencionan patologías específicas]

CIERRE:
[Resumen conciso de los principales hallazgos o "Sin otros hallazgos" si es normal]

Usa terminología médica precisa y profesional. Mantén un tono formal y objetivo.`
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content || "Error al generar el informe";
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    throw new Error("No se pudo generar el informe médico con IA");
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Generate medical report endpoint
  app.post("/api/generate-report", async (req, res) => {
    try {
      // Validate request body
      const validatedData = generateReportSchema.parse(req.body);
      
      // Generate medical report with AI
      const report = await generateMedicalReportWithAI(validatedData.dictation);
      
      res.json({ report });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          message: "Invalid request data",
          errors: error.issues 
        });
      } else {
        console.error("Error generating report:", error);
        res.status(500).json({ 
          message: "Internal server error while generating report" 
        });
      }
    }
  });

  // Planning endpoint with proper structure
  app.post("/api/plan", async (req, res) => {
    try {
      const {
        dictadoItems = [],
        pathologicalMap = {},
        additionalMap = {},
        fuzzyMap = {},
        templateMode = false
      } = req.body || {};

      if (!Array.isArray(dictadoItems)) {
        return res.status(400).json({ error: 'Payload inválido.' });
      }

      // Normalización simple
      const norm = (s: string) =>
        (s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/[^\p{L}\p{N}\s]/gu, "")
          .replace(/\s+/g, " ")
          .trim();

      const ensureDot = (s: string) => {
        const t = (s || "").trim();
        if (!t) return t;
        return /[.:]$/.test(t) ? t : `${t}.`;
      };

      // Índices directos
      const patKeys = new Map<string, string>();
      for (const [k, v] of Object.entries(pathologicalMap)) {
        patKeys.set(norm(String(k)), String(v));
      }
      const addKeys = new Map<string, string>();
      for (const [k, v] of Object.entries(additionalMap)) {
        addKeys.set(norm(String(k)), String(v));
      }
      const fuzzy = new Map<string, string>();
      for (const [k, v] of Object.entries(fuzzyMap)) {
        fuzzy.set(norm(String(k)), String(v));
      }

      const replaces: Array<{ targetNormal: string; newLine: string }> = [];
      const adds: Array<{ afterNormal: string; newLine: string }> = [];
      const loose: string[] = [];

      for (const raw of dictadoItems) {
        const n = norm(String(raw));
        if (!n) continue;
        if (n.includes("valida frases normales")) continue;

        let matchedKind: "pat" | "add" | null = null;
        let matchedNormal: string | null = null;
        let finalText: string | null = null;

        if (patKeys.has(n)) {
          matchedKind = "pat";
          matchedNormal = patKeys.get(n)!;
          finalText = String(raw);
        } else if (addKeys.has(n)) {
          matchedKind = "add";
          matchedNormal = addKeys.get(n)!;
          finalText = String(raw);
        } else {
          const maybeOficial = fuzzy.get(n);
          if (maybeOficial) {
            const oficialN = norm(maybeOficial);
            if (patKeys.has(oficialN)) {
              matchedKind = "pat";
              matchedNormal = patKeys.get(oficialN)!;
              finalText = maybeOficial;
            } else if (addKeys.has(oficialN)) {
              matchedKind = "add";
              matchedNormal = addKeys.get(oficialN)!;
              finalText = maybeOficial;
            }
          }
        }

        if (matchedKind === "pat" && matchedNormal && finalText) {
          replaces.push({ targetNormal: matchedNormal, newLine: ensureDot(finalText) });
        } else if (matchedKind === "add" && matchedNormal && finalText) {
          adds.push({ afterNormal: matchedNormal, newLine: ensureDot(finalText) });
        } else {
          loose.push(ensureDot(String(raw)));
        }
      }

      console.log('Plan request:', { 
        dictadoItems: dictadoItems.length, 
        templateMode,
        replaces: replaces.length,
        adds: adds.length,
        loose: loose.length
      });
      
      return res.json({ ok: true, plan: { replaces, adds, loose } });
    } catch (err: any) {
      console.error('Plan error:', err?.message || err);
      return res.status(500).json({ error: 'Plan failure' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}