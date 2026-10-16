/**
 * セッション画面
 * T057: FR-007, FR-017, FR-030 ＋ デザインシステム適用
 */

import React, { useMemo, useState } from "react";
import {
  Crown, ArrowRight, Play, Pause, SkipForward, Shuffle, TimerReset,
} from "lucide-react";
import { secondsLeft, elapsedMs } from "@tasuki/timer-core/aggregate";
import type { Room } from "@tasuki/timer-core";
import type { Topic } from "@tasuki/topic-core";
import { Card } from "./primitives.js";
import { TopicCard } from "./components/TopicCard.js";
import { CircularProgress } from "./components/CircularProgress.js";
import { TeamOrbit } from "./components/TeamOrbit.js";
import { RotationLineup } from "./components/RotationLineup.js";
import { rotationMembers } from "./rotation-names.js";
import {
  displayRemainingSeconds,
  driverNames,
  isUrgent as isUrgentRemaining,
  orbitSizes,
  progressPercent,
} from "./session-view.js";
import { RosterPanel } from "./components/RosterPanel.js";
import { EndSessionZone } from "./components/EndSessionZone.js";
import { SelfDriverToggle } from "./components/SelfDriverToggle.js";
import { SwitchAlert } from "./components/SwitchAlert.js";
import { BreakOverlay } from "./components/BreakOverlay.js";
import { BREAK_TEXT, breakElapsedMs, isBreakEnabled, isOnBreakRoom, isSuggestBandVisible } from "./break-view.js";
import { useBreakAlert } from "./use-break-alert.js";
import { useLastOneGuard } from "./use-last-one-guard.js";
import { SharedMemo } from "./components/SharedMemo.js";
import { useNowTick } from "./use-now-tick.js";
import { useDiscreteAnnouncement } from "./use-discrete-announcement.js";
import { usePrefersReducedMotion } from "./use-reduced-motion.js";
import { useSwitchAlert } from "./use-switch-alert.js";
import { useCountdownTick } from "./use-countdown-tick.js";
import { useIsWide, useViewportWidth } from "./use-breakpoint.js";
import { useNotifyPreferences } from "./use-notify-preferences.js";
import { formatRemaining, formatElapsed } from "./format-time.js";
import { Tabs } from "./components/Tabs.js";
import { InvitePanel } from "./components/InvitePanel.js";
import { PassphrasePanel } from "./components/PassphrasePanel.js";
import { NotifyHint } from "./components/NotifyHint.js";
import { loadNotifyHintSeen, saveNotifyHintSeen } from "../prefs/local-prefs.js";

