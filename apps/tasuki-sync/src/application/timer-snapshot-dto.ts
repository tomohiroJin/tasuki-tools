/**
 * 名簿（room-core）＋ timer の状態（timer-core）→ wire の `snapshot.room` を組む（#95 D16）。
 *
 * **ドメインに互いを知らせないための場所である。** ここでしか 2 つの文脈は出会わない。
 * 出力の形は S4a で変えない（既存の Web とそのテストが「変えていない」ことの証拠になる）。
 *
 * ★ **S4a で wire が変わった点の台帳はここ 1 つである**（同じ内容を他所へ書き写さないこと。
 * 片方だけが腐る）。`wire.ts` は**型の**例外だけを自分の射程として言う。
 *
 * 1. **`startedAt` を型と `RoomSchema` から落とした**（`wire.ts` の `startedAt` の注記）。
 *    書き手も読み手も 0 件。非 strict の `v.object` なので古い snapshot のパースは通る
 * 2. **`participants` の並びが挿入順から `[名簿の人…, 代理…]` へ変わった**
 *    （`buildTimerSnapshotRoom` の `participants` を組む行の注記）
 * 3. **`driverEligible` の出し方が変わった**（`buildTimerSnapshotRoom` の `eligible` の注記）。
 *    値を持つ条件が「押した人だけ」から「輪に席がある人」へ変わり、判定の結果は一致する
 *
 * ★ **S4b で wire が変わった点も、この台帳に続けて書く。**
 *
 * 4. **`connId` を型と `RoomSchema` から落とした**（`wire.ts` の `connId` の注記）。
 *    参加者が接続を複数持てるようになり（D14）、「接続 1 本」という形が嘘になった。
 *    製品コードの読み手は 0 件で、サーバー側の唯一の読み手だった配信の宛先解決は
 *    名簿を引く形へ揃えた（`create-sync-server.ts` の `recipientsOf`）
 * 5. **`presence` が導出値になった**（`presenceOf`）。値域から `"idle"` が実質消えた
 *    —— 代入する経路は S4a 時点で 0 件で、導出では表現できない。`RoomSchema` は
 *    3 値を受けたままなので、古い snapshot のパースは通る
 *
 * ★ **S5a で wire が変わった点も、この台帳に続けて書く。**
 *
 * 6. **`participants` が timer の在席者に絞られた**（{@link showsInTimer}）。
 *    選択画面（ハブ）や poker に居る人は載らない（R5 / R6）。**切断した人は載る** ——
 *    「timer から離れた」ことが分かっているのは前者だけだからである。
 *    名簿からは誰も消えず、輪の席も表示名（`config.members`）も残る（R7）。
 *    （**当時の記述である。** その `config.members` は下の 9 で落ちた。R7 が言う
 *    「表示名が残る」は、いまは席の `displayName` が担う。）
 *
 * ★ **#276 で wire が変わった点も、この台帳に続けて書く。**
 *
 * 7. **`session.seats: Seat[]` と `session.nextIndex: number | null` が必須項目として増えた**
 *    （{@link seatSkipReason}／`wire.ts` の `Seat` / `Room.session.seats` / `Room.session.nextIndex`
 *    の注記）。`RoomSchema` の `SessionStateSchema`（`schemas.ts`）は**わざと任意にしていない**
 *    （D7）—— 省略可にすると画面側に「config.members から補う」フォールバック経路が
 *    復活し、「サーバーが送る席」と「画面が推測する席」の 2 経路に戻ってしまう。
 *    （**D7 の判断は生きている。** 補う元だった `config.members` は 9 で消えたので、
 *    いまは席が欠けたら補う手段そのものが無い。任意化はより一層できない。）
 *    そのため**古い snapshot（この 2 項目を持たない）の互換は無い** —— `RoomSchema` の
 *    パースそのものが落ち、画面は「最新ではありません」側へ倒れる（`sync/stale-frame.ts`）。
 *    上の 4・5 項目（`connId` / `startedAt` の削除）とは逆に、**今回は非 strict の
 *    `v.object` であることが助けにならない**（必須項目が丸ごと無いため）。
 *    配布時の窓とその影響は `deploy/timer/NOTES.md` の順序表と設計文書 §7
 *    （`docs/superpowers/specs/2026-09-18-rotation-seat-and-presence-design.md`）を参照する。
 *    **「同期サーバーが先」という記述は誤りだった**（`deploy.sh timer` は画面とサーバーを
 *    同じ 1 コマンドで配るため、順序を選べない。Task 9 で是正）。
 *
 * ★ **#283 で wire が変わった点も、この台帳に続けて書く。**
 *
 * 8. **`problemGeneration`（お題の生成の状態）が任意項目として増えた**
 *    （`wire.ts` の `Room.problemGeneration` の注記）。**#276 の `seats` とは逆に、
 *    わざと任意にしてある** —— `deploy.sh timer` は画面を先に配るので
 *    「新しい画面 × 旧サーバー」の窓は順序では避けられず、必須にするとその窓で
 *    snapshot 全体が契約検査に落ちる。この項目は**欠けていたら「生成していない」**と
 *    読めばよいだけなので、同じ代償を払う理由が無い。
 *    値を作っていたのは代表への委譲（`ProblemDelegator`）ただ 1 つだった。**#91 PR 3 で
 *    委譲ごと同期サーバーから撤去したので、いまは書き手が居ない**（項目は timer-core の型と
 *    ともに撤去する）。
 *
 * ★ **#294 で wire が変わった点も、この台帳に続けて書く。**
 *
 * 9. **`config.members`（ローテーション順の表示名）を型と `RoomSchema` から落とした**
 *    （`wire.ts` 末尾の注記）。本来の読み手だった輪の表示は 7 の `seats` へ移っており、
 *    残っていた読み手 2 つ（`apps/timer-web` の「自分の名前が引けないときの縮退」と
 *    「完成記録に載せる表示名」）は、どちらも**輪の順の表示名を別の用途へ流用**していた。
 *    席は識別子を持つので、**添字でしか対応が付かない**この配列を置いておく理由が無い。
 *    **4・5 と同じく古い snapshot のパースは通る**（非 strict の `v.object`。7 の `seats`
 *    のように必須項目が増えたわけではないので、配布の窓は広がらない）。
 *    ⚠ **ついでに失敗経路が 1 つ消えた** —— 要素が `nonEmptyString` だったため、
 *    名簿から引けない席の空文字が 1 つ載るだけで**画面は snapshot 全体を捨てていた**
 *    （`docs/adr/0005`）。同じ縮退は 7 の `seats[].displayName`（`v.string()`）が受け止める。
 *    `rotationDisplayNames` は**残る** —— 交代の通知（`handlers.ts` の `nextDriverName`）と
 *    サーバー側の完成記録（`apply-room-level-event.ts`）が引き続き使う。
 *
 * 代理（`isPlaceholder`）はここで**合成される**。名簿には居らず、輪の上の席
 * （`RotationEntry` の `kind: "proxy"`）としてだけ存在するためである。
 */
