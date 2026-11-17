import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBitTorrentedJSON,parseTSPJSON,parseTorBoxSearchJSON,parseRarbgSearchJSON,search,diagnose,verifyRelease,manifest} from './index.mjs';

const HASH='123456789abcdef0123456789abcdef012345678';
const TARGET={imdb:'tt9999999',type:'series',year:2011,aliases:['MasterChef Italia','MasterChef Italy'],season:15,episode:4,airedDate:'2026-01-08'};
const TITLE='MasterChef.Italia.S15E04.1080p.WEB-DL.ITA';
const disabled=Object.fromEntries(['KNABEN','EZTV','YTS','RARBG','RARBG_SEARCH','TORLOCK','APIBAY','TORRENTSCSV','TORRENTPROJECT','NYAA','UINDEX','MAGNETZ','BT4G','BTDIG','SOLIDTORRENTS','BITSEARCH','BITSEARCH_WEB','BITTORRENTED','TSP_SEARCH','TORBOX_SEARCH'].map(n=>['ENABLE_'+n,'false']));
const F={...disabled,OFFICIAL_IN_STREAMS:'false',EXTRA_SOURCE_QUERIES:'1'};
const json=obj=>new Response(JSON.stringify(obj),{status:200,headers:{'Content-Type':'application/json'}});

test('manifest remains same addon id, now v0.9.0',()=>{
 assert.equal(manifest.id,'org.deepsearch.personale');assert.equal(manifest.version,'0.9.0');
});
test('BitTorrented parses independently from its JSON API',()=>{
 const arr=parseBitTorrentedJSON({results:[{torrent_name:TITLE,torrent_infohash:HASH,torrent_total_size:2123456789,torrent_seeders:51},{torrent_name:'invalid',torrent_infohash:'xyz'}]});
 assert.equal(arr.length,1);assert.equal(arr[0].hash,HASH);assert.equal(arr[0].seeders,51);assert.ok(verifyRelease(arr[0],TARGET));
});
test('TorBox Search parses nested torrents and avoids unsafe false hashes',()=>{
 const arr=parseTorBoxSearchJSON({success:true,data:{torrents:[{raw_title:TITLE,hash:HASH,size:2000000000,last_known_seeders:7,magnet:'magnet:?xt=urn:btih:'+HASH},{raw_title:'junk',hash:'0'.repeat(40)}]}});
 assert.equal(arr.length,1);assert.equal(arr[0].source,'TorBox Search');assert.ok(verifyRelease(arr[0],TARGET));
});
test('TSP aggregator accepts magnet results with or without hash field',()=>{
 const arr=parseTSPJSON({torrents:[{name:TITLE,magnet:`magnet:?xt=urn:btih:${HASH}&dn=MasterChef`,seeders:18},{name:'Other',magnet:'bad'}]});
 assert.equal(arr.length,1);assert.equal(arr[0].hash,HASH);
});
test('RarBg documented text-search JSON shape',()=>{
 const arr=parseRarbgSearchJSON({results:[{name:TITLE,info_hash:HASH,magnet:`magnet:?xt=urn:btih:${HASH}`,seeders:22}]});
 assert.equal(arr.length,1);assert.equal(arr[0].hash,HASH);assert.ok(verifyRelease(arr[0],TARGET));
});
test('new direct sources run without credentials; aggregate providers remain optional',async()=>{
 const previous=globalThis.fetch;const urls=[];
 globalThis.fetch=async (url,options={})=>{
  const s=String(url);urls.push(s);
  if(s.includes('bittorrented')) return json({results:[{torrent_name:TITLE,torrent_infohash:HASH}]});
  if(s.includes('therarbg.com/api/v1/search/')) return json({results:[{title:TITLE,info_hash:HASH}]});
  throw Error('Unauthorized network request '+s);
 };
 try{
  const res=await search(TARGET,{...F,ENABLE_BITTORRENTED:'true',ENABLE_RARBG_SEARCH:'true'});
  assert.equal(res.length,1);assert.equal(res[0].infoHash,HASH);
  assert.ok(urls.some(x=>x.startsWith('https://bittorrented.com/api/search/torrents')));
  assert.ok(urls.some(x=>x.startsWith('https://therarbg.com/api/v1/search/')));
  assert.ok(!urls.some(x=>x.includes('torbox.app') || x.includes('tspsearch.dev')));
 }finally{globalThis.fetch=previous;}
});
test('TorBox Search & TSP request authentic keys only through headers; diagnostic never exposes secrets',async()=>{
 const previous=globalThis.fetch; const calls=[]; const key='hidden_very_long_torbox_key'; const tspKey='tsp_hidden_key';
 globalThis.fetch=async (url,options={})=>{
  const s=String(url);calls.push({url:s,headers:options.headers||{}});
  if(s.includes('search-api.torbox.app'))return json({success:true,data:{torrents:[{raw_title:TITLE,hash:HASH}]}});
  if(s.includes('api.tspsearch.dev'))return json({torrents:[{name:TITLE,magnet:`magnet:?xt=urn:btih:${HASH}`}]});
  throw Error('unexpected '+s);
 };
 try{
  const res=await search(TARGET,{...F,ENABLE_TORBOX_SEARCH:'true',ENABLE_TSP_SEARCH:'true',TORBOX_SEARCH_API_KEY:key,TSP_API_KEY:tspKey});
  assert.equal(res.length,1);
  assert.equal(calls.filter(x=>x.url.includes('search-api.torbox.app')).length,2);
  assert.equal(calls.filter(x=>x.url.includes('api.tspsearch.dev')).length,2);
  assert.ok(calls.every(c=>!c.url.includes(key)&&!c.url.includes(tspKey)));
  assert.ok(calls.filter(x=>x.url.includes('torbox.app')).every(c=>c.headers.Authorization==='Bearer '+key));
  assert.ok(calls.filter(x=>x.url.includes('tspsearch.dev')).every(c=>c.headers['X-Api-Key']===tspKey));
 }finally{globalThis.fetch=previous;}
});
