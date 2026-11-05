import { isProcessAlive } from "./process-alive.mjs";

/** ロックの置き場（リポジトリからの相対）。拒む理由の文言に出す。 */
const LOCK_LABEL = "scripts/mutations/.lock";

/**
 * 既存のロックを見て、実行を拒む理由を返す（拒まないなら null）。`scripts/mutation-check.mjs` から分けた（#542）。
 *
 * **判定を純粋関数にしてある**（I/O は呼び出し側）。ロックの有無で分岐する経路は
 * 実際に 2 つ走らせないと再現できず、そのままではテストが書けないため。
 * 入口（`mutation-check.mjs`）は変異のパッチで書き換えない決まりなので、変異で守りたい判定はこちらに置く。
 *
 * **生死の判定は `lib/process-alive.mjs` の `isProcessAlive` の 1 本。** `kill(pid, 0)` だけだとゾンビを生きていると読む。
 * クラウドのコンテナは PID 1 が孤児を回収しないので、中断された実行がゾンビで残り、ロックが永久に拒む。
 * 判定の決めは `isProcessAlive` のとおり: ESRCH は死んだ。EPERM（別ユーザーの実行）は存在するので、続けて `/proc/<pid>/stat` の状態を読み、
 * ゾンビ（Z）と死亡（X）だけを死んだとする。状態が読めなければ生きている側に数える（別ユーザーの実行を踏み潰さない）。
 * 例外: `hidepid` つきの `/proc` では、kill が EPERM でも他ユーザーの stat は見えず ENOENT になり、自分の名前空間の `/proc` では
 * 「消えた」と読んで死んだ（X）にする。その環境では別ユーザーの生きた実行も死んだと数えうる。
 *
 * 壊れたロック（PID として読めない中身）は**無いものとして扱う**。中身が壊れるのは
 * 書き込みの途中で殺された場合が主で、そのとき書き手はもう死んでいる。拒む側へ
 * 倒すと、誰も走っていないのに永久に実行できなくなる（消し方を知らない人が詰む）。
 * 代わりに呼び出し側が警告を出す。
 */
export function lockRefusalReason(rawLockText, isAlive = isProcessAlive) {
  if (rawLockText === null || rawLockText === undefined) return null;
  const pid = Number.parseInt(String(rawLockText).trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (!isAlive(pid)) return null;
  return (
    `[mutation-check] 同じ作業ツリーで別の実行（PID ${pid}）が走っています。\n` +
    "2 つを同時に走らせると、片方の変異をもう片方の復元が消し、**変異が当たったまま**\n" +
    "残ることがあります。終わるのを待ってから再実行してください。\n\n" +
    `そのプロセスがもう居ないと分かっている場合だけ、${LOCK_LABEL} を消してください。`
  );
}