import {
  isPresentIn,
  presenceOf,
  type ConnId,
  type Participant as MembershipParticipant,
  type Room as MembershipRoom,
} from "@tasuki/room-core";
import { TOOL_TIMER } from "./tool-id.js";
import {
  rotationEntryId,
  type Participant,
  type Room,
  type RotationEntry,
  type Seat,
  type SeatSkipReason,
  type TimerState,
} from "@tasuki/timer-core";
// nextEligibleIndex は index.ts の公開契約に載っていない（ADR-0016・#220 —
// 「代わりの入口があるなら index に載せない」）。`aggregate` はサブパス入口として
// 列挙済みのモジュールなので、そこから直接取り込む（RoomSchema が `/schemas` から
// 取り込むのと同じ経路）。
import { nextEligibleIndex } from "@tasuki/timer-core/aggregate";

/** ローテーション上の代理の席だけを取り出す。 */
type ProxyEntry = Extract<RotationEntry, { kind: "proxy" }>;

function proxyEntries(timer: TimerState): ProxyEntry[] {
  return timer.session.rotation.filter((e): e is ProxyEntry => e.kind === "proxy");
}

/** ローテーション順の表示名。member は名簿から、proxy はラベルから解決する。 */
export function rotationDisplayNames(membership: MembershipRoom, timer: TimerState): string[] {
  const names = new Map(membership.participants.map((p) => [p.id, p.displayName]));
  return timer.session.rotation.map((e) =>
    e.kind === "proxy" ? e.label : (names.get(e.participantId) ?? ""),
  );
}

