import test from 'node:test';
import assert from 'node:assert/strict';
import {
 manifest,sourceCatalog,parseLimeTorrentsHTML,parse1337xListing,
 parseTorrentDownloadsJSON,parseSubsPleaseJSON, parseTorznab,
 officialStreamsForTarget,verifyRelease,diagnose
} from './index.mjs';
const hash='0123456789abcdef0123456789abcdef01234567';
const target={imdb:'tt0887984',type:'series',year:1997,aliases:['Le Iene','Le Iene Show'],season:30,episode:1,airedDate:'2026-09-24'};
test('v1 API and same addon ID, wide catalog with safe optional key status',()=>{
 assert.equal(manifest.version,'1.0.0');
 assert.equal(manifest.id,'org.deepsearch.personale');
 const data=sourceCatalog({TORBOX_SEARCH_API_KEY:'MY_KEY',MAX_CUSTOM_FEEDS_PER_REQUEST:'1000',
 TORZNAB_FEEDS:JSON.stringify([{name:'Jackett',url:'https://jackett.example/api',apikey:'TOP_SECRET'}])});
 assert.ok(data.publicSources.length>=25);
 assert.equal(data.customTorznab,1);
 assert.equal(data.maxCustomFeedsPerRequest,30);
 assert.ok(data.publicSources.some(x=>x.name==='1337x'));
 assert.ok(data.publicSources.some(x=>x.name==='LimeTorrents'));
 assert.ok(data.publicSources.some(x=>x.name==='BitTorrented'));
 assert.equal(JSON.stringify(data).includes('TOP_SECRET'),false);
 assert.equal(JSON.stringify(data).includes('MY_KEY'),false);
});
test('LimeTorrents parser pairs verifiable hash with its own result row',()=>{
 const html=`<table><tr bgcolor="#eee"><td><div class="tt-name"><a href="https://itorrents.net/torrent/${hash}.torrent">download</a><a href="/Le-Iene-S30E01.html">Le Iene S30E01 1080p</a></div></td><td>Today</td><td>1.4 GB</td><td class="tdseed">27</td></tr></table>`;
 const x=parseLimeTorrentsHTML(html);
 assert.equal(x.length,1);assert.equal(x[0].hash,hash);assert.equal(x[0].seeders,27);
 assert.ok(verifyRelease(x[0],target));
});
test('1337x listing parser never fabricates hash when details unavailable',()=>{
 const html='<tbody><tr><td class="coll-1"><a href="/category/tv">TV</a><a href="/torrent/321/le-iene">Le Iene S30E01 1080p</a></td><td class="coll-2">41</td><td>1.3 GB</td></tr></tbody>';
 const rows=parse1337xListing(html);
 assert.equal(rows.length,1);assert.equal(rows[0].seeders,41);
 assert.equal(rows[0].path,'/torrent/321/le-iene');
 assert.equal(rows[0].hash,undefined);
});
test('TorrentDownloads and SubsPlease only accept valid infohashes',()=>{
 const td=parseTorrentDownloadsJSON({torrents:[{hash,name:'Le Iene S30E01 1080p',seeders:12,size:123456},{hash:'bad',name:'bad'}]});
 assert.equal(td.length,1);
 const sub=parseSubsPleaseJSON({'1':{show:'Some Anime',episode:'01',downloads:[{res:'1080',magnet:'magnet:?xt=urn:btih:'+hash}]},'2':{show:'Bad',episode:'2',downloads:[]}});
 assert.equal(sub.length,1);assert.equal(sub[0].hash,hash);
});
test('Torznab gateway parser accepts hash-only XML without magnet',()=>{
 const xml=`<rss><channel><item><title>Le Iene S30E01 1080p ITA</title><torznab:attr name="infohash" value="${hash}"/><torznab:attr name="seeders" value="11"/></item></channel></rss>`;
 const rows=parseTorznab(xml,'Italian tracker');
 assert.equal(rows.length,1);assert.equal(rows[0].source,'Italian tracker');assert.ok(verifyRelease(rows[0],target));
});
test('official episodes and search provider catalog remain separate, app label retained',()=>{
 const all=officialStreamsForTarget(target,{});
 assert.ok(all.some(x=>x.name==='Usa app Mediaset'));
 assert.ok(all.every(x=>!x.infoHash));
});
test('TORZNAB_ALL gateway and custom JSON feeds participate in diagnostics without exposing secrets',async()=>{
 const old=globalThis.fetch;
 const requests=[];
 try{
  globalThis.fetch=async(input,opts)=>{
    const u=new URL(input);requests.push({host:u.hostname,path:u.pathname,search:u.search});
    if(u.hostname==='v3-cinemeta.strem.io')return new Response(JSON.stringify({meta:{name:'Le Iene',year:1997,videos:[{season:30,episode:1,released:'2026-09-24'}]}}),{status:200});
    if(u.hostname==='jackett.example')return new Response(`<rss><channel><item><title>Le Iene S30E01 1080p ITA</title><torznab:attr name="infohash" value="${hash}"/></item></channel></rss>`,{status:200});
    if(u.hostname==='json.example')return new Response(JSON.stringify({results:[{title:'Le Iene S30E01 1080p ITA',infoHash:hash}]}),{status:200});
    return new Response(JSON.stringify({torrents:[],results:[]}),{status:200});
  };
  const env={MAX_PROVIDER_REQUESTS:'18',TORZNAB_ALL_URL:'https://jackett.example/torznab/api',TORZNAB_ALL_API_KEY:'NOT_TO_EXPOSE',CUSTOM_JSON_FEEDS:JSON.stringify([{name:'Example',url:'https://json.example/search',queryParam:'query',apiKey:'NO_LEAK',apiKeyHeader:'X-Api-Key'}])};
  const out=await diagnose('series','tt0887984:30:1',env);
  assert.ok(out.providers.some(x=>x.source==='Jackett/Prowlarr ALL'));
  assert.ok(out.providers.some(x=>x.source==='JSON: Example'));
  assert.ok(out.acceptedTotal>=2);
  assert.equal(JSON.stringify(out).includes('NOT_TO_EXPOSE'),false);
  assert.equal(JSON.stringify(out).includes('NO_LEAK'),false);
 }finally{globalThis.fetch=old;}
});
