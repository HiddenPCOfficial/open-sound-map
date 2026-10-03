"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { EditPreview } from "./EditPreview";
import type { WikiEvent } from "@/types/wiki";
import { useLocatedEvents, type LocatedEvent } from "./useLocatedEvents";
const EarthScene = dynamic(
  () => import("./EarthScene").then((m) => m.EarthScene),
  {
    ssr: false,
    loading: () => <p className="globe-error">Caricamento del pianeta…</p>,
  },
);
export function PlanetView({ events }: { events: WikiEvent[] }) {
  const { located, status } = useLocatedEvents(events);
  const [selected, setSelected] = useState<LocatedEvent | null>(null);
  const [street, setStreet] = useState(false);
  const choose = (e: LocatedEvent) => {
    setSelected(e);
    setStreet(false);
  };
  return (
    <section className="planet-view" aria-label="Modifiche sul pianeta Terra">
      <div className="planet-stage">
        <div className="planet-heading">
          <span>OPENSTREETMAP / LIVE ATLAS</span>
          <h2>Il mondo, una modifica alla volta.</h2>
          <p>
            Trascina per ruotare · scorri o pizzica per lo zoom · seleziona un
            punto
          </p>
        </div>
        <EarthScene events={located} selected={selected} onSelect={choose} />
        <div className="planet-caption">
          <strong>{located.length} modifiche localizzate</strong>
          <span>{status}</span>
          <small>
            Confini: Natural Earth · dati cartografici a bassa risoluzione
          </small>
        </div>
      </div>
      <aside className="planet-detail">
        {selected ? (
          <>
            <span className="eyebrow">
              PUNTO SELEZIONATO / {selected.language.toUpperCase()}
            </span>
            <h3>{selected.title}</h3>
            <p>
              {selected.user} · {selected.delta > 0 ? "+" : ""}
              {selected.delta.toLocaleString("it-IT")} oggetti
            </p>
            <p className="coordinates">
              {selected.location.lat.toFixed(4)}°,{" "}
              {selected.location.lon.toFixed(4)}°
            </p>
            <div className="point-actions">
              <a href={selected.url} target="_blank" rel="noopener noreferrer">
                Apri il changeset ↗
              </a>
            </div>
            <EditPreview key={selected.id} event={selected} />
          </>
        ) : (
          <>
            <span className="eyebrow">ESPLORA IL PIANETA</span>
            <h3>Segui le modifiche alla mappa.</h3>
            <p>
              Seleziona un punto sul globo o una modifica qui sotto per
              avvicinarti al luogo e aprire il changeset.
            </p>
          </>
        )}
        <div className="located-heading">
          MODIFICHE GEOGRAFICHE <span>{located.length}/100</span>
        </div>
        {located.length === 0 && (
          <p className="planet-empty">
            In attesa di changeset con un’area geografica.
          </p>
        )}
        <ul className="located-list">
          {[...located].reverse().map((e) => (
            <li key={e.id}>
              <button
                onClick={() => choose(e)}
                aria-pressed={selected?.id === e.id}
              >
                <span>{e.title}</span>
                <small>
                  {e.language} · {e.delta > 0 ? "+" : ""}
                  {e.delta} oggetti
                </small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  );
}
