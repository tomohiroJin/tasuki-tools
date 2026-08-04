/**
 * 自分のドライバー状態と操作（2層モデル・D1）。
 *
 * 「一時離脱／復帰」(driver.skip/resume・順番を保持して一時的に飛ばす) と
 * 「列から外れる／ドライバーに加わる」(rotation の出入り・恒久) を併記し、
 * 「ちょっと抜ける」と「もう運転しない」を明確に分ける。
 * 自分の一時離脱はこのトグルが正本（参加者一覧では自分の行に重複表示しない）。
 */

import React from "react";
import { GhostButton, PrimaryButton } from "../primitives.js";

interface SelfDriverToggleProps {
  inRotation: boolean;
  /** 一時離脱中（driverEligible=false）。順番は保持され、復帰で戻れる。 */
  isSkipping: boolean;
  /** 列から外れられるか（最後の1人は外れられないため false）。 */
  canLeave: boolean;
  participantId: string;
  /** 輪への出入りは参加者IDで指す（D6b。同名でも取り違えない）。 */
  onJoin?: (participantId: string) => void;
  onLeave?: (participantId: string) => void;
  onSkip?: (participantId: string) => void;
  onResume?: (participantId: string) => void;
  /** ルームそのものから抜ける（自己退出・FR-079）。未指定なら導線を出さない。 */
  onLeaveRoom?: (participantId: string) => void;
  /** 退出しても不変条件（編集者以上が1名以上残る）を破らないか。false なら無効化する（FR-080）。 */
  canLeaveRoom?: boolean;
  /** そのルームが一度でもセッションを開始したか。役割の自己変更は開始後のみ許される（D3b）。 */
  started?: boolean;
  /** 自分の役割を自分で変える（role.set・自己対象）。未指定なら導線を出さない。 */
  onSelfRoleChange?: (role: "editor" | "viewer") => void;
  /** 見学に回っても不変条件（編集者以上が1名以上残る）を破らないか。false なら無効化する（FR-080）。 */
  canSpectate?: boolean;
}

export function SelfDriverToggle({
  inRotation,
  isSkipping,
  canLeave,
  participantId,
  onJoin,
  onLeave,
  onSkip,
  onResume,
  onLeaveRoom,
  canLeaveRoom = true,
  started = false,
  onSelfRoleChange,
  canSpectate = true,
}: SelfDriverToggleProps) {
  /**
   * 進行から降りて見学者になる導線（FR-083）。開始後のみ出す（開始前の役割変更は主催者の担当・FR-066）。
   *
   * 「列から外れる」はローテーションの出入りで、ドライバーをやるかどうかの話。
   * こちらは役割そのもので、進行の操作をするかどうかの話。意味が違うので別のボタンにする。
   * この導線が無いと見学者という状態に誰も到達できず、見学者向けの提示（拒否理由・進行に戻る）が
   * 一度も発動しない（実機検証で判明した欠落）。
   */
  const spectateButton =
    started && onSelfRoleChange ? (
      <GhostButton
        onClick={() => onSelfRoleChange("viewer")}
        disabled={!canSpectate}
        className="text-xs px-3 py-1.5"
        title={
          canSpectate
            ? "進行の操作をやめて見学に回ります。いつでも進行に戻れます。"
            : "進行できる人がいなくなるため見学に回れません。他の人が進行に加わってから操作してください。"
        }
      >
        見学に回る
      </GhostButton>
    ) : null;
  /**
   * ルームから抜ける導線。自分の操作なので確認は課さない（FR-079）。
   * 他人向けの「退出させる」（RosterPanel）とは配置を分ける。誤タップで他人を巻き込む
   * 事故と、自分が抜けるだけの操作は取り返しのつき方が違う（FR-078）。
   */
  const leaveRoomButton = onLeaveRoom ? (
    <GhostButton
      onClick={() => onLeaveRoom(participantId)}
      disabled={!canLeaveRoom}
      className="text-xs px-3 py-1.5"
      title={
        canLeaveRoom
          ? "この端末をルームから外します。招待から再参加できます。"
          : "進行できる人がいなくなるため抜けられません。他の人が進行に加わってから操作してください。"
      }
    >
      ルームから抜ける
    </GhostButton>
  ) : null;
  // rotation 外の場合は目立つ見学者バナーを表示（加入を促す）
  if (!inRotation) {
    return (
      <div className="mb-3 rounded-md border border-[var(--signal)] bg-[rgba(255,74,46,0.10)] px-3 py-3">
        {/* ここはローテーション外（役割は編集者のまま）を表す。役割が見学者である状態
            （SpectatorSelfActions）と同じ文言を使うと、進行の操作ができるのかどうかが
            読み分けられない。「ドライバーをやらない」と「進行の操作をしない」は別の状態である。 */}
        <p className="text-sm font-semibold text-[var(--bone)]">あなたはドライバーの輪の外です</p>
        <p className="mt-0.5 text-xs text-[var(--bone-muted)]">
          進行の操作はできます。交代の輪に入ると、ドライバーとして順番が回ってきます。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PrimaryButton onClick={() => onJoin?.(participantId)} className="text-sm px-4 py-2">
            ドライバーに加わる
          </PrimaryButton>
          {spectateButton}
          {/* 見学中でも部屋からは抜けられる。ここに導線が無いと見学者が取り残される。 */}
          {leaveRoomButton}
        </div>
      </div>
    );
  }

  // rotation 内の場合は従来の状態表示＋操作ボタン
  const status = isSkipping ? (
    <span className="font-semibold text-amber-300">離脱中</span>
  ) : (
    <span className="font-semibold text-[var(--signal)]">ドライバー</span>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] px-3 py-2">
      <span className="text-sm">あなた: {status}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {isSkipping && (
          <PrimaryButton onClick={() => onResume?.(participantId)} className="text-xs px-3 py-1.5">
            復帰
          </PrimaryButton>
        )}
        {!isSkipping && (
          <GhostButton onClick={() => onSkip?.(participantId)} className="text-xs px-3 py-1.5">
            一時離脱
          </GhostButton>
        )}
        <GhostButton
          onClick={() => onLeave?.(participantId)}
          disabled={!canLeave}
          title={canLeave ? undefined : "最後のドライバーは外れられません"}
          className="text-xs px-3 py-1.5"
        >
          列から外れる
        </GhostButton>
        {spectateButton}
        {leaveRoomButton}
      </span>
    </div>
  );
}
