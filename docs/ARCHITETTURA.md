# Architettura

## Confini delle responsabilità

`app/layout.tsx` e `app/page.tsx` sono Server Components: definiscono metadata, lingua e punto di ingresso. `WikipediaApp` è il confine client e compone l’interfaccia. Tutti gli accessi a `window`, EventSource e AudioContext avvengono dopo il mount o durante un gesto dell’utente, evitando errori di rendering sul server.

| Modulo | Responsabilità |
| --- | --- |
| `Header` | Stato connessione, avvio audio, volume e mute |
| `ActivityCanvas` | Area SVG, statistiche, legenda e welcome |
| `EditBubble` | Geometria e collegamento di una modifica |
| `RecentChanges` | Registro testuale degli ultimi eventi |
| `SettingsPanel` | Controlli React nativi per scala, musica, visibilità e hashtag |
| `About` | Spiegazione e attribuzioni |
| `useSettings` | Stato delle preferenze e sincronizzazione con hash URL |
| `useWikipedia` | Flusso, filtri, contatori, lista eventi e lifecycle audio |
| `OpenStreetMapStream` | Connessione SSE interna, oggetti reali e deduplicazione delle versioni |
| `app/api/osm/stream` | Risposta HTTP in streaming, validazione del cursore e annullamento |
| `lib/osmReplication` | Stato delle repliche, decompressione XML, sequenze e checkpoint |
| `lib/osm` | Normalizzazione di changeset e oggetti in `WikiEvent` |
| `EventSequence` | Coda della presentazione: un oggetto per passo, anche senza audio |
| `WikimediaStream` | Servizio storico, non istanziato dall’app attuale |
| `AudioEngine` | Coda sequenziale, programmazione audio, cache MP3, volume e rilascio |
| `lib/events` | Validazione dati esterni, hashtag e geometria deterministica |
| `types/wiki` | Modello eventi, impostazioni e stato connessione |

Le classi gestiscono risorse imperative; i componenti gestiscono l’interfaccia dichiarativa. Non ci sono manipolazioni dirette del DOM né variabili globali. React gestisce gli eventi e CSS gestisce le animazioni. Le impostazioni correnti sono lette dal callback SSE tramite ref: cambiare filtri o volume non richiede ricreare la connessione.

## Percorso di un evento

1. Il browser apre `EventSource('/api/osm/stream')` dopo l’inizializzazione delle preferenze.
2. Il backend legge `state.yaml` da `planet.openstreetmap.org/replication/changesets`, poi scarica ogni file `.osm.gz` necessario. La prima connessione parte dall’ultima sequenza; una riconnessione parte dal cursore `Last-Event-ID`.
3. `parseReplication` valida e legge l’XML, converte `num_changes` in `changes_count` e raccoglie i tag. Il server scarica anche `/api/0.6/changeset/<id>/download`, valida `osmChange` ed emette un messaggio SSE per changeset con metadati e array `elements`, identificato da `<sequenza>:<indice>`. Il cursore avanza solo dopo il download riuscito. Anche i file vuoti ricevono un checkpoint.
4. `normalizeOsmElement` verifica tipo, ID, versione, changeset e azione. Produce un evento per oggetto, con delta `+1` o `-1` e identità `osm:<tipo>:<id>:<versione>`. Usa le coordinate del nodo o il bounding box del changeset come fallback. `OpenStreetMapStream` conserva fino a 100.000 ID per deduplicare le versioni.
5. `useWikipedia` accoda gli oggetti in `EventSequence`. A ogni passo il callback legge le impostazioni correnti, applica i tag, aggiorna statistiche, registro e grafica e invia la nota se udibile. Gli eventi esclusi possono restare come cerchi attenuati. Il timestamp viene assegnato alla presentazione, per non far scadere gli oggetti in attesa.
6. Le liste alimentano SVG e globo. Ogni secondo scadono gli eventi grafici dopo 60 secondi e si aggiorna la frequenza ponderata: sei intervalli da dieci secondi, pesi dal più recente 6 al più vecchio 1. Il registro contiene 20 eventi e i cerchi al massimo 180.

## SSE, riconnessioni e tempi della sorgente

