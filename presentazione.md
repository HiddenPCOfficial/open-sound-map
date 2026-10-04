# Presentazione — Listen to OpenStreetMap

## 1. Il prodotto

**Listen to OpenStreetMap trasforma l’attività della mappa in un’esperienza visiva e musicale.**

Gli aggiornamenti diventano cerchi animati, punti su un pianeta 3D e note musicali. L’utente può scegliere scala, volume, filtri hashtag e accompagnamento MP3.

L’unità mostrata e suonata è una **versione di un oggetto OSM**: nodo, via o relazione. Il changeset raggruppa queste modifiche; ciascun elemento genera un evento distinto.

> Frase da presentare: «Il prodotto rende percepibile l’attività di una comunità: ogni oggetto aggiornato sulla mappa diventa un evento visivo e sonoro».

## 2. Architettura e flusso delle API

Il progetto usa Next.js e React. Il browser riceve gli eventi su una connessione SSE e gestisce filtri, rendering e audio. Il server legge i file di replica pubblicati da OSM.

```mermaid
sequenceDiagram
    participant U as Utente
    participant B as Browser / React
    participant N as API Next.js
    participant O as Repliche OpenStreetMap
    U->>B: Apre il prodotto
    B->>N: EventSource GET /api/osm/stream
    N-->>B: Connessione SSE aperta
    N->>O: GET state.yaml
    O-->>N: Ultima sequenza disponibile
    loop Ogni file disponibile, in sequenza
        N->>O: GET NNN/NNN/NNN.osm.gz
        O-->>N: XML compresso dei changeset
        N->>O: GET API changeset/id/download
        O-->>N: Oggetti effettivi del changeset
        N-->>B: SSE con metadati ed elements
        B->>B: Valida, deduplica e accoda ogni oggetto
    end
    B->>B: Mostra e suona un oggetto alla volta
    Note over N,O: Controllo nuovi file ogni 10 secondi; OSM pubblica circa ogni minuto
    Note over B,N: Dopo disconnessione EventSource invia Last-Event-ID
```

**La fonte attiva è OpenStreetMap.** I nomi `WikipediaApp`, `useWikipedia` e `WikiEvent` sono storici; il servizio istanziato è `OpenStreetMapStream`.

## 3. Quali API vengono chiamate

| Chiamante → destinatario | Metodo e URL | Scopo | Avvio / frequenza |
| --- | --- | --- | --- |
| Browser → backend | `GET /api/osm/stream` | Ricevere eventi SSE | Una connessione persistente dopo l’inizializzazione delle preferenze; riconnessione automatica |
| Backend → OSM | `GET https://planet.openstreetmap.org/replication/changesets/state.yaml` | Leggere l’ultima sequenza pubblicata | All’avvio e dopo ogni ciclo, con attesa di 10 secondi |
| Backend → OSM | `GET https://planet.openstreetmap.org/replication/changesets/NNN/NNN/NNN.osm.gz` | Leggere i changeset di ogni replica | Per ogni sequenza disponibile, senza saltare file intermedi |
| Backend → API OSM | `GET https://api.openstreetmap.org/api/0.6/changeset/<id>/download` | Ottenere gli oggetti effettivi del changeset | Per ogni changeset non vuoto prima di emettere il messaggio SSE |

Le richieste sono `GET`, senza body, chiavi API o autenticazione. L’app legge dati pubblici e non modifica la mappa. La vecchia rotta `/api/osm/changesets` resta nel repository, ma il client attivo non la usa.

## 4. Cosa invia il browser e cosa invia il server

### Richiesta del browser

```http
GET /api/osm/stream
Accept: text/event-stream
```

Il browser gestisce `Accept` attraverso `EventSource`. Alla riconnessione aggiunge l’ultimo ID ricevuto, per esempio:

```http
Last-Event-ID: 7211593:5
```

L’ID identifica la sequenza e il numero di elementi già consegnati in quel file. Lingue, hashtag e posizione del visitatore non vengono inviati; i filtri hashtag sono locali.

### Richieste e risposta del backend

Il backend invia `User-Agent: ListenToOpenStreetMap/1.0`, disabilita la cache delle richieste esterne e applica un timeout di 15 secondi. La risposta SSE usa `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no` per evitare buffering negli intermediari che rispettano questi header.

## 5. Il lavoro dell’API interna

La rotta `src/app/api/osm/stream/route.ts` e `src/lib/osmReplication.ts`:

