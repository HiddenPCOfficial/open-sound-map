export function About() {
  return (
    <footer className="about">
      <h2>Ascolta una mappa che cresce.</h2>
      <p>
        La fonte degli eventi è OpenStreetMap. Ogni nodo, via o relazione
        aggiornata dentro un changeset viene mostrata con un cerchio e produce
        una nota. Gli elementi sono presentati uno alla volta, in ordine,
        anche quando arrivano insieme. All’apertura vengono mostrate anche le
        modifiche recenti. Le note delle
        modifiche sono generate in tempo reale con Tone.js e seguono la scala
        selezionata; gli MP3 scelti possono accompagnarle senza sostituirle.
      </p>
      <p>
        Il pianeta usa le coordinate dei nodi; per vie e relazioni usa il
        centro approssimativo dell’area del changeset. Dati © collaboratori
        OpenStreetMap, ODbL. I
        campioni degli annunci provengono dal progetto originale Hatnote.
      </p>
      <div className="footer-links">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap · attribuzione e licenza ↗
        </a>
        <a
          href="https://github.com/hatnote/listen-to-wikipedia"
          target="_blank"
          rel="noopener noreferrer"
        >
          Progetto originale Hatnote ↗
        </a>
        <a
          href="https://portfolio-bice-three-70.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          hiiddenPc
        </a>
        <a
          href="https://linktr.ee/karmagally"
          target="_blank"
          rel="noopener noreferrer"
        >
          karmagally
        </a>
      </div>
    </footer>
  );
}
