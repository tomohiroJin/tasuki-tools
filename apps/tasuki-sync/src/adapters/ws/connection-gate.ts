/**
 * 入場の門（#368 Task 4。`ws-adapter.ts` から分けた）。
 *
 * `?tool=` の判定と、接続を受け入れるかの判定を**純粋な関数**として持つ。判定を実行する（close する・
 * ログを出す）のは `WsAdapter#handleOpen` である。守りの要（`docs/adr/0011`）なので、拒否ごとの
 * close コード・理由・ログの理由と判定の順番を `test/ws/connection-gate.test.ts` が表で固定する。
 */
import type { LogSafe } from "../../application/log/log-safe.js";
import { CONN_REJECT_REASONS } from "../../application/log/vocabulary.js";
import { TOOL_POKER, TOOL_ROULETTE, TOOL_TIMER, TOOL_TOPIC } from "../../application/tool-id.js";

/**
 * 接続層の 6 値の選択子。ツール識別子はそのうち 4 つと一致しているだけである
 * （`"hub"` / `"unknown"` に対応するツールは無い）。{@link protocolFromRequestUrl} の docstring を参照。
 */
export type Protocol = "timer" | "poker" | "topic" | "roulette" | "hub" | "unknown";

/**
 * 接続 URL が宣言するツール。**許可リストで判定する**（#95 S5c）。
 *
 * **入口は `/ws` の 1 本だけなので、経路ではツールを決められない**（S5b までは
 * パス自体が宣言だった。`/poker/ws` は poker、`/ws` はハブ、それ以外は timer）。
 * **wire には載せられない** —— メッセージ層はパーサ自体が別（`CommandSchema` /
 * `parseClientMessage` / `parseBoundaryMessage`）で、最初のフレームを読む前に
 * 層を決める必要があるためである。
 *
 * **許可リストに無い値は `"unknown"` にして接続を拒否する。** timer へもハブへも落とさない ——
 * 落とすと、綴りを間違えたクライアントが「繋がるのにコマンドが通らない」という
 * 静かな壊れ方をする（S5a の rewrite で実際に起きた型）。
 *
 * **綴りは `application/tool-id.ts` から取る**（#95 S5c・A-I1）。S5b までここが照合して
 * いたのは `/poker/ws` という**別の語彙**（経路）だったが、S5c でクエリへ移り、
 * `TOOL_TIMER` / `TOOL_POKER` と**同じ語彙**になった。しかも `TOOL_TIMER` は
 * `roster.tools`（`packages/room-core/src/wire.ts`）として wire にも載る。
 * リテラルを自前で持つと、次に綴りを変える人がここを取り残し、
 * **wire 互換を壊したことに気づけない**。
 *
 * **戻り値の型はリテラルのまま据え置く。** これは接続層の 5 値の選択子で、
 * ツール識別子はそのうち 3 つと一致しているだけである（`"hub"` / `"unknown"` に
 * 対応するツールは無い）。`typeof TOOL_TIMER` にして追従させると、綴りを変えたときに
 * 黙って通る —— リテラルで受けておくと**この関数で型検査が落ちる**ので、
 * `ConnectionData.protocol` と wire の両方を見直す機会になる。
 */
const TOOL_QUERY_KEY = "tool";

export function protocolFromRequestUrl(url: URL): Protocol {
  const declared = url.searchParams.get(TOOL_QUERY_KEY);
  if (declared === null) return "hub";
  if (declared === TOOL_TIMER) return TOOL_TIMER;
  if (declared === TOOL_POKER) return TOOL_POKER;
  if (declared === TOOL_TOPIC) return TOOL_TOPIC;
  if (declared === TOOL_ROULETTE) return TOOL_ROULETTE;
  return "unknown";
}

/** 入場を判定するのに要る、接続ごとの値。 */
export interface AdmissionRequest {
  readonly protocol: Protocol;
  /** `X-Forwarded-For` から導いた鍵。特定できなければ null。 */
  readonly clientKey: string | null;
  /** `Origin` ヘッダ（無ければ空文字）。 */
  readonly origin: string;
}

/** 入場の設定（`WsAdapterOptions` の同名の項目）。 */
export interface AdmissionPolicy {
  /** true のとき、クライアント鍵を導けなかった接続を拒否する（本番の fail-closed）。 */
  readonly requireClientAddress?: boolean | undefined;
  /** 空なら Origin を検めない（開発）。 */
  readonly allowedOrigins: readonly string[];
  /** 同時接続数の上限。無ければ検めない。 */
  readonly maxConnections?: number | undefined;
}

/**
 * 判定の結果。拒否は close コード・理由の文・ログの理由（ログを出さない拒否は null）を持つ。
 * ログの理由は列挙値だけ（P-2）。`?tool=` の値・生の IP・Origin の値は載せない（ADR 0012 D3）。
 */
export type Admission =
  | { readonly kind: "accept" }
  | { readonly kind: "reject"; readonly code: 1008 | 1013; readonly reason: string; readonly logReason: LogSafe | null };

/**
 * 接続を受け入れるかを判定する。**順番は 知らないツール → クライアント鍵 → Origin → 接続数**。
 *
 * - 知らないツール: 受け入れると「繋がるのにコマンドが通らない」静かな壊れ方になるので、理由つきで閉じる
 * - クライアント鍵の検査は Origin より前に置く。**どちらも 1008 なので、後ろに置くと「直結が拒否される」
 *   ことを確かめるテストが Origin 拒否を見ているだけ、という空振りになる**
 * - 同時接続数の上限（DoS 緩和）。超過は 1013（Try Again Later）で閉じ、ログは出さない
 *
 * `connectionCount` は、受理済みの接続の数（この接続を含まない）。
 */
export function admit(request: AdmissionRequest, policy: AdmissionPolicy, connectionCount: number): Admission {
  if (request.protocol === "unknown") {
    return { kind: "reject", code: 1008, reason: "Unknown tool", logReason: CONN_REJECT_REASONS.tool };
  }
  if (policy.requireClientAddress === true && request.clientKey === null) {
    return { kind: "reject", code: 1008, reason: "Client address required", logReason: CONN_REJECT_REASONS.clientAddress };
  }
  if (policy.allowedOrigins.length > 0 && !policy.allowedOrigins.includes(request.origin)) {
    return { kind: "reject", code: 1008, reason: "Origin not allowed", logReason: CONN_REJECT_REASONS.origin };
  }
  if (policy.maxConnections !== undefined && connectionCount >= policy.maxConnections) {
    return { kind: "reject", code: 1013, reason: "Server connection limit reached", logReason: null };
  }
  return { kind: "accept" };
}
