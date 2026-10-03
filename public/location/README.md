# Brani per paese

Questa cartella contiene gli MP3 della modalità **Brani per paese**.

- `italy.mp3`: Luciano Pavarotti — Funiculì Funiculà, fornito dall’utente.

Per aggiungere un paese, inserire `<nome-paese>.mp3` qui (minuscolo, senza spazi)
e registrare URL e titolo in `src/lib/locationMusic.ts`, usando come chiave
l’ID ISO numerico del paese presente in `public/geo/countries-110m.json`.
L’Italia usa `380`. Non vengono richiesti file per paesi non registrati.

Il paese viene ricavato localmente dal centro del changeset OpenStreetMap e dai
confini della mappa: coste, piccoli territori e changeset a cavallo dei confini
possono risultare approssimativi. Dove manca un brano si usano note sintetizzate.
Ogni modifica avvia un segmento; gli eventi durante un segmento vengono ignorati.
I brani sono mantenuti in memoria e riprendono dal punto precedente quando si
ritorna allo stesso paese, fino al cambio di modalità o alla fine della sessione.
