# Migrazione e verifica

## Dal progetto originale

| Prima | Dopo |
| --- | --- |
| HTML con script inline e variabili globali | Next.js App Router, TypeScript, componenti e hook |
| jQuery, tagsInput, noUiSlider | Stato React, input testuale e range nativi |
| D3 per creazione e rimozione SVG | SVG dichiarativo React, animazioni CSS |
| Howler | Classe AudioEngine con Tone.js per le note e Web Audio API per i campioni |
| WebSocket Wikimon per ogni lingua | EventSource verso `/api/osm/stream`, alimentato dalle repliche OSM |
| seedrandom modifica Math.random globale | Hash puro per posizione stabile degli eventi |
| Annunci/registro composti come HTML | Testo React con escaping automatico |

Il selettore del backend HTTP/HTTPS non serve più perché la sorgente è HTTPS. Il nuovo progetto non carica gli script legacy. La versione precedente può essere conservata nella sua cartella: il nuovo codice non la importa. I campioni e LICENSE mantengono l’attribuzione originale.

Le animazioni durano 60 secondi per una modifica, 2,5 per l’onda e 7 per un annuncio. I raggi sono limitati a 150 unità per mantenere leggibilità. Il rendering mantiene massimo 180 eventi contemporanei; in caso di traffico intenso può rimuovere i più vecchi prima della scadenza. Non si riproducono intenzionalmente note prima di **Attiva audio**. I riepiloghi OSM attuali non generano annunci di nuovi utenti.

## Dal polling OSM a SSE e coda audio

| Prima | Ora |
| --- | --- |
| Il browser richiede `/api/osm/changesets` dopo ogni ciclo | Una connessione persistente `EventSource('/api/osm/stream')` |
| Liste recenti globali e italiane, limitate dall’API | File di replica globali letti in sequenza |
| Pausa artificiale tra gli eventi nel client | SSE con oggetti reali; coda client che presenta un elemento alla volta |
| Molte note scartate durante i burst; MP3 ignora gli eventi mentre suona | Una nota per versione di nodo, via o relazione; i batch successivi entrano nella stessa sequenza |
| MP3 avviato come segmento indipendente | Lo stesso brano continua su una sorgente estesa dagli eventi consecutivi |
| Ripresa dalla lista recente | Ripresa dal file e dall’indice tramite `Last-Event-ID` |

Il polling rimane solo tra backend e repliche pubbliche: verifica ogni 10 secondi, pubblicazione OSM circa ogni minuto. Non sono necessari chiavi API o nuovi servizi da avviare. L’hosting deve supportare Node.js e risposte HTTP in streaming. La prima apertura parte dall’ultima replica; la continuità dell’ascolto dipende dalla presenza di eventi in coda. Il ritardo può crescere se i dati arrivano più velocemente della riproduzione.

## Verifica automatica

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

I test OSM coprono normalizzazione, XML, cursori invalidi, batch oltre 100 elementi, ripresa dentro un file, file vuoti, errori upstream, annullamento e connessioni sostituite. I test della sequenza e dell’audio verificano che tre oggetti dello stesso changeset producano tre eventi visivi e tre note separate, anche senza audio attivo, oltre a batch successivi, continuità MP3, loop, ripresa e cambio paese. Restano anche test dei moduli Wikimedia storici.

## Verifica manuale nel browser

1. Avvia `npm run dev`, apri la pagina e verifica che gli oggetti OSM compaiano uno alla volta, ogni 0,5 secondi prima di attivare l’audio. Considera la pubblicazione circa ogni minuto.
2. In Network individua `/api/osm/stream`: la risposta deve avere tipo `text/event-stream` e restare aperta. Sono attesi eventi `data`, stati e checkpoint; il browser non deve richiedere ripetutamente `/api/osm/changesets`.
3. Premi **Attiva audio**. Un changeset con più oggetti deve generare una nota e un evento visivo per ogni elemento, senza mostrare tutto il batch insieme. Gli eventi del batch successivo entrano in coda.
4. Carica un MP3 e verifica che il brano continui dal punto precedente per gli oggetti in attesa, senza fermarsi tra segmenti consecutivi. Verifica il loop a fine brano.
5. Seleziona **Brani per paese**: gli eventi italiani usano il brano italiano; dove manca un brano vengono suonate note. Il cambio segue l’ordine della coda; un primo download lento può causare attesa.
6. Attiva mute o porta il volume a zero: la coda deve svuotarsi. Dopo il ripristino, vengono suonati gli eventi nuovi. Cambia sorgente audio e verifica che la vecchia coda non riparta.
7. Inserisci un hashtag poco frequente: gli altri cerchi restano attenuati, senza nuove note o righe. Nascondi grafica, descrizioni e registro e verifica i controlli.
8. Disattiva temporaneamente la rete: attendi lo stato di riconnessione. Al ripristino verifica una nuova richiesta SSE con `Last-Event-ID`, ripresa degli eventi e assenza di duplicati.
9. Apri il pianeta e seleziona un punto: i dettagli devono rimandare alla versione dell’oggetto e al changeset OSM. La posizione è quella del nodo oppure il centro approssimativo del bounding box del changeset.
10. Ridimensiona la pagina, naviga con Tab e prova le animazioni ridotte. Su iPhone cambia app o blocca lo schermo; se l’audio risulta sospeso, usa di nuovo **Attiva audio**.

I test automatici non dimostrano da soli l’uscita audio sui dispositivi, il comportamento delle reti mobili o la disponibilità futura della sorgente. I vecchi hash di lingua restano leggibili ma non filtrano i changeset OSM.