/**
 * このルームで「名乗っている人」の一覧（名簿の参加者＋輪の上の代理）。
 *
 * S4a 以前は `Room.participants` が両方を含んでいたので、表示名の重複判定・在室者の
 * 数え上げ・指名の対象解決はすべてそこを見ていた。名簿から代理を抜いた以上、
 * **その 3 つは名簿だけを見てはならない**（見ると代理が消えて挙動が変わる）。
 *
 * 戻り値のキー名（`participantId`）は `@tasuki/room-core` の `conflictsWithExisting`
 * が要求する形に合わせてある（名簿の `Participant` は `id`）。
 */
export interface Occupant {
  participantId: string;
  displayName: string;
  /** Web 非接続の代理か（wire の `isPlaceholder` と同じ意味） */
  isPlaceholder: boolean;
  /** 在席（代理は常に offline。対面で居るがブラウザは繋いでいない） */
  presence: "online" | "idle" | "offline";
  /**
   * その人が持っている接続（#95 S4b）。**1 本ではない。**
   *
   * 退出の通知はここに載っている**すべての接続へ送る** —— 選択画面とツールを別タブで
   * 開いている人を片方のタブだけ追い出すと、残ったタブは存在しないルームの画面を
   * 映したままになる。代理は接続を持たないので常に空である。
   */
  connIds: ConnId[];
}

export function occupants(membership: MembershipRoom, timer: TimerState): Occupant[] {
  return [
    ...membership.participants.map((p) => ({
      participantId: p.id,
      displayName: p.displayName,
      isPlaceholder: false,
      presence: presenceOf(p),
      connIds: [...p.connections.keys()],
    })),
    ...proxyEntries(timer).map((e) => ({
      participantId: e.id,
      displayName: e.label,
      isPlaceholder: true,
      presence: "offline" as const,
      connIds: [],
    })),
  ];
}

/** 席の識別子から `eligible` を引く（輪に席が無ければ undefined）。 */
function seatEligibleOf(rotation: readonly RotationEntry[], id: string): boolean | undefined {
  const entry = rotation.find((e) => rotationEntryId(e) === id);
  return entry?.eligible;
}

/**
 * timer の一覧に出す人か（#95 S5a・R5 / R6）。
 *
 * **「timer に居ない」ことが分かっている人だけを外す。** 外れるのは
 * **他のツールか選択画面に居る人**であって、接続を 1 本も持たない人ではない ——
 *
 * - **選択画面（ハブ）に居る人**は、自分の意思で timer から離れた。一覧から外す（R6）
 * - **切断した人**（接続 0 本）は「どこに居るか分からない」。S4b までと同じく
 *   `offline` として一覧に残す。消すと**退出したように見える**うえ、回線が揺れた人が
 *   他の参加者の画面から消えたり現れたりする
 *
 * **名簿からは誰も消えない。** 消えるのは timer の画面に出る一覧からだけで、
 * 輪の席・投票・タイマーの状態は保たれる（R7）。
 */
function showsInTimer(participant: MembershipParticipant): boolean {
  return isPresentIn(participant, TOOL_TIMER) || participant.connections.size === 0;
}

/**
 * その席の番が飛ぶ理由（#276 D3 / D4）。`null` なら次の交代で番が回る。
 *
 * **この関数が適格判定の正本である。** {@link computeIneligibleIndices}（交代先の決定）と
 * wire の `seats[].skipReason`（画面が出す理由）の両方がここから出る。2 つに分けると、
 * 「番は飛ぶのに画面は理由を知らない」「画面が言う理由とサーバーの判断が違う」という
 * #276 そのものの欠陥が再発する。
 *
 * **一時離脱は在席より先に見る**（D3）。在席していても本人が降りているなら、
 * 利用者にとっての理由は「一時離脱中」である。
 *
 * **代理は在席の概念を持たない。** Web 非接続が常態で、対面に居る実在の人を表すため、
 * 外すとタイマー自動交代で永久に飛ばされる。
 *
 * ## `presence` では判定しない（D21・旧 `handlers.ts` の `computeIneligibleIndices` から移設）
 *
 * S4a までは `presence === "offline"` を「timer を見ていない」と読んでいた。参加者が
 * 持てる接続が timer のものだけだった間は同義だったが、**1 人が選択画面（ハブ）や
 * poker のタブを持てるようになると崩れる** —— その人は `online` なのにタイマーの前には
 * 居ないので、**タイマーを見ていない人にドライバーが回る**。
 *
 * 判定材料を timer の在席（`isPresentIn(p, TOOL_TIMER)`）へ替えてある。
 * ハブがまだ無い S4b の時点でも、選択画面とツールの 2 タブを開いた利用者が
 * 片方を閉じた瞬間にこの差が出る。
 */
