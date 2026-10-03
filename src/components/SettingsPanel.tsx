import type { ReactNode } from "react";
import { useState } from "react";
import { SCALES, isScaleId } from "@/lib/music";
import { parseTags } from "@/lib/settings";
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
        <p className="hint">
          Una scala comune a tutti gli eventi, su tre ottave. Modifiche piccole:
          note acute; grandi: note gravi. La dimensione indica il numero di
          oggetti aggiornati nel changeset. Durante i picchi vengono riprodotte
          meno note.
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
