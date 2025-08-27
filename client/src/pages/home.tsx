import React, { useState } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { useToast } from "../hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { Copy, X } from "lucide-react";

interface GenerateReportResponse {
  report: string;
}

export default function Home() {
  const [dictation, setDictation] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generatedReport, setGeneratedReport] = useState("");
  const { toast } = useToast();

  const generateReportMutation = useMutation({
    mutationFn: async (dictation: string): Promise<GenerateReportResponse> => {
      const response = await apiRequest("POST", "/api/generate-report", { dictation });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedReport(data.report);
      setIsModalOpen(true);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo generar el informe. Por favor, inténtelo de nuevo.",
        variant: "destructive",
      });
      console.error("Error generating report:", error);
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!dictation.trim()) {
      toast({
        title: "Entrada requerida",
        description: "Por favor, ingrese los hallazgos médicos antes de generar el informe.",
        variant: "destructive",
      });
      return;
    }

    generateReportMutation.mutate(dictation.trim());
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(generatedReport);
      toast({
        title: "Copiado",
        description: "Informe copiado al portapapeles",
      });
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = generatedReport;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast({
        title: "Copiado",
        description: "Informe copiado al portapapeles",
      });
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        {/* Main Content */}
        <div className="w-full max-w-2xl">
          <Card className="bg-card rounded-xl shadow-sm border border-border">
            <CardContent className="p-8">
              {/* Title */}
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-3" data-testid="app-title">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <span className="text-primary-foreground font-bold text-sm">TC</span>
                  </div>
                  GENERADOR DE INFORMES TC
                </h1>
              </div>

              {/* Report Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Dictation Field */}
                <div>
                  <Textarea
                    id="dictation"
                    data-testid="input-dictation"
                    value={dictation}
                    onChange={(e) => setDictation(e.target.value)}
                    placeholder="Inserte aquí el dictado del informe..."
                    className="w-full h-64 px-4 py-3 rounded-xl border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-none transition-all duration-200"
                  />
                </div>

                {/* Generate Button */}
                <Button
                  type="submit"
                  data-testid="button-generate"
                  disabled={generateReportMutation.isPending}
                  className="w-full bg-primary text-primary-foreground font-semibold py-3 px-6 rounded-xl hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200 shadow-sm"
                >
                  {generateReportMutation.isPending ? "Generando..." : "Generar Informe"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Report Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle data-testid="modal-title">Informe Generado</DialogTitle>
            <button
              onClick={closeModal}
              data-testid="button-close-modal"
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded-md p-1 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </DialogHeader>

          {/* Modal Content */}
          <div className="flex-1 overflow-auto">
            <div className="bg-muted rounded-lg p-6">
              <pre 
                data-testid="text-report-content"
                className="font-mono text-sm text-foreground whitespace-pre-wrap leading-relaxed"
              >
                {generatedReport}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleCopyReport}
              data-testid="button-copy"
              variant="secondary"
              className="mr-2"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copiar
            </Button>
            <Button
              onClick={closeModal}
              data-testid="button-close"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}