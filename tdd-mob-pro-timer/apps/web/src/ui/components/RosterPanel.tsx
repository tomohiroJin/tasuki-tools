/**
 * 在席一覧パネル
 * T057: FR-046,047,048,050,051,052,061 (US9)
 * Task 6: ドライバー/見学セクション分割・現ドライバー最上部・情報階層化
 *
 * 全参加者の在席状況・現ドライバー・役割を常時一覧表示。
 * 代理追加・改名・スキップ/復帰操作を提供する。
 * 色＋テキスト併記（FR-032）。
 * ドライバー（rotation 内）と見学（rotation 外）を別 <ul> で表示し、
 * 現ドライバーをドライバーセクション先頭に固定する。
 */

import React, { useState, useEffect, useRef } from "react";
import { Users, ChevronUp, ChevronDown, Crown, X } from "lucide-react";
import type { Participant } from "@tdd-mob/core";
import { MAX_DISPLAY_NAME } from "@tdd-mob/core/aggregate";
import { GhostButton, PrimaryButton, SectionHeader } from "../primitives.js";
import { presenceLabel, presenceDotClass } from "../presence.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { participantLabel } from "../participant-label.js";

/** 小さなダーク用ボタン。RosterPanel 内の改名/離脱/外す等のコンパクト操作用。
 * 行操作はサーバー往復で反映されるため、押下フィードバックが無いと「効いていない」ように見える。
 * クリック直後の短時間だけ「送信中」（disabled＋半透明）にし、効いた感の付与と二重送信防止を兼ねる。 */
function MiniButton({
  children,
  onClick,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    onClick?.(e);
    setPending(true);
    timer.current = setTimeout(() => setPending(false), 450);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className="px-3 py-2 min-h-[44px] sm:min-h-[36px] shrink-0 whitespace-nowrap rounded-md text-xs font-medium text-[var(--bone-muted)] bg-[var(--panel-2)] hover:bg-[#252934] border border-[var(--hairline)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
      {...rest}
    >
      {children}
    </button>
  );
}

interface RosterPanelProps {
  participants: Participant[];
  /** 現ドライバーの表示名（session.rotation[currentIndex]）。
   *  participants 配列のインデックスと rotation のインデックスは一致しないため、
   *  配列位置ではなく名前で現ドライバーを判定する。重複名は member.add/addProxy で
   *  拒否されるため displayName は一意。 */
  currentDriverName: string;
  myParticipantId: string;
  canManage: boolean;
  onRename: (participantId: string, displayName: string) => void;
  onSkip: (participantId: string) => void;
  onResume: (participantId: string) => void;
  onAddProxy: (displayName: string) => void;
  /** 参加者を退出させる（⑪）。開始後は主催者以外も実行できる（Issue #22・FR-065）。
   *  自分自身の退出はここには出さない（SelfDriverToggle が担う・FR-078）。 */
  onRemove?: (participantId: string) => void;
  /** 共有ルームか。確認ダイアログに他参加者への影響を出すかの判断に使う（FR-076）。 */
  isShared?: boolean;
  /** ホストを当該参加者へ移譲する（host 限定・オンライン・自分以外のみ表示）。 */
  onTransferHost?: (participantId: string) => void;
  /** ドライバーのローテーション順（session.rotation）。並べ替えの index 算出に使う（v2.3 #1）。
   *  participants の配列位置と rotation の位置は一致しないため、rotation 内の位置を別途渡す。 */
  rotation?: string[];
  /** ドライバー順の入れ替え（v2.3 #1・host）。fromIndex→toIndex（rotation 内の位置）。
   *  ドライバー行（rotation に含まれる）にのみ上/下ボタンを出す。 */
  onMove?: (fromIndex: number, toIndex: number) => void;
  /** 参加者リストに高さ上限＋内部スクロールを付ける（項目4・Session で有効化）。 */
  scrollable?: boolean;
  /** 自分のローテーション操作（一時離脱/復帰）を外部の自己トグルが担うか。
   *  true（Session）なら自分の行には一時離脱/復帰を出さず重複を避ける。
   *  false/未指定（Solo 等・自己トグル無し）なら自分の行にも出す。 */
  selfHasExternalToggle?: boolean;
  /** ホストが任意メンバーを現ドライバーに指名する（Issue #13・host 限定）。
   *  未指定なら指名ボタンを描画しない（ソロ等の非対応コンシューマ向け）。 */
  onAssignDriver?: (participantId: string) => void;
}

