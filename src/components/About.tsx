export function About() {
  return (
    <footer className="about">
      <h2>Ascolta una mappa che cresce.</h2>
      <p>
        La fonte degli eventi è OpenStreetMap. Ogni changeset raggruppa gli
        aggiornamenti alla mappa: il numero di oggetti modificati determina la
        dimensione del cerchio e l’altezza della nota. Gli eventi vengono
        controllati circa ogni 15–25 secondi e riprodotti gradualmente.
        All’apertura vengono mostrate anche le modifiche recenti. Le note delle
        modifiche sono generate in tempo reale con Tone.js e seguono la scala
        selezionata; gli MP3 scelti possono accompagnarle senza sostituirle.
      </p>
      <p>
        Il pianeta mostra il centro dell’area di ciascun changeset, una
        posizione approssimativa. Dati © collaboratori OpenStreetMap, ODbL. I
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
      </div>
    </footer>
  );
}
