/** DeepSearch Personale — stream-only Stremio addon for AIOStreams v2.
 * External indexers return torrent hashes; AIOStreams Service Wrapping manages TorBox.
 * Access only media you are entitled to download or stream.
 */
export const manifest = Object.freeze({
  id: 'org.deepsearch.personale', version: '0.3.0',
  name: 'DeepSearch Personale',
  description: 'Meta-ricerca multilingue multi-indexer con verifica titolo, anno, episodio e data; debrid attraverso AiOStreams.',
  resources: ['stream'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: []
});

const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*', 'Cache-Control':'public, max-age=180', ...extra}
});

const normal = str => String(str || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase().replace(/\s+/g,' ');
const unique = list => [...new Set(list.filter(Boolean))];
const getYear = str => { const m=String(str||'').match(/(?:19\d{2}|20\d{2})/); return m ? +m[0] : null; };
const num = value => { const n=Number(value); return Number.isFinite(n) && n>=0 ? n : undefined; };

/** Encoded magnet hashes may use 40-digit hex or 32-digit base32. */
export function hashFrom(item) {
  const magnet = String(item.magnetUri || item.magnetUrl || item.magnet || item.magnet_url || item.link || '');
  const fromMagnet = magnet.match(/btih:([a-f0-9]{40}|[a-z2-7]{32})(?:[^a-z0-9]|$)/i)?.[1];
  let hash = String(item.infoHash || item.infohash || item.info_hash || item.hash || item.btih || fromMagnet || '').trim();
  if (/^[a-f\d]{40}$/i.test(hash) && !/^0{40}$/.test(hash)) return hash.toLowerCase();
  if (/^[A-Z2-7]{32}$/i.test(hash)) {
    let bits=0, count=0, bytes=[];
    for (const ch of hash.toUpperCase()) {
      bits=(bits<<5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch); count+=5;
      if(count>=8) { count-=8; bytes.push((bits >> count)&255); bits&=(1<<count)-1; }
    }
    return bytes.length===20 ? bytes.map(b=>b.toString(16).padStart(2,'0')).join('') : null;
  }
  return null;
}

const markers = /^(?:19\d{2}|20\d{2}|2160p|1080p|720p|480p|4k|uhd|hdr|hdr10|dv|dolby|bluray|blu|bdrip|brrip|remux|web|webdl|webrip|hdrip|dvdrip|hdtv|x264|x265|h264|h265|hevc|av1|proper|repack|extended|directors|unrated|internal|limited|ita|italian|eng|english|multi|dual|truehd|dts|atmos|aac|ac3|ddp|eac3|s\d{1,2}e\d{1,2}|s\d{1,2}|\d+x\d+)$/i;
const junk = /\b(?:sample|trailer|extras?|featurettes?|behind[ ._-]?the[ ._-]?scenes|camrip|telesync|tc|ts|xbet|password)\b/i;
function matchPrefix(release, alias, aliases=[]) {
  const stripped=String(release||'').replace(/^\s*\[[^\]]{1,60}\]\s*/, '');
  const releaseN=normal(stripped), name=normal(alias);
  if(!name || !releaseN.startsWith(name)) return null;
  let rest=releaseN.slice(name.length).trim();
  if(!rest) return '';
  const validStart = value => markers.test(value.split(' ')[0])
    || /^(?:\d{1,2}\s+\d{1,2}\s+20\d{2})\b/.test(value);
  if(validStart(rest)) return rest;
  // Some Italian releases list both translated and original film titles before the year.
  // Accept this only if the second part is ALSO a known title alias and a marker follows.
  for(const alt of aliases) {
    const a=normal(alt);
    if(a && a!==name && rest.startsWith(a+' ')) {
      const tail=rest.slice(a.length).trim();
      if(validStart(tail)) return tail;
    }
  }
  return null;
}

