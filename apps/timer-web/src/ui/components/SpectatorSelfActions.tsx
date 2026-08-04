/**
 * 見学者が自分の状況を自分で解消するための導線（Issue #22・FR-069/073b/079/080）。
 *
 * 見学者には `SelfDriverToggle`（編集者以上）が出ないため、この盤が無いと
 * 「進行に戻る」も「部屋を抜ける」も画面上のどこにも存在しない。
 * サーバーは開始後の自己昇格（D3b）と自己退出（FR-079）をどちらも許可しているので、
 * 導線が無いことは UI 側だけの詰みになる。本 Issue が消そうとしている状態そのもの。
 *
 * あわせて「なぜ操作が出ていないか」を提示する（FR-069）。ボタンを黙って隠すだけでは、
 * 進行に加われば自分で解消できることに気づけない。
 */

import React from "react";
import { GhostButton, PrimaryButton } from "../primitives.js";
import { permissionHint } from "../permission-hints.js";
import { isAllowed, type Role } from "@tasuki/timer-core";

interface SpectatorSelfActionsProps {
  participantId: string;
  /** 自分の役割。見学者以外に描画しないが、ヒントの算出に使う。 */
  role: Role;
  /** 一度でもセッションを開始したか（Room.startedAt !== null）。 */
  started: boolean;
  /** 自分を編集者へ戻す（role.set・自己対象）。未指定なら導線を出さない。 */
  onSelfRoleChange?: (role: "editor" | "viewer") => void;
  /** ルームから抜ける（participant.remove・自己対象）。未指定なら導線を出さない。 */
  onLeaveRoom?: (participantId: string) => void;
}

export function SpectatorSelfActions({
  participantId,
  role,
  started,
  onSelfRoleChange,
  onLeaveRoom,
}: SpectatorSelfActionsProps) {
  // 「なぜ進行の操作が出ていないか」。実行できるなら null が返り、案内も出さない。
  const hint = permissionHint({
    command: "session.abort",
    role,
    started,
    isSelfTarget: false,
  });

  // 自己昇格の可否はサーバーと同じ関数に問う（D1）。ここで `started` を直接見ると
  // 規則表（D3b: role.set の自己対象は開始後のみ）の写しが2箇所になり、片方だけ
  // 古くなったときに「押せるのに UNAUTHORIZED」が発生する。それは FR-080 違反。
  const canRejoin =
    onSelfRoleChange !== undefined &&
    isAllowed({ command: "role.set", role, started, isSelfTarget: true });

  return (
    <div className="mb-3 rounded-md border border-[var(--signal)] bg-[rgba(255,74,46,0.10)] px-3 py-3">
      {/* こちらは役割が見学者である状態。ローテーション外（SelfDriverToggle）とは別物で、
          進行の操作そのものができない。文言で読み分けられるようにする。 */}
      <p className="text-sm font-semibold text-[var(--bone)]">あなたは見学者です</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--bone-muted)]">{hint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {canRejoin && (
          <PrimaryButton
            onClick={() => onSelfRoleChange!("editor")}
            className="text-sm px-4 py-2"
          >
            進行に加わる
          </PrimaryButton>
        )}
        {onLeaveRoom && (
          <GhostButton
            onClick={() => onLeaveRoom(participantId)}
            className="text-xs px-3 py-1.5"
            title="この端末をルームから外します。招待から再参加できます。"
          >
            ルームから抜ける
          </GhostButton>
        )}
      </div>
    </div>
  );
}
