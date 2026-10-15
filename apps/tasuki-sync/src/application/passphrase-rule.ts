/**
 * timer の入口で、合言葉の長さの規約を当てる（#377）。
 *
 * 規約（上限）は `@tasuki/room-core` の `MAX_PASSPHRASE` に 1 つだけ住む。玄関の
 * `room.join` は room-core の wire スキーマがそれを当てるが、timer の wire スキーマ
 * （`timer-core`）は `@tasuki/*` に依存しない（`docs/adr/0017` 決定 4）ので、ここ
 * （合成ルートのアプリケーション層）で当てる。表示名の規約（`normalize-command-names.ts`）と
 * 同じ置き方である。
 *
 * 呼ぶのは timer の受け口（`timer-command-receiver.ts`）だけで、失敗は表示名と同じく
 * `INVALID_COMMAND` へ合流させる。かつて timer の wire スキーマが落としていたときと、
 * 利用者が受け取るフレーム（コード・文言）は変わらない。
 */

import type { Command } from "@tasuki/timer-core";
import { isPassphraseWithinLimit } from "@tasuki/room-core";

/**
 * コマンドが運ぶ合言葉が上限に収まるか。合言葉を運ばないコマンドは `true`。
 *
 * 合言葉を運ぶのは `room.join`（任意）と `room.passphrase.set`（必須）の 2 つである。
 * wire スキーマ側に `passphrase` を持つ枝を足したら、ここへも足すこと。
 */
export function passphraseWithinLimit(cmd: Command): boolean {
  switch (cmd.command) {
    case "room.join":
      return cmd.passphrase === undefined || isPassphraseWithinLimit(cmd.passphrase);
    case "room.passphrase.set":
      return isPassphraseWithinLimit(cmd.passphrase);
    default:
      return true;
  }
}
