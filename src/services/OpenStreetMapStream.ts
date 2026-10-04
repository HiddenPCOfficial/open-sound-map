import { normalizeChangeset } from '../lib/osm';
import type { ConnectionStatus, WikiEvent } from '../types/wiki';

/** Receive replication events immediately; EventSource resumes after disconnects. */
export class OpenStreetMapStream {
  private source: EventSource | null = null;

  connect(onEvent: (event: WikiEvent) => void, onStatus: (status: ConnectionStatus) => void): void {
    this.close();
    onStatus('connecting');
    const counts = new Map<number, number>();
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
      const event = normalizeChangeset(item);
      if (!event) return;
      const changeset = item as { id: number; changes_count: number };
      const previous = counts.get(changeset.id);
      if (previous !== undefined && changeset.changes_count <= previous) return;
      counts.delete(changeset.id);
      counts.set(changeset.id, changeset.changes_count);
      if (counts.size > 4000) counts.delete(counts.keys().next().value!);
      onEvent({ ...event, delta: previous === undefined ? event.delta : changeset.changes_count - previous });
    };
  }

  close(): void {
    this.source?.close();
    this.source = null;
  }
}
