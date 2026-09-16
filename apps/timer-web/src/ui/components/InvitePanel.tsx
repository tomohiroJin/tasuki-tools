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
    <Card className="text-center">
      <p className="instrument-label mb-2">ルームコード</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="tabular text-4xl md:text-5xl font-black tracking-wider break-all text-[var(--signal)]">
          {code}
        </span>
        <GhostButton onClick={codeCopy.copy} aria-label="ルームコードをコピー">
          <span className="flex items-center gap-1 text-sm">
            {codeCopy.state === 'done' ? <Check className="w-4 h-4 text-[var(--ok)]" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
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
          className="h-52 w-52 rounded-xl bg-white p-2.5 mx-auto mt-4"
        />
      )}
      {/* コピーの方法がどちらも使えない環境でも、手で選んで共有できる（#76 F-1）。 */}
      <p className="tabular mt-4 break-all text-xs text-[var(--bone-muted)] select-all">
        {roomUrl}
      </p>
      <div className="mt-2">
        <GhostButton onClick={urlCopy.copy}>
          <span className="flex items-center gap-1 text-sm"><Copy className="w-4 h-4" aria-hidden="true" /> 参加 URL をコピー</span>
        </GhostButton>
      </div>
      <p role="status" className="mt-2 text-xs text-[var(--bone-muted)]">
        {urlCopy.state === 'done' && '参加 URL をコピーしました。'}
        {(urlCopy.state === 'failed' || codeCopy.state === 'failed') && 'コピーできません。URL またはルームコードを選んでコピーしてください。'}
      </p>
    </Card>
  );
}
