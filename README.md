# Listen to OpenStreetMap — Next.js e React

Evoluzione del progetto Hatnote: changeset OpenStreetMap, cerchi animati, pianeta 3D e musica generativa. Nessuna dipendenza da jQuery, D3 o Howler; rendering con React e note sintetizzate tramite Tone.js.

## Avvio

Richiede Node.js >= 20.9 e npm.

```sh
npm ci
npm run dev
```

Apri http://localhost:3000 e premi **Attiva audio**. Il browser richiede un gesto dell’utente per riprodurre suoni. La visualizzazione funziona anche prima dell’attivazione audio. Le note delle modifiche sono create da Tone.js, una per ogni versione di oggetto modificata.

Su iPhone, campioni e sintetizzatori condividono un solo contesto audio, attivato con una sorgente silenziosa nello stesso tocco. Dove disponibile, l’Audio Session API configura la riproduzione come musica. Il tocco su **Attiva audio** emette una breve nota di conferma e il pulsante diventa **Prova audio**, per verificare l’uscita anche senza eventi live. Se il browser sospende l’audio, il pulsante **Attiva audio** torna disponibile; se l’attivazione rimane bloccata, dopo cinque secondi puoi riprovare. Per la verifica su dispositivo: attiva l’audio e attendi le modifiche, prova la modalità musicale per paese come prima selezione, poi cambia app o blocca lo schermo e torna alla pagina; se compare il pulsante, toccalo per riprendere. Verifica anche con la modalità silenziosa dell’iPhone attiva e il volume multimediale alzato. Sui browser senza Audio Session API potrebbe essere necessario disattivare la modalità silenziosa.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` avvia la build di produzione dopo `npm run build`. Non sono richieste chiavi API né variabili d’ambiente.

## Funzioni

- Singoli nodi, vie e relazioni OSM rappresentati da cerchi, con collegamenti alla versione dell’oggetto, al changeset e al profilo dell’autore.
- Nove scale musicali, volume, mute e riproduzione sequenziale: una nota per ogni oggetto modificato, con gli eventi successivi in coda.
- MP3 caricati dal dispositivo oppure brani per paese. Segmenti consecutivi dello stesso MP3 proseguono su una sorgente continua, senza scartare i changeset arrivati durante la riproduzione.
- Filtri hashtag senza distinzione tra maiuscole e minuscole: basta un tag corrispondente. Gli altri cerchi restano attenuati e silenziosi.
- Grafica, descrizioni e registro nascondibili; ultimi 20 eventi nel registro, contatore e frequenza ponderata.
- Pianeta 3D con coordinate dei nodi e centro del bounding box del changeset come fallback.
- Riconnessione SSE automatica e ripresa tramite `Last-Event-ID`.

La scala e la visibilità dei titoli sono salvate nell’hash URL. Gli identificatori di lingua storici sono ancora compatibili con i vecchi link, ma non filtrano la sorgente OSM. Gli annunci Wikimedia non vengono prodotti dalla sorgente OSM; gli oggetti eliminati hanno delta negativo e usano il sintetizzatore delle rimozioni.

## Organizzazione

```text
src/
  app/         Pagina, layout, stili e API SSE /api/osm/stream
  components/  Interfaccia, cerchi, registro, impostazioni e globo
  hooks/       Preferenze, filtri, statistiche e ciclo di vita
  services/    OpenStreetMapStream, AudioEngine e servizio Wikimedia storico
  lib/         Repliche OSM, normalizzazione, musica, tag e geometria
  types/       Contratti TypeScript condivisi
