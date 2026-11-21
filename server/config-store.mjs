import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {backupText,atomicWrite} from './atomic-file.mjs';
import {parseAtlasConfig,normalizeBlacklist} from '../lib/data-formats.js';

const version=raw=>createHash('sha256').update(raw).digest('hex');
const encodeConfig=({blacklist,emojis,photoExclusions=[]})=>JSON.stringify({
 version:2,
 filters:{blacklist},
 emojis,
 photos:{exclusions:photoExclusions}
},null,2)+'\n';

export async function readConfig(dir){
 const raw=await fs.readFile(path.join(dir,'config.json'),'utf8');
 return {...parseAtlasConfig(raw),version:version(raw)};
}

export async function saveConfig(dir,input){
 const file=path.join(dir,'config.json');
 const raw=await fs.readFile(file,'utf8');
 const expected=input.version;
 if(version(raw)!==expected){
  const error=Error('黑名单或映射文件已被修改，请重新读取后再操作');
  error.status=409;
  throw error;
 }
 const {emojis,photoExclusions}=parseAtlasConfig(raw);
 const blacklist=normalizeBlacklist(input.blacklist);
 const output=encodeConfig({blacklist,emojis,photoExclusions});
 if(output===raw)return {...parseAtlasConfig(raw),version:expected};
 await backupText(file,raw);
 if(version(await fs.readFile(file,'utf8'))!==expected){
  const error=Error('配置在保存期间被修改，请重新读取');
  error.status=409;
  throw error;
 }
 await atomicWrite(file,output);
 return {...parseAtlasConfig(output),version:version(output)};
}
