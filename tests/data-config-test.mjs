import {ensureAtlasData} from '../atlas-data.mjs';
import {fileURLToPath} from 'node:url';
const atlasData=await ensureAtlasData();
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {selectEmoji} from '../emoji.js';import {applyRules} from '../organize.js';import {readConfig,saveConfig} from '../config-store.mjs';import {readPlaces} from '../csv-store.mjs';
const config=await readConfig(fileURLToPath(atlasData));assert.ok(config.placeRules.length>0);const db=await readPlaces(new URL('place.csv',atlasData));const closed=db.places.filter(p=>p.valid==='no');assert.ok(closed.length>0,'there should be closed places preserved');for(const p of closed){const events=[{title:'历史到访测试',places:[p.location],partners:[]}];assert.equal(applyRules(events,{},true).events.length,1);}assert.equal(selectEmoji({name:'寿司店'},[],config.emojis),'🍣');assert.equal(selectEmoji({name:'寿司店',eventTitles:['演唱会']},[],config.emojis),'🎵');assert.equal(selectEmoji({name:'寿司店'},[{location:'寿司店',emoji:'⭐'}],config.emojis),'🍣');assert.equal(selectEmoji({name:'未分类'},[],config.emojis),'📍');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-config-'));await fs.copyFile(new URL('config.json',atlasData),path.join(temp,'config.json'));const start=await readConfig(temp);const saved=await saveConfig(temp,{version:start.version,blacklist:[{type:'event',enabled:'1',match_type:'contains',value:'fixture',reason:'test'}]});assert.deepEqual(saved.eventRules.map(r=>r.value),['fixture']);assert.equal(saved.placeRules.length,0);await assert.rejects(saveConfig(temp,{version:start.version,blacklist:[]}),e=>e.status===409);const disabled=await saveConfig(temp,{version:saved.version,blacklist:[{...saved.blacklist[0],enabled:'0'}]});assert.equal(applyRules([{title:'fixture',places:['A'],partners:[]}],disabled,true).events.length,1);const deleted=await saveConfig(temp,{version:disabled.version,blacklist:[]});assert.equal(deleted.blacklist.length,0);assert.deepEqual(JSON.parse(await fs.readFile(path.join(temp,'config.json'),'utf8')),{blacklist:[],emojis:start.emojis});console.log(JSON.stringify({closedPlacesPreserved:closed.length,emojiMapping:'passed',placeOverride:'passed',fileRuleSave:'passed',configConflicts:'passed'}));

assert.equal(selectEmoji({name:'寿司店'},[],{...config.emojis,placeEmojis:{'寿司店':'⭐'}}),'⭐');

const migrationRoot=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-data-migration-test-'));
const legacy=path.join(migrationRoot,'user-data');
await fs.mkdir(legacy);
const sources={
 'calendar.ics':await fs.readFile(new URL('./fixture.ics',import.meta.url),'utf8'),
 'place.csv':'\uFEFFlocation,lat,lon\r\n"旧地点,测试",31.23,121.47\r\n',
 'blacklist.csv':'type,enabled,match_type,value,reason\r\nevent,0,exact,测试,\r\n',
 'emoji-map.json':'{"defaultEmoji":"📍"}'
};
await Promise.all(Object.entries(sources).map(([name,text])=>fs.writeFile(path.join(legacy,name),text)));
const [migrated,parallel]=await Promise.all([ensureAtlasData(migrationRoot),ensureAtlasData(migrationRoot)]);
assert.equal(migrated.href,parallel.href);
assert.equal(await fs.readFile(new URL('place.csv',migrated),'utf8'),sources['place.csv']);
assert.equal(await fs.readFile(new URL('calendar.ics',migrated),'utf8'),sources['calendar.ics']);
const converted=await readConfig(fileURLToPath(migrated));
assert.equal(converted.eventRules[0].enabled,'0');
assert.equal(converted.emojis.defaultEmoji,'📍');
assert.equal(await fs.readFile(path.join(legacy,'blacklist.csv'),'utf8'),sources['blacklist.csv']);
await fs.writeFile(path.join(legacy,'place.csv'),'old copy changed');
assert.equal(await fs.readFile(new URL('place.csv',await ensureAtlasData(migrationRoot)),'utf8'),sources['place.csv']);
const {parseMobilePlaces}=await import('../data-formats.js');
assert.equal(parseMobilePlaces('place.csv',sources['place.csv']).places[0].location,'旧地点,测试');
assert.equal(parseMobilePlaces('place.json','{"places":[{"location":"旧版导入"}]}').places[0].location,'旧版导入');
