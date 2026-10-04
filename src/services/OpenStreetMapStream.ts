import { normalizeOsmElement } from '../lib/osm';
import type { ConnectionStatus, WikiEvent } from '../types/wiki';

/** Receive replication events immediately; EventSource resumes after disconnects. */
export class OpenStreetMapStream {
  private source: EventSource | null = null;

  connect(onEvent: (event: WikiEvent) => void, onStatus: (status: ConnectionStatus) => void): void {
    this.close();
    onStatus('connecting');
    const seen = new Set<string>();
    const source = new EventSource('/api/osm/stream');
    this.source = source;
    source.onopen = () => { if (this.source === source) onStatus('connected'); };
    source.onerror = () => { if (this.source === source) onStatus('reconnecting'); };
    source.addEventListener('status', message => {
      if (this.source !== source) return;
      const status = (message as MessageEvent).data;
      if (status === 'connected' || status === 'reconnecting') onStatus(status);
    });
    source.onmessage = message => {
      if (this.source !== source) return;
      let item: unknown;
      try { item = JSON.parse(message.data); } catch { return; }
      if (!item || typeof item !== 'object' || !Array.isArray((item as { elements?: unknown }).elements)) return;
      console.info('[OpenStreetMapStream] Blocco ricevuto', {
        changesetId: (item as { id?: unknown }).id,
        elementi: (item as { elements: unknown[] }).elements.length,
      });
      for (const element of (item as { elements: unknown[] }).elements) {
        if (this.source !== source) return;
        const event = normalizeOsmElement(element, item);
        if (!event || seen.has(event.id)) continue;
        seen.add(event.id);
        if (seen.size > 100000) seen.delete(seen.values().next().value!);
        onEvent(event);
      }
    };
  }

  close(): void {
    this.source?.close();
    this.source = null;
  }
}
