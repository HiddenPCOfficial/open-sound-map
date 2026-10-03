import { articlePosition, editRadius } from "@/lib/events";
import type { WikiEvent } from "@/types/wiki";

export function EditBubble({
  event,
  hideTitle,
  silent,
}: {
  event: WikiEvent;
  hideTitle: boolean;
  silent: boolean;
}) {
  const [x, y] = articlePosition(event.title);
  const radius = editRadius(event.delta);
  const type = event.anonymous ? "anonymous" : event.bot ? "bot" : "registered";
  return (
    <g
      transform={`translate(${x * 1200}, ${y * 650})`}
      className={`bubble ${type}`}
      style={{ opacity: silent ? 0.2 : 1 }}
    >
      <circle className="ripple" r={radius + 20} />
      <a
        href={event.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Apri ${event.title}`}
      >
        <title>
          {event.title} · {event.user} · {event.delta > 0 ? "+" : ""}
          {event.delta} oggetti
        </title>
        <circle className="core" r={radius} />
        <text
          className={
            hideTitle || silent ? "article-label hover-only" : "article-label"
          }
          textAnchor="middle"
          y="5"
        >
          {event.title}
        </text>
      </a>
    </g>
  );
}
