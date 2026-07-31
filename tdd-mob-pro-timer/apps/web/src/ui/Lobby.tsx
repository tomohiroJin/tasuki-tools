/**
 * ロビー画面（タブ構造: ルーム / お題）
 * T058, T059: FR-011 ＋ デザインシステム適用
 * v2.2 #5/#6: 開始ボタンを上部固定、招待を InvitePanel に委譲
 */

import React, { useState } from "react";
import { Users, Code, Play, UserPlus, UserMinus, ChevronUp, ChevronDown, X, Crown, Shuffle, Bell, Eye, EyeOff } from "lucide-react";
import type { Room, Problem } from "@tdd-mob/core";
import { Card, PrimaryButton, GhostButton, SectionHeader } from "./primitives.js";
import { ProblemEditor } from "./components/ProblemEditor.js";
import { SessionConfigPanel } from "./components/SessionConfigPanel.js";
import { ProblemConfigPanel } from "./components/ProblemConfigPanel.js";
import { Tabs } from "./components/Tabs.js";
import { InvitePanel } from "./components/InvitePanel.js";
import { PassphrasePanel } from "./components/PassphrasePanel.js";
import { AiUnlockPanel } from "./components/AiUnlockPanel.js";
import { EmptyHint } from "./components/EmptyHint.js";
import { ProblemModeToggle } from "./components/ProblemModeToggle.js";
import { NotifySettingsPanel } from "./components/NotifySettingsPanel.js";
import { participantLabel, canTransferHostTo, canRemoveParticipant, canReorderRotation } from "./participant-label.js";
// 自己退出の不変条件（編集者以上が1名以上残る）は Session.tsx の SelfDriverToggle と
// 同じ関数（@tdd-mob/core）に問う。ローカルの canRemoveParticipant（participant-label.ts）は
// 「自己退出は別経路」と明記された「他人を退出させてよいか」の判定であり、シグネチャも違うため
// 別名 import して衝突を避ける（plan.md 参照）。
import { canRemoveParticipant as canLeaveRoomInvariant } from "@tdd-mob/core";
import { PresenceDot } from "./components/PresenceDot.js";
import { RemovalConfirmDialog } from "./components/RemovalConfirmDialog.js";
import { useNotifyPreferences } from "./use-notify-preferences.js";
import { saveNotifyPreferences } from "../prefs/local-prefs.js";
import { requestPermissionIfEnabling } from "../platform/notify.js";
import { playChime } from "../platform/sound.js";
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
  /** AI/定型のお題を生成中。ProblemEditor のスピナー＋減光に使う。 */
  generatingProblem?: boolean;
  /** セッション設定の変更（言語/難易度/間隔/オプション）。editor+ のみ。config.set を送る。 */
  onConfigSet?: (patch: Partial<SessionConfig>) => void;
  /** 自分をドライバーローテーションに加える（自分のIDで member.add）。2層モデル。 */
  onJoinRotation?: (participantId: string) => void;
  /** 自分をローテーションから外す（自名を渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (participantId: string) => void;
  /** ホストが参加者を退出させる（⑪・host 限定）。 */
  onRemoveParticipant?: (participantId: string) => void;
  /** ホストが他の参加者の役割を切り替える（host 限定・開始前・FR-083）。
   *  これが無いと見学者という状態に誰も到達できず、見学者向けの提示が一度も発動しない。 */
  onRoleSet?: (participantId: string, role: "editor" | "viewer") => void;
  /** ホストを当該参加者へ移譲する（host 限定・オンライン・自分以外・現ホスト以外のみ表示）。R2-3。 */
  onTransferHost?: (participantId: string) => void;
  /** ドライバー順の入れ替え（④・host）。fromIndex→toIndex（rotation 内の位置）。 */
  onMoveRotation?: (fromIndex: number, toIndex: number) => void;
  /** ドライバー順をランダムに並べ替える（v2.3 #1・host）。member.shuffle を送る。 */
  onShuffle?: () => void;
  /** ルームのパスフレーズ設定/解除（R4-2・host 限定）。空文字で解除。 */
  onSetPassphrase?: (passphrase: string) => void;
  /** AI お題生成の合言葉で解錠を試みる（host 限定）。 */
  onAiUnlock?: (key: string) => void;
  /** AI ⇔ 定型モードの切替（problem.mode.set）（host 限定）。 */
  onProblemModeSet?: (mode: "ai" | "fallback") => void;
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
  generatingProblem = false,
  onPasteProblem,
  onCopyProblem,
  onConfigSet,
  onJoinRotation,
  onLeaveRotation,
  onRemoveParticipant,
  onRoleSet,
  onTransferHost,
  onMoveRotation,
  onShuffle,
  onSetPassphrase,
  onAiUnlock,
  onProblemModeSet,
}: LobbyProps) {
  const myRole = room.participants.find((p) => p.participantId === participantId)?.role;
  const isHost = myRole === "host";
  const isEditor = myRole === "host" || myRole === "editor";

  // 退出の確認対象（FR-075）。取り返しがつかない操作なので直接は実行しない。
  // 同名が並ぶ場面では「1クリックで即退出」が誤操作に直結する（実機検証で判明）。
  // Session 画面の RosterPanel と同じ確認体験に揃える。
  //
  // 参加者オブジェクトではなく**識別子だけ**を持ち、表示は毎回最新の participants から引く。
  // オブジェクトを capture したままだと、確認中に対象が改名しても旧名を出し続け、
  // 対象が退出しても居ないままのダイアログが残る。
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const pendingRemoval = pendingRemovalId
    ? room.participants.find((p) => p.participantId === pendingRemovalId) ?? null
    : null;

  // 通知設定（ロビーのカードで直接編集できるよう、ライブ購読）。
  const notifyPrefs = useNotifyPreferences();

  // お題機能の有効/無効（デフォルト true・後方互換）
  const problemEnabled = room.config.problemEnabled !== false;

  // 開始ボタン（ルームタブ最上部に配置）
  const startButton = isHost ? (
    <PrimaryButton className="w-full" onClick={onStartSession} disabled={problemEnabled && !room.problem}>
      <span className="flex items-center justify-center gap-2"><Play className="w-5 h-5" aria-hidden="true" /> セッションを開始</span>
    </PrimaryButton>
  ) : (
    <p className="text-center text-sm text-white/60">主催者のセッション開始を待っています...</p>
  );

  return (
    <>
      {/* 退出の確認。対象者の名前と、招待から再参加できることを明示する（FR-075）。
          ロビーは共有ルームなので他の参加者の画面にも反映される旨を添える（FR-076）。 */}
      {pendingRemoval && onRemoveParticipant && (
        <RemovalConfirmDialog
          pendingRemoval={pendingRemoval}
          participants={room.participants}
          isShared={true}
          onConfirm={(id) => {
            onRemoveParticipant(id);
            setPendingRemovalId(null);
          }}
          onCancel={() => setPendingRemovalId(null)}
        />
      )}
    <Tabs
      ariaLabel="ロビー"
      items={[
        {
          id: "room",
          label: "ルーム",
          content: (
            <div className="space-y-6">
              {startButton}
              {/* セッション設定（交代間隔・詳細設定）。canEdit=false の観覧者には読み取り表示される
                  （旧 ConfigPanel と同じく isHost ではゲートしない）。 */}
              <Card>
                <SessionConfigPanel
                  config={room.config}
                  canEdit={isEditor}
                  onChange={(patch) => onConfigSet?.(patch)}
                />
              </Card>
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
              {/* 通知設定カード（host 限定）。セッション開始前に音通知を整えておける。 */}
              {isHost && (
                <Card>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--bone)]">
                    <Bell className="w-4 h-4 text-[var(--signal)]" aria-hidden="true" /> 交代通知
                  </div>
                  <NotifySettingsPanel
                    prefs={notifyPrefs}
                    onChange={(patch) => {
                      const next = { ...notifyPrefs, ...patch };
                      saveNotifyPreferences(next);
                      void requestPermissionIfEnabling(patch, next);
                    }}
                    onPreview={() => playChime(notifyPrefs.soundId, notifyPrefs.volume)}
                  />
                </Card>
              )}
              {/* 参加者一覧 */}
              <Card>
                <SectionHeader
                  icon={Users}
                  color="text-[var(--signal)]"
                  title={`参加者 (${room.participants.length}人)`}
                  right={
                    /* ドライバー順をランダムに（v2.3 #1・host）。2人以上で意味を持つ。 */
                    isHost && onShuffle && room.session.rotation.length > 1 ? (
                      <GhostButton onClick={onShuffle} aria-label="ドライバー順をランダムに並べ替える" className="text-sm">
                        <span className="flex items-center gap-1.5"><Shuffle className="w-4 h-4" aria-hidden="true" /> ランダム</span>
                      </GhostButton>
                    ) : undefined
                  }
                />
                <ul className="space-y-1.5">
                  {room.participants.map((p) => {
                    // rotation は参加者IDの配列（D6b）
                    const rotationIndex = room.session.rotation.indexOf(p.participantId);
                    const inRotation = rotationIndex >= 0;
                    const isMe = p.participantId === participantId;
                    const rotationLen = room.session.rotation.length;
                    const isLastDriver = inRotation && rotationLen <= 1;
                    // 同名が並ぶときだけ識別子を添える（FR-084・規則は participant-label.ts に1つだけ）。
                    // 二重参加の幽霊は本人と同名なので、名前だけでは操作の対象を選べない。
                    // 表示にも使う: 同名の行はバッジもアイコンも同じで、目で見ても区別できないため。
                    const label = participantLabel(p.displayName, p.participantId, room.participants);
                    return (
                      <li
                        key={p.participantId}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md bg-[var(--panel-2)] border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--bone)]"
                      >
                        <PresenceDot presence={p.presence} />
                        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
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

                        {/* 操作エリア（本人＝加入/離脱・退出、ホスト＝他人の加入/離脱・並び替え・退出） */}
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                          {isMe && (
                            inRotation ? (
                              <GhostButton
                                onClick={() => onLeaveRotation?.(p.participantId)}
                                disabled={isLastDriver}
                                title={isLastDriver ? "最後のドライバーは外れられません" : undefined}
                                className="text-xs px-3 py-1.5"
                              >
                                列から外れる
                              </GhostButton>
                            ) : (
                              <PrimaryButton onClick={() => onJoinRotation?.(p.participantId)} className="text-xs px-3 py-1.5 min-h-[44px] sm:min-h-0">
                                ドライバーに加わる
                              </PrimaryButton>
                            )
                          )}
                          {/* ルームから抜ける（自己退出・Issue #37）。自分の操作なので確認は課さない（FR-079）。
                              不変条件（編集者以上が1名以上残る）はサーバーと同じ関数に問う（FR-080 相当）。
                              押せるボタンを出しておいて拒否するのは避ける。 */}
                          {isMe && onRemoveParticipant && (
                            <GhostButton
                              onClick={() => onRemoveParticipant(p.participantId)}
                              disabled={!canLeaveRoomInvariant(room.participants, p.participantId)}
                              title={
                                canLeaveRoomInvariant(room.participants, p.participantId)
                                  ? "この端末をルームから外します。招待から再参加できます。"
                                  : "進行できる人がいなくなるため抜けられません。他の人が進行に加わってから操作してください。"
                              }
                              className="text-xs px-3 py-1.5"
                            >
                              ルームから抜ける
                            </GhostButton>
                          )}
                          {/* ホストは他参加者の役割を切り替えられる（FR-083）。
                              ローテーションの出入り（下）はドライバーをやるかどうか、
                              こちらは進行の操作をするかどうかで、意味が違うので別の操作にする。
                              自分の行には出さない（ホストの自己降格は CANNOT_CHANGE_HOST_ROLE で拒否される）。 */}
                          {!isMe && isHost && onRoleSet && (
                            p.role === "viewer" ? (
                              <RowIconButton
                                icon={Eye}
                                label={`${label} を進行に戻す`}
                                onClick={() => onRoleSet(p.participantId, "editor")}
                              />
                            ) : (
                              <RowIconButton
                                icon={EyeOff}
                                label={`${label} を見学者にする`}
                                onClick={() => onRoleSet(p.participantId, "viewer")}
                              />
                            )
                          )}
                          {/* ホストは他参加者のドライバー加入/離脱を制御できる（②） */}
                          {!isMe && isHost && (
                            inRotation ? (
                              <RowIconButton
                                icon={UserMinus}
                                label={`${label} をドライバーから外す`}
                                onClick={() => onLeaveRotation?.(p.participantId)}
                                disabled={isLastDriver}
                              />
                            ) : (
                              <RowIconButton
                                icon={UserPlus}
                                label={`${label} をドライバーに追加`}
                                onClick={() => onJoinRotation?.(p.participantId)}
                              />
                            )
                          )}
                          {/* ホストはドライバー順を入れ替えられる（④） */}
                          {canReorderRotation({ canManage: isHost, inRotation, rotationLength: rotationLen }) && onMoveRotation && (
                            <>
                              <RowIconButton
                                icon={ChevronUp}
                                label={`${label} を前の順番へ`}
                                onClick={() => onMoveRotation(rotationIndex, rotationIndex - 1)}
                                disabled={rotationIndex === 0}
                              />
                              <RowIconButton
                                icon={ChevronDown}
                                label={`${label} を後の順番へ`}
                                onClick={() => onMoveRotation(rotationIndex, rotationIndex + 1)}
                                disabled={rotationIndex === rotationLen - 1}
                              />
                            </>
                          )}
                          {/* ホストを他のオンライン参加者へ譲る（R2-3）。自分・オフライン・現ホストには出さない。 */}
                          {canTransferHostTo(p, { isSelf: isMe, canManage: isHost }) && onTransferHost && (
                            <RowIconButton
                              icon={Crown}
                              label={`${label} にホストを譲る`}
                              onClick={() => onTransferHost(p.participantId)}
                            />
                          )}
                          {/* ホストは他参加者を退出させられる（⑪） */}
                          {canRemoveParticipant({ isSelf: isMe, canManage: isHost }) && onRemoveParticipant && (
                            <RowIconButton
                              icon={X}
                              label={`${label} を退出させる`}
                              onClick={() => setPendingRemovalId(p.participantId)}
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
          label: "お題",
          content: (
            <div className="space-y-6">
              {/* お題あり/なしトグル（お題タブ先頭・host 限定）。 */}
              {isHost && (
                <Card>
                  <ProblemModeToggle
                    enabled={problemEnabled}
                    onChange={(v) => onConfigSet?.({ problemEnabled: v })}
                  />
                </Card>
              )}
              {/* お題の設定（言語/難易度/言語プール）。AI お題生成の解錠を末尾に控えめに同居。 */}
              <Card>
                <ProblemConfigPanel
                  config={room.config}
                  canEdit={isEditor}
                  problemEnabled={problemEnabled}
                  onChange={(patch) => onConfigSet?.(patch)}
                />
                {/* AI お題生成の解錠（host 限定・合言葉方式）。解錠前はテキストリンクのみ。 */}
                {isHost && onAiUnlock && onProblemModeSet && (
                  <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
                    <AiUnlockPanel
                      unlocked={!!room.aiUnlocked}
                      aiMode={room.problemMode === "ai"}
                      onUnlock={onAiUnlock}
                      onModeSet={onProblemModeSet}
                    />
                  </div>
                )}
              </Card>

              {/* お題（開始前にここで決める・US3）。確定済みなら editor+ は編集できる。 */}
              {problemEnabled && (
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
                      generating={generatingProblem}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="py-8 text-center text-[var(--bone-subtle)]">
                        <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-[var(--signal)] mb-2" aria-hidden="true" />
                        <p>
                          {room.aiUnlocked && room.problemMode === "ai"
                            ? "AI がお題を作成中です…（最大 1 分）"
                            : "お題を準備中です…"}
                        </p>
                      </div>
                      {/* 参照先タブ名を「お題」に更新。 */}
                      <EmptyHint>
                        お題は自動で用意されます。手動で決める必要はなく、「お題」でいつでも変更できます。
                      </EmptyHint>
                    </div>
                  )}
                </Card>
              )}
            </div>
          ),
        },
      ]}
    />
    </>
  );
}
