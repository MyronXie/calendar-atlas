import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const atlasFiles=['calendar.ics','place.csv','config.json'];
const projectRoot=fileURLToPath(new URL('../',import.meta.url));

export function atlasDataDirectory(root=projectRoot){
 return pathToFileURL(path.join(root,'atlas-data')+path.sep);
}
