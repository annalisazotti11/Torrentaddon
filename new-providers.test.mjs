import assert from 'node:assert/strict';
import {search, diagnose, verifyRelease, hashFrom, manifest} from '../index.mjs';
const HASH='0123456789abcdef0123456789abcdef01234567';
const H2='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const target={imdb:'tt1727587',type:'movie',year:2010,aliases:['Sintel'],season:0,episode:0,airedDate:null};
function json(data){return {ok:true,json:async()=>data,text:async()=>JSON.stringify(data)};}
function rss(body){return {ok:true,text:async()=>body,json:async()=>({})};}
const flags={ENABLE_KNABEN:'false',ENABLE_EZTV:'false',ENABLE_YTS:'false',ENABLE_RARBG:'false',ENABLE_TORLOCK:'false',ENABLE_BITSEARCH:'false',ENABLE_APIBAY:'false',ENABLE_TORRENTSCSV:'false',ENABLE_TORRENTPROJECT:'false',ENABLE_NYAA:'false',MAX_QUERIES:'2'};
async function runSource(flag, route, response, expected='Sintel.2010.1080p.BluRay.mkv'){
 globalThis.fetch=async url => {assert.ok(String(url).includes(route),String(url));return response;};
 const streams=await search(target,{...flags,[flag]:'true'});
 assert.equal(streams.length,1);
 assert.equal(streams[0].infoHash,HASH);
 assert.ok(streams[0].description.includes(expected));
 return streams[0];
}
assert.equal(manifest.version,'0.3.0');
assert.equal(hashFrom({infoHash:'0'.repeat(40)}),null);
await runSource('ENABLE_APIBAY','apibay.org',json([
  {id:'1',name:'Sintel.2010.1080p.BluRay.mkv',info_hash:HASH,seeders:'15',size:'4200000000'},
  {id:'2',name:'Wrong.2010.1080p.BluRay.mkv',info_hash:H2,seeders:'18',size:'4200000000'},
  {id:'0',name:'No results',info_hash:'0'.repeat(40)}
]));
await runSource('ENABLE_TORRENTSCSV','torrents-csv.com',json({torrents:[
  {name:'Sintel.2010.1080p.BluRay.mkv',infohash:HASH,seeders:21,size_bytes:3000000000}
]}));
await runSource('ENABLE_TORRENTPROJECT','torrentproject.se',json({torrents:[
  {title:'Sintel.2010.1080p.BluRay.mkv',hash:HASH,seeds:33,size:3000000000}
]}));
const tv={imdb:'tt9999999',type:'series',year:2023,aliases:['Example Show'],season:1,episode:1,airedDate:'2023-01-01'};
globalThis.fetch=async u=>{
 assert.ok(String(u).includes('nyaa.si'));
 return rss(`<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel><item><title>[Fansub] Example Show S01E01 1080p</title><nyaa:infoHash>${HASH}</nyaa:infoHash><nyaa:seeders>24</nyaa:seeders><nyaa:size>1.5 GiB</nyaa:size></item></channel></rss>`);
};
const anime=await search(tv,{...flags,ENABLE_NYAA:'true'});
assert.equal(anime.length,1);assert.equal(anime[0].infoHash,HASH);
assert.ok(anime[0].description.includes('1.50 GB') || anime[0].description.includes('1.50'));
assert.ok(verifyRelease({title:'The Diary of Anne Frank Il Diario di Anna Frank 1959 1080p'},
  {type:'movie',year:1959,aliases:['The Diary of Anne Frank','Il diario di Anna Frank']},true));
assert.equal(verifyRelease({title:'Unrelated S01E01 1080p'},tv),null);
console.log('PASS: APIBay, Torrents-CSV, TorrentProject, Nyaa RSS, hash validation, bilingual release matching');
