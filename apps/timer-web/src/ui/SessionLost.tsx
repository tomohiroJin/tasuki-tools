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
  /**
   * 玄関へ戻って新しいルームを作る（#95 S5c・R9）。
   *
   * **消えたルームの選択画面へは送らない。** ハブはそこで存在しないルームの
   * 参加画面を出し、名乗っても必ず失敗する。
   */
  onNewSession: () => void;
  /** 端末に残った完了記録を見る（`?view=history` で開く） */
  onShowHistory: () => void;
}

export function SessionLost({ code, onNewSession, onShowHistory }: SessionLostProps) {
  return (
    <div className="session-lost">
      <header className="session-lost-header">
        <p className="instrument-label session-lost-label">Session Lost</p>
        <h1 className="brand-title session-lost-title">
          セッションが見つかりません
        </h1>
        {code && (
          <p className="session-lost-code">
            ルーム <span className="tabular session-lost-code-value">{code}</span>
          </p>
        )}
      </header>

      <Card>
        <p className="session-lost-notice">
          <CloudOff className="session-lost-notice-icon" aria-hidden="true" />
          <span>
            同期サーバーが再起動したか、ルームが終了しました。ルームの状態はサーバー上にのみ
            置かれているため、元のセッションには戻れません。
            <br />
            <strong className="session-lost-emphasis">
              この端末に保存された完了の記録は保持されています。
            </strong>
          </span>
        </p>

        <PrimaryButton onClick={onNewSession} className="session-lost-new">
          <span className="session-lost-button-label">
            <Sparkles className="session-lost-button-icon-lg" aria-hidden="true" />
            新しいセッションを始める
          </span>
        </PrimaryButton>
        <GhostButton onClick={onShowHistory} className="session-lost-history">
          <span className="session-lost-button-label">
            <HistoryIcon className="session-lost-button-icon" aria-hidden="true" />
            記録を見る
          </span>
        </GhostButton>
      </Card>
    </div>
  );
}
