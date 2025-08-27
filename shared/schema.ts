import { z } from "zod";

// Schema for medical report generation request
export const generateReportSchema = z.object({
  dictation: z.string().min(1, "Dictation is required").max(5000, "Dictation is too long"),
});

// Schema for medical report generation response
export const medicalReportSchema = z.object({
  report: z.string(),
});

export type GenerateReportRequest = z.infer<typeof generateReportSchema>;
export type MedicalReportResponse = z.infer<typeof medicalReportSchema>;
