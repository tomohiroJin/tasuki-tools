/**
 * 名前の申し出（代理の追加・改名）の状態と判定（#370 で `components/RosterPanel.tsx` から出した。
 * `docs/adr/0015` 決定 1）。React にも I/O にも依存しない。
 *
 * 代理の追加と改名は同じ形を持つ（#291 とそのレビューの指摘 1〜4）。
 * 1. **送る前に手元の名簿で同名を見る。** 理由は押した場所に出す
 * 2. **送ったあとも閉じない。** 名簿にその名前が現れたら閉じる（画面が予測できない拒否が残るため）
 * 3. **拒んだ理由は名簿に追随させる。** 相手が退出したら「まだ駄目」と言わない
 * 4. **打ち直していたら畳まない。** 名簿に現れたときの入力が送った名前のときだけ畳む
 *
 * ⚠ **サーバーより厳しくしない。** 述語は写さずサーバーと同じ `conflictsWithExisting` を呼び、
 * 比べる値もサーバーが境界で掛ける `normalizeDisplayName` を通してから渡す。
 */
import { conflictsWithExisting, normalizeDisplayName } from "@tasuki/room-core";

/** 名前を突き合わせる相手（呼び名の同名判定プールと同じもの）。 */
export type NamePool = readonly { participantId: string; displayName: string }[];

/**
 * 名前を受け付けられなかったこと（#291）。
 *
 * **正規形を持つのが肝である。** 打った文字列は文言に出すために、正規形は
 * 「その理由がまだ生きているか」を毎回いまの名簿へ尋ねるために持つ。
 * 理由の文言そのものを state に置くと、相手が退出しても「まだ駄目」と言い続ける。
 */
export interface Rejection {
  /** 利用者が打った文字列（前後の空白だけ落としたもの）。文言に出す。 */
  readonly typed: string;
  /** サーバーと同じ正規化を掛けた値。名簿との突き合わせに使う。 */
  readonly normalized: string;
  /**
   * 失敗の通し番号。`role="alert"` の `key` に使う。
   *
   * 同じ名前で 2 度押したとき、文言もノードも変わらないと支援技術は**再告知しない**
   * （2 度目以降が無反応に見える＝#291 と同じ症状）。番号を進めて張り替える。
   */
  readonly attempt: number;
}

/** 送った代理の名前（代理は識別子を持たない）。 */
export interface ProxyPending {
  readonly normalized: string;
}

/** 送った改名。着いたかどうかは**識別子で**確かめる。 */
export interface RenamePending {
  readonly participantId: string;
  readonly normalized: string;
}

export interface NameRequestState<P> {
  /** 送って、名簿に現れるのを待っている名前。 */
  readonly pending: P | null;
  readonly rejection: Rejection | null;
}

export const INITIAL_NAME_REQUEST: NameRequestState<never> = { pending: null, rejection: null };

export type NameRequestAction<P> =
  | { readonly type: "rejected"; readonly typed: string; readonly normalized: string }
  | { readonly type: "sent"; readonly pending: P }
  | { readonly type: "arrived" }
  /** 打ち直した。理由だけを下ろす（直した名前の横に古い理由が残ると「まだ駄目なのか」と読む）。 */
  | { readonly type: "retyped" }
  | { readonly type: "reset" };

/** 代理の追加（`P` = {@link ProxyPending}）と改名（`P` = {@link RenamePending}）で同じ遷移を使う。 */
export function nameRequestReducer<P extends { readonly normalized: string }>(
  state: NameRequestState<P>,
  action: NameRequestAction<P>,
): NameRequestState<P> {
  switch (action.type) {
    case "rejected":
      return {
        ...state,
        rejection: { typed: action.typed, normalized: action.normalized, attempt: (state.rejection?.attempt ?? 0) + 1 },
      };
    case "sent":
      return {
        rejection: null,
        // 正規形が空の名前は突き合わせられないので待たない（サーバーが規約で弾く）。
        // 待たない＝閉じる条件が来ないだけで、フォームと入力はそのまま残る。
        pending: action.pending.normalized === "" ? null : action.pending,
      };
    case "arrived":
      return { ...state, pending: null };
    case "retyped":
      return { ...state, rejection: null };
    case "reset":
      return INITIAL_NAME_REQUEST;
  }
}

/**
 * その名前（正規形）の持ち主が名簿に居るか。**述語はサーバーと同じものに任せる。**
 *
 * この 1 つが 3 役を担う ——「送る前に拒む」「拒んだ理由がまだ生きているか」
 * 「送った名前が名簿に現れたか」。3 箇所に別々の比べ方を置くと、片方だけ直る。
 *
 * 正規形が空の名前は**突き合わせない**。`Seat.displayName` は名簿から引けないと
 * `""` へ落ちるので（`timer-snapshot-dto.ts` の `names.get(…) ?? ""`）、
 * 素通りさせると「同じ名前の人がすでに居ます」という嘘の理由を出しうる。
 */
export function someoneHolds(pool: NamePool, normalized: string, excludeId?: string): boolean {
  return normalized !== "" && conflictsWithExisting(pool, normalized, excludeId);
}

/** その人**だけ**を見て、いまその名前を持っているか（改名が着いたかの判定）。 */
export function holdsName(pool: NamePool, participantId: string, normalized: string): boolean {
  return (
    normalized !== "" &&
    conflictsWithExisting(
      pool.filter((p) => p.participantId === participantId),
      normalized,
    )
  );
}

export type NameSubmitPlan =
  | { readonly kind: "empty" }
  | { readonly kind: "reject" | "send"; readonly typed: string; readonly normalized: string };

/**
 * 送る前の判定。前後の空白を落とし、サーバーと同じ正規化を掛けて名簿と突き合わせる。
 *
 * @param excludeId 改名する人。自分自身は比べない（現在名と同じ名前への改名は許す）。サーバーの
 *   `conflictsWithExisting(residents, displayName, target.participantId)` と同じ。
 */
export function planNameSubmit(input: string, pool: NamePool, excludeId?: string): NameSubmitPlan {
  const typed = input.trim();
  if (!typed) return { kind: "empty" };
  const normalized = normalizeDisplayName(typed);
  return { kind: someoneHolds(pool, normalized, excludeId) ? "reject" : "send", typed, normalized };
}

/**
 * **理由は名簿の変化に追随させる**（#291 レビュー指摘3）。持っているのは正規形で、
 * 出すかどうかは毎回いまの名簿に尋ねる。相手が退出したら「まだ駄目」と言わない。
 */
export function activeRejection(rejection: Rejection | null, pool: NamePool, excludeId?: string): Rejection | null {
  return rejection !== null && someoneHolds(pool, rejection.normalized, excludeId) ? rejection : null;
}

/**
 * いま入力欄に載っているのが、送った名前のままか。
 *
 * ⚠ **名簿に現れたら閉じる対策自身が入力を捨てうる。** 送ったあと返事を待つ間に利用者が
 * 別の名前を打ち始めていると、あとから届いた名簿で閉じた拍子にその入力が消える ——
 * #291 が直そうとしているもの（打った文字が黙って消える）と同じ形である。
 */
export function inputStillMatches(input: string, pendingNormalized: string): boolean {
  return normalizeDisplayName(input.trim()) === pendingNormalized;
}
