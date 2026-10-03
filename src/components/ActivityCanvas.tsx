import { matchesTags } from "@/lib/events";
import type { Settings, WikiEvent } from "@/types/wiki";
import { EditBubble } from "./EditBubble";

export function ActivityCanvas({
  events,
  settings,
  rate,
  total,
}: {
  events: WikiEvent[];
  settings: Settings;
  rate: number;
  total: number;
}) {
  const welcome = [...events]
    .reverse()
    .find((event) => event.kind === "welcome");
  return (
    <section
      className={`activity ${settings.hideGraphics ? "background-mode" : ""}`}
      aria-label="Visualizzazione delle modifiche"
    >
      <div className="canvas-heading">
        <span>Open Street Map / LIVE</span>
        <span>
          {settings.languages.length}{" "}
          {settings.languages.length === 1 ? "edizione" : "edizioni"}
        </span>
      </div>
      {settings.hideGraphics ? (
        <div className="canvas-empty">♫ Ascolto in sottofondo</div>
      ) : (
        <>
          <svg
            viewBox="0 0 1200 650"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Cerchi animati: la dimensione indica i oggetti modificati"
          >
            {events
              .filter((event) => event.kind === "edit")
              .map((event) => (
                <EditBubble
                  key={event.id}
                  event={event}
                  hideTitle={settings.hideTitles}
                  silent={!matchesTags(event, settings.tags)}
                />
              ))}
          </svg>
          {events.length === 0 && (
            <div className="canvas-empty">
              In attesa di modifiche
              <span>Ogni modifica diventa una nota e un cerchio.</span>
            </div>
          )}
        </>
      )}
      {welcome && !settings.hideWelcomes && settings.tags.length === 0 && (
        <a
          key={welcome.id}
          className="welcome"
          href={welcome.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Benvenuto a {welcome.user}, nuovo utente di Wikipedia (
          {welcome.language})!
        </a>
      )}
      <div className="canvas-footer">
        <div>
          <strong>{rate}</strong> modifiche / minuto{" "}
          <span className="divider">/</span>{" "}
          <strong>{total.toLocaleString("it-IT")}</strong> totali
        </div>
        <div className="legend">
          <span className="registered">Utenti</span>
          <span className="anonymous">Anonimi</span>
          <span className="bot">Bot</span>
        </div>
      </div>
      {settings.tags.length > 0 && (
        <div className="tag-warning">
          Ascolto: {settings.tags.map((tag) => `#${tag}`).join(", ")}
        </div>
      )}
    </section>
  );
}
