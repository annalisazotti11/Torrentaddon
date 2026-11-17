import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest, officialStreamsForTarget} from './index.mjs';
const target={imdb:'tt0887984',type:'series',year:1997,aliases:['Le iene','Le Iene Show','Le Iene'],season:30,episode:1,airedDate:'2026-09-24'};
test('version',()=>assert.equal(manifest.version,'1.0.0'));
test('verified Mediaset episode says Usa app Mediaset',()=>{
 const x=officialStreamsForTarget(target, {ENABLE_OFFICIAL_LINKS:'true'});
 assert.ok(x.some(y=>y.name==='Usa app Mediaset'&&y.externalUrl?.includes('mediasetinfinity.mediaset.it')));
});
test('unknown episode must not claim available',()=>{
 const x=officialStreamsForTarget({...target,airedDate:'2025-08-14'}, {ENABLE_OFFICIAL_LINKS:'true'});
 assert.ok(!x.some(y=>y.name==='Usa app Mediaset'));
});
