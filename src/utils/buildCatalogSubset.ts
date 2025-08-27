// src/utils/buildCatalogSubset.ts
import type { CatalogItem } from "../services/openaiClassifier";

export function buildCatalogSubset(
  _hallazgo: string,
  catalog: {
    pathological: Map<string, { zona: string; fraseNormal: string }>;
    additional: Map<string, { zona: string; fraseNormal: string }>;
  }
): CatalogItem[] {
  const subset: CatalogItem[] = [];

  // Para demo: incluir todos los entries. 
  // ⚠️ Mejora esto con heurísticas (ej: filtrar por keywords).
  for (const [key, value] of catalog.pathological) {
    subset.push({
      oficial: key,
      tipo: "patologico",
      frase_normal: value.fraseNormal || null,
    });
  }
  for (const [key, value] of catalog.additional) {
    subset.push({
      oficial: key,
      tipo: "adicional",
      frase_normal: value.fraseNormal || null,
    });
  }

  // Limita a máximo 30 para no sobrecargar
  return subset.slice(0, 30);
}