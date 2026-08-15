import { GoogleGenAI } from "@google/genai";

export interface TelemetryEvent {
  model: string;
  latencyMs: number;
  success: boolean;
  routing_reason?: string;
  error?: string;
}

export type TelemetryCallback = (event: TelemetryEvent) => void;

/**
 * Executes a Gemini request with a multi-model fallback chain.
 * Includes observability guardrails for tracking telemetry.
 */
export async function generateGeminiContentWithRouting(
  apiKey: string,
  contents: any[],
  systemInstruction: string,
  onTelemetry?: TelemetryCallback
) {
  // Use a fallback chain to ensure high reliability
  const fallbackModels = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-flash-latest"
  ];

  let lastError: any = null;
  
  for (let i = 0; i < fallbackModels.length; i++) {
    const m = fallbackModels[i];
    const startTime = Date.now();
    
    try {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
        model: m,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
      });

      if (response && response.text) {
        const latencyMs = Date.now() - startTime;
        
        const routing_reason = i === 0 
          ? "Primary model succeeded" 
          : `Fallback to ${m} successful after primary failed`;

        if (onTelemetry) {
          onTelemetry({
            model: m,
            latencyMs,
            success: true,
            routing_reason
          });
        }

        return { text: response.text, usedModel: m, routing_reason };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      lastError = err;
      
      if (onTelemetry) {
        onTelemetry({
          model: m,
          latencyMs,
          success: false,
          error: err.message || "Unknown error",
          routing_reason: `Model ${m} failed, attempting next fallback`
        });
      }
    }
  }
  
  throw lastError || new Error("All Gemini fallback models failed.");
}
