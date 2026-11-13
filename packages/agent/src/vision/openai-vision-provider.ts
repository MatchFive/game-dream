import { readFileSync } from 'node:fs';
import { AgentError } from '../errors.js';
import { extractJson } from '../intake/extract-json.js';
import { parseVisualReview } from './visual-review.js';
import type { VisualReview, VisionProvider, VisionRequest } from './types.js';

export interface OpenAIVisionOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAIVisionProvider implements VisionProvider {
  readonly name = 'openai';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAIVisionOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async review(request: VisionRequest): Promise<VisualReview> {
    const timeoutMs = this.options.timeoutMs ?? 120_000;
    const image = readFileSync(request.imagePath).toString('base64');
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            messages: [
              { role: 'system', content: request.system },
              {
                role: 'user',
                content: [
                  { type: 'text', text: request.user },
                  {
                    type: 'image_url',
                    image_url: { url: `data:image/png;base64,${image}` },
                  },
                ],
              },
            ],
            temperature: 0,
            response_format: { type: 'json_object' },
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      const caught = error as Error;
      const timedOut = caught.name === 'TimeoutError' || caught.name === 'AbortError';
      throw new AgentError(
        'PROVIDER_HTTP_ERROR',
        timedOut
          ? `vision provider timed out after ${timeoutMs}ms`
          : `vision provider request failed: ${caught.message}`,
      );
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => ''))
        .replace(/\s+/g, ' ')
        .slice(0, 500);
      throw new AgentError(
        'PROVIDER_HTTP_ERROR',
        `vision provider returned ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new AgentError('PROVIDER_HTTP_ERROR', 'vision provider returned invalid JSON');
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AgentError('PROVIDER_EMPTY_RESPONSE', 'vision provider returned no content');
    }
    try {
      return parseVisualReview(extractJson(content));
    } catch (error) {
      throw new AgentError(
        'INVALID_VISION_REVIEW',
        `vision review is invalid: ${(error as Error).message}`,
      );
    }
  }
}
