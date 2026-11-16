PATCH v0.1.1: replace the existing index.mjs file at the root of your GitHub repo with this one. Do NOT change wrangler.toml if you already corrected its main and name.

Protected diagnostic: use the same private addon base URL as before, but end it with /debug/movie/tt1727587.json.

Result shows metadata lookup, search queries, per-source HTTP errors, number of torrents read, and number accepted by filters. No API key, magnet or torrent hash is returned in diagnostics.

This patch also handles Knaben bytes and liveSeeders and magnetUrl.

Never share the ADDON_TOKEN. Do not upload it to GitHub.
