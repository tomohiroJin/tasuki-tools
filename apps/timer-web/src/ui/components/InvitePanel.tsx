/**
 * 招待パネル（ルームコード・コピー・QR・参加URLコピー）。
 * Lobby「ルーム」タブと Session「ルーム」タブで再利用する（v2.2 Epic1・#1）。
 */
import React, { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Card, GhostButton } from "../primitives.js";
import { buildRoomUrl } from "../room-url.js";

export function InvitePanel({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const roomUrl = buildRoomUrl(window.location.origin, code);

  const copyText = async (text: string) => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 権限拒否等は無視 */
    }
  };

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(roomUrl, { width: 200 }))
      .then((url: string) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        /* QR 生成失敗は無視 */
      });
    return () => {
      cancelled = true;
    };
  }, [roomUrl]);

  return (
    <Card className="text-center">
      <p className="instrument-label mb-2">ルームコード</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="tabular text-4xl md:text-5xl font-black tracking-wider break-all text-[var(--signal)]">
          {code}
        </span>
        <GhostButton onClick={() => copyText(code)} aria-label="ルームコードをコピー">
          <span className="flex items-center gap-1 text-sm">
            {copied ? <Check className="w-4 h-4 text-[var(--ok)]" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
            {copied ? "コピーしました" : "コピー"}
          </span>
        </GhostButton>
      </div>
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt={`ルーム ${code} の QR コード`}
          /* 地は白のまま。QR は明暗のコントラストで読むため、卓の色に寄せると
             読み取り率が落ちる（装飾ではなく機能上の要請）。 */
          className="h-52 w-52 rounded-xl bg-white p-2.5 mx-auto mt-4"
        />
      )}
      {/* 参加 URL は画面にも出す。非セキュアオリジン（LAN の IP 等）では
          navigator.clipboard が無く、コピーボタンは黙って何もしない。
          URL が出ていなければ、その環境では誰も招待できない（#76 F-1）。 */}
      <p className="tabular mt-4 break-all text-xs text-[var(--bone-muted)] select-all">
        {roomUrl}
      </p>
      <div className="mt-2">
        <GhostButton onClick={() => copyText(roomUrl)}>
          <span className="flex items-center gap-1 text-sm"><Copy className="w-4 h-4" aria-hidden="true" /> 参加 URL をコピー</span>
        </GhostButton>
      </div>
    </Card>
  );
}
