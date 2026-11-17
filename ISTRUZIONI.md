# DeepSearch Personale 1.0.0 — raccolta delle fonti 2026

## In sintesi

- Un solo addon Stremio (ID invariato `org.deepsearch.personale`): non serve installarne altri in Nuvio.
- 27 adapter/varianti elencati nel catalogo `/sources`. Alcuni sono sperimentali e/o disattivati di default perché le richieste da Cloudflare sono bloccate o soggette a CAPTCHA/429; non sono 27 fonti *garantite funzionanti*.
- Le principali fonti generaliste del 2026 coperte direttamente (con disponibilità variabile) includono Knaben, APIBay/The Pirate Bay, BitSearch, LimeTorrents, 1337x, TheRarBg, BitTorrented, BTDig, SolidTorrents, BT4G e Torrents-CSV.
- Fonti TV/film/anime: EZTV (più mirror opzionale), YTS (più endpoint opzionale), Nyaa (opzionale), SubsPlease (opzionale), Torlock; altri indirizzi sperimentali (TorrentProject, UIndex, Magnetz, TorrentDownloads).
- Sono mantenuti TorBox Search e TSP come aggregatori **opzionali con chiave API**, le funzioni per data/stagione/episodio, i link ufficiali e la scritta «Usa app Mediaset» per le pagine episodio confermate.
- Compatibilità con un aggregatore Jackett/Prowlarr tramite Torznab «all» (opzionale) e fino a 50 feed Torznab nominali inseriti dall'utente. 16 feed per richiesta come limite predefinito; configurabile fino a 30, entro il limite totale delle richieste.
- Supporto per 24 endpoint JSON esterni configurabili in un Secret; 8 interrogati per richiesta come valore predefinito.
- Limite massimo predefinito di **44 interrogazioni sorgenti** per titolo/episodio, per evitare richieste illimitate. Priorità a gateway e feed personali.

**Importante:** Non esiste una soluzione capace di cercare letteralmente tutti i torrent online senza accessi o server aggiuntivi. Tracker privati/semi-privati richiedono le credenziali e le condizioni d'uso del loro servizio. Siti protetti da CAPTCHA o Cloudflare Turnstile non vengono aggirati. Gli adapter HTML sono soggetti a cambiamenti delle pagine e devono essere verificati su Cloudflare prima di definirli funzionanti.

## Installazione senza creare addon nuovi

1. Nel repository https://github.com/annalisazotti11/Torrentaddon sostituisci i file alla radice `index.mjs` e `wrangler.toml` con gli omonimi del pacchetto. Non cancellarli preventivamente.
2. Commit changes. In Cloudflare, verifica che il nuovo deployment sia `Ready`, `Active` e con 100% del traffico.
3. Apri lo stesso URL `/health` con il token già configurato. Deve dare `{"ok":true,"version":"1.0.0"}`.
4. `/sources` elenca gli adapter previsti, indica quali sono abilitati e mostra se la connessione dell'aggregatore è configurata, senza rivelare chiavi.
5. `/debug/series/tt0887984:30:1.json` analizza un esempio (Le Iene S30E1). Questo JSON dice quali upstream **rispondono davvero**, quali danno 403/429 e quanti risultati superano il controllo puntata. Non confondere `0 risultati` con un errore della sintassi.
6. Poiché l'ID e l'URL del manifest non cambiano, **non reinstallare AiOStreams/Nuvio**. Aggiorna solo se hai cambiato il token.

## Nuove variabili per le fonti aggiunte

In `wrangler.toml` sono presenti, tra le altre:

- `ENABLE_LIMETORRENTS="true"`
- `ENABLE_1337X="true"` (tentativi via HTML; può subire blocchi anti-bot)
- `ENABLE_TORRENTDOWNLOADS="false"` (endpoint sperimentale)
- `ENABLE_SUBSPLEASE="false"` (sorgente anime)
- `ENABLE_TORRENTPROJECT_RSS="false"`
- `ENABLE_EZTV_ALTERNATE="false"`
- `ENABLE_YTS_OFFICIAL="false"`
- `MAX_PROVIDER_REQUESTS="44"` (da 12 a 90)
- `MAX_CUSTOM_FEEDS_PER_REQUEST="16"` (da 1 a 30)
- `MAX_JSON_FEEDS_PER_REQUEST="8"` (da 1 a 16)

Conserva le variabili e i Secret già impostati su Cloudflare. **Non inserire segreti in `wrangler.toml` o su GitHub.**

## Supporto a molti altri tracker via Torznab (opzionale)

Puoi collegare un'istanza di Jackett o Prowlarr accessibile in HTTPS. Configura nel Worker (Settings → Variables and Secrets):

- `TORZNAB_ALL_URL` = URL completo dell'endpoint Torznab `all` del tuo aggregatore
- `TORZNAB_ALL_API_KEY` = chiave dell'aggregatore, **Secret**

Sono supportati anche i Secret già esistenti `TORZNAB_FEEDS` come array JSON, e `CUSTOM_JSON_FEEDS`. Per esempio:

`TORZNAB_FEEDS` (da impostare come **Secret**, non in GitHub):

```json
[
  {"name":"Indice 1","url":"https://tuo-indice.example/api","apikey":"INSERISCI_NEL_SECRET"},
  {"name":"Indice italiano","url":"https://altro-indice.example/api","apikey":"INSERISCI_NEL_SECRET","queryMode":"date"}
]
```

`queryMode:"date"` usa la data esatta quando presente anziché solo il numero di episodio, utile per programmi TV italiani. Le chiavi API presenti nei Secret non vengono elencate nelle risposte `/sources` o `/debug`.

`CUSTOM_JSON_FEEDS` (opzionale; JSON array di endpoint HTTPS che restituiscono `infoHash` + `title` o `name`, senza formati proprietari):

```json
[
  {"name":"Indice JSON autorizzato","url":"https://tuo-api.example/search","queryParam":"q","apiKeyHeader":"X-Api-Key","apiKey":"INSERISCI_NEL_SECRET"}
]
```

È necessario **avere l'accesso legittimo** agli indici che richiedono login o una chiave. Torznab non crea account né aggira limitazioni.

## Limiti e problemi già noti

- TorrentGalaxy originale è stato segnalato come chiuso nel 2025: non viene spacciato per fonte attiva.
- Anime Tosho ha smesso di aggiungere nuovi torrent nel maggio 2026: non viene inserito come fonte operativa.
- MasterChef e Le Iene possono avere formati delle release e date che non coincidono con metadati Stremio: la ricerca contiene entrambe le varianti, ma solo un hash confermato e un episodio corrispondente vengono pubblicati.
- Per aprire una puntata gratuita verificata, DeepSearch emette `externalUrl`; la visualizzazione in Nuvio e il formato di AiOStreams dipendono dalle loro impostazioni. Per preservare «Usa app Mediaset», nella configurazione custom DeepSearch di AiOStreams abilita **Format Passthrough** (NON Result Passthrough).
- Un addon diverso che mostra `N/A` e rimanda a TorrentClaw non è il nostro collegamento Mediaset; questa versione non modifica o paga quel servizio.

## Test

Nel pacchetto sono inclusi i file `*.test.mjs`. Verifica locale (Node 20+):

`node --test *.test.mjs`

I test simulano i risultati delle API HTML/JSON/XML e verificano matching e protezione delle chiavi, **non provano la raggiungibilità reale degli upstream da Cloudflare**.
