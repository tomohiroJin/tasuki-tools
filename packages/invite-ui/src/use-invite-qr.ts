import { useEffect, useState } from 'react';

/** 共有 URL を端末内で QR にする。閉じている間はライブラリを読み込まない。 */
export function useInviteQr(url: string, enabled: boolean) {
  const [result, setResult] = useState<{ url: string; dataUrl: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    import('qrcode')
      .then((qr) => qr.toDataURL(url, { width: 200 }))
      .then((dataUrl) => {
        if (!cancelled) setResult({ url, dataUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ url, dataUrl: null, failed: true });
      });
    return () => { cancelled = true; };
  }, [url, enabled]);

  const current = enabled && result?.url === url ? result : null;
  return { dataUrl: current?.dataUrl ?? null, failed: current?.failed ?? false };
}
