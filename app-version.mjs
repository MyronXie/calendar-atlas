import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);

export async function stampAppVersion(html, root) {
  const result = await run('git', ['rev-parse', '--show-prefix', '--short=7', 'HEAD'], {
    cwd: root,
    timeout: 1500,
    windowsHide: true,
  }).catch(() => null);
  const commit = /^\r?\n([a-f0-9]{7,64})\s*$/i.exec(result?.stdout || '')?.[1];
  const version = commit || '未标记';
  return html.replace('<output id="app-version">未标记</output>',
    '<output id="app-version">' + version + '</output>');
}
