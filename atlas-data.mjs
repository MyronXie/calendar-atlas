import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readLegacyConfig,encodeConfig} from './config-store.mjs';

export const atlasFiles=['calendar.ics','place.csv','config.json'];
const projectRoot=fileURLToPath(new URL('./',import.meta.url));
const asURL=dir=>pathToFileURL(dir+path.sep);
const directoryExists=async dir=>{
 try{return (await fs.stat(dir)).isDirectory();}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
};

export async function ensureAtlasData(root=projectRoot){
 const target=path.join(root,'atlas-data'),legacy=path.join(root,'user-data');
 if(await directoryExists(target)||!await directoryExists(legacy))return asURL(target);
 const config=await readLegacyConfig(legacy);
 const stage=await fs.mkdtemp(path.join(root,'.atlas-data-migration-'));
 try{
  for(const name of ['calendar.ics','place.csv']){
   const source=path.join(legacy,name),destination=path.join(stage,name);
   const {atime,mtime}=await fs.stat(source);
   await fs.copyFile(source,destination);
   await fs.utimes(destination,atime,mtime);
  }
  await fs.writeFile(path.join(stage,'config.json'),encodeConfig(config));
  try{await fs.rename(stage,target);}
  catch(error){if(!await directoryExists(target))throw error;}
 }finally{
  // Only these three known files were written into the temporary migration directory.
  for(const name of atlasFiles)await fs.unlink(path.join(stage,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await fs.rmdir(stage).catch(error=>{if(error.code!=='ENOENT')throw error;});
 }
 return asURL(target);
}