public/        Campioni audio, brani per paese e confini geografici
tests/         Test degli eventi, SSE, riconnessioni e coda audio
docs/          Architettura, migrazione e verifica manuale
```

Vedi [presentazione](presentazione.md), [architettura](docs/ARCHITETTURA.md) e [migrazione e verifica](docs/MIGRAZIONE.md).

## Flusso dati e audio

Il browser apre `EventSource('/api/osm/stream')`. Il backend Next.js legge `state.yaml` e i file `.osm.gz` dalle [repliche ufficiali OSM](https://planet.openstreetmap.org/replication/changesets/). La prima connessione parte dall’ultima replica disponibile; le riconnessioni riprendono dal file e dall’indice indicati da `Last-Event-ID`. Il server legge tutti i file intermedi, scarica `/api/0.6/changeset/<id>/download` e allega i nodi, le vie e le relazioni effettivi in un array `elements` per changeset. Il client deduplica per tipo, ID e versione: non simula gli oggetti moltiplicando il conteggio del riepilogo. La vecchia rotta `/api/osm/changesets` resta disponibile, ma non viene usata dal client.

OSM pubblica le repliche circa ogni minuto e il server controlla nuovi file ogni 10 secondi. SSE elimina il polling nel browser; non rende istantanea la pubblicazione dei dati OSM. Sono richiesti Internet, un browser con EventSource e Web Audio API e un hosting Node.js che supporti risposte HTTP in streaming. I limiti di durata dell’hosting possono causare riconnessioni automatiche.

`EventSequence` accoda gli oggetti e scandisce cerchi, registro, globo, statistiche e note con la differenza tra gli orari originali delle modifiche: tra le 15:06 e le 15:07 attende 60 secondi, anche se gli oggetti arrivano nello stesso batch. Il primo evento parte subito; i nuovi batch mantengono il tempo già trascorso dall'ultimo evento. Gli oggetti di ogni changeset sono ordinati per timestamp; timestamp uguali o precedenti non aggiungono attese. Se il timestamp manca, si usa l'orario di arrivo originale. La sequenza funziona anche senza audio attivo. Note, durata e intensità variano con creazione/modifica/cancellazione, tipo di oggetto, delta e differenza di delta, intervallo di arrivo e distanza geografica dall'editing precedente. Le note restano nella scala selezionata; due note consecutive uguali si spostano di un grado. La durata di una nota o di un segmento MP3 non determina l'attesa prima della modifica successiva.

Lo stesso brano prosegue senza riavvii e torna all’inizio alla fine del file. I brani dei paesi successivi vengono precaricati; un primo caricamento lento può ritardare il cambio. La coda può aumentare il ritardo rispetto alla sorgente: la riproduzione continua finché contiene eventi, poi attende dati nuovi.

Mute, volume zero, cambio della sorgente audio e sospensione del contesto fermano la coda audio; la presentazione continua silenziosamente. La chiusura dell’app cancella entrambe le code. L’app conserva al massimo 180 elementi grafici, 20 righe di registro e 100.000 identificatori per la deduplicazione. I limiti grafici non eliminano gli oggetti in attesa nella sequenza.

## Attribuzioni e licenza

Il codice del progetto è distribuito con licenza libera **BSD-3-Clause**, riportata in [LICENSE](LICENSE). Consente uso, modifica e redistribuzione, anche commerciale, mantenendo gli avvisi di copyright, le condizioni e l'esclusione di garanzia. I nomi degli autori non possono essere usati per promuovere prodotti derivati senza autorizzazione.

Copyright © 2026 per questa versione Next.js e React.

Progetto originale: [Hatnote / Listen to Wikipedia](https://github.com/hatnote/listen-to-wikipedia), Stephen LaPorte e Mahmoud Hashemi. Ispirazione: BitListen di Maximillian Laumeister. Campioni audio riutilizzati dalla cartella `static/sounds` originale. Gli avvisi originali BSD e MIT sono conservati in [LICENSE](LICENSE); dipendenze, dati e materiali di terzi mantengono le rispettive licenze.

## Vista Pianeta 3D

Il selettore sotto l’intestazione alterna cerchi e pianeta. Il globo Three.js usa confini Natural Earth a bassa risoluzione, ruota con trascinamento e supporta lo zoom. I punti usano le coordinate dei nodi quando disponibili. Per vie e relazioni usano il centro approssimativo del bounding box del changeset. Il pianeta riceve gli ultimi 20 eventi del registro e mostra quelli con coordinate valide; gli oggetti senza coordinate disponibili restano nei cerchi e nel registro.

Il clic su un punto mostra l’oggetto, la versione, l’autore e i collegamenti ai dettagli e al changeset. La modalità musicale per paese riconosce localmente il territorio dai confini; dove manca un brano usa note sintetizzate. Gli MP3 caricati restano nel browser e non vengono inviati al server. Vedi [brani per paese](public/location/README.md) per aggiungerne altri.
