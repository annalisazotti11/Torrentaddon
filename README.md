# DeepSearch Personale — addon per AiOStreams / TorBox

## Cosa contiene

Addon **stream-only**, non altera Home, cataloghi o AIOMetadata. Accetta gli ID IMDb di film e serie TV, recupera metadati tramite Cinemeta, interroga **Knaben API v2** e **Bitsearch API v1**, filtra per titolo e anno/episodio, elimina duplicati tramite `infoHash` e restituisce stream torrent nel formato Stremio. AiOStreams esegue **Service Wrapping con TorBox** (il progetto NON necessita della chiave TorBox).

- Italiano/inglese/altre lingue: interrogazione del titolo canonico e, se si inserisce `TMDB_API_KEY`, anche titoli alternativi (fra cui IT, EN e altri). Le lingue nel nome del file NON garantiscono che la traccia audio esista.
- Serie TV: solo risultati che indicano chiaramente l'episodio esatto (SxxEyy o NxEE). I season pack vengono scartati per evitare di selezionare il file errato.
- Film: anno di uscita obbligatorio per limitare i falsi positivi, configurabile con `REQUIRE_YEAR`.
- Qualità: tag 4K/1080p/720p, bitrate/qualità e priorità più avanzate vanno impostate in AiOStreams.
- Niente scraper di siti arbitrari: solo API documentate; per altri indexer va realizzato un adattatore.

## Installazione gratuita con Cloudflare Workers

1. Usa [Cloudflare Workers & Pages](https://dash.cloudflare.com/) sul piano **Free** (non selezionare Workers Paid).
2. **Via browser, senza PC acceso né terminale:** crea un repository **privato** su GitHub; carica i file estratti dallo ZIP conservando le directory `src/` e `test/`. Da Cloudflare: **Workers & Pages → Create application → GitHub**, collega il repository e avvia il deployment. La [documentazione di Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) conferma il deployment automatico da GitHub.
3. In Cloudflare, nella pagina del Worker, apri **Settings → Variables and Secrets** e aggiungi `ADDON_TOKEN` come **Secret**: usa un valore casuale di almeno 24 caratteri. Se necessario, avvia un nuovo deployment. Non inserirlo mai in codice pubblico.
4. Prendi il sottodominio `workers.dev` effettivamente assegnato da Cloudflare. Il tuo manifest avrà forma `https://NOME.UTENTE.workers.dev/VALORE_DI_ADDON_TOKEN/manifest.json`; sostituisci i segnaposto, senza condividere l'URL completo.
5. In AiOStreams v2: **Addons → Installed → Add by URL**, incolla il manifest. Abilita **Service Wrapping** per questo addon e TorBox fra i servizi. Il Worker restituisce torrent `infoHash` e AiOStreams li converte nei collegamenti TorBox.
6. Configura **Groups** in AiOStreams per usare DeepSearch come fallback quando le fonti principali restituiscono pochi stream validi. Salva, poi prova su Nuvio/Stremio. **Non toccare i cataloghi AIOMetadata.**

Alternativa tramite terminale, solo per il primo deployment: nella cartella estratta esegui `npm run deploy`, poi `npx wrangler secret put ADDON_TOKEN`. Il server resterà su Cloudflare; non è necessario lasciare acceso il computer.

**Opzionale:** Per più titoli tradotti, inserisci `TMDB_API_KEY` come segreto (`npx wrangler secret put TMDB_API_KEY`). Per il limite API Bitsearch più alto, aggiungi `BITSEARCH_API_KEY` (facoltativo). Non inserire la chiave TorBox nell'addon.

## Test (senza rete)

`npm test`

## Verifiche ancora necessarie dopo il deployment

- Test reali contro entrambe le API: in questo ambiente sono state verificate le rispettive documentazioni ma non è stato possibile inviare richieste HTTP live, quindi lo schema Knaben può richiedere un piccolo adeguamento.
- Test operativo AiOStreams/TorBox su un film liberamente distribuibile e un episodio con diritto di riproduzione.
- Verifica delle quote giornaliere delle API; Bitsearch dichiara 200 richieste/giorno senza API key, 1000/giorno con account gratuito. Cloudflare Workers Free riporta 100.000 richieste/giorno ma limiti CPU/subrequest separati.

## Limiti e sicurezza

L'addon non cerca *tutto il web*: interroga due indici specifici, espandibili. Non può garantire copertura completa, audio reale, riproducibilità di torrent senza file indicizzato, presenza di cache TorBox o gratuità futura delle piattaforme. Le opere e gli indexer sono soggetti a licenze, termini e leggi applicabili; utilizza solo materiali per i quali hai titolo di accesso.

Fonti tecniche: https://aiostreams.org/reference/addon-protocol/streams/ ; https://aiostreams.org/configuration/options/ ; https://aiostreams.org/faq/ ; https://knaben.org/api/v2/ ; https://bitsearch.eu/api ; https://developers.cloudflare.com/workers/platform/limits/
