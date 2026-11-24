import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyRules} from '../lib/organize.js';
import {readConfig,saveConfig} from '../server/config-store.mjs';
import {readPlaces} from '../server/csv-store.mjs';

const fixtures=new URL('./fixtures/',import.meta.url);
const config=await readConfig(fileURLToPath(fixtures));
assert.ok(config.placeRules.length>0);
const db=await readPlaces(new URL('place.csv',fixtures));
const closed=db.places.filter(place=>place.valid==='no');
assert.ok(closed.length>0);
for(const place of closed){
 const events=[{title:'历史到访测试',places:[place.location],partners:[]}];
 assert.equal(applyRules(events,{},true).events.length,1);
}

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-config-'));
const file=path.join(temp,'config.json');
const photoExclusions=[{name:'测试区域',latMin:31,latMax:32,lonMin:120,lonMax:121}];
await fs.writeFile(file,JSON.stringify({
 version:2,filters:{blacklist:config.blacklist},photos:{exclusions:photoExclusions},emojis:{defaultEmoji:'legacy'},
}));
const start=await readConfig(temp);
assert.equal(Object.hasOwn(start,'emojis'),false);
const saved=await saveConfig(temp,{version:start.version,blacklist:[{
 type:'event',enabled:'1',match_type:'contains',value:'fixture',reason:'test',
}]});
assert.deepEqual(saved.eventRules.map(rule=>rule.value),['fixture']);
assert.equal(saved.placeRules.length,0);
await assert.rejects(saveConfig(temp,{version:start.version,blacklist:[]}),error=>error.status===409);
const disabled=await saveConfig(temp,{version:saved.version,blacklist:[{...saved.blacklist[0],enabled:'0'}]});
assert.equal(applyRules([{title:'fixture',places:['A'],partners:[]}],disabled,true).events.length,1);
const deleted=await saveConfig(temp,{version:disabled.version,blacklist:[]});
assert.equal(deleted.blacklist.length,0);
assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{version:2,filters:{blacklist:[]},photos:{exclusions:photoExclusions}});
console.log('Config migration, rule conflicts and preservation of photo exclusions: passed');
