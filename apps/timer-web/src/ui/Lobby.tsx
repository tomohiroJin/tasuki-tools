/**
 * ロビー画面（タブ構造: ルーム / お題）
 * T058, T059: FR-011 ＋ デザインシステム適用
 * v2.2 #5/#6: 開始ボタンを上部固定、招待を InvitePanel に委譲
 */

import React, { useState } from "react";
import { Users, Code, Play, UserPlus, UserMinus, ChevronUp, ChevronDown, X, Shuffle, Bell } from "lucide-react";
import type { Room, Problem } from "@tasuki/timer-core";
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
import { participantLabel } from "./participant-label.js";
import { PresenceDot } from "./components/PresenceDot.js";
import { presenceLabel } from "./presence.js";
import { RemovalConfirmDialog } from "./components/RemovalConfirmDialog.js";
import { useNotifyPreferences } from "./use-notify-preferences.js";
import { saveNotifyPreferences } from "../prefs/local-prefs.js";
import { requestPermissionIfEnabling } from "../platform/notify.js";
import { playChime } from "../platform/sound.js";
import type { SessionConfig } from "@tasuki/timer-core";

interface LobbyProps {
  room: Room;
  participantId: string;
  onStartSession: () => void;
  /** お題まわり（開始前にロビーでお題を決める・US3）。 */
  onEditProblem?: (patch: Partial<Omit<Problem, "source" | "edited">>) => void;
  onRegenerateProblem?: () => void;
  onPasteProblem?: () => void;
  onCopyProblem?: () => void;
  /** AI/定型のお題を生成中。ProblemEditor のスピナー＋減光に使う。 */
  generatingProblem?: boolean;
  /** セッション設定の変更（言語/難易度/間隔/オプション）。config.set を送る。 */
  onConfigSet?: (patch: Partial<SessionConfig>) => void;
  /** 自分をドライバーローテーションに加える（自分のIDで member.add）。2層モデル。 */
  onJoinRotation?: (participantId: string) => void;
  /** 自分をローテーションから外す（自名を渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (participantId: string) => void;
  /** 参加者を退出させる（⑪）。 */
  onRemoveParticipant?: (participantId: string) => void;
  /** ドライバー順の入れ替え（④）。fromIndex→toIndex（rotation 内の位置）。 */
  onMoveRotation?: (fromIndex: number, toIndex: number) => void;
  /** ドライバー順をランダムに並べ替える（v2.3 #1）。member.shuffle を送る。 */
  onShuffle?: () => void;
  /** ルームのパスフレーズ設定/解除（R4-2）。空文字で解除。 */
  onSetPassphrase?: (passphrase: string) => void;
  /** AI お題生成の合言葉で解錠を試みる。 */
  onAiUnlock?: (key: string) => void;
  /** AI ⇔ 定型モードの切替（problem.mode.set）。 */
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
      className="grid h-11 w-11 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-md bg-[var(--panel)] hover:bg-[var(--panel-hover)] disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--hairline)] text-[var(--bone-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
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
  onMoveRotation,
  onShuffle,
  onSetPassphrase,
  onAiUnlock,
  onProblemModeSet,
}: LobbyProps) {
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

  // 開始ボタン（ルームタブ最上部に配置）。
  // かつては主催者にだけ出し、それ以外には「主催者の開始を待っています」と表示していた。
  // #95 S3 で役割が消え、居合わせた誰でも開始できる（待たされる相手がいなくなった）。
  const startButton = (
    <PrimaryButton className="w-full" onClick={onStartSession} disabled={problemEnabled && !room.problem}>
      <span className="flex items-center justify-center gap-2"><Play className="w-5 h-5" aria-hidden="true" /> セッションを開始</span>
    </PrimaryButton>
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
              {/* セッション設定（交代間隔・詳細設定）。誰でも変更できる。 */}
              <Card>
                <SessionConfigPanel
                  config={room.config}
                  onChange={(patch) => onConfigSet?.(patch)}
                />
              </Card>
              <InvitePanel code={room.code} />
              {/* ルームのパスフレーズ設定/解除（R4-2）。招待のすぐ下に置く。 */}
              {onSetPassphrase && (
                <Card>
                  <PassphrasePanel
                    protectedNow={!!room.passphraseProtected}
                    onSet={onSetPassphrase}
                  />
                </Card>
              )}
              {/* 通知設定カード。セッション開始前に音通知を整えておける。 */}
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
              {/* 参加者一覧 */}
              <Card>
                <SectionHeader
                  icon={Users}
                  color="text-[var(--signal)]"
                  title={`参加者 (${room.participants.length}人)`}
                  right={
                    /* ドライバー順をランダムに（v2.3 #1）。2人以上で意味を持つ。 */
                    onShuffle && room.session.rotation.length > 1 ? (
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
                        {/* 在席状態はドットの色だけで伝えていた（WCAG 1.4.1違反・Issue #42）。
                            RosterPanel と同じく sr-only テキストを呼び出し元に置く（PresenceDot 自体は変更しない）。 */}
                        <span className="sr-only">{presenceLabel(p.presence)}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                        {/* ドライバー（順番つき）/ 見学 の区別（§9.2・④ 順番可視化） */}
                        <span
                          className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold tabular ${
                            inRotation
                              ? "bg-[var(--signal-tint)] text-[var(--signal)] border border-[var(--signal-veil)]"
                              : "bg-[var(--panel)] text-[var(--bone-subtle)] border border-[var(--hairline)]"
                          }`}
                        >
                          {inRotation ? `ドライバー${rotationIndex + 1}` : "見学"}
                        </span>
                        {/* 操作エリア（本人＝加入/離脱・退出、他人＝加入/離脱・並び替え・退出）。
                            かつては他人への操作を主催者にだけ出していた（#95 S3 で全員に開いた）。 */}
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
                              かつては「編集者以上が1名以上残る」という不変条件で無効化していた
                              （#95 S3 でその不変条件ごと消え、いつでも抜けられる）。 */}
                          {isMe && onRemoveParticipant && (
                            <GhostButton
                              onClick={() => onRemoveParticipant(p.participantId)}
                              title="この端末をルームから外します。招待から再参加できます。"
                              className="text-xs px-3 py-1.5"
                            >
                              ルームから抜ける
                            </GhostButton>
                          )}
                          {/* 他参加者のドライバー加入/離脱を制御できる（②） */}
                          {!isMe && (
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
                          {/* ドライバー順を入れ替えられる（④）。2人以上で意味を持つ。 */}
                          {inRotation && rotationLen > 1 && onMoveRotation && (
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
                          {/* 他参加者を退出させられる（⑪） */}
                          {!isMe && onRemoveParticipant && (
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
              {/* お題あり/なしトグル（お題タブ先頭）。 */}
              <Card>
                <ProblemModeToggle
                  enabled={problemEnabled}
                  onChange={(v) => onConfigSet?.({ problemEnabled: v })}
                />
              </Card>
              {/* お題の設定（言語/難易度/言語プール）。AI お題生成の解錠を末尾に控えめに同居。 */}
              <Card>
                <ProblemConfigPanel
                  config={room.config}
                  problemEnabled={problemEnabled}
                  onChange={(patch) => onConfigSet?.(patch)}
                />
                {/* AI お題生成の解錠（合言葉方式）。解錠前はテキストリンクのみ。 */}
                {onAiUnlock && onProblemModeSet && (
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

              {/* お題（開始前にここで決める・US3）。確定済みなら誰でも編集できる。 */}
              {problemEnabled && (
                <Card>
                  <SectionHeader icon={Code} color="text-[var(--signal)]" title="お題" />
                  {room.problem ? (
                    <ProblemEditor
                      problem={room.problem}
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
