import { AgentError } from '../errors.js';

export function extractJson(text: string): unknown {
  const withoutFences = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AgentError('INVALID_MODEL_JSON', 'model response contains no JSON object');
  }
  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch (error) {
    throw new AgentError(
      'INVALID_MODEL_JSON',
      `model response is not valid JSON: ${(error as Error).message}`,
    );
  }
}
