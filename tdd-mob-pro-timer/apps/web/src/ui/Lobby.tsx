/**
 * ロビー画面（タブ構造: ルーム / お題・設定）
 * T058, T059: FR-011 ＋ デザインシステム適用
 * v2.2 #5/#6: 開始ボタンを上部固定、招待を InvitePanel に委譲
 */

import React from "react";
import { Users, Code, Play, UserPlus, UserMinus, ChevronUp, ChevronDown, X, Crown } from "lucide-react";
import type { Room, Problem } from "@tdd-mob/core";
import { Card, PrimaryButton, GhostButton, SectionHeader } from "./primitives.js";
import { ProblemEditor } from "./components/ProblemEditor.js";
import { ConfigPanel } from "./components/ConfigPanel.js";
import { Tabs } from "./components/Tabs.js";
import { InvitePanel } from "./components/InvitePanel.js";
import { PassphrasePanel } from "./components/PassphrasePanel.js";
import { EmptyHint } from "./components/EmptyHint.js";
import { presenceDotClass } from "./presence.js";
import type { SessionConfig } from "@tdd-mob/core";

interface LobbyProps {
  room: Room;
  participantId: string;
  onStartSession: () => void;
  /** お題まわり（開始前にロビーでお題を決める・US3）。editor+ のみ編集できる。 */
  onEditProblem?: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onRegenerateProblem?: () => void;
  onPasteProblem?: () => void;
  onCopyProblem?: () => void;
  /** セッション設定の変更（言語/難易度/間隔/オプション）。editor+ のみ。config.set を送る。 */
  onConfigSet?: (patch: Partial<SessionConfig>) => void;
  /** 自分をドライバーローテーションに加える（自名で member.add）。2層モデル。 */
  onJoinRotation?: (displayName: string) => void;
  /** 自分をローテーションから外す（自名を渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (displayName: string) => void;
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  onRemoveParticipant?: (participantId: string) => void;
  /** ホストを当該参加者へ移譲する（host 限定・オンライン・自分以外・現ホスト以外のみ表示）。R2-3。 */
  onTransferHost?: (participantId: string) => void;
  /** ドライバー順の入れ替え（④・host）。fromIndex→toIndex（rotation 内の位置）。 */
  onMoveRotation?: (fromIndex: number, toIndex: number) => void;
  /** ルームのパスフレーズ設定/解除（R4-2・host 限定）。空文字で解除。 */
  onSetPassphrase?: (passphrase: string) => void;
}