interface SessionProps {
  room: Room;
  /** 参加用 URL（組み立ては同期フックが持つ。画面は受け取って渡すだけ・#95 S5b）。 */
  inviteUrl: string;
  participantId: string;
  clockOffset?: number;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
  /** 現ドライバーのまま持ち時間を満タンからやり直す（Issue #14・session.act RESTART）。
   *  全体リセット（onReset・先頭ドライバーへ戻る）とは別操作。 */
  onRestartTimer: () => void;
  onComplete: () => void;
  /** 手で休憩に入る／休憩を終える（#402）。休憩の条件があるルームだけが押せる */
  onStartBreak: () => void;
  onEndBreak: () => void;
  onAbort: () => void;
  onReset: () => void;
  /** 在席一覧（RosterPanel）の操作ハンドラ（FR-046/047/048/051）。
   *  既存の onSkip（= SWITCH 交代）とは別物の driver.skip/resume を扱う。 */
  onRenameParticipant: (participantId: string, displayName: string) => void;
  onDriverSkip: (participantId: string) => void;
  onDriverResume: (participantId: string) => void;
  /** 任意メンバーを現ドライバーに指名する（Issue #13）。 */
  onDriverAssign: (participantId: string) => void;
  onAddProxy: (displayName: string) => void;
  /** 引き継ぎメモの更新（§9.1）。handoff.note.set を送る。 */
  onHandoffNoteSet?: (text: string) => void;
  /** 自分をドライバーローテーションに加える（自分のIDで member.add・2層モデル）。途中参加対応。 */
  onJoinRotation?: (participantId: string) => void;
  /** 自分をローテーションから外す（自分のIDを渡し、index は App が最新 snapshot から解決）。 */
  onLeaveRotation?: (participantId: string) => void;
  /** 参加者を退出させる（⑪）。 */
  onRemoveParticipant?: (participantId: string) => void;
  /** ドライバー順の入れ替え（v2.3 #1）。fromIndex→toIndex（rotation 内の位置・member.move）。 */
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

export function Session({
  room,
  inviteUrl,
  participantId,
  clockOffset = 0,
  onSkip,
  onPause,
  onResume,
  onRestartTimer,
  onComplete,
  onStartBreak,
  onEndBreak,
  onAbort,
  onReset,
  onRenameParticipant,
  onDriverSkip,
  onDriverResume,
  onDriverAssign,
  onAddProxy,
  onHandoffNoteSet,
  onJoinRotation,
  onLeaveRotation,
  onRemoveParticipant,
  onMoveRotation,
  onShuffle,
  onSetPassphrase,
  topic = null,
}: SessionProps) {
  // 初回ヒントを閉じたか（手動 dismiss で永続化）。実際の表示可否は下の notifyPrefs.enabled と
  // 組み合わせて派生で判定し、セッション中に通知を ON にしたら自動的に消えるようにする。
  const [hintDismissed, setHintDismissed] = useState(() => loadNotifyHintSeen());
  const dismissHint = () => { saveNotifyHintSeen(); setHintDismissed(true); };

  // 稼働中は定期的に再レンダリングしてカウントダウンを進める（FR-007・フックに分離）。
  // 休憩中は時計が止まるが、休憩の経過を数えるので時刻を進める（#402）。
  const onBreak = isOnBreakRoom(room);
  const breakSince = room.session.break?.since ?? null;
  const now = useNowTick(room.clock.running || onBreak, breakSince ?? room.clock.anchorServerTime);
  const elapsed = useMemo(
    () => elapsedMs(room.clock, now, clockOffset),
    [room.clock, now, clockOffset],
  );

  // 表示用の残り時間。サーバー権威の secondsLeft をそのまま使う（0 でクランプ）。
  // 交代＝サーバーの新アンカー snapshot で「ドライバー変更」と「時間リセット」が同時に
  // 反映されるため、二重リセットや先走りロールオーバーは行わない（⑥ 致命傷の修正）。
  // 上限は間隔で抑える（`session-view.ts` の `displayRemainingSeconds`）。
  const displayRemaining = useMemo(
    () => displayRemainingSeconds(room.clock.intervalSeconds, secondsLeft(room.clock, now, clockOffset)),
    [room.clock, now, clockOffset],
  );

  const currentParticipant = room.participants.find(
    (p) => p.participantId === participantId,
  );
  // かつてここには `isHost` / `isEditor` と、サーバーと同じ規則表を引く `can()` ヘルパがあり、
  // 終了系（`canEndSession`）と他人への管理操作（`canManageOthers`）の活性を決めていた。
  // **#95 S3 で役割が消え、これらはどれも常に真になった。** 恒真な述語は
  // 「検査しているように見えて何も守っていない」ため、判定ごと畳んで導線を全員へ出す。

  // 「次は誰か」はサーバーが決める（#276 D1 / D6。`session-view.ts` の `driverNames`）。
  const nextIndex = room.session.nextIndex;
  // 席はサーバーが組む（識別子・表示名・番が回らない理由）。`participants` も渡すのは
  // 呼び名の判定のためで、輪の外の見学者との同名を取りこぼさないようにする（D9）。
  const rotation = rotationMembers(room.session.seats, room.participants);
  // 現ドライバー・次・ナビは呼び名（同名が並ぶときは識別子つき）で出す。
  // 素の表示名だと同名2名がどちらも「Bob」になり「次は誰か」が判別できない。
  const rotationLen = room.session.rotation.length;
  const currentDriverId = room.session.rotation[room.session.currentIndex] ?? "";
  const {
    current: currentDriverName,
    next: nextDriverName,
    navigator: navigatorName,
  } = driverNames({
    names: rotation.map((m) => m.label),
    skipReasons: rotation.map((m) => m.skipReason),
    currentIndex: room.session.currentIndex,
    nextIndex,
    previousDriverIndex: room.session.previousDriverIndex ?? null,
    navigatorEnabled: room.config.navigatorEnabled === true,
  });

  const isUrgent = isUrgentRemaining(room.clock.running, displayRemaining);

  // 支援技術向けの離散アナウンス（FR-035・フックに分離）。
  const announcement = useDiscreteAnnouncement({
    running: room.clock.running,
    isPaused: room.session.isPaused,
    currentIndex: room.session.currentIndex,
    isUrgent,
    driverName: currentDriverName,
    onBreak,
  });


  // 強い交代通知（§9.1 assertiveSwitch）はカスタムフックに集約。reduced-motion は
  // SwitchAlert の描画にのみ使う（アニメ抑制）。
  const reducedMotion = usePrefersReducedMotion();
  // 個人通知設定をライブ購読する。NotifySettings での保存（同一タブ）と別タブの
  // storage 変更の両方で即時反映され、セッション中の ON/OFF・音変更が次の交代に効く。
  const notifyPrefs = useNotifyPreferences();
  const { switchAlertName, dismissSwitchAlert } = useSwitchAlert(
    room.session.currentIndex,
    currentDriverName,
    { assertiveSwitch: room.config.assertiveSwitch === true, notify: notifyPrefs, suppressed: onBreak },
  );
  // 休憩の知らせ（入った・終わった・知らせた）と、最後の一人が閉じるときの確認（#402）。
  useBreakAlert(breakSince, isSuggestBandVisible(room), notifyPrefs);
  const othersOffline = room.participants
    .filter((p) => p.participantId !== participantId && !p.isPlaceholder)
    .every((p) => p.presence === "offline");
  useLastOneGuard(onBreak && othersOffline);

  const progress = progressPercent(room.clock.intervalSeconds, displayRemaining);
  const isPaused = room.session.isPaused;
  const running = room.clock.running;

  // 交代前カウントダウン予告音（Issue #2）。個人設定でON/OFF・予告秒数を制御。
  useCountdownTick(displayRemaining, running, {
    enabled: notifyPrefs.countdownEnabled,
    thresholdSeconds: notifyPrefs.countdownSeconds,
    volume: notifyPrefs.volume,
    mode: notifyPrefs.countdownMode,
    voiceId: notifyPrefs.countdownVoiceId,
  });

  // PC ではタイマーを主役として大きく見せる（ステージ感・モバイルは収まるサイズに）。
  const isWide = useIsWide();
  // モバイルでは円形計器（固定 px）を幅から縮める（`session-view.ts` の `orbitSizes`・R5-3）。
  const vw = useViewportWidth();
  const { orbit: orbitSize, ring: ringSize } = orbitSizes(isWide, vw);

  // 「セッション」タブのコンテンツ（既存 UI をそのまま移動）。
  const sessionPanel = (
    <div className="session-panel">
      {/* 初回ヒント（未読かつ通知 OFF のときのみ）。閉じる or 通知 ON で消える。 */}
      {!hintDismissed && !notifyPrefs.enabled && <NotifyHint onDismiss={dismissHint} />}

      {/* 知らせるだけの帯（#402 §5.5）。snapshot から導くので、再接続した人にも出る。 */}
      {isSuggestBandVisible(room) && (
        <div className="break-suggest-band" role="status">
          <span>{BREAK_TEXT.suggestBand}</span>
          <button type="button" className="ui-button ui-button--sm" onClick={onStartBreak}>{BREAK_TEXT.startButton}</button>
        </div>
      )}

      {/* PC（lg+）は「左＝タイマー主役＋進行の操作（操作の面） / 右＝参加者・引き継ぎ（脇・22rem）」の2カラム。
          モバイルは素直に縦積みになる。段組みは部品層の `.ui-workspace`（#316）。脇は右（--side-end）。 */}
      <div className="ui-workspace ui-workspace--side-end">
      {/* ── 左（メイン）: タイマー＋進行の操作 ── */}
      <div className="ui-workspace-main session-column">
      {/* ドライバーパネル（タイマー＝円形プログレス、人＝円周配置、現ドライバー＝Crown） */}
      <Card className="session-driver-card">
        {/* 現ドライバー背後の微かな朱の発光（計器の照明）。虹色グラデは廃止。 */}
        <div className="session-driver-glow" />
        <div className="session-driver-body">
          <div className="instrument-label session-driver-label">Current Driver</div>
          <div
            key={currentDriverName}
            className="driver-name-fluid animate-fade-up session-driver-name"
          >
            <Crown className="session-driver-crown" aria-hidden="true" />
            {currentDriverName}
          </div>

          {/* 休憩中は残り時間の円を隠す（覆いが出ている・#402） */}
          {!onBreak && (
          <div className="session-orbit boot-reveal" style={{ animationDelay: "60ms" }}>
            <TeamOrbit members={rotation} currentIndex={room.session.currentIndex} nextIndex={nextIndex} size={orbitSize}>
              <CircularProgress
                progress={progress}
                warning={isUrgent}
                running={running && !isPaused}
                size={ringSize}
                strokeWidth={isWide ? 14 : 11}
              >
                {/* タイマー（残り10秒で緊急色）。role="timer" で意味付与、aria-live は off。 */}
                <div
                  role="timer"
                  aria-live="off"
                  aria-label={`残り時間 ${formatRemaining(displayRemaining)}`}
                  className="session-timer tabular"
                  data-urgent={isUrgent ? "" : undefined}
                  data-paused={isPaused ? "" : undefined}
                >
                  {formatRemaining(displayRemaining)}
                </div>
                {isPaused && (
                  <div className="instrument-label session-paused-label">Paused</div>
                )}
              </CircularProgress>
            </TeamOrbit>
          </div>
          )}

          <div className="session-next boot-reveal" style={{ animationDelay: "150ms" }}>
            <ArrowRight className="session-next-arrow" aria-hidden="true" />
            次: <span className="session-next-name">{nextDriverName}</span>
            {nextIndex === null && (
              <span className="session-next-note">（交代できる人がいません）</span>
            )}
            {/* 出すかどうか（有効か・直前に運転した人が分かってその場に居るか）は `session-view.ts` の `driverNames` が決める */}
            {navigatorName && (
              <span className="session-navigator">ナビ: <span className="session-navigator-name">{navigatorName}</span></span>
            )}
          </div>

          {/* 交代順ストリップ（読み取り専用・「自分はいつ？」確認用） */}
          <div className="session-lineup">
            <RotationLineup
              rotation={rotation}
              currentIndex={room.session.currentIndex}
              nextIndex={nextIndex}
              intervalSeconds={room.clock.intervalSeconds || 1}
              selfIndex={currentParticipant ? room.session.rotation.indexOf(currentParticipant.participantId) : -1}
              isPaused={room.session.isPaused}
            />
          </div>

          {/* 統計（等幅タビュラーで計測値らしく） */}
          <div className="session-stats">
            <span>経過 <span className="tabular session-stat-value">{formatElapsed(elapsed)}</span></span>
            <span>交代 <span className="tabular session-stat-value">{room.session.totalSwitches}</span>回</span>
          </div>
        </div>

        {/* 操作（時間リセット／スキップ／一時停止・再開）。誰でも操作できる（#95 S3）。
            40rem 未満は画面の下端の帯（`.ui-actions--dock`）。帯は計器のカードの最後の子なので、
            カードの範囲の中でだけ留まり、次のカード（終える区画）には被らない。主は最後（ADR 0025 決定 5）。 */}
        <div className="ui-actions ui-actions--dock session-actions boot-reveal" style={{ animationDelay: "230ms" }}>
          {/* 「時間リセット」＝持ち時間のやり直し（Issue #14）。人は変えず、現ドライバーの
              時間だけ満タンから走り直す。「最初から」（先頭ドライバーへ戻す全体リセット・
              EndSessionZone の朱の枠のボタン）とは文言・アイコン・置き場所で区別する。
              ラベルは短く保ち、詳細は title 属性で補う。
              一時停止中でも押せる（押すと走行再開する）ため disabled にしない。 */}
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={onRestartTimer}
            title="同じドライバーのまま、持ち時間を最初からやり直します"
          >
            <span className="session-action-label"><TimerReset className="session-action-icon" aria-hidden="true" /> 時間リセット</span>
          </button>
          <button type="button" className="ui-button ui-button--secondary" onClick={onSkip} disabled={!running}>
            <span className="session-action-label"><SkipForward className="session-action-icon" aria-hidden="true" /> スキップ</span>
          </button>
          {/* 休憩する（条件を設定したルームだけ・#402 D5）。休憩のあいだは覆いが出るので、ここには出ない */}
          {isBreakEnabled(room.config) && (
            <button
              type="button"
              className="ui-button ui-button--secondary"
              onClick={onStartBreak}
              title={BREAK_TEXT.startHint}
            >
              <span className="session-action-label">{BREAK_TEXT.startButton}</span>
            </button>
          )}
          {isPaused || !running ? (
            <button type="button" className="ui-button" onClick={onResume} disabled={!isPaused}>
              <span className="session-action-label"><Play className="session-action-icon-lg" aria-hidden="true" /> 再開</span>
            </button>
          ) : (
            <button type="button" className="ui-button" onClick={onPause}>
              <span className="session-action-label"><Pause className="session-action-icon" aria-hidden="true" /> 一時停止</span>
            </button>
          )}
        </div>
        {isBreakEnabled(room.config) && <p className="session-config-hint">{BREAK_TEXT.startHint}</p>}
      </Card>

      {/* 終了系3操作の隔離ゾーン（完成/中断/リセット・確認つき・FR-018/019/044）。
          誰にでも提示する（FR-081・#95 S3）。 */}
      <Card>
        <EndSessionZone
          onComplete={onComplete}
          onAbort={onAbort}
          onReset={onReset}
          isShared={room.code !== "SOLO"}
        />
      </Card>
      </div>{/* /左（メイン） */}

      {/* ── 右（サイド）: 参加者一覧＋引き継ぎメモ ── */}
      <div className="ui-workspace-side session-column">
      {/* いまのお題（#91）。timer は読むだけで、変えるのはお題ツールの仕事（spec T4）。
          脇の先頭に置く読む面（#316 PR 3・#314）。長い説明はここで切れるので、タイマーを押し下げない。 */}
      {topic && <TopicCard topic={topic} />}
      {/* 在席一覧（RosterPanel）。改名・一時離脱・代理追加・現ドライバー
          ハイライト（FR-046/047/048/050/051/061）。現ドライバーは rotation の識別子で判定。 */}
      <Card>
        {/* 自分のドライバー状態と加入/離脱（2層モデル・途中参加対応・D1）。
            **全参加者に出す。** かつては「編集者以上」に限り、見学者には別の盤
            （SpectatorSelfActions）を出していた。#95 S3 で役割が消え、進行から外れる
            唯一の導線がこの盤（一時離脱／列から外れる）になった。 */}
        {currentParticipant && (
          <SelfDriverToggle
            inRotation={room.session.rotation.includes(currentParticipant.participantId)}
            isSkipping={currentParticipant.driverEligible === false}
            canLeave={room.session.rotation.length > 1}
            participantId={currentParticipant.participantId}
            onJoin={onJoinRotation}
            onLeave={onLeaveRotation}
            onSkip={onDriverSkip}
            onResume={onDriverResume}
            // 自己退出は participant.remove に自分の participantId を渡す（新コマンドは不要）。
            onLeaveRoom={onRemoveParticipant}
          />
        )}
        {/* セッション中でもロスターからドライバー順をランダム化できる（v2.3 #1）。
            2人以上で意味を持つ。RosterPanel 内の上/下並べ替え（onMove）と対で配置。 */}
        {onShuffle && rotationLen > 1 && (
          <div className="session-toolbar">
            <button type="button" onClick={onShuffle} aria-label="ドライバー順をランダムに並べ替える" className="ui-button ui-button--secondary ui-button--sm">
              <span className="session-shuffle-label"><Shuffle className="session-action-icon" aria-hidden="true" /> ランダム</span>
            </button>
          </div>
        )}
        <RosterPanel
          participants={room.participants}
          seats={room.session.seats}
          currentDriverId={currentDriverId}
          myParticipantId={participantId}
          // 自分の一時離脱/復帰は上の SelfDriverToggle が担うため、行には出さず重複を避ける（#1）。
          selfHasExternalToggle
          rotation={room.session.rotation}
          onMove={onMoveRotation}
          onRename={onRenameParticipant}
          onSkip={onDriverSkip}
          onResume={onDriverResume}
          onAssignDriver={onDriverAssign}
          onAddProxy={onAddProxy}
          onRemove={onRemoveParticipant}
          isShared={room.code !== "SOLO"}
        />
      </Card>

      {/* 共有メモ（§9.1 拡張）。編集/プレビュー・Markdown 表示は SharedMemo に集約。 */}
      <SharedMemo note={room.handoffNote} onCommit={onHandoffNoteSet} />
      </div>{/* /右（サイド） */}
      </div>{/* /2カラムグリッド */}

    </div>
  );

  return (
    <div role="main" aria-label="セッション">
      {/* 休憩中は覆いの外を inert にする（#402）。覆いと、背後で開いていた確認ダイアログ
          （どちらも modal のフォーカストラップ）が focusin を奪い合わないように、背後へフォーカスを入れさせない。 */}
      <div inert={onBreak}>
      <Tabs
        ariaLabel="セッション"
        items={[
          { id: "session", label: "セッション", content: sessionPanel },
          {
            id: "room",
            label: "ルーム",
            content: (
              <div className="session-room">
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
                {/* このタブには SelfDriverToggle が無いため、自分の一時離脱/復帰は行に出す
                    （セッションタブ側は SelfDriverToggle が担うので行には出さない＝#1）。 */}
                <Card>
                  {/* 自己退出は Session タブの SelfDriverToggle が担うが、
                      Room タブだけを見ている場合に導線が消えないよう、ここにも出す。 */}
                  {currentParticipant && onRemoveParticipant && (
                    <div className="session-toolbar">
                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(currentParticipant.participantId)}
                        className="ui-button ui-button--quiet ui-button--sm"
                        title="この端末をルームから外します。招待から再参加できます。"
                      >
                        ルームから抜ける
                      </button>
                    </div>
                  )}
                  {/* ルームタブでもランダム化できる（v2.3 #1・セッションタブと同等）。 */}
                  {onShuffle && rotationLen > 1 && (
                    <div className="session-toolbar">
                      <button type="button" onClick={onShuffle} aria-label="ドライバー順をランダムに並べ替える" className="ui-button ui-button--secondary ui-button--sm">
                        <span className="session-shuffle-label"><Shuffle className="session-action-icon" aria-hidden="true" /> ランダム</span>
                      </button>
                    </div>
                  )}
                  <RosterPanel
                    participants={room.participants}
                    seats={room.session.seats}
                    currentDriverId={currentDriverId}
                    myParticipantId={participantId}
                    selfHasExternalToggle={false}
                    rotation={room.session.rotation}
                    onMove={onMoveRotation}
                    onRename={onRenameParticipant}
                    onSkip={onDriverSkip}
                    onResume={onDriverResume}
                    onAssignDriver={onDriverAssign}
                    onAddProxy={onAddProxy}
                    onRemove={onRemoveParticipant}
                    isShared={room.code !== "SOLO"}
                  />
                </Card>
              </div>
            ),
          },
        ]}
      />
      </div>
      {/* 交代通知・支援技術アナウンスはどのタブでも有効にする（タブに依存しない重要イベント） */}
      <div aria-live="assertive" role="status" className="ui-visually-hidden">
        {announcement}
      </div>
      {onBreak && breakSince !== null && (
        <BreakOverlay
          elapsedMs={breakElapsedMs(breakSince, now, clockOffset)}
          nextDriverName={currentDriverName}
          isLastOne={othersOffline}
          isShared={room.code !== "SOLO"}
          onEnd={onEndBreak}
          onComplete={onComplete}
          onStandDown={
            currentParticipant &&
            room.session.rotation.includes(currentParticipant.participantId) &&
            currentParticipant.driverEligible !== false
              ? () => onDriverSkip(currentParticipant.participantId)
              : undefined
          }
        />
      )}
      {switchAlertName && (
        <SwitchAlert
          driverName={switchAlertName}
          reducedMotion={reducedMotion}
          onDismiss={dismissSwitchAlert}
        />
      )}
    </div>
  );
}

