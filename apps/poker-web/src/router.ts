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
 * 素の文字列操作ではなく `URLSearchParams` に復号を任せる。パスから取り出す側も同じ理由で
 * {@link decodeRoomCode} を通す（`pathname` は符号化されて渡ってくる）。
 */
export type Route = { name: 'room'; roomId: string } | { name: 'redirect'; to: string };

const BASE = '/poker';

export function parseRoute(pathname: string, search = ''): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : null;
  if (rest === null) return { name: 'redirect', to: '/' };

  // **パスのルームを優先する。** 旧リンクを開いたまま `?room=` が残っている状況で、
  // 開こうとしたルームを勝手に乗り換えない。
  const match = /^\/room\/([^/]+)\/?$/.exec(rest);
  if (match?.[1]) return { name: 'redirect', to: hubPathFor(decodeRoomCode(match[1])) };

  if (rest === '' || rest === '/') {
    // 空のコードでは入室させない（`?room=` だけが付いた URL も行き先が無い）。
    const code = new URLSearchParams(search).get('room');
    return code ? { name: 'room', roomId: code } : { name: 'redirect', to: '/' };
  }

  return { name: 'redirect', to: '/' };
}

/**
 * パスから取り出したルームコードを復号する。
 *
 * **`location.pathname` は百分率符号化されて返る**（実測:
 * `new URL('http://a/poker/room/朝会モブ-a1b2').pathname` は
 * `/poker/room/%E6%9C%9D%E4%BC%9A%E3%83%A2%E3%83%96-a1b2`）。復号せずに
 * {@link hubPathFor} へ渡すと `%` がもう一度逃げ、**玄関が読むコードが別物になる** ——
 * 「コードを落とさない」つもりで落としているのと同じである。
 *
 * **壊れた `%` 列（`%zz` 等）で throw させない。** 手で書かれた URL からはいくらでも来る。
 * URL 操作の例外は隔離しておく作法（`apps/tasuki-sync/src/adapters/ws-adapter.ts` の
 * `handleFetch` が同じ理由で本体ごと囲っている）に倣い、**復号できなければ素のまま運ぶ**。
 * 存在しないコードとして玄関で弾かれるだけで、画面がここで落ちるよりはるかによい。
 */
function decodeRoomCode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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
