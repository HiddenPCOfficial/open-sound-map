import type { WikiEvent } from "@/types/wiki";
export function EditPreview({ event }: { event: WikiEvent }) {
  return (
    <section className="edit-preview" aria-label="Dettagli della modifica">
      <div className="edit-preview-heading">
        <span>ELEMENTO OPENSTREETMAP</span>
        <a href={event.url} target="_blank" rel="noopener noreferrer">
          Apri la versione dell’elemento ↗
        </a>
      </div>
      <p>
        {event.osm ? `${event.osm.type} #${event.osm.id} · versione ${event.osm.version} · ${event.osm.action}` : 'Oggetto aggiornato'}.
        {' '}Il punto usa le coordinate del nodo quando disponibili; altrimenti
        indica il centro approssimativo dell’area del changeset.
      </p>
      {event.changesetUrl && <a href={event.changesetUrl} target="_blank" rel="noopener noreferrer">Apri il changeset ↗</a>}
    </section>
  );
}
