/**
 * ロビー画面（1 画面。旧「ルーム」「お題」タブは #91 PR 3 で撤去した）
 * T058, T059: FR-011 ＋ デザインシステム適用
 * v2.2 #5/#6: 開始ボタンを上部固定、招待を InvitePanel に委譲
 */

import React, { useState } from "react";
import { Users, Play, UserPlus, UserMinus, ChevronUp, ChevronDown, X, Shuffle, Bell } from "lucide-react";
import type { Room } from "@tasuki/timer-core";
import type { Topic } from "@tasuki/topic-core";
import { Card, PrimaryButton, GhostButton, SectionHeader } from "./primitives.js";
import { TopicCard } from "./components/TopicCard.js";
import { SessionConfigPanel } from "./components/SessionConfigPanel.js";
import { InvitePanel } from "./components/InvitePanel.js";
import { PassphrasePanel } from "./components/PassphrasePanel.js";
import { EmptyHint } from "./components/EmptyHint.js";
import { NotifySettingsPanel } from "./components/NotifySettingsPanel.js";
import { labelPool, participantLabel } from "./participant-label.js";
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
  /** 参加用 URL（組み立ては同期フックが持つ。画面は受け取って渡すだけ・#95 S5b）。 */
  inviteUrl: string;
  participantId: string;
  onStartSession: () => void;
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
  /**
   * ルームのいまのお題（#91）。**読むだけ**（作る/直すのはお題ツールの仕事・spec T4）。
   * 未接続や `topic` フレーム未到達では無いので、無ければ描かない。
   */
  topic?: Topic | null;
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
      className="lobby-row-icon-button"
    >
      <Icon className="lobby-row-icon" />
    </button>
  );
}

export function Lobby({
  room,
  inviteUrl,
  participantId,
  onStartSession,
  onConfigSet,
  onJoinRotation,
  onLeaveRotation,
  onRemoveParticipant,
  onMoveRotation,
  onShuffle,
  onSetPassphrase,
  topic = null,
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

  // 呼び名の同名判定プール（`participant-label.ts` に1つだけ置く規則の呼び出し口）。
  // `room.participants` だけだと、輪に席は残るが timer 画面には居ない離席者を取りこぼし、
  // Session 側（RosterPanel・交代順ストリップ）と判定結果がずれる（敵対的レビュー #276 指摘1）。
  const labelParticipantPool = labelPool(room.session.seats, room.participants);

  // 通知設定（ロビーのカードで直接編集できるよう、ライブ購読）。
  const notifyPrefs = useNotifyPreferences();

  // 開始ボタン（画面最上部に配置）。
  // かつては主催者にだけ出し、それ以外には「主催者の開始を待っています」と表示していた。
  // #95 S3 で役割が消え、居合わせた誰でも開始できる（待たされる相手がいなくなった）。
  // **お題の有無では止めない**（#91 PR 3）。お題はお題ツールが配る任意の札になり、
  // 無いのが既定になったので、待つと誰も始められなくなる。
  const startButton = (
    <PrimaryButton onClick={onStartSession}>
      <span className="lobby-start-label"><Play className="lobby-start-icon" aria-hidden="true" /> セッションを開始</span>
    </PrimaryButton>
  );

  return (
    <>
      {/* 退出の確認。対象者の名前と、招待から再参加できることを明示する（FR-075）。
          ロビーは共有ルームなので他の参加者の画面にも反映される旨を添える（FR-076）。 */}
      {pendingRemoval && onRemoveParticipant && (
        <RemovalConfirmDialog
          pendingRemoval={pendingRemoval}
          participants={labelParticipantPool}
          isShared={true}
          onConfirm={(id) => {
            onRemoveParticipant(id);
            setPendingRemovalId(null);
          }}
          onCancel={() => setPendingRemovalId(null)}
        />
      )}
      <div className="lobby">
        {/* いまのお題（#91）。timer は読むだけで、変えるのはお題ツールの仕事（spec T4）。 */}
        {topic && <TopicCard topic={topic} />}
        {startButton}
        {/* セッション設定（交代間隔・詳細設定）。誰でも変更できる。 */}
        <Card>
          <SessionConfigPanel
            config={room.config}
            onChange={(patch) => onConfigSet?.(patch)}
          />
        </Card>
        <InvitePanel code={room.code} roomUrl={inviteUrl} />
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
          <div className="lobby-notify-heading">
            <Bell className="lobby-notify-icon" aria-hidden="true" /> 交代通知
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
            title={`参加者 (${room.participants.length}人)`}
            right={
              /* ドライバー順をランダムに（v2.3 #1）。2人以上で意味を持つ。 */
              onShuffle && room.session.rotation.length > 1 ? (
                <GhostButton onClick={onShuffle} aria-label="ドライバー順をランダムに並べ替える" className="lobby-shuffle">
                  <span className="lobby-shuffle-label"><Shuffle className="lobby-shuffle-icon" aria-hidden="true" /> ランダム</span>
                </GhostButton>
              ) : undefined
            }
          />
          <ul className="lobby-participants">
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
              const label = participantLabel(p.displayName, p.participantId, labelParticipantPool);
              return (
                <li
                  key={p.participantId}
                  className="lobby-participant"
                >
                  <PresenceDot presence={p.presence} />
                  {/* 在席状態はドットの色だけで伝えていた（WCAG 1.4.1違反・Issue #42）。
                      RosterPanel と同じく sr-only テキストを呼び出し元に置く（PresenceDot 自体は変更しない）。 */}
                  <span className="sr-only">{presenceLabel(p.presence)}</span>
                  <span className="lobby-participant-name">{label}</span>
                  {/* ドライバー（順番つき）/ 見学 の区別（§9.2・④ 順番可視化） */}
                  <span
                    className={`tabular lobby-participant-badge ${
                      inRotation ? "lobby-participant-badge-driver" : "lobby-participant-badge-spectator"
                    }`}
                  >
                    {inRotation ? `ドライバー${rotationIndex + 1}` : "見学"}
                  </span>
                  {/* 操作エリア（本人＝加入/離脱・退出、他人＝加入/離脱・並び替え・退出）。
                      かつては他人への操作を主催者にだけ出していた（#95 S3 で全員に開いた）。 */}
                  <span className="lobby-participant-actions">
                    {isMe && (
                      inRotation ? (
                        <GhostButton
                          onClick={() => onLeaveRotation?.(p.participantId)}
                          disabled={isLastDriver}
                          title={isLastDriver ? "最後のドライバーは外れられません" : undefined}
                          className="lobby-row-action"
                        >
                          列から外れる
                        </GhostButton>
                      ) : (
                        <PrimaryButton onClick={() => onJoinRotation?.(p.participantId)} className="lobby-row-action lobby-row-join">
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
                        className="lobby-row-action"
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
            <div className="lobby-empty-hint">
              <EmptyHint>
                まだあなただけです。上の招待リンクで仲間を呼び、揃ったら「開始」しましょう。
              </EmptyHint>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
