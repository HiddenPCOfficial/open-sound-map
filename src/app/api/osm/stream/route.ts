import { parseCursor, replicationEvents } from '@/lib/osmReplication';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  let cursor;
  try { cursor = parseCursor(request.headers.get('last-event-id')); }
  catch { return Response.json({ error: 'Invalid Last-Event-ID' }, { status: 400 }); }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (request.signal.aborted) abort();
  else request.signal.addEventListener('abort', abort, { once: true });
  const iterator = replicationEvents(cursor, controller.signal);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(output) { output.enqueue(encoder.encode('retry: 3000\n\n')); },
    async pull(output) {
      try {
        const next = await iterator.next();
        if (next.done) {
          request.signal.removeEventListener('abort', abort);
          output.close();
        } else output.enqueue(encoder.encode(next.value));
      } catch (error) {
        abort();
        request.signal.removeEventListener('abort', abort);
        output.error(error);
      }
    },
    async cancel() {
      abort();
      request.signal.removeEventListener('abort', abort);
      await iterator.return(undefined);
    },
  }, { highWaterMark: 0 });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  } });
}
