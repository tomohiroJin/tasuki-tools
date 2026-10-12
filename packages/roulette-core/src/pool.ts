/**
 * 抽選に入る人（#94 spec R7）。
 *
 * サーバー（回すとき）と web（円盤の下書き・一覧）が**同じ関数**を使う。写しを持つと片方だけ直る。
 */
import type { Entry, Member, NameConflict, RouletteState } from "./types.js";

/**
 * 入る人 = 在室の参加者 − 外した人 ＋ ゲスト − 外したゲスト − **在室者と同じ名前のゲスト**。
 *
 * 並びは決定的: 在室の参加者（`members` の順）→ ゲスト（足した順）。
 * 全域関数で、外した ID が名簿に居なくても落ちない。
 *
 * **在室者と同じ名前のゲストは入れない（在室者が勝つ・spec R13）。** ゲストを足した後で同じ名前の人が
 * 参加・改名すると、同じ人が円盤に 2 席になる。参加や改名を拒むと他のツールへ波及するので、ここで外す。
 * 状態からは消さない（在室者が抜ければまた入る）。比べるのは**外したかどうかを問わない在室者**
 * —— 外した人がゲストの席で戻ってこないようにする。同じ名前かは渡された `conflicts` だけで決める。
 *
 * web は「ゲストのうち、外しておらず、ここに居ない人」を「同じ名前の人がいるため外れている」として出せる。
 */
export function poolOf(members: readonly Member[], state: RouletteState, conflicts: NameConflict): Entry[] {
  const excluded = new Set(state.excluded);
  const present = members.filter((m) => m.present);
  const presentNames = present.map((m) => ({ participantId: m.id, displayName: m.name }));
  const fromMembers = present.filter((m) => !excluded.has(m.id)).map((m): Entry => ({ id: m.id, name: m.name }));
  const fromGuests = state.guests
    .filter((g) => !excluded.has(g.id) && !conflicts(presentNames, g.name))
    .map((g): Entry => ({ id: g.id, name: g.name }));
  return [...fromMembers, ...fromGuests];
}
