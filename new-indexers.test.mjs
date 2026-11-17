import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest,parseBTDigHTML,parseSolidTorrentsHTML,parseBitSearchHTML,search,hashFrom,verifyRelease} from './index.mjs';

const HASH='0123456789abcdef0123456789abcdef01234567';
const TARGET={imdb:'tt9999999',type:'series',year:2025,aliases:['Programma Italiano'],season:15,episode:4,airedDate:'2026-01-08'};
const FLAGS=Object.fromEntries(['KNABEN','BITSEARCH','BITSEARCH_WEB','EZTV','YTS','RARBG','TORLOCK','APIBAY','TORRENTSCSV','TORRENTPROJECT','NYAA','UINDEX','MAGNETZ','BT4G','BTDIG','SOLIDTORRENTS','BITTORRENTED','RARBG_SEARCH','TORBOX_SEARCH','TSP_SEARCH'].map(x=>['ENABLE_'+x,'false']));
const F={...FLAGS,OFFICIAL_IN_STREAMS:'false'};
const btdig=`<html><div class="one_result"><div class="torrent_name"><a href="/info/aaa">Programma.Italiano.S15E04.1080p.WEB-DL.ITA</a></div><span class="torrent_size">1.4&nbsp;GiB</span><a href="magnet:?xt=urn:btih:${HASH}&amp;dn=Test">magnet</a></div></html>`;
const solid=`<li class="search-result"><div class="info"><h5><a href="/torrent/test">Programma.Italiano.S15E04.1080p.WEB-DL.ITA</a></h5></div><div class="stats"><div>foo</div></div><div class="links"><a class="dl-magnet" href="magnet:?xt=urn:btih:${HASH}&amp;dn=Test">Get</a></div></li>`;
const bit=`<main class="mx-auto"><div class="space-y-4"><div class="bg-white"><div class="items-start"><div class="flex-1"><a href="/torrent/123">Programma.Italiano.S15E04.1080p.WEB-DL.ITA</a><a href="magnet:?xt=urn:btih:${HASH}&amp;dn=Test">Magnet</a></div></div></div></div></main>`;

test('v0.9.0, unchanged addon id and official stream protocol',()=>{
  assert.equal(manifest.version,'1.0.0');assert.equal(manifest.id,'org.deepsearch.personale');
  assert.deepEqual(manifest.resources,['stream']);
});
test('BTDig: DHT search result hash, name, size',()=>{
  const result=parseBTDigHTML(btdig);assert.equal(result.length,1);
  assert.equal(result[0].hash,HASH);assert.ok(result[0].size>1e9);
  assert.ok(verifyRelease(result[0],TARGET));
  assert.deepEqual(parseBTDigHTML('<html>no results</html>'),[]);
});
test('SolidTorrents: magnet within result, exact show',()=>{
  const result=parseSolidTorrentsHTML(solid);assert.equal(result.length,1);
  assert.equal(result[0].hash,HASH);assert.ok(verifyRelease(result[0],TARGET));
});
test('BitSearch website: alternate host parser',()=>{
  const result=parseBitSearchHTML(bit);assert.equal(result.length,1);
  assert.equal(result[0].hash,HASH);assert.ok(verifyRelease(result[0],TARGET));
});
test('Real search plan includes new sources, omits broken ones, does not duplicate',async()=>{
  const original=globalThis.fetch;const urls=[];
  globalThis.fetch=async u=>{urls.push(String(u));let page;
    if(String(u).includes('btdig.com'))page=btdig;
    else if(String(u).includes('solidtorrents.eu'))page=solid;
    else if(String(u).includes('bitsearch.to'))page=bit;
    else throw Error('Unexpected provider '+u);
    return new Response(page,{status:200});
  };
  try{
    const streams=await search(TARGET,{...F,ENABLE_BTDIG:'true',ENABLE_SOLIDTORRENTS:'true',ENABLE_BITSEARCH_WEB:'true',EXTRA_SOURCE_QUERIES:'1'});
    assert.equal(streams.length,1);
    assert.equal(streams[0].infoHash,HASH);
    assert.ok(urls.some(x=>x.includes('btdig.com/search')));
    assert.ok(urls.some(x=>x.includes('solidtorrents.eu/search')));
    assert.ok(urls.some(x=>x.includes('bitsearch.to/search')));
  }finally{globalThis.fetch=original;}
});
test('Unrelated show / wrong episode rejected even if indexer returned magnet',()=>{
  assert.equal(verifyRelease({title:'Programma.Italiano.S15E05.1080p'},TARGET),null);
  assert.equal(verifyRelease({title:'Programma.Italiano.Puntata.del.9.gennaio.2026.1080p'},TARGET),null);
  assert.equal(hashFrom({magnetUrl:'not a magnet'}),null);
});
test('MasterChef Italia: queries include episode code even with only five searches',async()=>{
  const {diagnose}=await import('./index.mjs');
  const prev=globalThis.fetch;
  const observed=[];
  globalThis.fetch=async u=>{
    observed.push(String(u));
    if(String(u).includes('v3-cinemeta'))return new Response(JSON.stringify({meta:{name:'MasterChef Italia',releaseInfo:'2011',videos:[{season:15,episode:4,released:'2026-01-08T00:00:00Z'}]}}));
    if(String(u).includes('knaben.org'))return new Response(JSON.stringify({hits:[]}));
    throw Error('unexpected '+u);
  };
  try{
    const report=await diagnose('series','tt9999999:15:4',{...F,ENABLE_KNABEN:'true',MAX_QUERIES:'5'});
    assert.equal(report.metadata.airDate,'2026-01-08');
    assert.ok(report.queries.some(x=>/MasterChef Italia S15E04/i.test(x)));
    assert.ok(report.queries.some(x=>/08\.01\.2026|8 gennaio 2026/i.test(x)));
    assert.ok(report.providers.some(x=>/S15E04/i.test(x.query)));
    assert.ok(report.metadata.aliases.includes('MasterChef Italy'));
  }finally{globalThis.fetch=prev;}
});
test('Le Iene retains date-first queries and an episode code',async()=>{
  const {diagnose}=await import('./index.mjs');
  const prev=globalThis.fetch;
  globalThis.fetch=async u=>{
    if(String(u).includes('v3-cinemeta'))return new Response(JSON.stringify({meta:{name:'Le Iene',releaseInfo:'1997',videos:[{season:30,episode:1,released:'2026-09-24T00:00:00Z'}]}}));
    if(String(u).includes('knaben.org'))return new Response(JSON.stringify({hits:[]}));
    throw Error('unexpected '+u);
  };
  try{
    const report=await diagnose('series','tt0887984:30:1',{...F,ENABLE_KNABEN:'true',MAX_QUERIES:'5'});
    assert.ok(/24\.09\.2026/.test(report.queries[0]));
    assert.ok(report.queries.some(x=>/S30E01/.test(x)));
    assert.ok(report.providers.some(x=>/S30E01/.test(x.query)));
  }finally{globalThis.fetch=prev;}
});
