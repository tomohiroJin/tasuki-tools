/**
 * 招待パネル（ルームコード・コピー・QR・参加URLコピー）。
 * Lobby「ルーム」タブと Session「ルーム」タブで再利用する（v2.2 Epic1・#1）。
 */
import React from "react";
import { useCopyText, useInviteQr } from "@tasuki/invite-ui";
import { Copy, Check } from "lucide-react";
import { Card, GhostButton } from "../primitives.js";

/**
 * `roomUrl` は**同期フックが組み立てたものを受け取る**（#95 S5b）。
 * 画面（`.tsx`）は同期クライアントを直接 import しない —— 層の対応表
 * （`docs/guides/architecture.md`）と `docs/adr/0015`。
 */
export function InvitePanel({ code, roomUrl }: { code: string; roomUrl: string }) {
  const codeCopy = useCopyText(code);
  const urlCopy = useCopyText(roomUrl);
  const qr = useInviteQr(roomUrl, true);

  return (
    <Card className="invite-panel">
      <p className="instrument-label invite-panel-label">ルームコード</p>
      <div className="invite-panel-code-row">
        <span className="tabular invite-panel-code">
          {code}
        </span>
        <GhostButton onClick={codeCopy.copy} aria-label="ルームコードをコピー">
          <span className="invite-panel-button-label">
            {codeCopy.state === 'done' ? <Check className="invite-panel-icon invite-panel-icon-done" aria-hidden="true" /> : <Copy className="invite-panel-icon" aria-hidden="true" />}
            {codeCopy.state === 'done' ? "コピーしました" : "コピー"}
          </span>
        </GhostButton>
      </div>
      {qr.dataUrl && (
        <img
          src={qr.dataUrl}
          alt={`ルーム ${code} の QR コード`}
          /* 地は白のまま。QR は明暗のコントラストで読むため、卓の色に寄せると
             読み取り率が落ちる（装飾ではなく機能上の要請）。 */
          className="invite-panel-qr"
        />
      )}
      {/* コピーの方法がどちらも使えない環境でも、手で選んで共有できる（#76 F-1）。 */}
      <p className="tabular invite-panel-url">
        {roomUrl}
      </p>
      <div className="invite-panel-url-action">
        <GhostButton onClick={urlCopy.copy}>
          <span className="invite-panel-button-label"><Copy className="invite-panel-icon" aria-hidden="true" /> 参加 URL をコピー</span>
        </GhostButton>
      </div>
      <p role="status" className="invite-panel-status">
        {urlCopy.state === 'done' && '参加 URL をコピーしました。'}
        {(urlCopy.state === 'failed' || codeCopy.state === 'failed') && 'コピーできません。URL またはルームコードを選んでコピーしてください。'}
      </p>
    </Card>
  );
}
