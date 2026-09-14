// 自前の軽量ルーティング（research R5: 2 ルートに React Router は過剰）

/**
 * URL からルートを決める（#95 S5c）。
 *
 * **旧入口（`TopPage`）を撤去したので、ルームコードを伴わない URL には行き先が無い。**
 * 玄関（`/`）へ送る。名乗りと合言葉の入力はそこに 1 つだけある。
 *
 * 旧リンク（`/poker/room/<id>`）も玄関へ送るが、**コードは落とさない** ——
 * 落とすと、ブックマークから来た人が入りたかったルームを失う。
 *
 * ルームコードには**ルーム名がそのまま入り、日本語も許される**（例: `朝会モブ-a1b2`）ので、
 * 素の文字列操作ではなく `URLSearchParams` に復号を任せる。
 */
export type Route = { name: 'room'; roomId: string } | { name: 'redirect'; to: string };

const BASE = '/poker';

export function parseRoute(pathname: string, search = ''): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
  if (rest === null) return { name: 'redirect', to: '/' };

  // **パスのルームを優先する。** 旧リンクを開いたまま `?room=` が残っている状況で、
  // 開こうとしたルームを勝手に乗り換えない。
  const match = /^\/room\/([^/]+)\/?$/.exec(rest);
  if (match?.[1]) return { name: 'redirect', to: hubPathFor(match[1]) };

  if (rest === '' || rest === '/') {
    // 空のコードでは入室させない（`?room=` だけが付いた URL も行き先が無い）。
    const code = new URLSearchParams(search).get('room');
    return code ? { name: 'room', roomId: code } : { name: 'redirect', to: '/' };
  }

  return { name: 'redirect', to: '/' };
}

/** 玄関のそのルーム（参加用 URL と同じ形・`docs/adr/0018` 決定 2）。 */
export function hubPathFor(roomId: string): string {
  return `/?room=${encodeURIComponent(roomId)}`;
}

/**
 * 別の URL へ**置き換えて**移動する（履歴に残らない）。
 *
 * **遷移はこのモジュールに閉じる**（画面へ `navigate` を prop で渡さない。入口が 2 つに
 * 増えると、どちらを通ったかで挙動が割れる）。テストは `vi.mock` で差し替える。
 *
 * `assign` ではなく `replace` を使う。行き場の無い URL を `assign` で送ると、
 * 戻るボタンがその URL へ戻り、そこからまた送り返される往復になる
 * （timer の `platform/location.ts` の `redirectTo` と同じ理由・#95 S5c・R9）。
 */
export function redirectTo(to: string): void {
  location.replace(to);
}
