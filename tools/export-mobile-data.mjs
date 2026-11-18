import {fileURLToPath} from 'node:url';
import {atlasFiles,ensureAtlasData} from '../atlas-data.mjs';
const dir=await ensureAtlasData();
console.log(JSON.stringify({directory:fileURLToPath(dir),files:atlasFiles}));
console.log('桌面和手机共用上述文件，无需另行导出。');
