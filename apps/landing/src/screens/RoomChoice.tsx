import type { RosterRoom } from '@tasuki/room-core';
import { useId, useState } from 'react';
import { useCopyText, useInviteQr } from '@tasuki/invite-ui';
import { TOOLS } from '../tools.js';
import { ToolMark } from '../ToolMark.js';
import { HistoryLink } from './HistoryLink.js';

import { labelFor } from '../hub/participant-label.js';

/**
 * 選択画面（#95 S5a・R1）。ルーム名を見出しに置き、道具・参加者・仲間を招くの 3 つを
 * 見出しつきの領域に分けて並べる（#270）。
 *
 * **札の意匠は変えない**（設計正本 §5.7）。既存の {@link TOOLS} をそのまま使い、
 * `href` に `?room=CODE` を付けるだけである。新しいツールを足すときに触るのは、
 * 今と同じく `src/tools.ts` の 1 ファイルになる。
 */
export interface RoomChoiceProps {
  readonly code: string;
  /** 参加用 URL（組み立ては同期フックが持つ。画面は受け取って描くだけ）。 */
  readonly inviteUrl: string;
  readonly roster: RosterRoom | null;
  readonly connection: 'online' | 'reconnecting';
  /**
   * いまのお題のタイトル（無ければ null）。**説明は受け取らない**
   * （玄関はタイトルだけを出す・spec §5.5）。
   */
  readonly topicTitle: string | null;
}

export function RoomChoice({ code, inviteUrl, roster, connection, topicTitle }: RoomChoiceProps) {
  const participants = roster?.participants ?? [];
  const copy = useCopyText(inviteUrl);
  const [showQr, setShowQr] = useState(false);
  const qr = useInviteQr(inviteUrl, showQr);
  const qrId = useId();

  return (
    <main className="page landing landing-choice">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <div className="hub-room-summary">
          <span className="hub-label">ルーム</span>
          <p className="hub-room-code">{code}</p>
        </div>
        {connection === 'reconnecting' && (
          <p className="hub-notice" role="status">
            接続が切れました。再接続しています…
          </p>
        )}
      </header>

      <div className="hub-workspace">
        <section className="hub-tools" aria-labelledby="hub-tools-heading">
          <h2 className="hub-section-title" id="hub-tools-heading">道具を選ぶ</h2>
          <ul className="hand" aria-label="ツール">
            {TOOLS.map((tool) => (
              <li key={tool.href}>
                <a
                  className="card tool-card"
                  href={`${tool.href}?room=${encodeURIComponent(code)}`}
                  data-label={tool.pip}
                >
                  <ToolMark kind={tool.mark} />
                  <span className="tool-name">{tool.name}</span>
                  <span className="tool-summary">{tool.summary}</span>
                </a>
              </li>
            ))}
          </ul>
          {topicTitle !== null && (
            <p className="hub-topic">
              <span className="hub-label">いまのお題</span>
              <span className="hub-topic-title">{topicTitle}</span>
            </p>
          )}
        </section>
        <div className="hub-room">
          <section className="hub-panel" aria-labelledby="hub-roster-heading">
            <h2 className="hub-heading" id="hub-roster-heading">参加者</h2>
            <ul className="hub-roster" aria-label="参加者">
              {participants.map((p) => (
                <li key={p.participantId} className="hub-participant" data-presence={p.presence}>
                  <span className="hub-participant-name">{labelFor(p, participants)}</span>
                  {p.presence === 'offline' && <span className="hub-presence">切断中</span>}
                  {p.tools.length > 0 && (
                    <span className="hub-participant-where">{whereLabel(p.tools)}</span>
                  )}
                </li>
              ))}
            </ul>

          </section>
          <section className="hub-panel" aria-labelledby="hub-invite-heading">
            <h2 className="hub-heading" id="hub-invite-heading">仲間を招く</h2>
            <input className="hub-invite" readOnly value={inviteUrl} aria-label="参加用 URL" />
            <div className="hub-invite-actions">
              <button type="button" onClick={copy.copy}>参加用 URL をコピー</button>
              <button type="button" aria-expanded={showQr} aria-controls={qrId} onClick={() => setShowQr(!showQr)}>
                {showQr ? 'QR コードを閉じる' : 'QR コードを表示'}
              </button>
            </div>
            <p className="hub-invite-status" role="status">
              {copy.state === 'done' && 'コピーしました。'}
              {copy.state === 'failed' && 'コピーできません。URL を選んでコピーしてください。'}
            </p>
            <div id={qrId} hidden={!showQr} className="hub-invite-qr">
              {qr.dataUrl && <img src={qr.dataUrl} width={200} height={200} alt="参加用 URL の QR コード" />}
              {showQr && !qr.dataUrl && (
                <p role="status">{qr.failed ? 'QR コードを表示できません。URL を選んでコピーしてください。' : 'QR コードを準備しています…'}</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ルームに入ったままでも端末の記録は見られる（撤去した旧入口（timer の `Setup`）の性質を保つ）。
          戻り先を持たせて、見終わったら同じルームの選択画面へ戻れるようにする。 */}
      <HistoryLink roomCode={code} />
    </main>
  );
}

/**
 * その人がいまどのツールに居るかの表示。
 *
 * **綴りの正本はサーバー**（`apps/tasuki-sync/src/application/tool-id.ts`）で、
 * 見せ方の正本は `src/tools.ts` である（設計正本 §7 の既知の地雷 4）。
 * **名前はツール ID で引く**（並び順で引くと、札を足したときにずれる・#91 PR 2）。
 * 知らない綴りはそのまま出す —— 隠すと、増えたツールが黙って消える。
 */
function whereLabel(tools: readonly string[]): string {
  const names = tools.map((id) => TOOLS.find((tool) => tool.id === id)?.name ?? id);
  return `${names.join(' / ')} にいます`;
}
