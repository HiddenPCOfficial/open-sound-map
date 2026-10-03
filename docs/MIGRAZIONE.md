# Migrazione e verifica

## Dal progetto originale

| Prima | Dopo |
| --- | --- |
| HTML con script inline e variabili globali | Next.js App Router, TypeScript, componenti e hook |
| jQuery, tagsInput, noUiSlider | Stato React, input testuale e range nativi |
| D3 per creazione e rimozione SVG | SVG dichiarativo React, animazioni CSS |
| Howler | Classe AudioEngine con Tone.js per le note e Web Audio API per i campioni |
| WebSocket Wikimon per ogni lingua | Un EventSource HTTPS Wikimedia con filtro client |
| seedrandom modifica Math.random globale | Hash puro per posizione stabile degli articoli |
| Annunci/registro composti come HTML | Testo React con escaping automatico |

Il selettore del backend HTTP/HTTPS non serve più perché la sorgente è HTTPS. Il nuovo progetto non carica gli script legacy. La versione precedente può essere conservata nella sua cartella: il nuovo codice non la importa. I campioni e LICENSE mantengono l’attribuzione originale.

Le animazioni durano 60 secondi per una modifica, 2,5 per l’onda e 7 per un annuncio. I raggi sono limitati a 150 unità per mantenere leggibilità. Il rendering mantiene massimo 180 eventi contemporanei; in caso di traffico intenso può rimuovere i più vecchi prima della scadenza. Non si riproducono intenzionalmente note prima di **Attiva audio**. I nuovi utenti vengono annunciati subito, senza il ritardo iniziale di 20 secondi della versione precedente.

## Verifica automatica

`npm test` copre payload invalidi, host non consentiti, eventi nel namespace principale, creazione utenti, Wikidata, aggiunte/rimozioni, escaping dei link, filtri hashtag e formato hash originale. `npm run typecheck` verifica i contratti TypeScript, `npm run lint` le regole React/Next.js e `npm run build` il rendering e la compilazione di produzione.

## Verifica manuale nel browser

1. Avvia `npm run dev` e apri la pagina. Conferma passaggio da Connessione a In diretta e comparsa delle modifiche.
2. Premi Attiva audio: verifica campane e pizzicati. Varia volume e mute. Se un caricamento fallisce, usa Riprova audio.
3. Seleziona italiano e inglese: gli eventi devono appartenere alle lingue scelte. Deseleziona tutte le lingue: lo stato deve chiedere di selezionarne una.
4. Inserisci un hashtag poco frequente: gli altri cerchi devono risultare più deboli, senza audio né righe nuove. Rimuovi il filtro e conferma ripresa del registro.
5. Nascondi grafica, titoli, annunci e registro, verificando che l’ascolto prosegua.
6. Apri direttamente `/#it,en,notitles` e verifica selezioni e titoli nascosti. Un hash sconosciuto ripiega sull’inglese.
7. Ridimensiona la pagina, naviga i controlli con Tab e attiva l’opzione di sistema per ridurre le animazioni.
8. Disattiva temporaneamente la rete: lo stato deve indicare riconnessione, tornando In diretta dopo il ripristino.

Queste verifiche richiedono una sessione browser e dati Wikimedia reali. I test unitari e la build non dimostrano da soli riproduzione audio o disponibilità del servizio remoto.

## Esito della verifica iniziale

- Build di produzione Next.js 16.3.8: riuscita.
- TypeScript e lint: riusciti.
- Test automatici: 8 superati, inclusa chiusura e ricreazione della connessione SSE.
- Riproduzione audio e comportamento con feed reale: da verificare nel browser tramite la procedura sopra.
- `npm audit`: 5 segnalazioni high nella catena di dipendenze di sviluppo `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. La segnalazione riguarda pattern annidati che possono causare esaurimento dello stack. L’audit propone un downgrade incompatibile di eslint-config-next a 14.2.35; non è stato applicato. Nessuna segnalazione rilevata sulle dipendenze di produzione nell’audit iniziale. Prima di aggiornare le dipendenze, ricontrollare l’audit e rieseguire i controlli.
