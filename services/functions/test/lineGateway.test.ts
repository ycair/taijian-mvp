import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineGateway } from '../src/line/gateway';

afterEach(() => {
  vi.unstubAllGlobals();
});

function gatewayWith(response: { ok: boolean; status: number; text: () => Promise<string> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return { gateway: new LineGateway('https://line.example', 'access-token'), fetchMock };
}

describe('LineGateway', () => {
  it('posts reply messages with the channel access token', async () => {
    const { gateway, fetchMock } = gatewayWith({ ok: true, status: 200, text: async () => '' });

    await gateway.reply('reply-token', [{ type: 'text', text: 'hi' }]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://line.example/v2/bot/message/reply',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
        body: JSON.stringify({
          replyToken: 'reply-token',
          messages: [{ type: 'text', text: 'hi' }],
        }),
      }),
    );
  });

  it('includes the response body in API errors', async () => {
    const { gateway } = gatewayWith({
      ok: false,
      status: 400,
      text: async () => '{"message":"invalid reply token"}',
    });

    await expect(gateway.push('U123', [{ type: 'text', text: 'hi' }])).rejects.toThrow(
      'LINE API /v2/bot/message/push failed with 400: {"message":"invalid reply token"}',
    );
  });

  it('still reports the status when the body is unavailable', async () => {
    const { gateway } = gatewayWith({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('no body');
      },
    });

    await expect(gateway.push('U123', [{ type: 'text', text: 'hi' }])).rejects.toThrow(
      'LINE API /v2/bot/message/push failed with 500',
    );
  });
});
