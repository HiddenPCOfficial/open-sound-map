import type { WikiEvent } from '../types/wiki';
import { DEFAULT_INTERVAL_SCALE, isIntervalScale } from '../lib/settings';

/** A single presentation clock for graphics, statistics and audio submissions. */
export class EventSequence {
  private queue: WikiEvent[] = [];
  private head = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private closed = false;
  private previousTime: number | null = null;
  private presentedAt = 0;

  private intervalScale = DEFAULT_INTERVAL_SCALE;

  constructor(private present: (event: WikiEvent) => void, intervalScale = DEFAULT_INTERVAL_SCALE) {
    if (isIntervalScale(intervalScale)) this.intervalScale = intervalScale;
  }

  setIntervalScale(value: number): void {
    if (this.closed || !isIntervalScale(value) || value === this.intervalScale) return;
    this.intervalScale = value;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.advance();
    }
  }

  enqueue(event: WikiEvent): void {
    if (this.closed) return;
    this.queue.push(event);
    if (!this.active) this.advance();
  }

  private advance(): void {
    this.timer = null;
    if (this.closed) return;
    this.active = true;
    while (!this.closed) {
      const item = this.queue[this.head];
      if (!item) {
        console.info('[EventSequence] Nessun prossimo evento: in attesa di nuove modifiche.');
        this.queue = []; this.head = 0; this.active = false;
        return;
      }
      const time = [item.editedAt, item.observedAt, item.receivedAt].find(value => typeof value === 'number' && Number.isFinite(value))!;
      const deltaSeconds = this.previousTime === null ? 0 : Math.max(0, (time - this.previousTime) / 1000);
      const elapsedSeconds = this.previousTime === null ? 0 : (Date.now() - this.presentedAt) / 1000;
      const scaledDeltaSeconds = deltaSeconds * this.intervalScale;
      const remainingSeconds = scaledDeltaSeconds - elapsedSeconds;
      if (remainingSeconds > 0) {
        console.info(`[EventSequence] Prossimo suono tra ${remainingSeconds} secondi`, {
          eventId: item.id,
          origineOrario: Number.isFinite(item.editedAt) ? 'timestamp modifica' : 'arrivo evento (fallback)',
          deltaSecondi: deltaSeconds,
          intervalloRiproduzioneSecondi: scaledDeltaSeconds,
          tempoTrascorsoSecondi: elapsedSeconds,
          attesaResiduaSecondi: remainingSeconds,
          eventiInCoda: this.queue.length - this.head,
        });
        // Long gaps may exceed the browser's maximum timeout; check again then.
        this.timer = setTimeout(() => this.advance(), Math.min(remainingSeconds * 1000, 2147483647));
        return;
      }
      this.head++;
      if (this.head > 1000) { this.queue = this.queue.slice(this.head); this.head = 0; }
      const delaySeconds = Math.max(0, -remainingSeconds);
      this.previousTime = time;
      this.presentedAt = Date.now();
      console.info('[EventSequence] Invio evento alla riproduzione', {
        eventId: item.id,
        ritardoTimerSecondi: delaySeconds,
        deltaSecondi: deltaSeconds,
        intervalloRiproduzioneSecondi: scaledDeltaSeconds,
        eventiInCoda: this.queue.length - this.head,
      });
      this.present({ ...item, observedAt: item.observedAt ?? item.receivedAt, receivedAt: this.presentedAt });
    }
  }

  close(): void {
    console.info('[EventSequence] Sequenza chiusa', { eventiAnnullati: this.queue.length - this.head });
    this.closed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
    this.head = 0;
  }
}
