DeepSearch Personale v0.2.0 — aggiornamento multi-indexer

INSTALLAZIONE:
1. Su GitHub apri il repository annalisazotti11/Torrentaddon.
2. Carica index.mjs e wrangler.toml di questo ZIP SOSTITUENDO i due file omonimi gia presenti, non creare copie con nomi differenti.
3. Commit changes sul branch main.
4. Su Cloudflare verifica Deployments > Ready.
5. Usa il tuo URL privato che termina con /debug/movie/tt1727587.json e controlla providers.
6. Non modificare il manifest, token, configurazione AiOStreams o TorBox.

FONTI:
- Knaben (API v2) per film, serie e releases multilingue
- EZTV (API IMDb) per serie
- YTS (API IMDb) per film, base documentata da terzi e soggetta a variazioni
- TheRarBg (JSON by IMDb) per film e serie
- Torlock (Torznab RSS) per film e serie
- Bitsearch DISABILITATO di default: nel test precedente rispondeva HTTP 429.
- TORZNAB_FEEDS: secret Cloudflare facoltativo per fino a 4 indexer aggiuntivi.
  Esempio: [{"url":"https://example.org/torznab/api","apikey":"CHIAVE"}]
  Inserire solo API URL di cui ci si fida, mai password TorBox.

RICERCA:
- Riconoscimento film con titolo e anno.
- Serie tramite episodio SxxEyy, NxEE o, quando la data ufficiale e nota dai metadati, data di trasmissione esatta.
- Titoli originali e alternative con TMDB_API_KEY facoltativa.
- Controllo infoHash e deduplica; formato compatibile con Service Wrap di AiOStreams.
- /debug/... mostra le fonti che rispondono, il numero di risultati e gli errori.

LIMITI:
Le API terze possono cambiare o rispondere 429/403. Questi provider non sono stati testati in tempo reale sul tuo Worker: servono prove tramite /debug dopo il deployment. Nessuna fonte assicura tutti i titoli. Ricerca solo contenuti per cui hai diritto di accesso.
