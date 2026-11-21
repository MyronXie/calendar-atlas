import {execFile} from 'node:child_process';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);

export async function stampAppVersion(html, root) {
  const result = await access(path.join(root, '.git')).then(() => run('git', [
    'show', '-s', '--abbrev=7', '--format=%H%n%h%n%ci', 'HEAD',
  ], {
    cwd: root,
    timeout: 1500,
    windowsHide: true,
  })).catch(() => null);
  const metadata = /^([a-f0-9]{40,64})\r?\n([a-f0-9]{7,64})\r?\n(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):\d{2} [+-]\d{4}$/i.exec(result?.stdout.trim() || '');
  if (!metadata) return html;
  const [, commit, short, date] = metadata;
  const link = '<a href="https://github.com/MyronXie/calendar-atlas/commit/' + commit
    + '" target="_blank" rel="noopener noreferrer">' + short + '</a>';
  return html.replace('<output id="app-version">未标记</output>',
    '<output id="app-version">' + link + ' (' + date.replaceAll('-', '/') + ')</output>');
}
