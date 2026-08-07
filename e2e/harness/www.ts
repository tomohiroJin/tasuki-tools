/**
 * `/var/www/*` を各 dist へ向ける。
 *
 * 断片が `root * /var/www/tasuki` を絶対値で宣言しており、Caddy 側に読み替える
 * 手段が無いため、環境側を断片に合わせる。
 *
 * **ubuntu-latest には /var/www が存在しない**ので、まず作る。
 */
import { execFileSync } from 'node:child_process';
import { WEB_ROOTS } from './paths';

export function linkWebRoots(): void {
  execFileSync('sudo', ['mkdir', '-p', '/var/www']);
  for (const { link, dist } of WEB_ROOTS) {
    execFileSync('sudo', ['ln', '-sfn', dist, link]);
  }
}

/**
 * 張った symlink を外す。
 *
 * preflight で「実体ディレクトリなら触らない」を確認済みなので、
 * ここで消すのは symlink だけである。
 */
export function unlinkWebRoots(): void {
  for (const { link } of WEB_ROOTS) {
    execFileSync('sudo', ['rm', '-f', link]);
  }
}