1. Validano `Last-Event-ID`; un formato invalido restituisce `400`.
2. Leggono `state.yaml`. Una prima connessione parte dall’ultima replica; una riconnessione riprende dal file e dall’indice indicati.
3. Scaricano e decomprimono i file `.osm.gz`, validano l’XML e trasformano `num_changes` in `changes_count` e i tag XML in un oggetto JSON.
4. Scaricano il dettaglio `osmChange` di ciascun changeset e inviano un messaggio SSE con metadati e array `elements`. Se il download fallisce, non avanzano il cursore oltre quel changeset.
5. Inviano un checkpoint anche per i file vuoti e continuano con la sequenza successiva.
6. Quando i file disponibili sono terminati, attendono 10 secondi prima di rileggere lo stato. Il keep-alive è un commento SSE e non genera un changeset.
7. In caso di errore della sorgente inviano lo stato `reconnecting` e ritentano senza avanzare oltre il file fallito.

La chiusura della connessione annulla le richieste e le attese del server. La rotta richiede un runtime Node.js e un hosting che supporti risposte HTTP in streaming.

## 6. Quali dati arrivano

Esempio illustrativo di un messaggio SSE:

```text
id: 7211593:5
data: {"id":123456,"user":"MapperExample","changes_count":3,"tags":{"comment":"Edifici #survey"},"elements":[{"type":"node","id":100,"version":2,"changeset":123456,"action":"modify","lat":45.47,"lon":9.19,"tags":{}},{"type":"way","id":200,"version":1,"changeset":123456,"action":"create","tags":{}},{"type":"relation","id":300,"version":4,"changeset":123456,"action":"delete","tags":{}}]}

```

| Campo | Uso nel prodotto |
| --- | --- |
| `id`, `user`, `tags` del changeset | Collegamento al changeset, autore, commento e hashtag |
| `changes_count` | Conteggio del riepilogo; non determina il numero di eventi simulati |
| `elements[].type`, `id`, `version` | Identità dell’oggetto e deduplicazione |
| `elements[].action` | Creazione, modifica o eliminazione |
| `elements[].lat`, `lon` | Coordinate del nodo quando disponibili |
| Bounding box del changeset | Posizione approssimativa per oggetti senza coordinate proprie |

## 7. Una sequenza per visualizzazione e musica

`OpenStreetMapStream` riceve i messaggi SSE, normalizza gli oggetti con `normalizeOsmElement` e deduplica per tipo, ID e versione. Conserva fino a 100.000 identificatori. Gli oggetti reali provengono dal download del changeset: non vengono inventati a partire da `changes_count`.

`EventSequence` accoda gli oggetti in ordine e ne presenta uno alla volta. Un changeset con tre elementi produce tre cerchi, tre righe di registro e, con audio attivo, tre note. I batch successivi entrano nella stessa coda. Senza audio il passo è 0,5 secondi. Con note attive segue la cadenza musicale calcolata; con MP3 usa la durata per elemento selezionata. La sequenza funziona anche senza audio o in mute; i filtri correnti vengono applicati al momento della presentazione. Il timestamp dell’evento viene aggiornato quando è mostrato, evitando che scada mentre aspetta in coda.

`AudioEngine` programma le note sul tempo audio. Segmenti consecutivi dello stesso brano estendono una sola sorgente continua; i brani dei paesi successivi vengono precaricati. Un primo caricamento può richiedere attesa. Mute, volume zero, cambio della sorgente audio e sospensione fermano l’audio, mentre la presentazione continua. La chiusura cancella entrambe le code.

Il server suggerisce una riconnessione dopo 3 secondi. `EventSource` invia `Last-Event-ID`; il cursore riprende il changeset del file di replica, mentre gli identificatori degli oggetti evitano duplicati nella sessione. Le callback di connessioni sostituite vengono ignorate.

OSM pubblica repliche circa ogni minuto e il server controlla nuovi file ogni 10 secondi. I dati possono arrivare in batch: è la coda client a presentarli singolarmente. Una coda lunga aumenta il ritardo rispetto alla sorgente; quando si esaurisce, attende dati nuovi. La prima connessione non recupera tutta la cronologia precedente.

## 8. Dal JSON alla visualizzazione e alla musica

La normalizzazione produce un `WikiEvent` per versione di oggetto con ID `osm:<tipo>:<id>:<versione>`. Il campo `delta` è `+1` per creazioni e modifiche, `-1` per eliminazioni. `osm` conserva tipo, ID, versione, azione e ID del changeset; `changesetUrl` rimanda al gruppo di modifiche.

`useWikipedia` elimina ulteriori duplicati e applica i filtri hashtag. Gli eventi corrispondenti aggiornano contatore, frequenza e registro; quelli esclusi possono restare visibili come cerchi attenuati e silenziosi.

