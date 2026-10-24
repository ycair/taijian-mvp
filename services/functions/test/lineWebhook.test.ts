import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { handleWebhookRequest } from '../src/line/webhook';
import type { LineWebhookEvent } from '../src/line/handler';

const SECRET = 'test-messaging-secret';

function signed(rawBody: string): string {
  return createHmac('sha256', SECRET).update(rawBody).digest('base64');
}

function messageEvent(id: string, text = '今日'): LineWebhookEvent {
  return {
    type: 'message',
    webhookEventId: id,
    replyToken: `reply-${id}`,
    source: { type: 'user', userId: 'U1' },
    message: { type: 'text', text },
  };
}

describe('handleWebhookRequest', () => {
  it('verifies the signature before dispatching every event', async () => {
    const rawBody = JSON.stringify({ events: [messageEvent('e1'), messageEvent('e2')] });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    const result = await handleWebhookRequest(Buffer.from(rawBody), signed(rawBody), dispatch);

    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.map(([event]) => event.webhookEventId)).toEqual(['e1', 'e2']);
  });

  it('rejects a body whose signature does not match', async () => {
    const rawBody = JSON.stringify({ events: [messageEvent('e1')] });
    const tampered = JSON.stringify({ events: [messageEvent('e1', '餵食 阿肥')] });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    const result = await handleWebhookRequest(Buffer.from(tampered), signed(rawBody), dispatch);

    expect(result.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a missing signature', async () => {
    const rawBody = JSON.stringify({ events: [messageEvent('e1')] });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    const result = await handleWebhookRequest(Buffer.from(rawBody), '', dispatch);

    expect(result.status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a signed body that is not JSON', async () => {
    const rawBody = 'not json';
    const dispatch = vi.fn().mockResolvedValue(undefined);

    const result = await handleWebhookRequest(Buffer.from(rawBody), signed(rawBody), dispatch);

    expect(result.status).toBe(400);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('accepts an empty event list', async () => {
    const rawBody = JSON.stringify({ events: [] });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    const result = await handleWebhookRequest(Buffer.from(rawBody), signed(rawBody), dispatch);

    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('still returns 200 when one event fails, so LINE does not retry the batch', async () => {
    const rawBody = JSON.stringify({ events: [messageEvent('e1'), messageEvent('e2')] });
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await handleWebhookRequest(Buffer.from(rawBody), signed(rawBody), dispatch);

    expect(result.status).toBe(200);
    expect(dispatch).toHaveBeenCalledTimes(2);
    // Only the event id and the failure are logged; message text never is.
    expect(error).toHaveBeenCalledWith(
      'line webhook event failed',
      expect.objectContaining({ webhookEventId: 'e1' }),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('今日');
    error.mockRestore();
  });
});
