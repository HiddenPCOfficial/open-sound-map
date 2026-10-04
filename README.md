# Listen to Wikipedia — Next.js e React

Ricostruzione del progetto Hatnote: modifiche in tempo reale, cerchi animati e musica generativa. Nessuna dipendenza da jQuery, D3 o Howler; rendering con React e note sintetizzate tramite Tone.js.

## Avvio

Richiede Node.js >= 20.9 e npm.

```sh
npm ci
npm run dev
```

Apri http://localhost:3000 e premi **Attiva audio**. Il browser richiede un gesto dell’utente per riprodurre suoni. La visualizzazione funziona anche prima dell’attivazione audio. Le note delle modifiche sono create da Tone.js; i tre campioni degli annunci vengono scaricati e decodificati al primo clic.

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

- Aggiunte: celesta; rimozioni: pizzicati di clav. Modifiche grandi producono note più basse e cerchi più grandi.
- Cerchi bianchi per utenti registrati, verdi per anonimi, viola per bot; clic per aprire l’articolo e titoli al passaggio del mouse.
- Annunci dei nuovi utenti con crescendo e collegamento alla pagina di discussione.
- Tutte le 43 edizioni/progetti del progetto originale, incluso Wikidata, selezionabili insieme.
- Volume, mute, ascolto senza grafica, visibilità dei titoli, degli annunci e del registro.
- Filtri hashtag insensibili a maiuscole/minuscole: OR tra tag nel riepilogo. Le modifiche escluse sono visibili con opacità ridotta e non producono suoni.
- Registro degli ultimi 20 eventi, contatore di modifiche accettate e media ponderata delle modifiche al minuto.
- URL compatibili con `#it,en,notitles,nowelcomes`; `#none` mantiene tutte le lingue disattivate. Le altre impostazioni valgono per la sessione.
- Riconnessione SSE automatica, rilascio delle risorse alla chiusura, limiti di memoria e massimo 15 suoni sovrapposti.

## Organizzazione

```text
src/
  app/         Layout e pagina Next.js App Router, stile globale
  components/  Interfaccia React: header, cerchi, canvas, registro, impostazioni
  hooks/       Stato React, preferenze URL e ciclo di vita dei servizi
  services/    Classi WikimediaStream e AudioEngine
  lib/         Funzioni pure: validazione eventi, lingue, tag, geometria
  types/       Contratti TypeScript condivisi
public/sounds/ Campioni originali MP3 e OGG
tests/         Test della validazione, filtri e compatibilità URL
docs/          Architettura, migrazione e verifica manuale
```

Vedi [architettura](docs/ARCHITETTURA.md) e [migrazione e verifica](docs/MIGRAZIONE.md).

## Flusso dati

La connessione client usa il flusso HTTPS ufficiale [Wikimedia EventStreams](https://wikitech.wikimedia.org/wiki/EventStreams) e la sua [API recent changes](https://www.mediawiki.org/wiki/API:Recent_changes_stream). Non è necessario avviare il vecchio backend Wikimon. In caso di disconnessione lo stato mostra “Riconnessione…”; senza lingue selezionate la connessione viene chiusa. È necessaria una connessione Internet e un browser con EventSource e Web Audio API.

La SSE riceve tutte le modifiche pubbliche Wikimedia: lingue e hashtag vengono filtrati nel browser. L’app conserva al massimo 180 elementi grafici, 20 righe di registro e 4.000 identificatori per evitare duplicati durante le riconnessioni. Eventuali protezioni di rete o indisponibilità Wikimedia possono interrompere il flusso.

## Attribuzioni e licenza

Il codice del progetto è distribuito con licenza libera **BSD-3-Clause**, riportata in [LICENSE](LICENSE). Consente uso, modifica e redistribuzione, anche commerciale, mantenendo gli avvisi di copyright, le condizioni e l'esclusione di garanzia. I nomi degli autori non possono essere usati per promuovere prodotti derivati senza autorizzazione.

Copyright © 2026 per questa versione Next.js e React.

Progetto originale: [Hatnote / Listen to Wikipedia](https://github.com/hatnote/listen-to-wikipedia), Stephen LaPorte e Mahmoud Hashemi. Ispirazione: BitListen di Maximillian Laumeister. Campioni audio riutilizzati dalla cartella `static/sounds` originale. Gli avvisi originali BSD e MIT sono conservati in [LICENSE](LICENSE); dipendenze, dati e materiali di terzi mantengono le rispettive licenze.

### Vista Pianeta 3D

Il selettore sotto l’intestazione alterna Lista e Pianeta 3D. Il globo Three.js mostra terre e confini Natural Earth (world-atlas, 110m), ruota con trascinamento e supporta zoom con rotella o gesto touch. I punti selezionabili corrispondono alle coordinate della voce Wikipedia o alla proprietà P625 terrestre di Wikidata, mai alla posizione dell’autore. Il pannello conserva fino a 100 modifiche localizzate mentre la vista è aperta; le voci senza coordinate non vengono posizionate. Le richieste sono raggruppate per lingua ogni quattro secondi, con cache temporanea e ripetizione in caso di errore.

Street View si apre dal dettaglio del punto, mantenendo il globo visibile. Senza configurazione è disponibile il collegamento a Google Maps. Per il panorama incorporato configura `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local` con una chiave abilitata per Maps Embed API e limitata ai domini dell’app, quindi riavvia il server. La copertura e il panorama disponibile dipendono da Google. I confini a bassa risoluzione sono adatti alla vista planetaria, non alla cartografia stradale.


## Fonte attuale: OpenStreetMap

La UI Next.js usa `OpenStreetMapStream` con una connessione SSE (`EventSource`) a `/api/osm/stream`. Il server legge in sequenza le [repliche ufficiali dei changeset OSM](https://planet.openstreetmap.org/replication/changesets/), senza il limite dei 100 risultati dell’API recente, e invia gli eventi senza distribuirli artificialmente nel tempo. Gli eventi sono changeset (gruppi di aggiornamenti), non singoli oggetti: ognuno attiva una nota Tone.js nella scala selezionata. Un eventuale segmento MP3 accompagna la nota. La prima connessione legge l’ultima replica disponibile; le riconnessioni riprendono tramite `Last-Event-ID`, con deduplicazione e conteggio degli incrementi nel client. OSM pubblica le repliche circa ogni minuto: il server ne verifica la disponibilità ogni 10 secondi, quindi questa sorgente non permette aggiornamenti istantanei al momento del salvataggio su OSM. La rotta richiede un runtime Node.js con risposte HTTP in streaming; eventuali limiti di durata dell’hosting causano una riconnessione automatica.

Il pianeta usa il centro del bounding box del changeset. I changeset senza bounding box restano nei cerchi e nel registro. La scala dei cerchi e delle note usa il numero di oggetti, non byte. La selezione delle lingue salvata in precedenza non limita più gli eventi. La cartografia del globo resta Natural Earth.
