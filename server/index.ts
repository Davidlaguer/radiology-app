// server/index.ts
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Salud
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Planificador híbrido (mínimo viable)
app.post("/api/plan", (req, res) => {
  const body = req.body || {};
  const {
    dictadoItems = [],
    pathologicalMap = {},
    additionalMap = {},
    fuzzyMap = {},
  } = body;

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

  type PlanReplace = { targetNormal: string; newLine: string };
  type PlanAdd = { afterNormal: string; newLine: string };

  const replaces: PlanReplace[] = [];
  const adds: PlanAdd[] = [];
  const loose: string[] = [];

  for (const raw of dictadoItems) {
    const n = norm(raw);
    if (!n) continue;
    if (n.includes("valida frases normales")) continue;

    let matchedKind: "pat" | "add" | null = null;
    let matchedNormal: string | null = null;
    let finalText: string | null = null;

    if (patKeys.has(n)) {
      matchedKind = "pat";
      matchedNormal = patKeys.get(n)!;
      finalText = raw;
    } else if (addKeys.has(n)) {
      matchedKind = "add";
      matchedNormal = addKeys.get(n)!;
      finalText = raw;
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
      loose.push(ensureDot(raw));
    }
  }

  res.json({ ok: true, plan: { replaces, adds, loose } });
});

const PORT = Number(process.env.PORT) || 5173;
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});