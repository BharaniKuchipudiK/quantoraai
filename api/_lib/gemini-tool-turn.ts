export type GeminiModelTurn = {
  role: 'model';
  parts: any[];
};

/**
 * Gemini 3 function calls can carry a thoughtSignature on the model-authored
 * part. The next request must replay that model turn exactly; reconstructing a
 * new { functionCall } object discards the signature and Google rejects the
 * continuation. Keep the candidate content verbatim instead.
 */
export function extractSignedFunctionTurn(chunk: any): {
  call: any;
  modelTurn: GeminiModelTurn;
} | null {
  const candidateContent = chunk?.candidates?.[0]?.content;
  const candidateParts = Array.isArray(candidateContent?.parts) ? candidateContent.parts : [];
  const signedPart = candidateParts.find((part: any) => part?.functionCall?.name);
  const fallbackCall = Array.isArray(chunk?.functionCalls) ? chunk.functionCalls[0] : null;
  const call = signedPart?.functionCall || fallbackCall;
  if (!call?.name) return null;

  // Prefer the SDK candidate content because it contains provider-owned fields
  // such as thoughtSignature. Older/non-Gemini-3 responses may expose only the
  // convenience functionCalls array; those safely fall back to a normal part.
  const parts = candidateParts.length > 0
    ? candidateParts.map((part: any) => ({ ...part }))
    : [{ functionCall: { ...call } }];

  return {
    call: { ...call },
    modelTurn: {
      role: 'model',
      parts,
    },
  };
}

export function appendFunctionResponse(contents: any[], modelTurn: GeminiModelTurn, call: any, response: any) {
  contents.push(modelTurn);
  contents.push({
    role: 'user',
    parts: [{
      functionResponse: {
        name: call.name,
        response,
      },
    }],
  });
  return contents;
}
