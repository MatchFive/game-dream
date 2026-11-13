import type { ModelProvider, ModelRequest } from '../types.js';
import { AgentError } from '../errors.js';

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = 'openai';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: ModelRequest): Promise<string> {
    const response = await this.fetchImpl(
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
            { role: 'user', content: request.user },
          ],
          temperature: request.temperature ?? 0.2,
          response_format: { type: 'json_object' },
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AgentError(
        'PROVIDER_HTTP_ERROR',
        `provider returned ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AgentError('PROVIDER_EMPTY_RESPONSE', 'provider returned no content');
    }
    return content;
  }
}
