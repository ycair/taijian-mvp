import { onRequest } from 'firebase-functions/v2/https';
import { config } from '../config';
import { handleLineEvent, type LineWebhookEvent } from './handler';
import { verifyLineSignature } from './verify';

export type WebhookResult = { status: number; body: string };

export type WebhookDispatcher = (event: LineWebhookEvent) => Promise<void>;

/**
 * Signature check, parsing, and fan-out for one Messaging API delivery. Kept
 * separate from the deployed wrapper so tests can exercise the raw-body
 * verification without HTTP.
 */
export async function handleWebhookRequest(
  rawBody: Buffer,
  signature: string,
  dispatch: WebhookDispatcher = handleLineEvent,
): Promise<WebhookResult> {
  if (!verifyLineSignature(rawBody, config.LINE_MESSAGING_CHANNEL_SECRET, signature)) {
    return { status: 401, body: 'invalid signature' };
  }

  let body: { events?: unknown };
  try {
    body = JSON.parse(rawBody.toString('utf8')) as { events?: unknown };
  } catch {
    return { status: 400, body: 'invalid body' };
  }
  const events = Array.isArray(body.events)
    ? body.events.filter(
        (event): event is LineWebhookEvent =>
          typeof event === 'object' && event !== null && 'webhookEventId' in event,
      )
    : [];

  // One failing event must not make LINE redeliver a batch that partially
  // succeeded; each event is already idempotent through `commands/{commandId}`.
  // A batch where every event failed is a transient problem (Firestore, LINE
  // API), so it returns 5xx and lets LINE retry the delivery.
  const results = await Promise.allSettled(events.map((event) => dispatch(event)));
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      failed += 1;
      console.error('line webhook event failed', {
        webhookEventId: events[index]?.webhookEventId,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  if (events.length > 0 && failed === events.length) {
    return { status: 500, body: 'event handling failed' };
  }

  return { status: 200, body: 'ok' };
}

export const lineWebhook = onRequest({ region: 'asia-east1' }, async (request, response) => {
  // LINE signs the exact bytes it sent, so the raw body is never re-serialized.
  const rawBody = request.rawBody;
  if (!rawBody) {
    response.status(400).send('missing body');
    return;
  }
  const result = await handleWebhookRequest(rawBody, request.header('x-line-signature') ?? '');
  response.status(result.status).send(result.body);
});
