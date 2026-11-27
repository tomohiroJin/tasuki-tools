/**
 * うちわけの型（#476・設計 §4.2）。
 *
 * 区切りの位置は**時刻軸**（そのルームの状態を最初に置いた時点を 0 とする ms の整数）で持つ。
 * 時刻軸は単調時計で測る。単調時計の値そのものは state の中だけで使い、wire には載せない
 * （送る時点の時刻軸の位置 `nowMs` を載せる）。
 * **誰が操作したかは、どの型にも持たない**（設計 §6）。
 */

/** 区切りの種類。work = 作業・break = 休憩（合計と割合から外す） */
export type SegmentKind = "work" | "break";

export interface Segment {
  /** "g-1", "g-2", …（作った順の通し番号。取り消しても番号は戻さない） */
  readonly id: string;
  readonly kind: SegmentKind;
  /** 正規化済みの作業名。"" は名前なし。休憩はいつも "" */
  readonly label: string;
  /** 始まりの位置（時刻軸） */
  readonly startMs: number;
  /** 終わりの位置。null = 計測中（あっても最後の 1 つだけ） */
  readonly endMs: number | null;
  /** 全員の切断で閉じた印 */
  readonly autoClosed: boolean;
}

/** 取り消せる操作の種類 */
export type UndoKind = "start" | "stop" | "clear" | "away";

/** 直前の 1 操作ぶんの写し。定番は含めない（取り消しても定番は戻らない） */
export interface UndoSlot {
  /** その操作に振った番号。`track.undo` はこれと照らす */
  readonly rev: number;
  readonly kind: UndoKind;
  /** 単調時計。これ以降は取り消せない */
  readonly expiresAt: number;
  readonly segments: readonly Segment[];
  readonly resumeOffer: boolean;
}

export interface TrackState {
  /** 単調時計。時刻軸の 0 */
  readonly epochMono: number;
  /** 同じ時点の壁時計（表示のためだけに使う） */
  readonly epochWallMs: number;
  /** 開始の昇順・重ならない */
  readonly segments: readonly Segment[];
  /** 次に振る区切りの番号 */
  readonly nextSeq: number;
  /** 定番の作業名 */
  readonly pinned: readonly string[];
  /** 状態が変わるたびに +1（取り消しも +1。期限切れでは進めない） */
  readonly rev: number;
  readonly undo: UndoSlot | null;
  /** 全員の切断で閉じた後、再開を尋ねている */
  readonly resumeOffer: boolean;
}

export type SegmentView = Segment;

/** 画面へ送る写し。全員に同じものを配る */
export interface TrackView {
  readonly epochWallMs: number;
  /** 送る時点の時刻軸の位置 */
  readonly nowMs: number;
  readonly segments: readonly SegmentView[];
  readonly pinned: readonly string[];
  readonly rev: number;
  readonly undo: { readonly rev: number; readonly kind: UndoKind; readonly remainingMs: number } | null;
  readonly resumeOffer: boolean;
}
