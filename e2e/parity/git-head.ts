/**
 * 作業ツリーの世代（#321）。期待値の要約と除去検査の結果に書き、束ねるときに揃いを断定する
 * （`out/` を消さずに流す・`-g` で一部だけ流し直す、で世代の違う結果が混ざるのを止める）。
 */
import { execFileSync } from 'node:child_process';

const git = (cwd: string, args: string[]): string =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** `<HEAD の SHA>`。作業ツリーに変更があれば `<SHA>-dirty`。 */
export function repoGeneration(cwd = process.cwd()): string {
  const head = git(cwd, ['rev-parse', 'HEAD']);
  return git(cwd, ['status', '--porcelain']) === '' ? head : `${head}-dirty`;
}
