/**
 * テキストをファイルとして保存する（端末 I/O。#476 第 2 段 B9）。
 * Blob のリンクを 1 度だけ押し、すぐに解放する。CSV の中身と名前は track-core が作る（ここは渡されたものを保存するだけ）。
 */
export function downloadTextFile(fileName: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
