/**
 * 合言葉の長さの上限（#377 で timer-core から移設）。
 *
 * 合言葉はルームへの入室を守るもので、どのツールの入口から入っても同じルームの同じ合言葉と
 * 比べる。したがって**規約はメンバーシップ文脈に住む**（表示名の `MAX_DISPLAY_NAME` と同じ扱い）。
 * 合言葉は `docs/adr/0011` のデータ分類で資格情報にあたり、上限は比べる処理へ大きな文字列が
 * 流れ込むのを防ぐ（巨大入力 DoS 対策・R4-2）。
 *
 * **この値がサービス全体の唯一の上限である。** かつては timer の wire スキーマだけが 128 を
 * 掛け、玄関（とそのスキーマを通る topic・roulette）の `room.join` は上限なしだった（#377）。
 * 適用する場所は 2 つで、どちらもこの値を見る:
 *
 * - 玄関の wire（`./wire.ts` の `HubCommandSchema`）
 * - timer の入口（`apps/tasuki-sync/src/application/passphrase-rule.ts`。`timer-core` は
 *   `@tasuki/*` に依存しないので、表示名と同じく合成ルートで当てる。`docs/adr/0017` 決定 4）
 *
 * 空文字（解除）を許すため下限は置かない。
 */
export const MAX_PASSPHRASE = 128;

/** 合言葉が上限に収まるか。 */
export function isPassphraseWithinLimit(passphrase: string): boolean {
  return passphrase.length <= MAX_PASSPHRASE;
}
