import type { AiEvaluation } from './mock-phase4';

// Only a hidden/missing evaluation is absence. Transport and parser failures
// must remain failures so the AI factory can return a safe INTERNAL_ERROR.
export async function readAiEvaluation(response: Response | undefined): Promise<AiEvaluation | null> {
  if (response?.status === 404) return null;
  if (!response || !response.ok) throw new Error('Evaluation lookup failed');
  return response.json() as Promise<AiEvaluation>;
}
