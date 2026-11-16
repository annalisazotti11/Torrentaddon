DEEPSEARCH PERSONALE v0.3.0 — PIÙ INDICI TORRENT

Un aggiornamento del TUO addon Cloudflare Workers, NON un nuovo addon per Nuvio/AiOStreams.

NUOVE SORGENTI (default abilitate)
- APIBay (API JSON The Pirate Bay): ricerca generalista
- Torrents-CSV: indice pubblico con infohash
- TorrentProject: endpoint JSON con infohash (disponibilità da verificare sul Worker)
- Nyaa RSS: principalmente anime e contenuti asiatici

SORGENTI GIÀ PRESENTI
Knaben, EZTV, YTS, TheRarBg, Torlock, Torznab aggiuntivi configurabili.
Bitsearch resta OFF, perché aveva restituito HTTP 429.

MIGLIORAMENTI
- Riconosce titoli che iniziano con [Gruppo Fansub].
- Supporta due alias conosciuti consecutivi nello stesso titolo, per esempio
  The Diary of Anne Frank Il diario di Anna Frank 1959 1080p.
- Ignora infohash nulli di 40 caratteri (falso 'nessun risultato').
- Consulta le nuove fonti con massimo 2 query ciascuna; timeout e errori
  di una fonte non bloccano le altre.
- /debug/... restituisce i conteggi separati e gli errori delle nuove fonti.
- Mantiene lo stesso manifest ID e gli stessi URL privati.

AGGIORNAMENTO SU GITHUB (annalisazotti11/Torrentaddon)
1) Aprire https://github.com/annalisazotti11/Torrentaddon
2) Sostituire il contenuto di index.mjs con il file index.mjs allegato.
3) Sostituire wrangler.toml con quello allegato (o aggiungere solo le nuove variabili).
4) Commit delle modifiche sul branch utilizzato dal deploy Cloudflare.
5) Verificare nel dashboard Cloudflare Workers che il deploy sia riuscito.
6) Dal browser, mantenendo SEGRETO il token del Worker, aprire:
   https://<worker>/<TOKEN>/health -> deve mostrare la versione 0.3.0
   https://<worker>/<TOKEN>/debug/movie/tt1727587.json
   (diagnostica per Sintel, film di prova).
7) In AiOStreams NON aggiungere un nuovo addon: continua a usare DeepSearch Personale
   già configurato con Service Wrap e TorBox.
8) In Nuvio aggiornare la lista dei risultati. Eventuali stream continuano a
   essere filtrati e limitati a due da AiOStreams, NON da questo Worker.

CONFIGURAZIONE OPZIONALE
Nel pannello di Cloudflare si possono disattivare singole fonti impostando
ENABLE_APIBAY / ENABLE_TORRENTSCSV / ENABLE_TORRENTPROJECT / ENABLE_NYAA = "false".
Le variabili sono già presenti nel wrangler.toml in modalità "true".
La variabile EXTRA_SOURCE_QUERIES (=2) limita il numero di ricerche per fonte.

Per aggiungere titoli alternativi italiani senza modificare codice, creare
Cloudflare Worker Secret EXTRA_ALIASES con un JSON come:
{"tt0052738":["Il diario di Anna Frank"]}
(chiavi IMDb, liste di titoli; opzionale).

LIMITAZIONI IMPORTANTI
I test inclusi verificano parsing e filtraggio con risposte simulate, NON la
raggiungibilità in tempo reale da Cloudflare. /debug mostra 403, 429, timeout
ed errori se un indice limita le richieste.
Questo codice non garantisce disponibilità per puntate rare come Le Iene S26E1,
né può garantire riproducibilità, autenticità dell'audio italiano o 1080p quando
la release non dichiara o non possiede tali caratteristiche.
Utilizzare solo per materiale distribuito lecitamente o per il quale si dispone
dei diritti necessari.
