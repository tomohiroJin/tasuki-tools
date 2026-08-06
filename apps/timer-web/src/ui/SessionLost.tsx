/**
 * セッション喪失の画面（#76 F-4）
 *
 * 本番は揮発インメモリで、同期サーバーが再起動するとルームが全て消える（FR-007/059）。
 * これまでは StatusStrip が「セッション喪失」に変わるだけで、タイマーも
 * 一時停止・スキップ・完成! もそのまま押せる状態で残った。押しても何も起きず、
 * 説明バナーは再接続のたびに `onConnected` で消え、やり直す導線も無かった。
 *
 * 効かない操作を残さず、何が起きたか・端末の記録は無事であることを画面として示す。
 */

import React from "react";
import { CloudOff, Sparkles, History as HistoryIcon } from "lucide-react";
import { Card, PrimaryButton, GhostButton } from "./primitives.js";

interface SessionLostProps {
  /** 消えたルームのコード（分かる場合のみ表示する） */
  code?: string | undefined;
  /** 入口へ戻って新しいルームを作る */
  onNewSession: () => void;
  /** 端末に残った完了記録を見る */
  onShowHistory: () => void;
}

export function SessionLost({ code, onNewSession, onShowHistory }: SessionLostProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-8">
      <header className="text-center">
        <p className="instrument-label mb-2 text-[var(--urgent)]">Session Lost</p>
        <h1 className="brand-title font-black text-[var(--bone)]">
          セッションが見つかりません
        </h1>
        {code && (
          <p className="text-[var(--bone-muted)] mt-2 text-sm">
            ルーム <span className="tabular font-bold">{code}</span>
          </p>
        )}
      </header>

      <Card>
        <p className="flex items-start gap-3 text-sm text-[var(--bone-muted)]">
          <CloudOff className="mt-0.5 w-5 h-5 shrink-0 text-[var(--urgent)]" aria-hidden="true" />
          <span>
            同期サーバーが再起動したか、ルームが終了しました。ルームの状態はサーバー上にのみ
            置かれているため、元のセッションには戻れません。
            <br />
            <strong className="text-[var(--bone)]">
              この端末に保存された完了の記録は保持されています。
            </strong>
          </span>
        </p>

        <PrimaryButton onClick={onNewSession} className="w-full mt-5 text-lg py-3">
          <span className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
            新しいセッションを始める
          </span>
        </PrimaryButton>
        <GhostButton onClick={onShowHistory} className="w-full mt-3">
          <span className="flex items-center justify-center gap-2">
            <HistoryIcon className="w-4 h-4" aria-hidden="true" />
            記録を見る
          </span>
        </GhostButton>
      </Card>
    </div>
  );
}
