// 自前の軽量ルーティング（research R5: 2 ルートに React Router は過剰）
export type Route = { name: 'top' } | { name: 'room'; roomId: string } | { name: 'not-found' };

const BASE = '/poker';

export function parseRoute(pathname: string): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
  if (rest === null) return { name: 'not-found' };
  if (rest === '' || rest === '/') return { name: 'top' };

  const match = /^\/room\/([^/]+)\/?$/.exec(rest);
  if (match?.[1]) return { name: 'room', roomId: match[1] };

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
