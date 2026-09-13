// 自前の軽量ルーティング（research R5: 2 ルートに React Router は過剰）
export type Route = { name: 'top' } | { name: 'room'; roomId: string } | { name: 'not-found' };

const BASE = '/poker';

/**
 * URL からルートを決める。
 *
 * **`?room=CODE` も見る**（#95 S5b）。選択画面（ハブ）の札は `/poker/?room=CODE` を
 * 出すので、`pathname` だけを見ていると `{name:'top'}` に落ちてクエリが捨てられる ——
 * timer は元から `?room=` を解するため、**poker だけが静かに落ちていた**。
 *
 * **パスのルームを優先する。** 旧リンク（`/poker/room/<id>`）を開いたまま `?room=` が
 * 残っている状況で、画面に出ているルームを勝手に乗り換えない。
 *
 * ルームコードには**ルーム名がそのまま入り、日本語も許される**（例: `朝会モブ-a1b2`）ので、
 * 素の文字列操作ではなく `URLSearchParams` に復号を任せる。
 */
export function parseRoute(pathname: string, search = ''): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
  if (rest === null) return { name: 'not-found' };

  const match = /^\/room\/([^/]+)\/?$/.exec(rest);
  if (match?.[1]) return { name: 'room', roomId: match[1] };

  if (rest === '' || rest === '/') {
    // 空のコードでは入室させない（`?room=` だけが付いた URL は入口のまま）。
    const code = new URLSearchParams(search).get('room');
    return code ? { name: 'room', roomId: code } : { name: 'top' };
  }

  return { name: 'not-found' };
}

export function roomPath(roomId: string): string {
  return `${BASE}/room/${roomId}`;
}

/** トップ画面のパス（招待 URL・戻りリンクの単一情報源） */
export function topPath(): string {
  return `${BASE}/`;
}

/** History API で遷移し、popstate 相当の再描画を促す */
export function navigate(path: string): void {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}
