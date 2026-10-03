import { normalizeEvent } from '../lib/events';
import type { ConnectionStatus, WikiEvent } from '../types/wiki';

/** One SSE connection for all languages; EventSource handles reconnects. */
export class WikimediaStream {
  private source: EventSource | null = null;
  connect(onEvent: (event: WikiEvent) => void, onStatus: (status: ConnectionStatus) => void): void {
    this.close();
    onStatus('connecting');
    const source = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');
    this.source = source;
    source.onopen = () => onStatus('connected');
    source.onerror = () => onStatus('reconnecting');
    source.onmessage = message => {
      try {
        const event = normalizeEvent(JSON.parse(message.data));
        if (event) onEvent(event);
      } catch { /* Ignore keep-alives and malformed payloads. */ }
    };
  }
  close(): void {
    this.source?.close();
    this.source = null;
  }
}
