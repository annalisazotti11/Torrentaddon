/** DeepSearch Personale — stream-only Stremio addon for AIOStreams v2.
 * External indexers return torrent hashes; AIOStreams Service Wrapping manages TorBox.
 * Access only media you are entitled to download or stream.
 */
export const manifest = Object.freeze({
  id: 'org.deepsearch.personale', version: '0.7.1',
  name: 'DeepSearch Personale',
  description: 'Ricerca torrent e disponibilita gratuite ufficiali in Italia: RaiPlay, Mediaset Infinity, DMAX, Real Time e altri servizi, senza bypass DRM.',
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
  const magnet = String(item.magnetUri || item.magnetUrl || item.magnet || item.magnet_url || item.magnet_link || item.link || '');
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

const markers = /^(?:19\d{2}|20\d{2}|2160p|1080p|720p|480p|4k|uhd|hdr|hdr10|dv|dolby|bluray|blu|bdrip|brrip|remux|web|webdl|webrip|hdrip|dvdrip|hdtv|x264|x265|h264|h265|hevc|av1|proper|repack|extended|directors|unrated|internal|limited|ita|italian|eng|english|multi|dual|truehd|dts|atmos|aac|ac3|ddp|eac3|s\d{1,2}e\d{1,3}|s\d{1,2}|\d+x\d+)$/i;
const junk = /\b(?:sample|trailer|extras?|featurettes?|behind[ ._-]?the[ ._-]?scenes|camrip|telesync|tc|ts|xbet|password)\b/i;
const monthNames = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const otherMonths = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/** Exact date parser for broadcast TV release names (numerical or month names).
 * No loose year-only inference: a release is accepted by date only with matching day/month/year.
 */
const monthShort={gen:1,feb:2,mar:3,apr:4,mag:5,giu:6,lug:7,ago:8,set:9,sett:9,ott:10,nov:11,dic:12,
  jan:1,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,dec:12};
const dateISO=(y,m,d)=>{
  if(y<1900||y>2100||m<1||m>12||d<1||d>31) return null;
  const v=new Date(Date.UTC(y,m-1,d));
  return v.getUTCFullYear()===y && v.getUTCMonth()+1===m && v.getUTCDate()===d
    ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
};
const dateYear = token => {
  const y=Number(token);
  return /^\d{2}$/.test(token)?(y<70?2000+y:1900+y):y;
};
const dateMonth = token => {
  if(/^\d{1,2}$/.test(token))return Number(token);
  return monthNames.indexOf(token)+1 || otherMonths.indexOf(token)+1 || monthShort[token] || 0;
};
export function releaseDates(release){
  const source=String(release||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const dates=new Set();
  const add=(y,m,d)=>{const v=dateISO(y,m,d);if(v)dates.add(v);};
  // Dates with separators (dots, dashes, spaces, underscores) in European and ISO order.
  const t=normal(source).split(' ');
  for(let i=0;i<t.length-2;i++){
    const [a,b,c]=t.slice(i,i+3);
    if(/^\d{4}$/.test(a) && /^\d{1,2}$/.test(c)) add(+a,dateMonth(b),+c);
    if(/^\d{1,2}$/.test(a) && /^\d{2,4}$/.test(c)) add(dateYear(c),dateMonth(b),+a);
    if(/^[a-z]{3,}$/.test(a) && dateMonth(a) && /^\d{1,2}$/.test(b) && /^\d{2,4}$/.test(c)) add(dateYear(c),dateMonth(a),+b);
  }
  // Dates compactly encoded as YYYYMMDD or DDMMYYYY.
  const compact=source.match(/(?<!\d)(?:19\d{6}|20\d{6}|\d{8})(?!\d)/g)||[];
  for(const value of compact){
    add(Number(value.slice(0,4)),Number(value.slice(4,6)),Number(value.slice(6,8)));
    add(Number(value.slice(4,8)),Number(value.slice(2,4)),Number(value.slice(0,2)));
  }
  return [...dates];
}
export function matchesBroadcastDate(release,isoDate){
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate||'') && releaseDates(release).includes(isoDate);
}

function matchPrefix(release, alias, aliases=[]) {
  const stripped=String(release||'').replace(/^\s*(?:\[[^\]]{1,60}\]\s*){1,3}/, '');
  const releaseN=normal(stripped), name=normal(alias);
  if(!name || !releaseN.startsWith(name)) return null;
  let rest=releaseN.slice(name.length).trim();
  if(!rest) return '';
  const validStart = value => markers.test(value.split(' ')[0])
    || /^(?:\d{1,2}\s+\d{1,2}\s+20\d{2})\b/.test(value)
    // Italian broadcast releases frequently begin 'Puntata del ...' instead of SxxEyy.
    || /^(?:(?:la|il)\s+)?(?:puntata|episodio|episode)(?:\s+(?:del|dell|di|of))?\s+/i.test(value)
    || /^(?:\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\s+20\d{2})\b/.test(value)
    || /^(?:stagione|season)\s+\d{1,3}\s+(?:puntata|episodio|episode|ep)\s+\d{1,3}\b/.test(value)
    || /^\d{8}(?:\s|$)/.test(value)
    || /^\d{1,2}\s+\d{1,2}\s+(?:19|20)?\d{2}(?:\s|$)/.test(value);
  if(validStart(rest)) return rest;
  // Bilingual releases may prepend a second known alias.
  for(const alt of aliases) {
    const a=normal(alt);
    if(a && a!==name && rest.startsWith(a+' ')) {
      const tail=rest.slice(a.length).trim();
      if(validStart(tail)) return tail;
    }
  }
  return null;
}

/** Conservative matching: episode-number OR exact airdate required for series. */
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
    const local=[...title.matchAll(/\b(?:stagione|season)[ ._-]*(\d{1,3})[ ._-]*(?:puntata|episodio|episode|ep)[ ._-]*(\d{1,3})\b/gi)];
    const matches = [...episodes, ...alt, ...local].map(m => [+m[1],+m[2]]);
    const matchEpisode = matches.length===1 && matches[0][0]===target.season && matches[0][1]===target.episode;
    const hasAirDate = matchesBroadcastDate(rem, target.airedDate);
    if(!matchEpisode && !hasAirDate) return null;
    // TVDB/TMDB/Cinemeta can number a broadcast differently. The exact verified
    // broadcast date may override a DIFFERENT season/episode, never a mismatched date.
    if(matches.length > 1 || (matches.length && !matchEpisode && !hasAirDate)) return null;
    if(matches.length===1 && matches[0][0]===target.season && matches[0][1]!==target.episode) return null;
    // An explicit incorrect date is suspicious even if SxxEyy matched.
    const statedDates=releaseDates(rem);
    if(target.airedDate && statedDates.length && !statedDates.includes(target.airedDate)) return null;
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


/** Stable JSON index with ready-to-use BTIH hashes (documented at magnetz.eu/apis). */
async function searchMagnetz(q) {
  const u=new URL('https://magnetz.eu/api/magnets/search');
  u.searchParams.set('query',safeQuery(q));u.searchParams.set('page','1');
  const response=await getJSON(u.toString());
  const rows=Array.isArray(response?.data)?response.data:[];
  return rows.map(x=>fromResult({
    title:x.name,info_hash:x.info_hash,magnet_link:x.magnet_link,
    seeders:x.seeders,size_bytes:x.size,createdAt:x.created_at
  },'Magnetz')).filter(Boolean);
}

/** Minimal HTML-only parser for UIndex listing/search pages, no browser emulation.
 * The UIndex search URL is often challenge-protected. The category listing is
 * a best-effort fallback; results without a magnet or valid hash are discarded.
 */
function cleanHTML(v) {return entityDecode(String(v||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ')).replace(/\s+/g,' ').trim();}
function attrValue(tag,key){
  const m=String(tag||'').match(new RegExp('\\b'+key+'\\s*=\\s*(["\\\'])(.*?)\\1','i'));
  return m?entityDecode(m[2]):'';
}
export function parseUIndexHTML(html){
  const table=String(html||'').match(/<table\b[^>]*class\s*=\s*["'][^"']*\bsr-table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if(!table) return [];
  const output=[];
  for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    if(cells.length<5)continue;
    const anchors=[...cells[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
      .map(m=>({href:attrValue('<a '+m[1]+'>','href'),label:cleanHTML(m[2])}));
    const magnet=anchors.find(a=>a.href.startsWith('magnet:'))?.href;
    const title=anchors.find(a=>a.href.startsWith('/') && a.label)?.label || cleanHTML(cells[1]);
    const entry=fromResult({title,magnetUrl:magnet,
      size_bytes:parseHumanSize(cleanHTML(cells[2])),
      seeders:Number(cleanHTML(cells[3]).replace(/[^0-9]/g,''))||0},'UIndex');
    if(entry)output.push(entry);
  }
  return output;
}
async function getHTML(url){
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),4500);
  try{
    const res=await fetch(url,{signal:ctrl.signal,headers:{'Accept':'text/html'}});
    if(!res.ok)throw Error('HTTP '+res.status);
    const body=await res.text();if(body.length>1_500_000)throw Error('HTML too large');
    return body;
  }finally{clearTimeout(timer);}
}
async function searchUIndex(target){
  const u=new URL('https://uindex.org/search.php');
  u.searchParams.set('c',target.type==='movie'?'1':'2');
  u.searchParams.set('search',target.aliases[0]);
  try{
    const html=await getHTML(u.toString());
    const parsed=parseUIndexHTML(html);
    if(parsed.length) return parsed;
    // When the request is blocked or returns no recognized listing, diagnose
    // rather than silently claiming a working source with zero results.
    if(!/sr-table/.test(html))throw Error('UIndex table unavailable (possible challenge)');
    return [];
  }catch(error){
    // UIndex has no stable search API. Try only a public category listing.
    const listing=new URL('https://uindex.org/search.php');
    listing.searchParams.set('c',target.type==='movie'?'1':'2');
    try{
      const rows=parseUIndexHTML(await getHTML(listing.toString()));
      if(rows.length)return rows.filter(x=>target.aliases.some(a=>normal(x.title).includes(normal(a))));
    }catch{}
    throw error;
  }
}

/** BT4G XML RSS as used by SearXNG; returns torrent identifiers only when
 * the feed itself includes a BTIH magnet/hash. Never infer a hash from an ID.
 */
export function parseBT4GRSS(xml){
  const rows=[];
  for(const m of String(xml||'').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
    const body=m[1];
    const enclosures=[...body.matchAll(/<enclosure\b[^>]*>/gi)].map(x=>attrValue(x[0],'url'));
    const explicitMagnet=body.match(/magnet:\?xt=urn:btih:[a-z0-9]{32,40}(?:[^\s"'<>]*)/i)?.[0];
    const all=[xmlTag(body,'link'),xmlTag(body,'guid'),xmlTag(body,'torrent:magnetURI'),
      xmlTag(body,'magnetURI'),...enclosures,entityDecode(explicitMagnet)].filter(Boolean);
    const magnet=all.find(s=>/btih:/i.test(s))||'';
    const hash=xmlTag(body,'torrent:infoHash')||xmlTag(body,'infoHash')||
      (all.find(s=>/\b[a-f0-9]{40}\b/i.test(s))||'').match(/\b[a-f0-9]{40}\b/i)?.[0];
    const item=fromResult({title:xmlTag(body,'title'),magnetUrl:magnet,hash,
      seeders:xmlTag(body,'torrent:seeders')||xmlTag(body,'seeders'),
      size_bytes:parseHumanSize(xmlTag(body,'size')||xmlTag(body,'description')),
      published:xmlTag(body,'pubDate')},'BT4G RSS');
    if(item)rows.push(item);
  }
  return rows;
}
async function searchBT4G(q,target){
  const u=new URL('https://bt4gprx.com/search');
  u.searchParams.set('q',safeQuery(q));u.searchParams.set('orderby','seeders');
  u.searchParams.set('category',target.type==='movie'?'movie':'all');
  u.searchParams.set('p','1');u.searchParams.set('page','rss');
  return parseBT4GRSS(await getXML(u.toString()));
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
  const broad=selectBroadQueries(target,queries,Math.max(1,Math.min(4,Number(env.EXTRA_SOURCE_QUERIES||3))));
  if(env.ENABLE_APIBAY!=='false') for(const q of broad)
    checks.push({query:q,source:'APIBay',run:()=>searchAPIBay(q)});
  if(env.ENABLE_TORRENTSCSV!=='false') for(const q of broad)
    checks.push({query:q,source:'Torrents-CSV',run:()=>searchTorrentsCSV(q)});
  if(env.ENABLE_TORRENTPROJECT!=='false') for(const q of broad.slice(0,1))
    checks.push({query:q,source:'TorrentProject',run:()=>searchTorrentProject(q)});
  if(env.ENABLE_NYAA!=='false') checks.push({query:target.aliases[0],source:'Nyaa',run:()=>searchNyaa(target.aliases[0])});
  // Italy-first source: UIndex (best effort; website can require a browser challenge).
  if(env.ENABLE_UINDEX!=='false') checks.push({query:target.aliases[0],source:'UIndex',run:()=>searchUIndex(target)});
  // Independent magnet database and RSS metadata index.
  if(env.ENABLE_MAGNETZ!=='false') for(const q of broad.slice(0,1))
    checks.push({query:q,source:'Magnetz',run:()=>searchMagnetz(q)});
  if(env.ENABLE_BT4G!=='false') for(const q of broad.slice(0,1))
    checks.push({query:q,source:'BT4G RSS',run:()=>searchBT4G(q,target)});
  for(const feed of feedsFromEnv(env)) checks.push({query:target.aliases[0],source:'Custom Torznab',run:()=>searchCustomTorznab(target,feed)});
  return {queries,checks};
}

/** TheTVDB aired order for Le Iene S26 (2022-23), keyed by IMDb series ID.
 * Cinemeta sometimes uses a different season numbering, so its episode list has no matching date.
 * Source: thetvdb.com/series/306607-show/seasons/official/26 .
 */
const knownItalianBroadcasts=Object.freeze({
  tt0887984: Object.freeze({
    26: Object.freeze([
      '2022-10-04','2022-10-11','2022-10-18','2022-10-25',
      '2022-11-01','2022-11-08','2022-11-15','2022-11-22','2022-11-29',
      '2022-12-06','2022-12-13','2023-01-10','2023-01-17','2023-01-24',
      '2023-01-31','2023-02-07','2023-02-10','2023-02-14','2023-02-21',
      '2023-02-28','2023-03-07','2023-03-14','2023-03-21','2023-03-28',
      '2023-04-04','2023-04-11','2023-04-18','2023-04-25','2023-05-02',
      '2023-05-09','2023-05-16','2023-05-23'
    ])
  })
});
// Sparse, independently verified aired-order dates not covered by the dense season list.
// TheTVDB: https://thetvdb.com/series/306607-show/allseasons/official
const verifiedBroadcastDates=Object.freeze({
  tt0887984: Object.freeze({'28:10':'2024-12-01'})
});
function getBroadcastOverride(imdb,season,episode,env){
  const known=verifiedBroadcastDates[imdb]?.[`${season}:${episode}`] ||
    knownItalianBroadcasts[imdb]?.[season]?.[episode-1] || null;
  let custom=null;
  if(env.EPISODE_DATE_OVERRIDES){
    try {
      const value=JSON.parse(env.EPISODE_DATE_OVERRIDES)[imdb]?.[`${season}:${episode}`];
      if(/^\d{4}-\d{2}-\d{2}$/.test(value))custom=value;
    }catch{}
  }
  return custom || known;
}

async function getTarget(type, id, env) {
  const m=id.match(/^(tt\d{6,12})(?::(\d+):(\d+))?$/);
  if(!m || (type==='series' && (!m[2] || !m[3])) || (type==='movie' && m[2])) return null;
  const imdb=m[1];
  // Cinemeta is an external dependency; never lose a verified official TV
  // episode link solely because metadata temporarily fails.
  let meta;
  try {
    const metaJson=await getJSON(`https://v3-cinemeta.strem.io/meta/${type}/${imdb}.json`);
    meta=metaJson?.meta;
  } catch (error) {
    if(imdb!=='tt0887984' || type!=='series')throw error;
  }
  if(!meta?.name && imdb==='tt0887984' && type==='series')
    meta={name:'Le Iene',originalName:'Le Iene',releaseInfo:'1997',videos:[]};
  if(!meta?.name) return null;
  const year = getYear(meta.releaseInfo || meta.year || meta.released || meta.releaseDate);
  const aliases = [meta.name,meta.originalName,meta.originalTitle];
  if(imdb==='tt0887984') aliases.push('Le Iene Show','Le Iene','LeIene');
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
  if(!airedDate && video?.name) airedDate=releaseDates(video.name)[0]||null;
  // Aired-order override wins over conflicting metadata providers for this episode.
  airedDate=getBroadcastOverride(imdb,Number(m[2]||0),Number(m[3]||0),env)||airedDate;
  // Free, documented TVmaze lookup by exact IMDb ID (only when Cinemeta lacks the date).
  // No scraping challenges or background browser needed.
  if(type==='series' && !airedDate && env.ENABLE_TVMAZE!=='false'){
    try {
      const show=await getJSON(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(imdb)}`);
      if(show?.id && (!show.externals?.imdb || show.externals.imdb===imdb)){
        aliases.push(show.name);
        const ep=await getJSON(`https://api.tvmaze.com/shows/${show.id}/episodebynumber?season=${Number(m[2])}&number=${Number(m[3])}`);
        if(/^\d{4}-\d{2}-\d{2}$/.test(ep?.airdate||'')) airedDate=ep.airdate;
      }
    }catch{} // Optional provider; unsupported series are normal.
  }
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
  const max=Math.max(1,Math.min(10,Number(env.MAX_QUERIES||8)));
  const names=unique(target.aliases.slice(0,4));
  const main=names[0];
  const queries=[];
  if(target.type==='movie') {
    for(const name of names) queries.push(target.year?`${name} ${target.year}`:name);
    queries.push(main);
  } else {
    const ep=`S${String(target.season).padStart(2,'0')}E${String(target.episode).padStart(2,'0')}`;
    if(target.airedDate){
      const [y,m,d]=target.airedDate.split('-');
      const day=String(+d), month=monthNames[+m-1];
      // Indexers differ in punctuation, locale, and aired-order numbering.
      queries.push(`${main} ${d}.${m}.${y}`, `${main} ${day} ${month} ${y}`);
      if(names[1]) queries.push(`${names[1]} ${day} ${month} ${y}`);
      if(names[1]) queries.push(`${names[1]} ${d}.${m}.${y}`);
      queries.push(`${main} ${y}.${m}.${d}`);
    }
    queries.push(`${main} ${ep}`);
    if(names[1]) queries.push(`${names[1]} ${ep}`);
    // Last-resort discovery only: verifyRelease still requires the exact date or episode.
    queries.push(`${main} ${target.airedDate?.slice(0,4)||''}`.trim(),main);
  }
  return unique(queries).slice(0,max);
}
function selectBroadQueries(target,queries,limit){
  if(target.type==='movie')return queries.slice(0,limit);
  // Each index gets a mixture, not three minor spellings of the same date.
  const picked=[];
  if(target.airedDate){
    picked.push(queries.find(x=>/\d{1,2}\.\d{1,2}\.\d{4}/.test(x)));
    picked.push(queries.find(x=>/\b(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/i.test(x)));
  }
  picked.push(queries.find(x=>/\bS\d{2}E\d{2,3}\b/i.test(x)));
  picked.push(...queries);
  return unique(picked).slice(0,limit);
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
  const torrentStreams = [...found.values()].sort((a,b)=>b.score-a.score)
    .slice(0,Math.max(1,Math.min(80,Number(env.RESULT_LIMIT||50))))
    .map(x=>({name:`DeepSearch | ${quality(x.title)}`,
      description:`${x.title}\n${x.source} · ${x.size?(x.size/(1024**3)).toFixed(2)+' GB · ':''}${x.seeders} seed · ${langTags(x.title)}`,
      infoHash:x.hash,
      ...(x.fileIdx!==undefined?{fileIdx:x.fileIdx}:{}),
      behaviorHints:{filename:x.title,seeders:x.seeders,indexer:x.source,
        ...(x.size!==undefined?{folderSize:x.size}:{}),
        ...(x.published && !Number.isNaN(Date.parse(String(x.published)))?{publishDate:new Date(x.published).toISOString()}:{}),
      }}));
  if(env.OFFICIAL_IN_STREAMS==='false')return torrentStreams;
  const handVerified=officialStreamsForTarget(target,env);
  const located=env.WATCHMODE_API_KEY && env.ENABLE_WATCHMODE!=='false'
    ? await lookupFreeOfficialSources(target,env):[];
  const deduped=uniqueOfficialStreams([...located,...handVerified]);
  // An exact, independently verified page can be prioritized; generic programme
  // archives and unverified search pages never suppress legitimate torrents.
  const specific=deduped.filter(x=>x.deepsearchExact===true);
  const broad=deduped.filter(x=>x.deepsearchExact!==true);
  const stripInternal=x=>{const {deepsearchExact,...stream}=x;return stream;};
  return env.OFFICIAL_FIRST==='false'
    ? [...torrentStreams,...deduped.map(stripInternal)]
    : [...specific.map(stripInternal),...torrentStreams,...broad.map(stripInternal)];
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
     officialLinks:officialStreamsForTarget(target,env).map(x=>({name:x.name,externalUrl:x.externalUrl,description:x.description})),
     officialProviderCount:OFFICIAL_PROVIDERS.length,watchmodeConfigured:Boolean(env.WATCHMODE_API_KEY),
     note:'Diagnostic counts include duplicates. The ordinary stream endpoint deduplicates by infoHash. Official links are external web pages, never torrent results.'};
}

/** Official links: deliberately NOT torrents or extracted DRM media.  These are
 * hand-verified canonical provider pages and a small set of direct episode pages.
 * No automated scraping, site access bypass, cookie harvesting or re-hosting.
 * An archive/search link is NEVER represented as a verified episode stream.
 */
/** Search gateways for official catalogues. These are site-restricted SEARCH links,
 * never claims that a programme or a particular episode can currently be played.
 * Each destination corresponds to an official domain checked at release time.
 */
export const OFFICIAL_PROVIDERS=Object.freeze([
  {id:'mediaset',label:'Mediaset Infinity',domain:'mediasetinfinity.mediaset.it',category:'TV italiana'},
  {id:'raiplay',label:'RaiPlay',domain:'www.raiplay.it',category:'TV italiana'},
  {id:'dmax',label:'DMAX / discovery+',domain:'www.discoveryplus.com',category:'Discovery'},
  {id:'realtime',label:'Real Time / discovery+',domain:'www.discoveryplus.com',category:'Discovery'},
  {id:'nove',label:'NOVE / discovery+',domain:'www.discoveryplus.com',category:'Discovery'},
  {id:'foodnetwork',label:'Food Network / discovery+',domain:'www.discoveryplus.com',category:'Discovery'},
  {id:'discovery',label:'discovery+',domain:'www.discoveryplus.com',category:'Discovery'},
  {id:'la7',label:'LA7',domain:'www.la7.it',category:'TV italiana'},
  {id:'tv8',label:'TV8',domain:'www.tv8.it',category:'TV italiana'},
  {id:'pluto',label:'Pluto TV',domain:'pluto.tv',category:'Film e serie gratis'},
  {id:'rakuten',label:'Rakuten TV Gratis',domain:'www.rakuten.tv',category:'Film e serie gratis'},
  {id:'plex',label:'Plex TV gratis',domain:'watch.plex.tv',category:'Film e serie gratis'},
  {id:'arte',label:'ARTE',domain:'www.arte.tv',category:'Documentari e cultura'},
  {id:'chili',label:'CHILI Gratis',domain:'www.chili.com',category:'Film e serie gratis'},
  {id:'serially',label:'Serially',domain:'www.serially.it',category:'Film e serie gratis'},
  {id:'filmzie',label:'Filmzie',domain:'filmzie.com',category:'Film e serie gratis'}
]);
const OFFICIAL_PROGRAMS=Object.freeze([
  {
    key:'le-iene',imdb:'tt0887984',aliases:['Le Iene','Le Iene Show','LeIene'],
    service:'Mediaset Infinity',
    programUrl:'https://mediasetinfinity.mediaset.it/programmi-tv/leiene_SE000000000061',
    archiveUrl:'https://www.iene.mediaset.it/puntate/',
    // Exact episode pages verified against Mediaset Infinity on 2026-11-16.
    episodeUrls:{
      // Verified exact 2024 episode: 1 December 2024 = TheTVDB S28E10.
      // https://www.iene.mediaset.it/video/puntata-dell-1-dicembre_1361511.shtml
      '2024-12-01':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-dell-1-dicembre_F313525401001001',
      '2026-09-24':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-del-24-settembre_F314731701000101',
      '2026-10-01':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-dell1-ottobre_F314731701000201',
      '2026-10-08':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-dell8-ottobre_F314731701000301',
      '2026-10-15':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-del-15-ottobre_F314731701000401',
      '2026-10-22':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-del-22-ottobre_F314731701000501',
      '2026-10-29':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-del-29-ottobre_F314731701000601',
      '2026-11-05':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-del-5-novembre_F314731701000701',
      '2026-11-12':'https://mediasetinfinity.mediaset.it/video/leiene/puntata-del-12-novembre_F314731701000801'
    }
  },
  {key:'le-iene-inside',aliases:['Le Iene presentano: Inside','Le Iene Presentano Inside','Le Iene Inside'],
    service:'Mediaset Infinity',
    programUrl:'https://mediasetinfinity.mediaset.it/programmi-tv/leienepresentanoinside_SE000000001856',
    archiveUrl:'https://www.iene.mediaset.it/speciali/le-iene-presentano-inside_1208435.shtml'},
  {key:'report',aliases:['Report'],service:'RaiPlay',
    programUrl:'https://www.raiplay.it/programmi/report',
    archiveUrl:'https://www.raiplay.it/programmi/report'},
  {key:'airport-security',aliases:['Airport Security','Airport Security: Colombia',
     'Airport Security: Europa','Airport Security: Spagna','Airport Security: Stati Uniti'],
    service:'discovery+', searchOnly:true,
    archiveUrl:'https://www.discoveryplus.com/it/it'}
]);
const OFFICIAL_ALLOWED_HOSTS=new Set([
  'mediasetinfinity.mediaset.it','www.iene.mediaset.it','www.raiplay.it',
  'raiplay.it','www.discoveryplus.com','discoveryplus.com',
  'www.la7.it','la7.it','www.tv8.it','tv8.it','pluto.tv','www.pluto.tv',
  'rakuten.tv','www.rakuten.tv','watch.plex.tv','www.arte.tv','arte.tv',
  'chili.com','www.chili.com','www.serially.it','serially.it',
  'filmzie.com','www.filmzie.com'
]);
function officialAllowedUrl(input) {
  try {
    const u=new URL(String(input||''));
    return u.protocol==='https:' && !u.username && !u.password && !u.port &&
      OFFICIAL_ALLOWED_HOSTS.has(u.hostname.toLowerCase()) && u.toString().length<1400
      ? u.toString():null;
  }catch {return null;}
}
function extraOfficialEntry(target,env) {
  if(!env.OFFICIAL_EXTRA_LINKS || !/^tt\d{6,12}$/.test(target.imdb))return null;
  try {
    const config=JSON.parse(env.OFFICIAL_EXTRA_LINKS);
    const entry=config?.[target.imdb];
    if(!entry || typeof entry!=='object' || Array.isArray(entry))return null;
    const programUrl=officialAllowedUrl(entry.programUrl);
    const episodes={};
    if(entry.episodeUrls && typeof entry.episodeUrls==='object'){
      for(const [key,value] of Object.entries(entry.episodeUrls).slice(0,160)){
        if(/^\d{4}-\d{2}-\d{2}$/.test(key) && officialAllowedUrl(value)) episodes[key]=value;
      }
    }
    if(!programUrl && !Object.keys(episodes).length)return null;
    return {key:'custom',imdb:target.imdb,aliases:target.aliases,
      service:'Sito ufficiale',programUrl,episodeUrls:episodes};
  } catch {return null;}
}
function matchingOfficialPrograms(target,env={}) {
  if(env.ENABLE_OFFICIAL_LINKS==='false')return [];
  if(target.type!=='series')return extraOfficialEntry(target,env)?[extraOfficialEntry(target,env)]:[];
  const normalized=new Set((target.aliases||[]).map(normal));
  const known=OFFICIAL_PROGRAMS.filter(entry=>
    (!entry.imdb || target.imdb===entry.imdb) && entry.aliases.some(alias=>normalized.has(normal(alias))));
  const extra=extraOfficialEntry(target,env);
  return extra?[...known,extra]:known;
}
/** Returns only hand-verified page URLs or clearly labelled archives. */
export function officialStreamsForTarget(target,env={}){
  const results=[];
  for(const entry of matchingOfficialPrograms(target,env)){
    const exact=target.airedDate && officialAllowedUrl(entry.episodeUrls?.[target.airedDate]);
    if(exact){
      results.push({
        name:`🌐 ${entry.service} | Puntata ufficiale`,
        description:`Pagina ufficiale della puntata del ${target.airedDate}. Apri nel browser; eventuale accesso gratuito richiesto. Non è un torrent.`,
        externalUrl:exact,deepsearchExact:true
      });
    }else{
      const archive=officialAllowedUrl(entry.archiveUrl||entry.programUrl);
      if(!archive)continue;
      results.push({
        name:`🔎 ${entry.service} | ${entry.searchOnly?'Cerca disponibilità':'Archivio ufficiale'}`,
        description:`${entry.searchOnly?'Disponibilità gratuita NON verificata.':'Link al catalogo, NON alla puntata specifica.'} ${target.airedDate?`Cerca la data ${target.airedDate}.`:''} Si apre nel browser, non nel player.`,
        externalUrl:archive
      });
    }
  }
  return results.slice(0,4);
}
/** Optional, *official* streaming availability lookup. The user must configure
 * WATCHMODE_API_KEY as a Worker Secret; do not put API keys in wrangler.toml or
 * the manifest. Source: https://api.watchmode.com/docs .
 * Only Italian FREE (including ad-supported) rows are accepted. Paid offers
 * are never relabelled as free. For TV series a title-page URL cannot prove
 * availability of a specific episode, hence it is explicitly NOT exact.
 * The Developer plan includes limited noncommercial monthly credits and
 * requires Watchmode attribution (included in every returned stream).
 */
export function parseFreeOfficialSources(raw,target){
  const sourceRows=Array.isArray(raw)?raw:[];
  const output=[];
  const seen=new Set();
  for(const row of sourceRows){
    if(!row || typeof row!=='object')continue;
    const kind=String(row.type||'').toLowerCase();
    const region=String(row.region||'').toUpperCase();
    if(!['free','ads','ad_supported'].includes(kind) || region!=='IT')continue;
    const official=officialAllowedUrl(row.web_url);
    if(!official)continue;
    const provider=String(row.name||'Piattaforma gratuita').trim().slice(0,80);
    const key=new URL(official).hostname.toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    output.push({
      name:`📺 ${provider} | GRATIS (Italia)`,
      description:`Disponibilita gratuita ${kind==='free'?'':'con possibile pubblicita '}segnalata per l'Italia da Watchmode.com. ${target.type==='series'?'Verifica che anche la singola puntata sia disponibile.':'Apri la pagina ufficiale del titolo.'} Riproduzione sul servizio originale; nessun bypass DRM. Fonte: https://www.watchmode.com/`,
      externalUrl:official,
      deepsearchExact:target.type==='movie'
    });
  }
  return output.slice(0,12);
}
export async function lookupFreeOfficialSources(target,env={}){
  if(env.ENABLE_WATCHMODE==='false' || typeof env.WATCHMODE_API_KEY!=='string'
     || !/^[a-z0-9_-]{10,160}$/i.test(env.WATCHMODE_API_KEY))return [];
  if(!/^tt\d{6,12}$/.test(target.imdb||''))return [];
  const u=new URL(`https://api.watchmode.com/v1/title/${target.imdb}/sources/`);
  u.searchParams.set('apiKey',env.WATCHMODE_API_KEY);
  u.searchParams.set('regions','IT');
  try {return parseFreeOfficialSources(await getJSON(u.toString()),target);}
  catch{return [];}
}
function uniqueOfficialStreams(streams){
  const seen=new Set();const output=[];
  for(const stream of streams){
    if(!stream?.externalUrl || typeof stream.externalUrl!=='string')continue;
    const u=stream.externalUrl;
    if(seen.has(u))continue;
    seen.add(u);output.push(stream);
  }
  return output.slice(0,14);
}

const escapeHtml = value=>String(value??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const officialSearchLink=(provider,query)=>{
  const google=new URL('https://www.google.com/search');
  google.searchParams.set('q',`site:${provider.domain} ${String(query).slice(0,110)}`);
  return google.toString();
};
function officialSearchPage(query,env){
  const q=String(query||'').trim().slice(0,110);
  const normalQ=normal(q);
  const matches=q?OFFICIAL_PROGRAMS.filter(p=>p.aliases.some(a=>normal(a).includes(normalQ)||normalQ.includes(normal(a)))):OFFICIAL_PROGRAMS;
  const cards=matches.map(p=>{
    const href=officialAllowedUrl(p.programUrl||p.archiveUrl);
    const main=href?`<a class="btn" href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">Apri ${escapeHtml(p.service)}</a>`:'';
    const episodes=Object.entries(p.episodeUrls||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,20)
      .map(([date,url])=>`<a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">Puntata ${escapeHtml(date)}</a>`).join('');
    return `<section><h2>${escapeHtml(p.aliases[0])}</h2><p>${escapeHtml(p.searchOnly?'Disponibilità gratuita non verificata':'Pagine ufficiali, accesso e disponibilità da verificare sul sito')}</p>${main}${episodes?`<details><summary>Puntate con link esatto verificato (${Object.keys(p.episodeUrls).length})</summary><div class="episodes">${episodes}</div></details>`:''}</section>`;
  }).join('');
  const providerGroups=[...new Set(OFFICIAL_PROVIDERS.map(p=>p.category))];
  const generic=providerGroups.map(group=>`<section><h3>${escapeHtml(group)}</h3>${OFFICIAL_PROVIDERS.filter(p=>p.category===group)
    .map(p=>`<a class="btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(q?officialSearchLink(p,q):'https://'+p.domain)}">${q?'Cerca su ':'Apri '}${escapeHtml(p.label)}</a>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DeepSearch · Fonti ufficiali</title>
  <style>body{font:16px system-ui,sans-serif;max-width:840px;margin:30px auto;padding:0 18px;background:#10151f;color:#ecf2fc}h1{font-size:27px}section{padding:16px 20px;margin:16px 0;border:1px solid #334256;border-radius:12px}a{color:#93c5fd}.btn{display:inline-block;padding:10px 12px;border:1px solid #628eca;border-radius:8px;margin:7px 5px 7px 0;text-decoration:none}input{padding:12px;border-radius:8px;width:min(100%,530px);font-size:16px}button{padding:13px;border-radius:8px;cursor:pointer}.episodes{display:flex;gap:12px;flex-wrap:wrap;padding-top:12px}footer{opacity:.8;margin:30px 0}</style></head>
  <body><h1>DeepSearch · Ricerca ufficiale</h1><p>Ricerca tra ${OFFICIAL_PROVIDERS.length} servizi e canali gratuiti italiani, compresi Mediaset Infinity, RaiPlay, DMAX, Real Time, NOVE, Pluto TV, Plex, Rakuten TV, ARTE e altri. I risultati generici sono <strong>ricerche</strong>, non video verificati. Nessun bypass DRM.</p>
  <form method="GET"><input name="q" value="${escapeHtml(q)}" maxlength="110" placeholder="Es. Le Iene 4 ottobre 2022"><button type="submit">Cerca</button></form>
  <h2>Ricerca sui siti ufficiali</h2><div>${generic}</div><h2>${q?'Programmi corrispondenti':'Collegamenti verificati'}</h2>
  ${cards||'<p>Nessun programma nella raccolta di link verificati. Usa la ricerca per trovare altre pagine ufficiali.</p>'}
  <footer>La presenza di un link non garantisce la disponibilità della singola puntata né la gratuità. I link di ricerca aprono Google con risultati limitati al sito ufficiale. I contenuti FREE di discovery+ sono differenti dal catalogo a pagamento; Mediaset Infinity e Rakuten TV possono richiedere un account. La verifica opzionale dei titoli è fornita da <a href="https://www.watchmode.com/" rel="noopener noreferrer" target="_blank">Watchmode.com</a>.</footer></body></html>`;
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
    if(path==='/official' || path==='/official/search'){
      const page=officialSearchPage(url.searchParams.get('q')||'',env);
      return new Response(page,{status:200,headers:{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"}});
    }
    const officialRoute=path.match(/^\/official\/(movie|series)\/(tt\d{6,12}(?::\d+:\d+)?)\.json$/);
    if(officialRoute){
      try{
        const target=await getTarget(officialRoute[1],officialRoute[2],env);
        const sources=target?uniqueOfficialStreams([...await lookupFreeOfficialSources(target,env),...officialStreamsForTarget(target,env)]) : [];
        return json({streams:sources.map(({deepsearchExact,...stream})=>stream)},200,{'Cache-Control':'public, max-age=600'});
      }catch {return json({streams:[]},200,{'Cache-Control':'no-store'});}
    }
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
