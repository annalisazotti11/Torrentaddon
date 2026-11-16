import test from 'node:test';
import assert from 'node:assert/strict';
import addon,{manifest, hashFrom,verifyRelease,search} from '../src/index.mjs';
const H='0123456789abcdef0123456789abcdef01234567';
const movie={type:'movie',year:2022,aliases:['The Example','Esempio'],season:0,episode:0};
const series={type:'series',year:2022,aliases:['The Example'],season:1,episode:2};
test('manifest exposes only stream resource',()=>{
  assert.deepEqual(manifest.resources,['stream']); assert.deepEqual(manifest.types,['movie','series']);
});
test('hash from standard fields and magnet',()=>{
  assert.equal(hashFrom({infohash:H}),H);
  assert.equal(hashFrom({magnet:'magnet:?xt=urn:btih:'+H}),H);
  assert.equal(hashFrom({infohash:'invalid'}),null);
});
test('movie exact alternate titles, year and no accidental match',()=>{
  const m=t=>verifyRelease({title:t},movie,true);
  assert.ok(m('The.Example.2022.2160p.BluRay.REMUX'));
  assert.ok(m('Esempio.2022.1080p.WEB-DL'));
  assert.equal(m('The.Example.2011.1080p.WEB-DL'),null);
  assert.equal(m('The.Example.After.2022.1080p.WEB-DL'),null);
  assert.equal(m('The.Example.1080p.WEB-DL'),null);
});
test('episodes do not match incorrect episode or pack',()=>{
  const s=t=>verifyRelease({title:t},series);
  assert.ok(s('The.Example.S01E02.1080p.WEB-DL'));
  assert.ok(s('The.Example.1x02.1080p.WEB-DL'));
  assert.equal(s('The.Example.S01E03.1080p.WEB-DL'),null);
  assert.equal(s('The.Example.S01E02-E04.1080p.WEB-DL'),null);
  assert.equal(s('The.Example.S01.Complete.1080p.WEB-DL'),null);
});
test('search deduplicates same infoHash, produces AIOStreams-compatible P2P stream',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async (req)=> {
    const u=String(req);
    const item={title:'The.Example.2022.2160p.BluRay.REMUX.ITA',infohash:H,size:7500000000,seeders:42};
    if(u.includes('knaben')) return new Response(JSON.stringify({hits:[item]}));
    return new Response(JSON.stringify({results:[item]}));
  };
  try{
    const streams=await search(movie,{MAX_QUERIES:'1'});
    assert.equal(streams.length,1);
    assert.equal(streams[0].infoHash,H);
    assert.equal(streams[0].behaviorHints.indexer,'Knaben');
    assert.ok(!('url' in streams[0]));
    assert.ok(streams[0].description.includes('ITA?'));
  } finally {globalThis.fetch=original;}
});
test('worker protects all routes with a token',async()=>{
  const missing=await addon.fetch(new Request('https://example.workers.dev/manifest.json'),{ADDON_TOKEN:'private123'});
  assert.equal(missing.status,404);
  const response=await addon.fetch(new Request('https://example.workers.dev/private123/manifest.json'),{ADDON_TOKEN:'private123'});
  assert.equal(response.status,200);
  assert.equal((await response.json()).id,'org.deepsearch.personale');
});

test('non-Latin alternative titles are preserved in matching',()=>{
  const foreign={...movie,aliases:['千と千尋の神隠し','Унесённые призраками']};
  assert.ok(verifyRelease({title:'千と千尋の神隠し.2001.1080p.BluRay'}, {...foreign,year:2001}));
  assert.ok(verifyRelease({title:'Унесённые призраками.2001.1080p.BluRay'}, {...foreign,year:2001}));
});
