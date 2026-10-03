# Architettura

## Confini delle responsabilità

`app/layout.tsx` e `app/page.tsx` sono Server Components: definiscono metadata, lingua e punto di ingresso. `WikipediaApp` è il confine client e compone l’interfaccia. Tutti gli accessi a `window`, EventSource e AudioContext avvengono dopo il mount o durante un gesto dell’utente, evitando errori di rendering sul server.

| Modulo | Responsabilità |
| --- | --- |
| `Header` | Stato connessione, avvio audio, volume e mute |
| `ActivityCanvas` | Area SVG, statistiche, legenda e welcome |
| `EditBubble` | Geometria e collegamento di una modifica |
| `RecentChanges` | Registro testuale degli ultimi eventi |
| `SettingsPanel` | Controlli React nativi per lingue, visibilità e hashtag |
| `About` | Spiegazione e attribuzioni |
| `useSettings` | Stato delle preferenze e sincronizzazione con hash URL |
| `useWikipedia` | Flusso, filtri, contatori, lista eventi e lifecycle audio |
| `WikimediaStream` | Un’unica connessione SSE e normalizzazione dei payload |
| `AudioEngine` | Caricamento, decodifica, volume, polifonia e rilascio audio |
| `lib/events` | Validazione dati esterni, hashtag e geometria deterministica |
| `types/wiki` | Modello eventi, impostazioni e stato connessione |

Le classi gestiscono risorse imperative; i componenti gestiscono l’interfaccia dichiarativa. Non ci sono manipolazioni dirette del DOM né variabili globali. React gestisce gli eventi e CSS gestisce le animazioni. Le impostazioni correnti sono lette dal callback SSE tramite ref: cambiare lingua o volume non richiede ricreare la connessione.

## Percorso di un evento

1. EventSource riceve un messaggio dal flusso `recentchange`.
2. `normalizeEvent` verifica tipo, host Wikimedia, namespace, utente e lunghezze. Accetta modifiche/nuove pagine nel namespace principale e log di creazione utenti.
3. `useWikipedia` verifica lingua, duplicati e hashtag. Gli annunci sono sospesi con filtri hashtag o se nascosti.
4. Una modifica accettata aggiorna contatore, tempi e registro. Il motore audio la riproduce solo se l’utente ha attivato l’audio.
5. La lista grafica alimenta i componenti SVG. Gli eventi non corrispondenti ai tag sono visibili ma silenziosi.
6. Ogni secondo si rimuovono gli eventi scaduti e si aggiorna la frequenza ponderata: sei intervalli da dieci secondi, pesi dal più recente 6 al più vecchio 1.

## Audio

Le modifiche OpenStreetMap vengono trasformate in note MIDI dalla scala selezionata e sintetizzate direttamente con due `Tone.PolySynth`: uno per aggiunte/modifiche e uno più breve per le rimozioni. Il riverbero e il volume sono gestiti da Tone.js. I tre swell MP3 originali restano riservati agli annunci di nuovi utenti; gli eventuali brani MP3 possono accompagnare una modifica, ma non ne sostituiscono mai la nota. Alla distruzione dell’app vengono annullati i download, fermate le sorgenti, rilasciati i nodi Tone.js e chiuso l’AudioContext.

## Sicurezza, prestazioni e accessibilità

I dati esterni vengono mostrati come testo React, senza `innerHTML`. Gli URL sono generati usando esclusivamente host Wikipedia/Wikidata validati e titoli codificati. I collegamenti esterni hanno `noopener noreferrer`.

I controlli hanno label, focus visibile, checkbox native e pulsanti. Lo stato connessione usa `role=status`; il registro non è una live region per evitare annunci vocali continui. SVG usa un viewBox responsive. `prefers-reduced-motion` disattiva le animazioni: la rimozione temporizzata degli elementi continua.

I limiti sulle liste evitano accumuli indefiniti. Il flusso globale resta però una sorgente ad alto traffico; per installazioni con molti visitatori è possibile aggiungere un backend che filtri e distribuisca gli eventi.

## Estensioni

Per aggiungere una lingua aggiorna `lib/languages.ts`. Per cambiare il flusso mantieni il contratto `WikiEvent` nella classe del servizio. Per cambiare il suono modifica `AudioEngine`; i componenti non dipendono da dettagli audio. Per introdurre preferenze persistenti estendi `useSettings` e documenta esplicitamente quali dati finiscono nell’URL o nel browser.