/** Conservative matching. No filename information can guarantee a genuine audio track. */
export function verifyRelease(entry, target, requireYear=true) {
  const title=String(entry.title || entry.name || entry.filename || '').trim();
  if (!title || junk.test(title)) return null;
  if (target.type==='movie' && /\bS\d{1,2}E\d{1,2}\b/i.test(title)) return null;
  const aliases = [...target.aliases].sort((a,b)=>normal(b).length-normal(a).length);
  let rem=null;
  for (const alias of aliases) { rem=matchPrefix(title, alias, aliases); if(rem!==null) break; }
  if (rem===null) return null;
  if (target.type==='movie') {
    const year=target.year;
    const releaseYear=(rem.match(/\b(?:19\d{2}|20\d{2})\b/) || [])[0];
    if (year && releaseYear && Number(releaseYear)!==year) return null;
    if (requireYear && year && !releaseYear) return null;
    if (/\b(?:complete|collection|trilogy|duology|pack)\b/i.test(title)) return null;
  } else {
    const episodes = [...title.matchAll(/\bS(\d{1,2})[ ._-]*E(\d{1,3})\b/gi)];
    const alt = [...title.matchAll(/\b(\d{1,2})x(\d{1,3})\b/gi)];
    const matches = [...episodes, ...alt].map(m => [+m[1],+m[2]]);
    const matchEpisode = matches.length===1 && matches[0][0]===target.season && matches[0][1]===target.episode;
    // Some broadcast/TV releases use the exact broadcast date rather than SxxEyy.
    const date=target.airedDate?.split('-');
    const remainder=normal(rem);
    const hasAirDate= date && (new RegExp(`\\b${date[0]}\\s+0?${+date[1]}\\s+0?${+date[2]}\\b`).test(remainder)
      || new RegExp(`\\b0?${+date[2]}\\s+0?${+date[1]}\\s+${date[0]}\\b`).test(remainder));
    if(!matchEpisode && !hasAirDate) return null;
    if(matches.length && !matchEpisode) return null;
    if (/\b(?:complete|season[ ._-]*pack)\b/i.test(title)) return null;
    if (/\bS\d{1,2}[ ._-]*E\d{1,3}[ ._-]*(?:to|through|-)[ ._-]*E?\d{1,3}\b/i.test(title)) return null;
  }
  return {title, remainder:rem};
}

