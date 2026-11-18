import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {parseAtlasConfig,normalizeBlacklist,parseCSV} from './data-formats.js';

const columns=['type','enabled','match_type','value','reason'];
const version=raw=>createHash('sha256').update(raw).digest('hex');
export const encodeConfig=({blacklist,emojis})=>JSON.stringify({blacklist,emojis},null,2)+'\n';

export async function readLegacyConfig(dir){
 const [raw,emoji]=await Promise.all(['blacklist.csv','emoji-map.json'].map(name=>fs.readFile(path.join(dir,name),'utf8')));
 const blacklist=parseCSV(raw,columns).places;
 return parseAtlasConfig(JSON.stringify({blacklist,emojis:JSON.parse(emoji.replace(/^\uFEFF/,''))}));
}

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
 const {emojis}=parseAtlasConfig(raw);
 const blacklist=normalizeBlacklist(input.blacklist);
 const output=encodeConfig({blacklist,emojis});
 if(output===raw)return {...parseAtlasConfig(raw),version:expected};
 const backup=path.join(dir,'.backups');
 await fs.mkdir(backup,{recursive:true});
 await fs.writeFile(path.join(backup,'config.json.'+Date.now()+'.'+randomUUID()+'.bak'),raw,{flag:'wx'});
 const tmp=file+'.'+randomUUID()+'.tmp';
 try{
  await fs.writeFile(tmp,output,{flag:'wx'});
  if(version(await fs.readFile(file,'utf8'))!==expected){
   const error=Error('配置在保存期间被修改，请重新读取');
   error.status=409;
   throw error;
  }
  await fs.rename(tmp,file);
 }catch(error){
  await fs.unlink(tmp).catch(()=>{});
  throw error;
 }
 return {...parseAtlasConfig(output),version:version(output)};
}
