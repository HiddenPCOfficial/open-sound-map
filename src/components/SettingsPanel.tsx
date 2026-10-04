import type { ReactNode } from "react";
import { useState } from "react";
import { SCALES, isScaleId } from "@/lib/music";
import { isIntervalScale, parseTags } from "@/lib/settings";
import type { Settings } from "@/types/wiki";

const TOGGLES = [
  ["hideTitles", "Nascondi descrizioni dei changeset"],
  ["hideLog", "Nascondi registro delle modifiche"],
  ["hideGraphics", "Ascolta in sottofondo, senza grafica"],
] as const;
export function SettingsPanel({
  settings,
  onChange,
  music,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  music?: ReactNode;
}) {
  const [tab, setTab] = useState("music");
  return (
    <section className="panel settings" id="settings">
      <nav className="settings-tabs" aria-label="Categorie impostazioni">
        {[
          ["music", "Musica"],
          ["display", "Visualizzazione"],
          ["filters", "Filtri"],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <fieldset hidden={tab !== "music"}>
        <legend>Musica</legend>
        {music}
        <label htmlFor="scale">Scala musicale</label>{" "}
        <select
          id="scale"
          value={settings.scale}
          onChange={(event) => {
            if (isScaleId(event.target.value))
              onChange({ scale: event.target.value });
          }}
        >
          {SCALES.map((scale) => (
            <option key={scale.id} value={scale.id}>
              {scale.name}
            </option>
          ))}
        </select>
        <label htmlFor="interval-scale">
          Fattore di durata tra gli eventi · {settings.intervalScale.toFixed(2).replace(".", ",")}
        </label>
        <input
          id="interval-scale"
          type="range"
          min={0.05}
          max={0.25}
          step={0.01}
          value={settings.intervalScale}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (isIntervalScale(value)) onChange({ intervalScale: value });
          }}
        />
        <p className="hint">
          Moltiplica l’intervallo originale: 0,08 trasforma 100 secondi in 8
          secondi. Scegli un fattore tra 0,05 e 0,25. Valori più bassi accelerano
          la sequenza. Si applica subito anche all’attesa in corso.
        </p>
        <p className="hint">
          Ogni nodo, via o relazione modificata genera un cerchio e una nota
          nella scala scelta. Gli elementi vengono mostrati e suonati uno
          alla volta; durante i picchi gli elementi successivi restano in coda.
        </p>
      </fieldset>
      <fieldset hidden={tab !== "display"}>
        <legend>Visualizzazione</legend>
        <div className="toggles">
          {TOGGLES.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(event) => onChange({ [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset hidden={tab !== "filters"}>
        <legend>Filtra per hashtag</legend>
        <label htmlFor="tags">Hashtag nel riepilogo della modifica</label>
        <input
          id="tags"
          className="tag-input"
          type="text"
          placeholder="es. #arte, #scienza"
          defaultValue={settings.tags.join(", ")}
          onChange={(event) =>
            onChange({ tags: parseTags(event.target.value) })
          }
        />
        <p className="hint">
          Separa i tag con spazi o virgole. Basta un tag corrispondente. Gli
          altri cerchi restano visibili, ma silenziosi.
        </p>
      </fieldset>
    </section>
  );
}
