import { LOCATION_MODE } from "@/lib/locationMusic";
import type { useWikipedia } from "@/hooks/useWikipedia";

type Props = Pick<
  ReturnType<typeof useWikipedia>,
  | "locationTrack"
  | "tracks"
  | "selectedTrack"
  | "trackLoading"
  | "trackError"
  | "segmentRange"
  | "selectTrack"
  | "uploadTracks"
  | "changeSegmentRange"
>;
export function Mp3Settings({
  locationTrack,
  tracks,
  selectedTrack,
  trackLoading,
  trackError,
  segmentRange,
  selectTrack,
  uploadTracks,
  changeSegmentRange,
}: Props) {
  return (
    <div className="mp3-settings">
      <label htmlFor="audio-track">Sorgente audio</label>
      <select
        id="audio-track"
        value={selectedTrack}
        onChange={(event) => void selectTrack(event.target.value)}
      >
        <option value="">Note musicali di OpenStreetMap</option>
        <option value={LOCATION_MODE}>Brani per paese</option>
        {tracks.map((track) => (
          <option key={track.id} value={track.id}>
            {track.name}
          </option>
        ))}
      </select>
      {selectedTrack === LOCATION_MODE && (
        <p className="hint">
          La posizione dell’elemento sceglie il brano del paese. Italia: Funiculì
          Funiculà. Dove manca un brano vengono suonate le note. I confini sono
          approssimativi; il segmento in corso termina prima di cambiare paese.
        </p>
      )}
      {locationTrack && (
        <p role="status" className="hint">
          {locationTrack}
        </p>
      )}
      <label className="mp3-upload" htmlFor="mp3-files">
        ＋ Carica file MP3
        <input
          id="mp3-files"
          type="file"
          accept=".mp3,audio/mpeg"
          multiple
          onChange={(event) => {
            if (event.target.files) uploadTracks(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <p className="hint">
        I file caricati restano disponibili durante questa sessione e vengono
        riprodotti sul tuo dispositivo. Massimo 100 MB per file.
      </p>
      {trackLoading && (
        <p role="status" className="hint">
          Preparazione del brano…
        </p>
      )}
      {trackError && (
        <p role="alert" className="audio-error">
          {trackError}
        </p>
      )}
      {selectedTrack && (
        <div className="segment-settings">
          <h3>Durata per elemento</h3>
          <div className="segment-ranges">
            <label>
              Durata · {segmentRange.min.toFixed(1)} s
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={segmentRange.min}
                onChange={(event) => {
                  const min = Number(event.target.value);
                  changeSegmentRange(min, Math.max(min, segmentRange.max));
                }}
              />
            </label>
          </div>
          <p className="hint">
            Ogni oggetto modificato viene mostrato e suonato per{" "}
            {segmentRange.min.toFixed(1)} secondi. Gli elementi successivi
            restano in coda e il brano prosegue finché ci sono eventi.
            Alla fine della canzone si riparte dall’inizio.
          </p>
        </div>
      )}
    </div>
  );
}
