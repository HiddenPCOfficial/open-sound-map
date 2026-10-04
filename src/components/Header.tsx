import type { ConnectionStatus } from "@/types/wiki";

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connessione…",
  connected: "In diretta",
  reconnecting: "Riconnessione…",
  paused: "In pausa",
};
interface Props {
  status: ConnectionStatus;
  audioState: "off" | "loading" | "on" | "error";
  volume: number;
  muted: boolean;
  onEnable: () => void;
  onVolume: (volume: number) => void;
  onMute: () => void;
  onSettings: () => void;
  onAbout: () => void;
}
export function Header({
  status,
  audioState,
  volume,
  muted,
  onEnable,
  onVolume,
  onMute,
  onSettings,
  onAbout,
}: Props) {
  return (
    <header className="header">
      <div>
        <a className="brand" href="#top">
          Listen to OpenStreetMap<span className="brand-dot">.</span>
        </a>
        <p className="tagline">Il suono della mappa, in tempo reale.</p>
      </div>
      <div className="header-controls">
        <span className={`status ${status}`} role="status">
          <span />
          {LABELS[status]}
        </span>
          <button onClick={onEnable} disabled={audioState === "loading"}>
            {audioState === "loading"
              ? "Caricamento audio…"
              : audioState === "error"
                ? "Riprova audio"
                : audioState === "on"
                  ? "♫ Prova audio"
                  : "♫ Attiva audio"}
          </button>
        <button className="secondary" onClick={onMute} aria-pressed={muted}>
          {muted ? "Riattiva" : "Silenzia"}
        </button>
        <label className="volume">
          Volume{" "}
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => onVolume(Number(event.target.value))}
          />
        </label>
        <button className="secondary settings-trigger" onClick={onSettings}>
          ⚙ Impostazioni
        </button>
        <button
          className="icon-button"
          onClick={onAbout}
          aria-label="Come funziona"
        >
          ?
        </button>
      </div>
      {audioState === "error" && (
        <p role="alert">
          Audio non avviato. Tocca Riprova audio. Se resta muto, controlla il volume multimediale e la modalità silenziosa dell’iPhone.
        </p>
      )}
    </header>
  );
}