OSM pubblica repliche circa ogni minuto. Il browser non esegue polling; il backend controlla lo stato ogni 10 secondi dopo aver elaborato i file disponibili. Ogni richiesta esterna ha timeout di 15 secondi e cache disabilitata. In caso di errore il server emette `status: reconnecting` e ritenta senza saltare la sequenza fallita. I keep-alive sono commenti SSE.

La risposta suggerisce `retry: 3000`; `EventSource` gestisce riconnessione e invio di `Last-Event-ID`. Il cursore consente di riprendere anche dentro un file. La chiusura annulla fetch e attese lato server; il client ignora callback di connessioni precedenti. La rotta richiede Node.js e supporto dell’hosting per HTTP in streaming. Non è un flusso push istantaneo dal database OSM e non recupera tutta la cronologia alla prima apertura.

La vecchia rotta `/api/osm/changesets` e il servizio Wikimedia restano nel repository per compatibilità e storia del progetto; il percorso corrente usa `/api/osm/stream`.

## Audio

`EventSequence` presenta gli oggetti singolarmente e `AudioEngine` mantiene la programmazione audio in ordine. I nuovi batch si aggiungono alla sequenza, senza mostrare tutto insieme né scartare note con un limitatore di burst. Una nota rappresenta una versione modificata di un oggetto: un changeset con tre oggetti genera tre eventi visivi e tre note. La presentazione prosegue anche senza audio.

Il motore programma gli eventi sul tempo di `AudioContext`, con un piccolo anticipo e un controllo della coda ogni 25 ms quando necessario. Senza MP3, `getEditSound` calcola nota e intervallo usando tipo di oggetto, azione e differenze rispetto all’evento precedente. `EventSequence` usa lo stesso intervallo per la visualizzazione; senza audio mantiene un passo di 0,5 secondi. Il riverbero può lasciare risuonare la coda delle note precedenti.

Con MP3 ogni oggetto aggiunge la durata per elemento scelta dall’utente; la presentazione usa lo stesso passo. Segmenti consecutivi dello stesso brano estendono un’unica sorgente in loop, conservando continuità e posizione. Il motore precarica i brani dei paesi successivi e condivide download concorrenti dello stesso URL; il primo caricamento può comunque causare un’attesa. Ogni brano mantiene il proprio punto di ripresa nella sessione.

La riproduzione continua finché ci sono eventi in coda; una coda lunga aumenta il ritardo rispetto alla ricezione. Mute, volume zero, cambio della sorgente audio e sospensione del contesto svuotano la coda audio; la presentazione continua silenziosamente. La distruzione dell’app cancella entrambe le code. Alla distruzione vengono annullati i download, fermate le sorgenti e rilasciate le risorse audio. Il download distingue creazione, modifica ed eliminazione; gli oggetti eliminati usano il sintetizzatore delle rimozioni.

## Sicurezza, prestazioni e accessibilità

I dati esterni vengono mostrati come testo React, senza `innerHTML`. I link agli eventi sono generati su `openstreetmap.org` usando ID numerici validati e nomi utente codificati. Il server valida il cursore prima di costruire i percorsi di replica. I collegamenti esterni hanno `noopener noreferrer`.

I controlli hanno label, focus visibile, checkbox native e pulsanti. Lo stato connessione usa `role=status`; il registro non è una live region per evitare annunci vocali continui. SVG usa un viewBox responsive. `prefers-reduced-motion` disattiva le animazioni: la rimozione temporizzata degli elementi continua.

I limiti sulle liste contengono la memoria della visualizzazione. La coda della presentazione conserva gli oggetti da mostrare e suonare: un flusso più veloce dell’ascolto aumenta il backlog. Ogni connessione SSE legge le repliche; per molti visitatori si può introdurre un lettore condiviso che distribuisca gli eventi.

## Estensioni

Per aggiungere un brano per paese consulta [la guida ai brani](../public/location/README.md). I moduli delle lingue sono compatibilità storica e non filtrano OSM. Per cambiare il flusso mantieni il contratto `WikiEvent` nella classe del servizio. Per cambiare il suono modifica `AudioEngine`; i componenti non dipendono da dettagli audio. Per introdurre preferenze persistenti estendi `useSettings` e documenta esplicitamente quali dati finiscono nell’URL o nel browser.
