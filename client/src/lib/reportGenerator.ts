export function processHallazgos(dictation: string): string {
  // Split dictation into individual findings
  const hallazgos = dictation
    .split(/[.;]/)
    .map(finding => finding.trim())
    .filter(finding => finding.length > 0)
    .map(finding => `- ${finding}.`);

  return hallazgos.join('\n');
}

export function generateMedicalReport(dictation: string): string {
  const processedHallazgos = processHallazgos(dictation);
  
  const report = `TÉCNICA: 
Tomografía computarizada de tórax con administración de contraste endovenoso.

HALLAZGOS:
${processedHallazgos}
- Campos pulmonares sin consolidaciones ni nódulos patológicos.
- Corazón de morfología y tamaño normales.
- Estructuras mediastínicas sin alteraciones significativas.

CIERRE:
Sin otros hallazgos.`;

  return report;
}