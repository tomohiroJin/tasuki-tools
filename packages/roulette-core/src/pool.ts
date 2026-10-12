/**
 * 抽選に入る人（#94 spec R7）。
 *
 * サーバー（回すとき）と web（円盤の下書き・一覧）が**同じ関数**を使う。写しを持つと片方だけ直る。
 */
import type { Entry, Member, RouletteState } from "./types.js";

/**
 * 入る人 = 在室の参加者 − 外した人 ＋ ゲスト − 外したゲスト。
 *
 * 並びは決定的: 在室の参加者（`members` の順）→ ゲスト（足した順）。
 * 全域関数で、外した ID が名簿に居なくても落ちない。
 */
export function poolOf(members: readonly Member[], state: RouletteState): Entry[] {
  const excluded = new Set(state.excluded);
  const fromMembers = members
    .filter((m) => m.present && !excluded.has(m.id))
    .map((m): Entry => ({ id: m.id, name: m.name }));
  const fromGuests = state.guests.filter((g) => !excluded.has(g.id)).map((g): Entry => ({ id: g.id, name: g.name }));
  return [...fromMembers, ...fromGuests];
}
