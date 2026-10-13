/**
 * WebSocket に上がらない HTTP の応答（#368 Task 3。`ws-adapter.ts` から分けた）。
 *
 * 管理用の経路（`/status`・`/admin/rooms`）は組み立てが渡す `httpHandler` が答え、答えが無ければ
 * 426（Upgrade Required）を返す。**純粋な関数にしてある**（Bun のサーバーにも接続の表にも触らない）。
 * 例外の隔離（I-4）は呼び出し元（`WsAdapter#handleFetch`）が本体ごと持つ。
 */

/**
 * httpHandler（`handleAdminHttp`）へ渡すヘッダの許可リスト（N-4）。
 * 実際に読まれているのは `x-admin-token` だけ
 * （`apps/tasuki-sync/src/application/admin.ts` で確認済み）。
 * 増やすときは、そのヘッダが本当に読まれる先を確認してから足すこと。
 * `as const` にしてあるのは、受け取り側 `pickHeaders` の `readonly string[]`
 * に噛み合わせるため（Minor 4）。
 */
const ADMIN_HTTP_ALLOWED_HEADERS = ["x-admin-token"] as const;

/** `headers` のうち `allowed` に含まれるキーだけを取り出す（キーは小文字で比較）。 */
function pickHeaders(headers: Headers, allowed: readonly string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of allowed) {
    const value = headers.get(key);
    if (value !== null) picked[key] = value;
  }
  return picked;
}

/**
 * httpHandler に渡すリクエスト表現。
 * Node の IncomingMessage にも Bun の Request にも依存しない形にしてある。
 */
export interface HttpRequestInfo {
  method: string;
  /** クエリを含むパス（`/status?x=1`）。handleAdminHttp が `?` で切る。 */
  path: string;
  /** キーは小文字。**許可リスト（{@link ADMIN_HTTP_ALLOWED_HEADERS}）に絞ってある。** */
  headers: Record<string, string>;
}

/** 非 Upgrade の HTTP リクエストのフック。結果を返せばそれを応答、null なら 426。 */
export type HttpHandler = (req: HttpRequestInfo) => { status: number; contentType: string; body: string } | null;

/** `httpHandler` の答えを応答にする。答えが無ければ（フックが無いときも）426 を返す。 */
export function respondToPlainHttp(req: Request, url: URL, httpHandler: HttpHandler | undefined): Response {
  const handled = httpHandler?.({
    method: req.method,
    path: url.pathname + url.search,
    // 非 Upgrade の HTTP リクエストに限っても、生のヘッダを丸ごとは渡さない。
    // httpHandler（handleAdminHttp）が実際に読むのは `x-admin-token` だけ
    // （apps/tasuki-sync/src/application/admin.ts で確認済み）なので許可リストに絞る。
    // 「賢い検査より単純な検査・無状態＋許可リストへ倒す」の教訓に合わせる。
    headers: pickHeaders(req.headers, ADMIN_HTTP_ALLOWED_HEADERS),
  });
  if (handled) {
    return new Response(handled.body, {
      status: handled.status,
      headers: { "content-type": handled.contentType },
    });
  }
  return new Response("Upgrade Required", {
    status: 426,
    headers: { "content-type": "text/plain" },
  });
}