export function RosterPanel({
  participants,
  currentDriverName,
  myParticipantId,
  canManage,
  selfHasExternalToggle = false,
  onRename,
  onSkip,
  onResume,
  onAddProxy,
  onRemove,
  isShared = false,
  onTransferHost,
  rotation,
  onMove,
  onAssignDriver,
  scrollable = false,
}: RosterPanelProps) {
  const [proxyName, setProxyName] = useState("");
  const [showProxyInput, setShowProxyInput] = useState(false);
  // 改名中の参加者 ID と編集中の名前（同時に1人だけ編集できる）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // 退出の確認対象。取り返しがつかない操作なので直接は実行しない（FR-075）。
  const [pendingRemoval, setPendingRemoval] = useState<Participant | null>(null);

  const handleAddProxy = () => {
    if (!proxyName.trim()) return;
    onAddProxy(proxyName.trim());
    setProxyName("");
    setShowProxyInput(false);
  };

  const startRename = (participantId: string, current: string) => {
    setEditingId(participantId);
    setEditName(current);
  };

  const submitRename = (participantId: string) => {
    const trimmed = editName.trim();
    if (trimmed) onRename(participantId, trimmed);
    setEditingId(null);
    setEditName("");
  };

  // rotation 内かどうかを判定するヘルパ
  const inRot = (p: Participant) => rotation ? rotation.includes(p.displayName) : false;

  // ドライバーグループ: 現ドライバー起点の巡回順（現=0, 次=1, …）で並べる。
  // 交代のたびにリストが1つずつ繰り上がる自然な並びにする（v2.10 #4）。
  const drivers = (() => {
    const rotParts = participants.filter(inRot);
    if (!rotation || rotation.length === 0) return rotParts;
    const len = rotation.length;
    const curIdx = rotation.indexOf(currentDriverName);
    const turnOrder = (p: Participant): number => {
      const i = rotation.indexOf(p.displayName);
      if (i < 0 || curIdx < 0) return Number.MAX_SAFE_INTEGER;
      return (i - curIdx + len) % len;
    };
    return [...rotParts].sort((a, b) => turnOrder(a) - turnOrder(b));
  })();

  // 見学グループ: rotation 外（元の相対順を保持）
  const watchers = participants.filter((p) => !inRot(p));

  // リストのクラス（scrollable 対応）
  const listClass = `flex flex-col gap-1.5 ${scrollable ? "max-h-[20rem] overflow-y-auto pr-1" : ""}`;

  /** 参加者行の共通レンダリング関数。全アクション（改名/離脱/復帰/譲る/外す/並べ替え）を維持する。 */
  const renderRow = (p: Participant) => {
    const isCurrentDriver = currentDriverName !== "" && p.displayName === currentDriverName;
    const isMine = p.participantId === myParticipantId;
    const isSkipping = p.driverEligible === false;
    // 改名は本人 or ホストが可能（観覧者でも自分自身は改名可: FR-046）
    const canRename = isMine || canManage;
    const isEditing = editingId === p.participantId;
    // ドライバー順での位置。rotation.indexOf(displayName) で算出する
    // （participants の配列位置とは一致しないため）。-1 なら見学者（rotation 外）。
    const rotationIndex = rotation ? rotation.indexOf(p.displayName) : -1;
    const inRotation = rotationIndex >= 0;
    const rotationLen = rotation?.length ?? 0;
    // 並べ替えはホストが操作でき、ドライバーが2人以上いるときだけ意味を持つ。
    const canMove = canManage && !!onMove && inRotation && rotationLen > 1;

    return (
      <li
        // 現ドライバーになった瞬間だけ key を変えて再マウントし、入場アニメ(animate-pop-in)を
        // 再生させる＝交代で先頭に入れ替わった「感」を出す（reduced-motion では index.css で抑制）。
        key={isCurrentDriver ? `${p.participantId}-current` : p.participantId}
        className={`rounded-md px-3 py-2 text-sm transition-colors ${
          isCurrentDriver
            ? "bg-[rgba(255,74,46,0.12)] border border-[rgba(255,74,46,0.4)] animate-pop-in"
            : "bg-[var(--panel-2)] border border-[var(--hairline)]"
        }`}
      >
        {isEditing ? (
          /* 改名中は入力＋保存/キャンセルで行を専有する。 */
          <div className="flex w-full min-w-0 gap-1">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              aria-label={`${p.displayName} の新しい名前`}
              maxLength={MAX_DISPLAY_NAME}
              className="min-w-0 flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
            />
            <MiniButton onClick={() => submitRename(p.participantId)}>保存</MiniButton>
            <MiniButton onClick={() => setEditingId(null)}>取消</MiniButton>
          </div>
        ) : (
          <>
            {/* 1段目: 順番＋在席ドット＋名前＋役割バッジ＋「▶ 今」。
                名前は text-base font-medium で目立たせる。
                メタ情報（順番番号・役割バッジ）は控えめな色で表示。
                在席「オンライン」テキストチップは廃止しドット＋sr-only のみに（FR-032 色併記は
                ドットで維持し、スクリーンリーダーには sr-only テキストで伝える）。
                役割バッジは host/viewer のみ表示（editor は省略）。 */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 [&>span.chip]:whitespace-nowrap">
              {inRotation && (
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular bg-[var(--panel)] text-[var(--bone-subtle)] border border-[var(--hairline)]"
                  aria-label={`順番 ${rotationIndex + 1}`}
                >
                  {rotationIndex + 1}
                </span>
              )}
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${presenceDotClass(p.presence)}`}
                aria-hidden="true"
              />
              {/* 在席状態をスクリーンリーダーへ（可視チップは廃止） */}
              <span className="sr-only">{presenceLabel(p.presence)}</span>
              {/* 名前: text-base font-medium で情報階層の最上位に */}
              <span className="min-w-0 font-medium text-base text-[var(--bone)] break-words">
                {p.displayName}
              </span>
              {/* 役割バッジ: host/viewer のみ（editor は表示しない） */}
              {p.role === "host" && (
                <span className="chip text-xs text-[var(--bone-subtle)] font-semibold">主催者</span>
              )}
              {p.role === "viewer" && (
                <span className="chip text-xs text-[var(--bone-subtle)]">観覧</span>
              )}
              {p.isPlaceholder && (
                <span className="chip text-xs text-amber-300">代理</span>
              )}
              {isSkipping && (
                <span className="chip text-xs text-[var(--bone-subtle)]">離脱中</span>
              )}
              {isCurrentDriver && (
                <span className="chip text-xs text-[var(--signal)] font-semibold">▶ 今</span>
              )}
            </div>

            {/* 2段目: 操作。バッジと分離し行幅いっぱいで右寄せ＋折返し（flex-wrap）にして、
                操作が増えても枠からはみ出さないようにする。host 管理操作（譲る/外す）は
                アイコン化して幅を圧縮（Lobby と同じ Crown/X）。改名は本人 or ホスト。
                一時離脱/復帰は driver.skip で、自分の分は外部の自己トグルがあるなら出さず重複を避ける（#1）。 */}
            {canRename && (
              <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1 pl-4">
                <MiniButton onClick={() => startRename(p.participantId, p.displayName)}>改名</MiniButton>
                {/* 一時離脱/復帰の表示可否: 自分=外部トグルが無いときのみ／他人=ホストのみ。観覧者は対象外。 */}
                {p.role !== "viewer" &&
                  (isMine ? !selfHasExternalToggle : canManage) &&
                  (isSkipping ? (
                    <MiniButton onClick={() => onResume(p.participantId)}>復帰</MiniButton>
                  ) : (
                    <MiniButton onClick={() => onSkip(p.participantId)}>一時離脱</MiniButton>
                  ))}
                {/* ホストは現ドライバー以外の rotation メンバーを即ドライバーに指名できる（Issue #13）。
                    実在（非代理）オフラインの相手は無人ドライバーになるため指名不可（host.transfer と同じ方針）。
                    代理(placeholder)は Web 非接続が常態で対面在席するため offline でも指名可能。 */}
                {canManage && onAssignDriver && inRotation && !isCurrentDriver &&
                  (p.presence !== "offline" || p.isPlaceholder === true) && (
                  <MiniButton
                    onClick={() => onAssignDriver(p.participantId)}
                    aria-label={`${p.displayName} をドライバーにする`}
                    title="ドライバーにする"
                  >
                    ドライバーにする
                  </MiniButton>
                )}
                {/* ホストはドライバー順を入れ替えられる（v2.3 #1）。
                    ドライバー行（rotation に含まれる）にのみ上/下を出す。先頭/末尾は無効化。 */}
                {canMove && (
                  <>
                    <MiniButton
                      onClick={() => onMove!(rotationIndex, rotationIndex - 1)}
                      disabled={rotationIndex === 0}
                      aria-label={`${p.displayName} を前の順番へ`}
                      title="前の順番へ"
                    >
                      <ChevronUp className="w-4 h-4" aria-hidden="true" />
                    </MiniButton>
                    <MiniButton
                      onClick={() => onMove!(rotationIndex, rotationIndex + 1)}
                      disabled={rotationIndex === rotationLen - 1}
                      aria-label={`${p.displayName} を後の順番へ`}
                      title="後の順番へ"
                    >
                      <ChevronDown className="w-4 h-4" aria-hidden="true" />
                    </MiniButton>
                  </>
                )}
                {/* ホストを他のオンライン参加者へ譲る（R2-3）。自分・オフライン・現ホストには出さない。
                    アイコン（Crown）＋aria-label/title で省スペース化。 */}
                {canManage && !isMine && p.role !== "host" && p.presence !== "offline" && onTransferHost && (
                  <MiniButton
                    onClick={() => onTransferHost(p.participantId)}
                    aria-label={`${p.displayName} にホストを譲る`}
                    title="ホストを譲る"
                  >
                    <Crown className="w-4 h-4" aria-hidden="true" />
                  </MiniButton>
                )}
                {/* 他の参加者を退出させる（⑪）。開始後は主催者以外も実行できる。
                    自分の行には出さない（自己退出は SelfDriverToggle 側・FR-078）。
                    取り返しがつかない操作なので確認を挟む（FR-075）。
                    同名が並ぶときはラベルに識別子を添える。二重参加の幽霊は本人と同名なので、
                    名前だけだと「どちらを消すのか」を選ぶ時点で区別できない（FR-084）。 */}
                {canManage && !isMine && onRemove && (
                  <MiniButton
                    onClick={() => setPendingRemoval(p)}
                    aria-label={`${participantLabel(p.displayName, p.participantId, participants)} を退出させる`}
                    title="退出させる"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </MiniButton>
                )}
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  return (
    <div className="w-full">
      {/* 退出の確認。対象者の名前と、招待から再参加できることを明示する（FR-075）。
          共有ルームでは他の参加者の画面にも反映されることを添える（FR-076）。 */}
      {pendingRemoval && onRemove && (
        <ConfirmDialog
          open={true}
          title={`${participantLabel(pendingRemoval.displayName, pendingRemoval.participantId, participants)} さんを退出させますか？`}
          description={`一覧とドライバーの輪から外れます。招待から再参加できます。${
            isShared ? "（他の参加者全員の画面にも反映されます）" : ""
          }`}
          confirmLabel="退出させる"
          confirmIntent="danger"
          onConfirm={() => {
            onRemove(pendingRemoval.participantId);
            setPendingRemoval(null);
          }}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
      <SectionHeader
        icon={Users}
        color="text-[var(--signal)]"
        title="参加者"
        right={
          canManage ? (
            <GhostButton onClick={() => setShowProxyInput((v) => !v)} aria-label="代理参加者を追加" className="text-sm">
              代理追加
            </GhostButton>
          ) : undefined
        }
      />

      {/* 代理追加フォーム */}
      {showProxyInput && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={proxyName}
            onChange={(e) => setProxyName(e.target.value)}
            placeholder="Web 非接続のメンバー名"
            aria-label="代理参加者の名前"
            maxLength={MAX_DISPLAY_NAME}
            className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
          />
          <PrimaryButton onClick={handleAddProxy} className="px-4 py-2 text-sm">追加</PrimaryButton>
        </div>
      )}

      {/* ドライバーセクション（rotation 内）: 現ドライバー → rotation 順 */}
      {drivers.length > 0 && (
        <>
          <p className="mt-2 mb-1 text-xs font-semibold text-[var(--bone-subtle)] uppercase tracking-wide">ドライバー</p>
          <ul aria-label="ドライバー一覧" className={listClass}>
            {drivers.map(renderRow)}
          </ul>
        </>
      )}

      {/* 見学セクション（rotation 外）: 元の相対順 */}
      {watchers.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-xs font-semibold text-[var(--bone-subtle)] uppercase tracking-wide">見学</p>
          <ul aria-label="見学一覧" className={listClass}>
            {watchers.map(renderRow)}
          </ul>
        </>
      )}
    </div>
  );
}
