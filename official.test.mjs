import test from 'node:test';
import assert from 'node:assert/strict';
import addon,{manifest,OFFICIAL_PROVIDERS,parseFreeOfficialSources,lookupFreeOfficialSources,officialStreamsForTarget,verifyRelease} from './index.mjs';
const base='https://example.workers.dev/unit-secret';
const target={type:'series',imdb:'tt0887984',aliases:['Le Iene'],airedDate:'2026-11-12',season:49,episode:8};
const env={ADDON_TOKEN:'unit-secret',ENABLE_KNABEN:'false',ENABLE_EZTV:'false',ENABLE_YTS:'false',ENABLE_RARBG:'false',ENABLE_TORLOCK:'false',ENABLE_BITSEARCH:'false',ENABLE_APIBAY:'false',ENABLE_TORRENTSCSV:'false',ENABLE_TORRENTPROJECT:'false',ENABLE_NYAA:'false',ENABLE_UINDEX:'false',ENABLE_MAGNETZ:'false',ENABLE_BT4G:'false'};

test('v0.7 keeps the same addon ID and stream protocol',()=>{
  assert.equal(manifest.id,'org.deepsearch.personale');assert.equal(manifest.version,'0.7.0');
  assert.deepEqual(manifest.resources,['stream']);
});
test('16 searchable official services and channels, including free Italian networks',()=>{
  assert.equal(OFFICIAL_PROVIDERS.length,16);
  for(const k of ['mediaset','raiplay','dmax','realtime','nove','pluto','rakuten','plex','arte','chili','la7','tv8']){
    assert.ok(OFFICIAL_PROVIDERS.find(x=>x.id===k),k);
  }
});
test('free offers: accept only IT FREE/ADS with official HTTPS URL; reject paid and suspicious urls',()=>{
  const rows=[
    {type:'free',name:'RaiPlay',region:'IT',web_url:'https://www.raiplay.it/film/a'},
    {type:'ads',name:'Plex',region:'IT',web_url:'https://watch.plex.tv/movie/b'},
    {type:'sub',name:'discovery+',region:'IT',web_url:'https://www.discoveryplus.com/it/it/show/c'},
    {type:'rent',name:'Mediaset',region:'IT',web_url:'https://mediasetinfinity.mediaset.it/movie/pay'},
    {type:'free',name:'RaiPlay',region:'US',web_url:'https://www.raiplay.it/film/us'},
    {type:'free',name:'Bad',region:'IT',web_url:'javascript:alert(1)'},
    {type:'free',name:'Bad',region:'IT',web_url:'https://evil.example/redirect'},
  ];
  const accepted=parseFreeOfficialSources(rows,{type:'movie'});
  assert.equal(accepted.length,2);
  assert.ok(accepted.every(x=>x.deepsearchExact && x.description.includes('Watchmode.com')));
  assert.deepEqual(accepted.map(x=>x.externalUrl),['https://www.raiplay.it/film/a','https://watch.plex.tv/movie/b']);
  const episode=parseFreeOfficialSources(rows,{type:'series'});
  assert.ok(episode.every(x=>x.deepsearchExact===false));
  assert.ok(episode[0].description.includes('singola puntata'));
});
test('no Watchmode API request when key absent',async()=>{
  const prev=globalThis.fetch;globalThis.fetch=()=>{throw Error('must not fetch');};
  try{assert.deepEqual(await lookupFreeOfficialSources(target,env),[]);}
  finally{globalThis.fetch=prev;}
});
test('Watchmode uses verified Italy filter when optional key is present',async()=>{
  const prev=globalThis.fetch;const seen=[];
  globalThis.fetch=async url=>{
    seen.push(String(url));
    return new Response(JSON.stringify([
      {name:'Mediaset Infinity',type:'free',region:'IT',web_url:'https://mediasetinfinity.mediaset.it/programmi-tv/leiene_SE000000000061'},
      {name:'Paid',type:'sub',region:'IT',web_url:'https://www.discoveryplus.com/it/it'}
    ]),{headers:{'Content-Type':'application/json'}});
  };
  try{
    const got=await lookupFreeOfficialSources(target,{WATCHMODE_API_KEY:'aaaaaaaaaaaa'});
    assert.equal(got.length,1);
    assert.equal(got[0].deepsearchExact,false);
    assert.match(seen[0],/\/v1\/title\/tt0887984\/sources\//);
    assert.match(seen[0],/regions=IT/);
  }finally{globalThis.fetch=prev;}
});
test('known full episode gets exact external URL, not a debrid/torrent URL',()=>{
  const got=officialStreamsForTarget(target,env);
  assert.equal(got.length,1);
  assert.equal(got[0].deepsearchExact,true);
  assert.match(got[0].externalUrl,/puntata-del-12-novembre/);
  assert.equal(got[0].infoHash,undefined);
  assert.equal(got[0].url,undefined);
});
test('older Le Iene episode links to an archive, not an invented working episode',()=>{
  const got=officialStreamsForTarget({...target,airedDate:'2022-10-04'});
  assert.equal(got.length,1);assert.match(got[0].description,/NON alla puntata specifica/);
  assert.equal(got[0].deepsearchExact,undefined);
});
test('search portal includes broad platform links and escapes user HTML',async()=>{
  const bad='<script>alert(1)</script>';
  const res=await addon.fetch(new Request(base+'/official/search?q='+encodeURIComponent(bad)),env);
  assert.equal(res.status,200);
  const html=await res.text();
  assert.ok(!html.includes(bad));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html,/site%3Awww.raiplay.it/);
  assert.match(html,/site%3Awww.discoveryplus.com/);
  assert.match(html,/site%3Awatch.plex.tv/);
  assert.match(html,/site%3Apluto.tv/);
  assert.match(html,/16 servizi/);
});
test('official-only route integrates optional Watchmode into free sources',async()=>{
  const prev=globalThis.fetch;
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.includes('v3-cinemeta'))return new Response(JSON.stringify({meta:{name:'Le Iene',videos:[{season:49,episode:8,released:'2026-11-12T00:00:00Z'}]}}));
    if(u.includes('api.watchmode.com'))return new Response(JSON.stringify([{name:'RaiPlay',type:'free',region:'IT',web_url:'https://www.raiplay.it/programmi/report'}]));
    throw Error('unexpected URL '+u);
  };
  try{
    const r=await addon.fetch(new Request(base+'/official/series/tt0887984:49:8.json'),{...env,WATCHMODE_API_KEY:'aaaaaaaaaaaa'});
    const streams=(await r.json()).streams;
    assert.equal(streams.length,2);
    assert.equal(streams[0].externalUrl,'https://www.raiplay.it/programmi/report');
    assert.equal(streams[1].deepsearchExact,undefined);
    assert.equal(streams[1].infoHash,undefined);
  }finally{globalThis.fetch=prev;}
});
test('torrent matching still rejects wrong broadcast date',()=>{
  const t={...target,aliases:['Le Iene','Le Iene Show'],airedDate:'2022-10-04',season:26,episode:1};
  assert.ok(verifyRelease({title:'Le.Iene.Show.Puntata.del.4.ottobre.2022.1080p'},t));
  assert.equal(verifyRelease({title:'Le.Iene.Show.Puntata.del.5.ottobre.2022.1080p'},t),null);
});
