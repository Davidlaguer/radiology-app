import type { Express } from "express";
import { createServer, type Server } from "http";
import { generateReportSchema } from "@shared/schema";
import { z } from "zod";

function processHallazgos(dictation: string): string {
  // Split dictation into individual findings
  const hallazgos = dictation
    .split(/[.;]/)
    .map(finding => finding.trim())
    .filter(finding => finding.length > 0)
    .map(finding => `- ${finding}.`);

  return hallazgos.join('\n');
}

function generateMedicalReport(dictation: string): string {
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Generate medical report endpoint
  app.post("/api/generate-report", async (req, res) => {
    try {
      // Validate request body
      const validatedData = generateReportSchema.parse(req.body);
      
      // Generate medical report
      const report = generateMedicalReport(validatedData.dictation);
      
      res.json({ report });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          message: "Invalid request data",
          errors: error.errors 
        });
      } else {
        console.error("Error generating report:", error);
        res.status(500).json({ 
          message: "Internal server error while generating report" 
        });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