const quality = title => /(?:2160p|4k|uhd)/i.test(title) ? '2160p' : /1080p/i.test(title) ? '1080p' : /720p/i.test(title) ? '720p' : 'unknown';
function langTags(title) {
  const words=normal(title).split(' ');
  const tags=[];
  if(words.some(w=>['ita','italian','italiano'].includes(w))) tags.push('ITA?');
  if(words.some(w=>['eng','english'].includes(w))) tags.push('ENG?');
  if(words.some(w=>['multi','multiaudio','dual'].includes(w))) tags.push('MULTI?');
  return tags.length ? tags.join('+') : 'audio non verificato';
}
function rank(item) {
  const t=item.title; let score = /remux/i.test(t)?65:/bluray|blu-ray/i.test(t)?45:/web.?dl/i.test(t)?30:0;
  score+=quality(t)==='2160p'?30:quality(t)==='1080p'?19:quality(t)==='720p'?8:0;
  score+=(/\b(?:hdr|dv|dolby.vision|hdr10)\b/i.test(t)?6:0);
  score+=Math.min(Math.log2((item.seeders||0)+1),10);
  return score;
}
function fromResult(item, source) {
  if (!item || typeof item !== 'object') return null;
  const title=String(item.title || item.name || item.filename || '');
  const hash=hashFrom(item);
  if(!hash || !title) return null;
  const seeders=num(item.liveSeeders ?? item.seeders ?? item.seeds ?? item.seed) || 0;
  const size=num(item.bytes ?? item.size_bytes ?? item.size ?? item.filesize ?? item.file_size);
  const published=item.createdAt || item.date || item.published || item.publishDate || item.timestamp || item.date_released_unix;
  const fileIdx=num(item.fileIdx ?? item.file_idx);
  return {title, hash, seeders, size, published, fileIdx, source};
}
function unpack(raw) {
  const first = raw?.hits?.hits || raw?.results || raw?.torrents || raw?.data?.results || raw?.data || raw?.hits || raw?.items || raw?.documents || raw;
  if(!Array.isArray(first)) return [];
  return first.map(x=>x?._source || x?.source || x).filter(Boolean);
}
async function getJSON(url, opts={}) {
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(), 4500);
  try {
    const res=await fetch(url, {...opts, signal:ctrl.signal, headers:{'Accept':'application/json',...(opts.headers||{})}});
    if(!res.ok) throw Error('HTTP '+res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

function safeQuery(q) { return q.length>110 ? q.slice(0,110) : q; }
async function searchKnaben(q) {
  const u=new URL('https://api.knaben.org/v2/search');
  u.searchParams.set('q',safeQuery(q)); u.searchParams.set('s','60'); u.searchParams.set('o','seeders');
  const data=await getJSON(u.toString());
  return unpack(data).map(x=>fromResult(x,'Knaben')).filter(Boolean);
}
async function searchBitsearch(q, target, env) {
  const u=new URL('https://bitsearch.eu/api/v1/search');
  u.searchParams.set('q',safeQuery(q)); u.searchParams.set('limit','60');
  u.searchParams.set('category',target.type==='series'?'3':'2');
  const headers={}; if(env.BITSEARCH_API_KEY) headers['x-api-key']=env.BITSEARCH_API_KEY;
  const data=await getJSON(u.toString(),{headers});
  return unpack(data).map(x=>fromResult(x,'Bitsearch')).filter(Boolean);
}

/** Additional provider adapters: each one uses an independently documented API. */
async function searchEZTV(target) {
  if (target.type!=='series') return [];
  const u=new URL('https://eztv.yt/api/get-torrents');
  u.searchParams.set('imdb_id',target.imdb.replace(/^tt/,''));
  u.searchParams.set('limit','100');
  const data=await getJSON(u.toString());
  return (Array.isArray(data.torrents)?data.torrents:[]).map(x=>fromResult({
    ...x, title:x.filename || x.title, magnetUrl:x.magnet_url, seeders:x.seeds,
    size_bytes:x.size_bytes, published:x.date_released_unix
  },'EZTV')).filter(Boolean);
}
async function searchYTS(target) {
  if (target.type!=='movie') return [];
  const u=new URL('https://movies-api.accel.li/api/v2/list_movies.json');
  u.searchParams.set('query_term',target.imdb); u.searchParams.set('limit','20');
  const data=await getJSON(u.toString());
  const movies=Array.isArray(data?.data?.movies)?data.data.movies:[];
  return movies.filter(m=>m.imdb_code===target.imdb && (!target.year || +m.year===target.year))
    .flatMap(m=>(m.torrents||[]).map(t=>fromResult({
      title:`${m.title || m.title_english}.${m.year}.${t.quality || ''}.${t.type || 'WEB'}`,
      hash:t.hash,seeders:t.seeds,size_bytes:t.size_bytes,published:t.date_uploaded_unix
    },'YTS'))).filter(Boolean);
}
async function searchRarbg(target) {
  const u=new URL(`https://therarbg.com/api/v1/title/${target.imdb}/`);
  if(target.type==='series'){
    u.searchParams.set('season',String(target.season));
    u.searchParams.set('episode',String(target.episode));
  }
  const data=await getJSON(u.toString());
  const results=Array.isArray(data.torrents)?data.torrents:[];
  return results.map(x=>fromResult({...x,title:x.name || x.title,published:x.added},'TheRarBg')).filter(Boolean);
}

/** Lightweight, dependency-free Torznab RSS parser. Only output entries with verifiable SHA-1 infohash. */
function entityDecode(v){
  return String(v||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(m,k)=>{
    const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(k[0]==='#'){const n=k[1]?.toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);
      return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):m;}
    return entities[k.toLowerCase()]||m;
  }).trim();
}
function xmlTag(block,name){
  const re=new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,'i');
  return entityDecode(block.match(re)?.[1]);
}
function xmlAttr(block,name){
  for(const hit of block.matchAll(/<(?:[\w-]+:)?attr\b([^>]*?)\/?>/gi)){
    const attrs=hit[1];
    const k=attrs.match(/\bname\s*=\s*(["'])(.*?)\1/i)?.[2];
    if(k?.toLowerCase()===name.toLowerCase()) return entityDecode(attrs.match(/\bvalue\s*=\s*(["'])(.*?)\1/i)?.[2]);
  }
  return '';
}
export function parseTorznab(xml,source='Torznab'){
  const entries=[];
  for(const match of String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
    const body=match[1];
    const title=xmlTag(body,'title');
    const magnet=xmlAttr(body,'magneturl') || xmlTag(body,'link');
    const hash=xmlAttr(body,'infohash') || xmlAttr(body,'hash');
    const entry=fromResult({title,hash,magnetUrl:magnet,seeders:xmlAttr(body,'seeders') || xmlAttr(body,'seed'),
      size_bytes:xmlTag(body,'size') || xmlAttr(body,'size'),published:xmlTag(body,'pubDate')},source);
    if(entry)entries.push(entry);
  }
  return entries;
}
async function getXML(url,headers={}){
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),4500);
  try {const response=await fetch(url,{signal:ctrl.signal,headers:{'Accept':'application/xml, application/rss+xml, text/xml',...headers}});
    if(!response.ok)throw Error('HTTP '+response.status);
    const xml=await response.text(); if(xml.length>2_000_000) throw Error('RSS too large'); return xml;
  }finally{clearTimeout(timer);}
}
async function searchTorlock(target){
  const u=new URL('https://www.torlock.com/torznab/api');
  u.searchParams.set('t',target.type==='movie'?'movie':'tvsearch');
  u.searchParams.set('q',target.aliases[0]);
  if(target.type==='series') {u.searchParams.set('season',String(target.season));u.searchParams.set('ep',String(target.episode));}
  u.searchParams.set('limit','50');
  return parseTorznab(await getXML(u.toString()),'Torlock');
}
/** Optional standard Torznab feed configured via secret TORZNAB_FEEDS (JSON array). */
function feedsFromEnv(env){
  if(!env.TORZNAB_FEEDS)return [];
  try {
    const list=JSON.parse(env.TORZNAB_FEEDS);
    if(!Array.isArray(list))return [];
    return list.slice(0,4).filter(x=>typeof x?.url==='string' && /^https:\/\//i.test(x.url)
      && !/\b(?:localhost|127\.|0\.0\.0|\[::1\])\b/i.test(x.url));
  }catch{return [];}
}
async function searchCustomTorznab(target,feed){
  const u=new URL(feed.url);
  u.searchParams.set('t',target.type==='movie'?'movie':'tvsearch');
  u.searchParams.set('q',target.aliases[0]);
  if(feed.apikey)u.searchParams.set('apikey',String(feed.apikey));
  if(target.type==='series'){u.searchParams.set('season',String(target.season));u.searchParams.set('ep',String(target.episode));}
  u.searchParams.set('limit','80');
  return parseTorznab(await getXML(u.toString()),'Custom Torznab');
}

/** Extra public search indexes. They return hashes only; TorBox processing remains in AIOStreams.
 * Individual providers can fail or throttle without hiding other providers' results.
 */
async function searchAPIBay(q) {
  const u=new URL('https://apibay.org/q.php');
  u.searchParams.set('q',safeQuery(q));
  u.searchParams.set('cat','0');
  const data=await getJSON(u.toString());
  if(!Array.isArray(data)) return [];
  return data.filter(x=>x && x.id!=='0').map(x=>fromResult({
    title:x.name,info_hash:x.info_hash,seeders:x.seeders,
    size_bytes:x.size,published:x.added
  },'APIBay')).filter(Boolean);
}

async function searchTorrentsCSV(q) {
  const u=new URL('https://torrents-csv.com/service/search');
  u.searchParams.set('q',safeQuery(q));u.searchParams.set('size','60');
  const data=await getJSON(u.toString());
  const rows=Array.isArray(data?.torrents)?data.torrents:[];
  return rows.map(x=>fromResult({
    title:x.name,infohash:x.infohash,seeders:x.seeders,
    size_bytes:x.size_bytes,published:x.scraped_date || x.created_unix
  },'Torrents-CSV')).filter(Boolean);
}

async function searchTorrentProject(q) {
  const u=new URL('https://torrentproject.se/');
  u.searchParams.set('s',safeQuery(q));u.searchParams.set('out','json');
  u.searchParams.set('num','50');u.searchParams.set('filter','2000');
  const data=await getJSON(u.toString());
  // Older public API deployments have used both arrays and hash-keyed objects.
  const rows=Array.isArray(data)?data:Array.isArray(data?.torrents)?data.torrents:
    Array.isArray(data?.results)?data.results:
    data && typeof data==='object'?Object.entries(data).filter(([,v])=>v && typeof v==='object')
      .map(([hash,v])=>({...v,hash:v.hash||hash})):[];
  return rows.map(x=>fromResult({
    title:x.title || x.name,hash:x.hash || x.infohash || x.info_hash,
    seeders:x.seeds ?? x.seeders,size_bytes:x.size_bytes ?? x.size,
    published:x.date || x.created
  },'TorrentProject')).filter(Boolean);
}

function parseHumanSize(value) {
  if(typeof value==='number') return value;
  const m=String(value||'').match(/([\d.,]+)\s*(TiB|GiB|MiB|KiB|TB|GB|MB|KB|B)\b/i);
  if(!m) return undefined;
  const n=Number(m[1].replace(',','.'));if(!Number.isFinite(n))return undefined;
  const units={b:1,kb:1e3,mb:1e6,gb:1e9,tb:1e12,kib:1024,mib:1024**2,gib:1024**3,tib:1024**4};
  return Math.round(n*units[m[2].toLowerCase()]);
}
async function searchNyaa(q) {
  const u=new URL('https://nyaa.si/');
  u.searchParams.set('page','rss');u.searchParams.set('c','1_0');
  u.searchParams.set('q',safeQuery(q));
  const xml=await getXML(u.toString());
  const rows=[];
  for(const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const body=match[1];
    const entry=fromResult({
      title:xmlTag(body,'title'),hash:xmlTag(body,'nyaa:infoHash'),
      seeders:xmlTag(body,'nyaa:seeders'),
      size_bytes:parseHumanSize(xmlTag(body,'nyaa:size')),
      published:xmlTag(body,'pubDate')
    },'Nyaa');
    if(entry)rows.push(entry);
  }
  return rows;
}

/** Re-use this plan for the stream endpoint and protected diagnostics. */
function searchPlan(target,env){
  const queries=makeQueries(target,env);
  const checks=[];
  if(env.ENABLE_KNABEN!=='false') for(const q of queries) checks.push({query:q,source:'Knaben',run:()=>searchKnaben(q)});
  if(env.ENABLE_BITSEARCH==='true') for(const q of queries.slice(0,1)) checks.push({query:q,source:'Bitsearch',run:()=>searchBitsearch(q,target,env)});
  if(target.type==='series' && env.ENABLE_EZTV!=='false') checks.push({query:target.imdb,source:'EZTV',run:()=>searchEZTV(target)});
  if(target.type==='movie' && env.ENABLE_YTS!=='false') checks.push({query:target.imdb,source:'YTS',run:()=>searchYTS(target)});
  if(env.ENABLE_RARBG!=='false') checks.push({query:target.imdb,source:'TheRarBg',run:()=>searchRarbg(target)});
  if(env.ENABLE_TORLOCK!=='false') checks.push({query:target.aliases[0],source:'Torlock',run:()=>searchTorlock(target)});
  // Query new generic indexes with at most two focused searches each, to avoid 429/rate limits.
  const broad=queries.slice(0,Math.max(1,Math.min(2,Number(env.EXTRA_SOURCE_QUERIES||2))));
  if(env.ENABLE_APIBAY!=='false') for(const q of broad)
    checks.push({query:q,source:'APIBay',run:()=>searchAPIBay(q)});
  if(env.ENABLE_TORRENTSCSV!=='false') for(const q of broad)
    checks.push({query:q,source:'Torrents-CSV',run:()=>searchTorrentsCSV(q)});
  if(env.ENABLE_TORRENTPROJECT!=='false') for(const q of broad.slice(0,1))
    checks.push({query:q,source:'TorrentProject',run:()=>searchTorrentProject(q)});
  if(env.ENABLE_NYAA!=='false') checks.push({query:target.aliases[0],source:'Nyaa',run:()=>searchNyaa(target.aliases[0])});
  for(const feed of feedsFromEnv(env)) checks.push({query:target.aliases[0],source:'Custom Torznab',run:()=>searchCustomTorznab(target,feed)});
  return {queries,checks};
}

async function getTarget(type, id, env) {
  const m=id.match(/^(tt\d{6,12})(?::(\d+):(\d+))?$/);
  if(!m || (type==='series' && (!m[2] || !m[3])) || (type==='movie' && m[2])) return null;
  const imdb=m[1];
  const metaJson=await getJSON(`https://v3-cinemeta.strem.io/meta/${type}/${imdb}.json`);
  const meta=metaJson?.meta;
  if(!meta?.name) return null;
  const year = getYear(meta.releaseInfo || meta.year || meta.released || meta.releaseDate);
  const aliases = [meta.name,meta.originalName,meta.originalTitle];
  if(env.EXTRA_ALIASES) {
    try {
      const extra=JSON.parse(env.EXTRA_ALIASES);
      if(Array.isArray(extra?.[imdb])) aliases.push(...extra[imdb].filter(x=>typeof x==='string').slice(0,12));
    }catch{} // Ignore malformed optional alias configuration.
  }
  const video=type==='series' && Array.isArray(meta.videos) ? meta.videos.find(v=>
    Number(v.season)===Number(m[2]) && Number(v.episode)===Number(m[3])) : null;
  let airedDate= typeof video?.released==='string' && /^\d{4}-\d{2}-\d{2}/.test(video.released)
    ? video.released.slice(0,10) : null;
  if (env.TMDB_API_KEY) {
    try {
      const params=new URLSearchParams({api_key:env.TMDB_API_KEY,external_source:'imdb_id'});
      const resolved=await getJSON(`https://api.themoviedb.org/3/find/${imdb}?${params}`);
      const info=(type==='movie'?resolved.movie_results:resolved.tv_results)?.[0];
      if(info) {
        const base=type==='movie'?'movie':'tv';
        aliases.push(info.title,info.original_title,info.name,info.original_name);
        const alt=await getJSON(`https://api.themoviedb.org/3/${base}/${info.id}/alternative_titles?api_key=${encodeURIComponent(env.TMDB_API_KEY)}`);
        const titles=alt.titles || alt.results || [];
        // Prefer IT/EN aliases, but retain other language titles when requested by provider.
        aliases.push(...titles.filter(x=>['IT','US','GB','FR','ES','DE','JP','KR','IN','CN','BR'].includes(x.iso_3166_1)).slice(0,12).map(x=>x.title));
        if(type==='series' && !airedDate){
          try { const ep=await getJSON(`https://api.themoviedb.org/3/tv/${info.id}/season/${+m[2]}/episode/${+m[3]}?api_key=${encodeURIComponent(env.TMDB_API_KEY)}`);
            if(/^\d{4}-\d{2}-\d{2}$/.test(ep?.air_date||'')) airedDate=ep.air_date;
          }catch{} // Episode-date search remains optional.
        }
      }
    } catch { /* Metadata lookup remains optional */ }
  }
  const usable=unique(aliases.map(x=>String(x||'').trim()).filter(x=>normal(x).length>=2));
  return {imdb,type,year,season:Number(m[2]||0),episode:Number(m[3]||0),aliases:usable,airedDate};
}
function makeQueries(target,env) {
  const max=Math.max(1,Math.min(7,Number(env.MAX_QUERIES||4)));
  const queries=[];
  for(const alias of target.aliases){
    if(target.type==='movie')queries.push(target.year?`${alias} ${target.year}`:alias);
    else queries.push(`${alias} S${String(target.season).padStart(2,'0')}E${String(target.episode).padStart(2,'0')}`);
    if(queries.length>=max)break;
  }
  const main=target.aliases[0];
  if(target.type==='series' && target.airedDate){
    const [y,m,d]=target.airedDate.split('-');
    queries.push(`${main} ${y}.${m}.${d}`,`${main} ${d}.${m}.${y}`);
  }
  // Broad search only when we can still validate results by year or exact episode/date.
  queries.push(main);
  return unique(queries).slice(0,max);
}

export async function search(target,env={}) {
  const {checks}=searchPlan(target,env);
  const settled=await Promise.allSettled(checks.map(x=>x.run()));
  const entries=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  const found=new Map();
  for(const item of entries){
    if(!verifyRelease(item,target,env.REQUIRE_YEAR!=='false'))continue;
    const score=rank(item);
    const key=item.hash;
    if(!found.has(key) || score>found.get(key).score)found.set(key,{...item,score});
  }
  return [...found.values()].sort((a,b)=>b.score-a.score)
    .slice(0,Math.max(1,Math.min(80,Number(env.RESULT_LIMIT||50))))
    .map(x=>({name:`DeepSearch | ${quality(x.title)}`,
      description:`${x.title}\n${x.source} · ${x.size?(x.size/(1024**3)).toFixed(2)+' GB · ':''}${x.seeders} seed · ${langTags(x.title)}`,
      infoHash:x.hash,
      ...(x.fileIdx!==undefined?{fileIdx:x.fileIdx}:{}),
      behaviorHints:{filename:x.title,seeders:x.seeders,indexer:x.source,
        ...(x.size!==undefined?{folderSize:x.size}:{}),
        ...(x.published && !Number.isNaN(Date.parse(String(x.published)))?{publishDate:new Date(x.published).toISOString()}:{}),
      }}));
}

/** Protected diagnostics: explain where a zero-result search breaks without exposing keys or hashes. */
export async function diagnose(type, id, env={}) {
  let target;
  try {
    target=await getTarget(type,id,env);
    if (!target) return {ok:false,stage:'metadata',message:'Invalid ID or no metadata returned'};
  } catch (error) {
    return {ok:false,stage:'metadata',message:String(error?.message || error)};
  }
  const {queries,checks}=searchPlan(target,env);
  const outcomes=await Promise.all(checks.map(async ({query,source,run})=>{
    try {
      const entries=await run();
      const accepted=entries.filter(x=>verifyRelease(x,target,env.REQUIRE_YEAR!=='false'));
      return {query,source,received:entries.length,accepted:accepted.length,
        exampleTitles:entries.slice(0,2).map(x=>x.title)};
    } catch (error) {
      return {query,source,error:String(error?.message || error)};
    }
  }));
  return {ok:true,metadata:{title:target.aliases[0],year:target.year??null,type,airDate:target.airedDate??null,
     aliases:target.aliases},queries,providers:outcomes,
     acceptedTotal:outcomes.reduce((n,x)=>n+(x.accepted||0),0),
     note:'Diagnostic counts include duplicates. The ordinary stream endpoint deduplicates by infoHash.'};
}

export default {
  async fetch(request, env={}, ctx={}) {
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return json({},200,{'Access-Control-Allow-Methods':'GET,OPTIONS'});
    if(request.method!=='GET') return json({error:'Method not allowed'},405);
    const token=String(env.ADDON_TOKEN||'').trim();
    // A secret path is mandatory: no public uncontrolled scanning endpoint.
    if(!token) return json({error:'ADDON_TOKEN not configured'},503);
    const routePrefix='/'+encodeURIComponent(token);
    if(!url.pathname.startsWith(routePrefix+'/')) return json({error:'Not found'},404);
    const path=url.pathname.slice(routePrefix.length);
    if(path==='/manifest.json') return json(manifest,200,{'Cache-Control':'public, max-age=3600'});
    if(path==='/health') return json({ok:true,version:manifest.version});
    const diagnostic=path.match(/^\/debug\/(movie|series)\/(tt\d{6,12}(?::\d+:\d+)?)\.json$/);
    if(diagnostic) {
      const result=await diagnose(diagnostic[1],diagnostic[2],env);
      return json(result,200,{'Cache-Control':'no-store'});
    }
    const match=path.match(/^\/stream\/(movie|series)\/(tt\d{6,12}(?::\d+:\d+)?)\.json$/);
    if(!match) return json({error:'Not found'},404);
    try {
      const cache=typeof caches!=='undefined' && caches?.default;
      if(cache) { const hit=await cache.match(request); if(hit) return hit; }
      const target=await getTarget(match[1],match[2],env);
      const streams=target ? await search(target,env) : [];
      const res=json({streams},200,{'Cache-Control':'public, max-age=300'});
      if(cache && ctx.waitUntil) ctx.waitUntil(cache.put(request,res.clone()));
      return res;
    } catch {
      // Do not expose secrets or upstream errors to users.
      return json({streams:[]},200,{'Cache-Control':'no-store'});
    }
  }
};