- **Cerchi:** fino a 180 eventi grafici; gli eventi OSM scadono dopo 60 secondi.
- **Registro:** ultimi 20 eventi corrispondenti ai filtri.
- **Pianeta:** riceve la lista del registro e mostra gli eventi con coordinate valide. Il flusso attuale gli passa quindi al massimo 20 eventi, anche se un’etichetta della UI riporta `/100`.
- **Posizione:** coordinate del nodo quando disponibili; altrimenti centro del bounding box del changeset, una posizione approssimativa.
- **Audio:** dopo l’attivazione dell’utente, Tone.js sintetizza note nella scala scelta; ogni elemento genera una nota. Eventuali segmenti MP3 possono accompagnarla.

Il download distingue `create`, `modify` e `delete`; le eliminazioni usano il sintetizzatore delle rimozioni.

## 9. Altre richieste: file statici e collegamenti

| Risorsa | Quando viene richiesta | Funzione |
| --- | --- | --- |
| `/geo/countries-110m.json` | All’apertura del pianeta; anche alla prima selezione della musica per posizione | Confini del globo e riconoscimento locale del paese |
| `/location/italy.mp3` | Quando la modalità geografica seleziona il brano italiano, se non già nella cache audio | Accompagnamento musicale per eventi localizzati in Italia |
| URL del brano selezionato | Alla selezione, se non già nella cache audio | Caricamento e decodifica dell’MP3 |

Queste sono richieste di asset, non API esterne di dati. I file MP3 scelti dal computer vengono letti tramite URL `blob:` nel browser: non vengono caricati sul server.

Il clic su un evento apre `https://www.openstreetmap.org/<tipo>/<id>/history/<versione>`; il dettaglio offre anche il collegamento al changeset. il link all’autore apre `https://www.openstreetmap.org/user/<nome codificato>`. Sono navigazioni verso pagine web.

## 10. Distinzione dal vecchio flusso Wikipedia

`src/services/WikimediaStream.ts` contiene ancora una connessione SSE:

```text
https://stream.wikimedia.org/v2/stream/recentchange
```

Quel servizio usa `EventSource` per ricevere messaggi continui e beneficiare della riconnessione automatica del browser, ma **non è istanziato nel flusso attuale dell’app**.

Il codice attuale non chiama API Wikipedia/Wikidata per ottenere coordinate e non incorpora Street View. I servizi Wikimedia e i relativi test restano come codice storico; questa presentazione segue il flusso OpenStreetMap collegato alla pagina.

## 11. Traccia breve per l’esposizione

> «Il browser mantiene una connessione SSE con la nostra API. Il server legge le repliche OpenStreetMap e scarica gli oggetti di ogni changeset. Il client li accoda: un nodo, una via o una relazione viene mostrata e suonata alla volta, anche se i dati arrivano insieme. Un changeset con tre elementi produce tre eventi e tre note. I batch successivi continuano la stessa sequenza; con un MP3 il brano prosegue finché ci sono eventi. Dopo una disconnessione il flusso riprende tramite l’ultimo ID ricevuto».

## Riferimenti nel repository

- [Pagina e metadati del prodotto](src/app/layout.tsx)
- [Composizione dell’interfaccia](src/components/WikipediaApp.tsx)
- [Hook: eventi, filtri, statistiche e audio](src/hooks/useWikipedia.ts)
- [Client SSE e deduplicazione OSM](src/services/OpenStreetMapStream.ts)
- [API SSE interna](src/app/api/osm/stream/route.ts)
- [Lettura e ripresa delle repliche](src/lib/osmReplication.ts)
- [Normalizzazione dei changeset e degli oggetti](src/lib/osm.ts)
- [Pianeta e dati visualizzati](src/components/globe/PlanetView.tsx)
- [Coda della presentazione](src/services/EventSequence.ts)
- [Test della presentazione singola](tests/event-sequence.test.ts)
- [Motore audio e caricamento MP3](src/services/AudioEngine.ts)
- [Selezione musicale per paese](src/lib/locationMusic.ts)
- [Test SSE, XML e ripresa delle repliche](tests/osm-replication.test.ts)
- [Test della coda audio e continuità MP3](tests/mp3.test.ts)
- [Test della normalizzazione e del servizio OSM](tests/osm.test.ts)

Documento ricostruito dal codice del repository il 4 ottobre 2026. Gli esempi descrivono l’implementazione; non costituiscono una verifica live della disponibilità delle API esterne.
