// 桌面端就地写文件的公共机制：先备份到 .backups/，再写临时文件并原子 rename。
// 各 store 仍各自负责版本校验与内容编码，这里只去掉重复的备份/落盘样板。
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function backupText(file, raw) {
  const backupDir = path.join(path.dirname(file), '.backups');
  await fs.mkdir(backupDir, { recursive: true });
  const target = path.join(backupDir, path.basename(file) + '.' + Date.now() + '.' + randomUUID() + '.bak');
  await fs.writeFile(target, raw, { flag: 'wx' });
  return target;
}

export async function atomicWrite(file, output) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, output, { flag: 'wx' });
    await fs.rename(temp, file);
  } catch (error) {
    await fs.unlink(temp).catch(() => {});
    throw error;
  }
}
