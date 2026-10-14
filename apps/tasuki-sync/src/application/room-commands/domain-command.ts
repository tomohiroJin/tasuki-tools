/**
 * `handleRoomCommand` が `decide` へ渡す前のドメインのコマンド（#366）。
 *
 * wire のコマンドからの翻訳（`build-domain-command.ts`）か、サーバーが順列を作った `member.shuffle`。
 * サーバーが後で埋める値（`driver.assign` の `index` など）は、ここでは仮の値のまま持つ。
 */
import type { buildDomainCommand } from "../build-domain-command.js";

export type DomainCommandDraft =
  | NonNullable<ReturnType<typeof buildDomainCommand>>
  | { command: "member.shuffle"; order: number[] };
