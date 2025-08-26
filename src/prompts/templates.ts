// src/prompts/templates.ts
// Plantillas y helpers para el encabezado (TÍTULO) y la sección TÉCNICA del informe.

export type ContrastTag = 'CON CONTRASTE' | 'SIN CONTRASTE';
export type RegionTag = 'TC-TORAX' | 'TC-ABDOMEN';

export function getSelectedRegions(tags: string[]): RegionTag[] {
  const set = new Set(tags.map(t => t.trim().toUpperCase()));
  const regions: RegionTag[] = [];
  if (set.has('TC-TORAX')) regions.push('TC-TORAX');
  if (set.has('TC-ABDOMEN')) regions.push('TC-ABDOMEN');
  return regions;
}

export function getSelectedContrast(tags: string[]): ContrastTag | null {
  const set = new Set(tags.map(t => t.trim().toUpperCase()));
  if (set.has('CON CONTRASTE')) return 'CON CONTRASTE';
  if (set.has('SIN CONTRASTE')) return 'SIN CONTRASTE';
  return null;
}

/**
 * Construye el TÍTULO del informe según regiones y contraste.
 * Retorna, por ejemplo:
 *  - "TC DE TÓRAX CON CONTRASTE:"
 *  - "TC DE ABDOMEN SIN CONTRASTE:"
 *  - "TC DE TÓRAX Y ABDOMEN CON CONTRASTE:"
 */
export function buildReportTitle(regions: RegionTag[], contrast: ContrastTag | null): string {
  const area =
    regions.length === 2
      ? 'TÓRAX Y ABDOMEN'
      : regions[0] === 'TC-TORAX'
      ? 'TÓRAX'
      : 'ABDOMEN';

  const c = contrast ? ` ${contrast}` : '';
  return `TC DE ${area}${c}:`;
}

/**
 * Devuelve el bloque de TÉCNICA EXACTO (texto oficial) según etiquetas.
 * Usa exactamente una de las frases (sin inventar variantes).
 */
export function buildTechniqueBlock(regions: RegionTag[], contrast: ContrastTag | null): string {
  // Frases oficiales (texto íntegro)
  if (regions.length === 1 && regions[0] === 'TC-TORAX' && contrast === 'SIN CONTRASTE') {
    return 'TECNICA:\nSe realiza TC de tórax sin contraste ev.';
  }
  if (regions.length === 1 && regions[0] === 'TC-TORAX' && contrast === 'CON CONTRASTE') {
    return 'TECNICA:\nSe realiza TC de tórax con contraste ev.';
  }
  if (regions.length === 1 && regions[0] === 'TC-ABDOMEN' && contrast === 'SIN CONTRASTE') {
    return 'TECNICA:\nSe realiza TC de abdomen sin contraste ev.';
  }
  if (regions.length === 1 && regions[0] === 'TC-ABDOMEN' && contrast === 'CON CONTRASTE') {
    return 'TECNICA:\nSe realiza TC de abdomen con contraste ev.';
  }
  if (regions.length === 2 && contrast === 'SIN CONTRASTE') {
    return 'TECNICA:\nSe realiza TC de tórax y abdomen sin contraste ev.';
  }
  if (regions.length === 2 && contrast === 'CON CONTRASTE') {
    return 'TECNICA:\nSe realiza TC de tórax y abdomen con contraste ev.';
  }

  // Fallback mínimo si faltara el contraste (no debería ocurrir si etiquetas llegan bien)
  if (regions.length === 1 && regions[0] === 'TC-TORAX') {
    return 'TECNICA:\nSe realiza TC de tórax.';
  }
  if (regions.length === 1 && regions[0] === 'TC-ABDOMEN') {
    return 'TECNICA:\nSe realiza TC de abdomen.';
  }
  return 'TECNICA:\nSe realiza TC de tórax y abdomen.';
}

/**
 * Cabecera exacta "HALLAZGOS:" con salto justo después (norma de formato).
 */
export function buildHallazgosHeader(): string {
  return 'HALLAZGOS:';
}
