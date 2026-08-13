/**
 * クライアント IP から、レート制限の鍵を導出する。
 *
 * **生の IP アドレスはこのモジュールの外へ出さない**（`docs/adr/0012` D3）。
 * 呼び出し側が受け取るのは HMAC 済みの不透明な文字列だけである。
 *
 * ## なぜ最後の要素を採るのか
 *
 * Caddy 2.11.4 は `X-Forwarded-For` をクライアントの実 IP で**上書き**する（実測）。
 * 一方、信頼するプロキシを設定した構成では**追記**になる。どちらの場合も
 * 「最後の要素 = リバースプロキシが見た直接のピア」であり、最後だけを採れば
 * Caddy の版・設定に依存しない。`X-Real-IP` は偽装が素通しするので使わない。
 *
 * ## なぜ IPv6 を /64 へ丸めるのか
 *
 * VPS・ISP は 1 ホストに /64 を割り当てるのが標準で、アドレス単位で数えると
 * 送信元を回すだけで制限が消える。/64 は IPv4 の NAT 1 個と同じ粒度にあたる。
 *
 * ## なぜ正規化を数値で行うのか
 *
 * `2001:db8::1` / `2001:DB8::1` / `2001:0db8::1` / `2001:db8:0:0::1` は
 * すべて同じアドレスで、すべて `net.isIP` を通る（実測）。文字列のまま鍵にすると
 * 表記を変えるだけで別の鍵になり、丸めの意味が消える。
 */
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** IPv6 のグループ数（16 ビット × 8 = 128 ビット）。 */
const IPV6_GROUPS = 8;
/** /64 に相当するグループ数。 */
const IPV6_PREFIX_GROUPS = 4;

/**
 * `:` 区切りの断片を 16 進グループの配列にする。
 * 埋め込み IPv4（`::ffff:192.0.2.1` の `192.0.2.1`）は 2 グループぶんへ展開する。
 */
function toGroups(part: string): string[] {
  if (part === "") return [];
  const groups: string[] = [];
  for (const raw of part.split(":")) {
    if (raw.includes(".")) {
      const [a = 0, b = 0, c = 0, d = 0] = raw.split(".").map(Number);
      groups.push((((a << 8) | b) >>> 0).toString(16), (((c << 8) | d) >>> 0).toString(16));
    } else {
      groups.push(raw);
    }
  }
  return groups;
}

/** `net.isIP` が 6 と判定した文字列から、上位 64 ビットの正規形を作る。 */
function ipv6Prefix(address: string): string {
  const [head = "", tail = ""] = address.split("::");
  const headGroups = toGroups(head);
  const tailGroups = address.includes("::") ? toGroups(tail) : [];
  const missing = address.includes("::")
    ? IPV6_GROUPS - headGroups.length - tailGroups.length
    : 0;
  const expanded = [
    ...headGroups,
    ...new Array<string>(Math.max(0, missing)).fill("0"),
    ...tailGroups,
  ];
  return expanded
    .slice(0, IPV6_PREFIX_GROUPS)
    .map((group) => (parseInt(group, 16) || 0).toString(16))
    .join(":");
}

/**
 * `X-Forwarded-For` の値から、鍵の材料になる正規形を作る。
 * 特定できなければ `null` を返す。
 *
 * 戻り値は `v4:` / `v6:` の接頭辞を持つ。IPv4 の `0.0.0.0` と IPv6 の `::` が
 * 同じ鍵に落ちないようにするため。
 */
export function normalizeClientAddress(forwardedFor: string | undefined): string | null {
  if (forwardedFor === undefined) return null;
  const parts = forwardedFor.split(",");
  const last = parts[parts.length - 1] ?? "";
  // 角括弧（`[::1]`）とゾーン ID（`%eth0`）は net.isIP が受け付けないので先に剥がす。
  const address = last.trim().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const family = isIP(address);
  if (family === 4) return `v4:${address}`;
  if (family === 6) return `v6:${ipv6Prefix(address)}`;
  return null;
}

/**
 * ソルトを固定した鍵の導出関数を作る。
 *
 * ソルトはプロセス起動時に 1 度だけ生成し、env にも設定にも置かない
 * （`docs/adr/0012` D3）。再起動をまたぐと鍵が変わるが、揮発インメモリ設計
 * （憲法 原則 III）と整合するので受け入れる。
 */
export function createClientKeyDeriver(
  salt: Uint8Array,
): (forwardedFor: string | undefined) => string | null {
  return (forwardedFor) => {
    const normalized = normalizeClientAddress(forwardedFor);
    if (normalized === null) return null;
    return createHmac("sha256", salt).update(normalized).digest("base64url");
  };
}