function seatSkipReason(
  entry: RotationEntry,
  watchingTimer: ReadonlySet<string>,
  byId: ReadonlyMap<string, MembershipParticipant>,
): SeatSkipReason | null {
  if (entry.eligible === false) return "stood-down";
  if (entry.kind === "proxy") return null;
  if (watchingTimer.has(entry.participantId)) return null;
  // 名簿に居ない席は「どこに居るか分からない」。接続数を問えないので切断として扱う。
  const participant = byId.get(entry.participantId);
  return participant && participant.connections.size > 0 ? "away" : "disconnected";
}

/** timer に在席している参加者の識別子。 */
function watchingTimerIds(membership: MembershipRoom): Set<string> {
  return new Set(
    membership.participants.filter((p) => isPresentIn(p, TOOL_TIMER)).map((p) => p.id),
  );
}

/**
 * ドライバー対象外の rotation インデックス集合（#95 S4a、判定は S4b で在席へ）。
 *
 * **判定そのものは {@link seatSkipReason} が持つ。** ここはその結果を添字の集合へ
 * 畳むだけである（#276 D5。`handlers.ts` から移設した）。
 *
 * 対象者が 0 名になった場合は呼び出し側（`advanceDriver` / `decide`）が現状維持に
 * 縮退する（R15）。ここでは「全員が対象外」という集合をそのまま返す。
 */
export function computeIneligibleIndices(
  membership: MembershipRoom,
  timer: TimerState,
): Set<number> {
  const watching = watchingTimerIds(membership);
  const byId = new Map(membership.participants.map((p) => [p.id, p]));
  const set = new Set<number>();
  timer.session.rotation.forEach((entry, i) => {
    if (seatSkipReason(entry, watching, byId) !== null) set.add(i);
  });
  return set;
}

