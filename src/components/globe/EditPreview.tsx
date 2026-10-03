import type { WikiEvent } from "@/types/wiki";
export function EditPreview({ event }: { event: WikiEvent }) {
  return (
    <section className="edit-preview" aria-label="Dettagli della modifica">
      <div className="edit-preview-heading">
        <span>CHANGESET OPENSTREETMAP</span>
        <a href={event.url} target="_blank" rel="noopener noreferrer">
          Dettagli e oggetti modificati ↗
        </a>
      </div>
      <p>
        {event.delta.toLocaleString("it-IT")} oggetti aggiornati. Il punto
        indica il centro dell’area interessata; un changeset può coprire più
        luoghi e contenere aggiunte, modifiche e rimozioni.
      </p>
    </section>
  );
}
