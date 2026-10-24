import { config } from '../config';

export type LineMessage = {
  type: 'text';
  text: string;
  quickReply?: unknown;
};

/**
 * Thin Messaging API client. The channel access token is read from the
 * server-only config and never leaves the Functions runtime.
 */
export class LineGateway {
  constructor(
    private readonly baseUrl = config.LINE_API_BASE,
    private readonly accessToken = config.LINE_CHANNEL_ACCESS_TOKEN,
  ) {}

  private async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `LINE API ${path} failed with ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }
  }

  async reply(replyToken: string, messages: LineMessage[]): Promise<void> {
    await this.post('/v2/bot/message/reply', { replyToken, messages });
  }

  async push(to: string, messages: LineMessage[]): Promise<void> {
    await this.post('/v2/bot/message/push', { to, messages });
  }
}
