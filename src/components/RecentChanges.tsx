import type { WikiEvent } from "@/types/wiki";

export function RecentChanges({ events }: { events: WikiEvent[] }) {
  return (
    <section className="panel recent">
      <div className="section-heading">
        <h2>Modifiche recenti</h2>
        <span>ULTIMI 20 EVENTI</span>
      </div>
      {events.length === 0 ? (
        <p className="empty">Le modifiche di OpenStreetMap appariranno qui.</p>
      ) : (
        <ol className="event-list">
          {events.map((event) => (
            <li key={event.id}>
              <span className={`delta ${event.delta < 0 ? "negative" : ""}`}>
                {event.kind === "welcome"
                  ? "NUOVO"
                  : `${event.delta > 0 ? "+" : ""}${event.delta.toLocaleString("it-IT")}`}
              </span>
              <div>
                <a href={event.url} target="_blank" rel="noopener noreferrer">
                  {event.kind === "welcome"
                    ? `Benvenuto, ${event.user}!`
                    : event.title}
                </a>
                <p>
                  <a
                    href={event.userUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {event.user}
                  </a>
                  {event.anonymous && " · anonimo"}
                  {event.bot && " · bot"}
                  {event.reverted && " · annullamento"}
                  {event.kind === "edit" && " · oggetti"}
                </p>
              </div>
              <span className="language-code">{event.language}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