export function buildTimerSnapshotRoom(membership: MembershipRoom, timer: TimerState): Room {
  const aiKeys = new Set(timer.aiKeyHolders);
  const members: Participant[] = membership.participants.filter(showsInTimer).map((p) => {
    // 適格は**席の属性**なので、輪に席がある人だけが値を持つ（輪の外の人は省略）。
    // S4a 以前は「一度でも見送り／復帰を押した人」だけが値を持っていたが、`false` と
    // `true` のどちらも同じ条件で出るこの形のほうが素直で、判定（`=== false` /
    // `!== false`）の結果は一致する。
    const eligible = seatEligibleOf(timer.session.rotation, p.id);
    return {
      participantId: p.id,
      displayName: p.displayName,
      presence: presenceOf(p),
      hasAiKey: aiKeys.has(p.id),
      joinedAt: p.joinedAt,
      ...(eligible !== undefined ? { driverEligible: eligible } : {}),
    };
  });
  // 席ごとの skipReason と、次に交代する先（#276 D2 / D5）。判定の出所は
  // seatSkipReason（適格判定の正本）1 つに揃える —— computeIneligibleIndices を
  // ここで呼び直すと同じ判定が 2 度走る（seats が既に理由を持っている）。
  const watching = watchingTimerIds(membership);
  const byId = new Map(membership.participants.map((p) => [p.id, p]));
  // **表示名の解決は {@link rotationDisplayNames} 1 つに揃える**（#294 のレビュー指摘）。
  // かつてここには同じ規則を書いた 2 つ目の実装があった。`config.members` が wire に
  // あった間は「同じ関数の結果が 2 か所へ出る」形だったが、それが落ちた後も
  // **席（画面が読む）とサーバー側の完成記録（`apply-room-level-event.ts`）が
  // 別々の実装から名前を引く**状態が残っていた。片方だけが変わると、同じセッションの
  // 記録と画面が違う名前を言う。
  const displayNames = rotationDisplayNames(membership, timer);
  const seats: Seat[] = timer.session.rotation.map((e, i) => ({
    id: rotationEntryId(e),
    displayName: displayNames[i] ?? "",
    isProxy: e.kind === "proxy",
    skipReason: seatSkipReason(e, watching, byId),
  }));
  const ineligible = new Set(
    seats.flatMap((s, i) => (s.skipReason !== null ? [i] : [])),
  );
  // 全席が不適格ならサーバーは現状維持へ縮退する（R15）。`nextEligibleIndex` は
  // その場合 currentIndex を返すので、「次は現ドライバー」と区別が付かない。
  // 画面に人名を出させないため、ここで null へ倒す（D6）。
  const candidate =
    seats.length === 0 || ineligible.size === seats.length
      ? null
      : nextEligibleIndex(timer.session, timer.session.currentIndex, ineligible);
  // D6 追補（最終レビュー指摘）: 席が 2 つ以上あり、かつ適格なのが現ドライバーの席
  // だけのときも `nextEligibleIndex` は `currentIndex` を返す（全席不適格のときと
  // 同じ「区別が付かない」形）。ここを見落とすと画面は「Current Driver: あや」の
  // 直下に「次: あや」を出す —— 2 人ルームで相方が離席する、最も起きやすい場面である。
  // 「交代しても運転者が変わらないなら人名を出さない」へ倒し、null にする。
  // ⚠ 席が 1 つだけの輪はこの分岐に入れない。`(0+1)%1 = 0` で「自分が次」を返すのは
  // #276 より前からの既存の振る舞いであり、射程外（この分岐を変えると変わってしまう）。
  const nextIndex =
    candidate !== null && seats.length >= 2 && candidate === timer.session.currentIndex
      ? null
      : candidate;
  // 代理の `joinedAt` は名簿の作成時刻で埋める。席は追加時刻を持たないが、
  // この値を読む処理は無い（候補列の並べ替えは `hasAiKey` の人だけを見る）。
  const proxies: Participant[] = proxyEntries(timer).map((e) => ({
    participantId: e.id,
    displayName: e.label,
    presence: "offline" as const,
    hasAiKey: false,
    joinedAt: membership.createdAt,
    isPlaceholder: true,
    driverEligible: e.eligible,
  }));
  return {
    code: timer.code,
    createdAt: timer.createdAt,
    // wire の設定は保管している設定と同じ形である（#294 で `members` が落ちた・台帳 9）。
    // **写しを渡す。** 保管している実体をそのまま配ると、wire の投影と集約が同じ
    // オブジェクトを指す（この関数の外で配信前に触られたら、集約ごと変わる）。
    config: { ...timer.config },
    problem: timer.problem,
    // **明示列挙にする。** スプレッド（`...timer.session`）だと、サーバー側の
    // `SessionState` に足したフィールドが**黙って wire に載る**。ここに
    // **明示列挙されている項目だけ**が載る書き方にしておけば、増えた項目は
    // 既定で載らず、載せたい人はこの行に書き足すことになる
    // （型が赤くなるわけではない —— 既定を「載せない」側へ倒すための書き方である）。
    session: {
      rotation: timer.session.rotation.map(rotationEntryId),
      currentIndex: timer.session.currentIndex,
      isPaused: timer.session.isPaused,
      driverCounts: timer.session.driverCounts,
      totalSwitches: timer.session.totalSwitches,
      seats,
      nextIndex,
    },
    clock: timer.clock,
    phase: timer.phase,
    // ⚠ **並びは S4a で挿入順ではなくなった**（台帳の 2。旧 `ProxyMemberAdded` は
    // `[...room.participants, proxy]` で足していたので `[m1, proxy, m2]` になりえた。
    // 新しくは常に `[名簿の人…, 代理…]`）。**席は `joinedAt` を持たないので挿入順は
    // 復元できない。** 表示への影響は実測で次のとおり ——
    // `RosterPanel` は輪に居る人を rotation 順へ並べ直すので影響を受けない。
    // 配列順のまま出すのは `Lobby` の参加者一覧と `RosterPanel` の見学一覧の 2 つで、
    // どちらも代理が後ろへ寄る（内容は変わらない）。
    participants: [...members, ...proxies],
    sessionRecords: timer.sessionRecords,
    handoffNote: timer.handoffNote,
    onBreak: timer.onBreak,
    ...(timer.problemMode !== undefined ? { problemMode: timer.problemMode } : {}),
    ...(timer.passphraseProtected !== undefined
      ? { passphraseProtected: timer.passphraseProtected }
      : {}),
    ...(timer.aiUnlocked !== undefined ? { aiUnlocked: timer.aiUnlocked } : {}),
    // お題の生成の状態（#283）。**ここで作らない**（推測すると書き手が 2 つになる）。
    // 書き手だった代表への委譲は #91 PR 3 で撤去した。項目は timer-core の型とともに消す。
    ...(timer.problemGeneration !== undefined
      ? { problemGeneration: timer.problemGeneration }
      : {}),
  };
}
