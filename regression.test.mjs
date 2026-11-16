import test from 'node:test';
import assert from 'node:assert/strict';
import addon,{manifest,officialStreamsForTarget} from './index.mjs';
const EXACT='https://mediasetinfinity.mediaset.it/video/leiene/puntata-dell-1-dicembre_F313525401001001';
const target={imdb:'tt0887984',type:'series',aliases:['Le Iene','Le Iene Show'],season:28,episode:10,airedDate:'2024-12-01'};
const env={ADDON_TOKEN:'secret',ENABLE_KNABEN:'false',ENABLE_BITSEARCH:'false',ENABLE_EZTV:'false',ENABLE_YTS:'false',ENABLE_RARBG:'false',ENABLE_TORLOCK:'false',ENABLE_APIBAY:'false',ENABLE_TORRENTSCSV:'false',ENABLE_TORRENTPROJECT:'false',ENABLE_NYAA:'false',ENABLE_UINDEX:'false',ENABLE_MAGNETZ:'false',ENABLE_BT4G:'false',ENABLE_WATCHMODE:'false'};
const orig=globalThis.fetch;
test('v0.7.1 exact S28E10 page',()=>{
 assert.equal(manifest.version,'0.7.1');
 const streams=officialStreamsForTarget(target,env);
 assert.equal(streams.length,1);
 assert.equal(streams[0].externalUrl,EXACT);
 assert.equal(streams[0].deepsearchExact,true);
 assert.ok(!('url' in streams[0]));
});
test('metadata missing season airedDate is corrected and stream found',async()=>{
 globalThis.fetch=async u=>{
  if(String(u).includes('v3-cinemeta'))return Response.json({meta:{name:'Le Iene',videos:[],releaseInfo:'1997'}});
  throw Error('Unexpected source: '+u);
 };
 try {
  const debug=await addon.fetch(new Request('https://foo/secret/debug/series/tt0887984:28:10.json'),env);
  const j=await debug.json();
  assert.equal(j.metadata.airDate,'2024-12-01');
  assert.ok(j.officialLinks.some(s=>s.externalUrl===EXACT));
  const res=await addon.fetch(new Request('https://foo/secret/stream/series/tt0887984:28:10.json'),env);
  const data=await res.json();
  assert.equal(data.streams.length,1);
  assert.equal(data.streams[0].externalUrl,EXACT);
 }finally{globalThis.fetch=orig;}
});
test('metadata downtime still yields verified official episode',async()=>{
 globalThis.fetch=async u=>{throw Error('503 unavailable')};
 try{
  const res=await addon.fetch(new Request('https://foo/secret/official/series/tt0887984:28:10.json'),env);
  const data=await res.json();
  assert.equal(data.streams.length,1);
  assert.equal(data.streams[0].externalUrl,EXACT);
 }finally{globalThis.fetch=orig;}
});
test('other episode not misidentified as 1 December 2024',()=>{
 const streams=officialStreamsForTarget({...target,episode:11,airedDate:'2024-12-08'},env);
 assert.ok(!streams.some(s=>s.externalUrl===EXACT));
});
