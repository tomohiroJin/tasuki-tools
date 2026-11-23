/**
 * ドメインのコマンドのうち、wire から受け取らずサーバーが埋める値（#366）。以前は `handleRoomCommand` の中にあった。
 *
 * 値はそのコマンドのときだけ引く（関数で受ける）。代理の ID の生成は、生成器の連番を進めるので、
 * 代理の追加でないときに呼んではならない。
 */
import type { DomainCommandDraft } from "./domain-command.js";

export interface ServerValueSources {
  /** 完了した時点のお題のタイトル（保管から引く。お題が無ければ null） */
  topicTitle: () => string | null;
  /** 代理の参加者 ID を新しく作る */
  newParticipantId: () => string;
  /** 交代先にしない席（一時離脱・オフライン） */
  ineligible: () => ReadonlySet<number>;
  /** ランダム交代（#660）の引く順を作り直す順列。輪の順のモードなら undefined（乱数を引かない） */
  randomOrder: () => readonly number[] | undefined;
  /** ランダム交代を入れるときの最初の引く順（まだ袋が無いので、モードに依らず引く） */
  firstRandomOrder: () => readonly number[];
}

export function fillServerValues(draft: DomainCommandDraft, sources: ServerValueSources): DomainCommandDraft {
  switch (draft.command) {
    case "session.complete":
      // 完成記録に写すお題のタイトル（#91・spec T9）。**完了した時点**の保管から引く。
      // wire では受け取らない —— 利用者が好きなタイトルを記録へ差し込めてしまう。
      return { ...draft, topicTitle: sources.topicTitle() };
    case "participant.addProxy":
      // 代理参加者の participantId は client 供給（信頼境界外）。既存参加者との衝突で
      // participantId 突合（skip/rename 等）が誤動作するのを防ぐため、サーバーで一意に再生成する。
      return { ...draft, participantId: sources.newParticipantId() };
    case "session.act":
      // 手動 SWITCH は自動交代と同じく一時離脱/オフライン(非placeholder)を飛ばす（B-2統合）。
      // 交代先の決定は decide 自身（nextDriverIndex 経由）に一本化されたため、ここでは
      // ineligible を decide への入力として注入するだけで、決定結果を後から差し替えない。
      // ランダム交代（#660）は、交代と開始のたびに引く順を作り直す。順列を作るのはサーバーで、
      // ドメインは受け取った順列から次の人を決める（`member.shuffle` と同じ形）。
      if (draft.action === "SWITCH") return { ...draft, ineligible: sources.ineligible(), randomOrder: sources.randomOrder() };
      return draft.action === "START" ? { ...draft, randomOrder: sources.randomOrder() } : draft;
    case "session.reset":
      // 2 回目以降のセッションは、画面がリセットで始める。開始と同じく引く順を作り直す（#660）。
      return { ...draft, randomOrder: sources.randomOrder() };
    case "config.set":
      // ランダム交代を入れる設定には、最初の引く順を付ける。既にランダム交代なら decide は使わない。
      return draft.config.rotationMode === "random" ? { ...draft, randomOrder: sources.firstRandomOrder() } : draft;
    case "member.remove":
      // 運転中の人が外れたときの次の担当も、交代と同じ資格の規則で選ぶ（#376）。
      // 以前は位置で次の席になり、一時離脱・不在の人に運転が回った。
      return { ...draft, ineligible: sources.ineligible() };
    default:
      return draft;
  }
}
