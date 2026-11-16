/** DeepSearch Personale — stream-only Stremio addon for AIOStreams v2.
 * External indexers return torrent hashes; AIOStreams Service Wrapping manages TorBox.
 * Access only media you are entitled to download or stream.
 */
export const manifest = Object.freeze({
  id: 'org.deepsearch.personale', version: '0.1.0',
  name: 'DeepSearch Personale',
  description: 'Ricerca torrent multilingue con verifica conservativa di titolo, anno ed episodio. Usa il wrapping debrid di AiOStreams.',
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
  const magnet = String(item.magnetUri || item.magnet || item.magnet_url || item.link || '');
  const fromMagnet = magnet.match(/btih:([a-f0-9]{40}|[a-z2-7]{32})(?:[^a-z0-9]|$)/i)?.[1];
  let hash = String(item.infoHash || item.infohash || item.info_hash || item.hash || item.btih || fromMagnet || '').trim();
  if (/^[a-f\d]{40}$/i.test(hash)) return hash.toLowerCase();
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
function matchPrefix(release, alias) {
  const releaseN=normal(release), name=normal(alias);
  if (!name || !releaseN.startsWith(name)) return null;
  const rest=releaseN.slice(name.length).trim();
  if (!rest) return '';
  // Longest title wins. A different word after the title is normally a different work.
  if (!markers.test(rest.split(' ')[0])) return null;
  return rest;
}

/** Conservative matching. No filename information can guarantee a genuine audio track. */
export function verifyRelease(entry, target, requireYear=true) {
  const title=String(entry.title || entry.name || entry.filename || '').trim();
  if (!title || junk.test(title)) return null;
  if (target.type==='movie' && /\bS\d{1,2}E\d{1,2}\b/i.test(title)) return null;
  const aliases = [...target.aliases].sort((a,b)=>normal(b).length-normal(a).length);
  let rem=null;
  for (const alias of aliases) { rem=matchPrefix(title, alias); if(rem!==null) break; }
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
    if(matches.length!==1 || matches[0][0]!==target.season || matches[0][1]!==target.episode) return null;
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
  const seeders=num(item.seeders ?? item.seeds ?? item.seed) || 0;
  const size=num(item.size ?? item.filesize ?? item.file_size ?? item.size_bytes);
  const published=item.createdAt || item.date || item.published || item.publishDate || item.timestamp;
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

async function getTarget(type, id, env) {
  const m=id.match(/^(tt\d{6,12})(?::(\d+):(\d+))?$/);
  if(!m || (type==='series' && (!m[2] || !m[3])) || (type==='movie' && m[2])) return null;
  const imdb=m[1];
  const metaJson=await getJSON(`https://v3-cinemeta.strem.io/meta/${type}/${imdb}.json`);
  const meta=metaJson?.meta;
  if(!meta?.name) return null;
  const year = getYear(meta.releaseInfo || meta.year || meta.released || meta.releaseDate);
  const aliases = [meta.name];
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
        aliases.push(...titles.filter(x=>['IT','US','GB','FR','ES','DE','JP'].includes(x.iso_3166_1)).slice(0,10).map(x=>x.title));
      }
    } catch { /* Metadata lookup remains optional */ }
  }
  const usable=unique(aliases.map(x=>String(x||'').trim()).filter(x=>normal(x).length>=2));
  return {imdb,type,year,season:Number(m[2]||0),episode:Number(m[3]||0),aliases:usable};
}
function makeQueries(target, env) {
  const max = Math.max(1,Math.min(5,Number(env.MAX_QUERIES||3)));
  const queries=[];
  for(const alias of target.aliases) {
    queries.push(target.type==='movie' && target.year?`${alias} ${target.year}`:`${alias} S${String(target.season).padStart(2,'0')}E${String(target.episode).padStart(2,'0')}`);
    if(queries.length>=max) break;
  }
  if(target.type==='movie' && queries.length<max) queries.push(target.aliases[0]);
  if(target.type==='movie' && queries.length<max) queries.push(`${target.aliases[0]} ITA`);
  return unique(queries).slice(0,max);
}

export async function search(target, env={}) {
  const queries=makeQueries(target,env);
  const tasks=[];
  for(const q of queries){
    if(env.ENABLE_KNABEN!=='false') tasks.push(searchKnaben(q));
    if(env.ENABLE_BITSEARCH!=='false') tasks.push(searchBitsearch(q,target,env));
  }
  const settled=await Promise.allSettled(tasks);
  const entries=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  const requireYear=env.REQUIRE_YEAR!=='false';
  const found=new Map();
  for(const item of entries) {
    const matched=verifyRelease(item,target,requireYear);
    if(!matched) continue;
    const score=rank(item);
    const key=item.hash;
    if(!found.has(key) || score>found.get(key).score)
      found.set(key,{...item,score});
  }
  return [...found.values()].sort((a,b)=>b.score-a.score)
    .slice(0,Math.max(1,Math.min(80,Number(env.RESULT_LIMIT||35))))
    .map(x=>({name:`DeepSearch | ${quality(x.title)}`,
      description:`${x.title}\n${x.source} · ${x.size?(x.size/(1024**3)).toFixed(2)+' GB · ':''}${x.seeders} seed · ${langTags(x.title)}`,
      infoHash:x.hash,
      ...(x.fileIdx!==undefined?{fileIdx:x.fileIdx}:{}),
      behaviorHints:{filename:x.title, seeders:x.seeders,indexer:x.source,
        ...(x.size!==undefined?{folderSize:x.size}:{}),
        ...(x.published && !Number.isNaN(Date.parse(String(x.published)))?{publishDate:new Date(x.published).toISOString()}:{}),
      }}));
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