/** 参加者行のコンパクトなアイコンボタン（行が改行だらけにならないよう小さく揃える）。 */
function RowIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: { icon: typeof UserPlus; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-11 w-11 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-md bg-[var(--panel)] hover:bg-[#252934] disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--hairline)] text-[var(--bone-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

export function Lobby({
  room,
  participantId,
  onStartSession,
  onEditProblem,
  onRegenerateProblem,
  onPasteProblem,
  onCopyProblem,
  onConfigSet,
  onJoinRotation,
  onLeaveRotation,
  onRemoveParticipant,
  onTransferHost,
  onMoveRotation,
  onSetPassphrase,
}: LobbyProps) {
  const myRole = room.participants.find((p) => p.participantId === participantId)?.role;
  const isHost = myRole === "host";
  const isEditor = myRole === "host" || myRole === "editor";

  // 開始ボタン（ルームタブ最上部に配置）
  const startButton = isHost ? (
    <PrimaryButton className="w-full" onClick={onStartSession} disabled={!room.problem}>
      <span className="flex items-center justify-center gap-2"><Play className="w-5 h-5" /> セッションを開始</span>
    </PrimaryButton>
  ) : (
    <p className="text-center text-sm text-white/60">主催者のセッション開始を待っています...</p>
  );

  return (
    <Tabs
      ariaLabel="ロビー"
      items={[
        {
          id: "room",
          label: "ルーム",
          content: (
            <div className="space-y-6">
              {startButton}
              <InvitePanel code={room.code} />
              {/* ルームのパスフレーズ設定/解除（R4-2・host 限定）。招待のすぐ下に置く。 */}
              {isHost && onSetPassphrase && (
                <Card>
                  <PassphrasePanel
                    protectedNow={!!room.passphraseProtected}
                    onSet={onSetPassphrase}
                  />
                </Card>
              )}
              {/* 参加者一覧 */}
              <Card>
                <SectionHeader icon={Users} color="text-[var(--signal)]" title={`参加者 (${room.participants.length}人)`} />
                <ul className="space-y-1.5">
                  {room.participants.map((p) => {
                    const rotationIndex = room.session.rotation.indexOf(p.displayName);
                    const inRotation = rotationIndex >= 0;
                    const isMe = p.participantId === participantId;
                    const rotationLen = room.session.rotation.length;
                    const isLastDriver = inRotation && rotationLen <= 1;
                    return (
                      <li
                        key={p.participantId}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--bone)]"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${presenceDotClass(p.presence)}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate font-medium">{p.displayName}</span>
                        {/* ドライバー（順番つき）/ 見学 の区別（§9.2・④ 順番可視化） */}
                        <span
                          className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold tabular ${
                            inRotation
                              ? "bg-[rgba(255,74,46,0.14)] text-[var(--signal)] border border-[rgba(255,74,46,0.3)]"
                              : "bg-[var(--panel)] text-[var(--bone-subtle)] border border-[var(--hairline)]"
                          }`}
                        >
                          {inRotation ? `ドライバー${rotationIndex + 1}` : "見学"}
                        </span>
                        {p.role === "host" && (
                          <span className="instrument-label shrink-0 rounded-sm bg-[var(--panel)] px-2 py-0.5 border border-[var(--hairline-strong)] text-[var(--bone-muted)]">主催者</span>
                        )}

                        {/* 操作エリア（本人＝加入/離脱、ホスト＝他人の加入/離脱・並び替え・退出） */}
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                          {isMe && (
                            inRotation ? (
                              <GhostButton
                                onClick={() => onLeaveRotation?.(p.displayName)}
                                disabled={isLastDriver}
                                title={isLastDriver ? "最後のドライバーは外れられません" : undefined}
                                className="text-xs px-3 py-1.5 min-h-[44px] sm:min-h-0"
                              >
                                列から外れる
                              </GhostButton>
                            ) : (
                              <PrimaryButton onClick={() => onJoinRotation?.(p.displayName)} className="text-xs px-3 py-1.5 min-h-[44px] sm:min-h-0">
                                ドライバーに加わる
                              </PrimaryButton>
                            )
                          )}
                          {/* ホストは他参加者のドライバー加入/離脱を制御できる（②） */}
                          {!isMe && isHost && (
                            inRotation ? (
                              <RowIconButton
                                icon={UserMinus}
                                label={`${p.displayName} をドライバーから外す`}
                                onClick={() => onLeaveRotation?.(p.displayName)}
                                disabled={isLastDriver}
                              />
                            ) : (
                              <RowIconButton
                                icon={UserPlus}
                                label={`${p.displayName} をドライバーに追加`}
                                onClick={() => onJoinRotation?.(p.displayName)}
                              />
                            )
                          )}
                          {/* ホストはドライバー順を入れ替えられる（④） */}
                          {isHost && inRotation && rotationLen > 1 && onMoveRotation && (
                            <>
                              <RowIconButton
                                icon={ChevronUp}
                                label={`${p.displayName} を前の順番へ`}
                                onClick={() => onMoveRotation(rotationIndex, rotationIndex - 1)}
                                disabled={rotationIndex === 0}
                              />
                              <RowIconButton
                                icon={ChevronDown}
                                label={`${p.displayName} を後の順番へ`}
                                onClick={() => onMoveRotation(rotationIndex, rotationIndex + 1)}
                                disabled={rotationIndex === rotationLen - 1}
                              />
                            </>
                          )}
                          {/* ホストを他のオンライン参加者へ譲る（R2-3）。自分・オフライン・現ホストには出さない。 */}
                          {!isMe && isHost && p.role !== "host" && p.presence !== "offline" && onTransferHost && (
                            <RowIconButton
                              icon={Crown}
                              label={`${p.displayName} にホストを譲る`}
                              onClick={() => onTransferHost(p.participantId)}
                            />
                          )}
                          {/* ホストは他参加者を退出させられる（⑪） */}
                          {!isMe && isHost && onRemoveParticipant && (
                            <RowIconButton
                              icon={X}
                              label={`${p.displayName} を退出させる`}
                              onClick={() => onRemoveParticipant(p.participantId)}
                            />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {/* まだ自分1人のとき、招待を促す控えめなヒント（R5-2）。 */}
                {room.participants.length === 1 && (
                  <div className="mt-3">
                    <EmptyHint>
                      まだあなただけです。上の招待リンクで仲間を呼び、揃ったら「開始」しましょう。
                    </EmptyHint>
                  </div>
                )}
              </Card>
            </div>
          ),
        },
        {
          id: "options",
          label: "お題・設定",
          content: (
            <div className="space-y-6">
              {/* セッション設定（言語/難易度/間隔/詳細設定）。host(editor+) が開始前に決める。 */}
              <Card>
                <ConfigPanel
                  config={room.config}
                  canEdit={isEditor}
                  onChange={(patch) => onConfigSet?.(patch)}
                />
              </Card>

              {/* お題（開始前にここで決める・US3）。確定済みなら editor+ は編集できる。 */}
              <Card>
                <SectionHeader icon={Code} color="text-[var(--signal)]" title="お題" />
                {room.problem ? (
                  <ProblemEditor
                    problem={room.problem}
                    canEdit={isEditor}
                    difficulty={room.config.difficulty}
                    language={room.config.language}
                    onEdit={onEditProblem ?? (() => {})}
                    onRegenerate={onRegenerateProblem ?? (() => {})}
                    onPaste={onPasteProblem ?? (() => {})}
                    onCopy={onCopyProblem ?? (() => {})}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="py-8 text-center text-[var(--bone-subtle)]">
                      <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-[var(--signal)] mb-2" aria-hidden="true" />
                      <p>お題を準備中です…</p>
                    </div>
                    {/* お題は自動で用意される旨を伝える控えめなヒント（R5-2）。
                        開始ボタンはお題が用意できると有効になる（disabled={!room.problem}）ため、
                        「未設定でも開始可」とは書かず実態に合わせる。 */}
                    <EmptyHint>
                      お題は自動で用意されます。手動で決める必要はなく、「お題・設定」でいつでも変更できます。
                    </EmptyHint>
                  </div>
                )}
              </Card>
            </div>
          ),
        },
      ]}
    />
  );
}
