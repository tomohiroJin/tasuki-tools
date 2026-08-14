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
 *
 * ## なぜ IPv4 射影アドレスを v4: 名前空間へ落とすのか（F1）
 *
 * IPv4 射影アドレス（`::ffff:0:0/96`。例: `::ffff:203.0.113.7`）は上位 96 ビットが
 * 固定で、IPv4 部は必ず下位 32 ビットに来る。単純に上位 4 グループ（/64）だけを
 * 見ると、この固定部分しか残らず **全世界の IPv4 射影クライアントが
 * `v6:0:0:0:0` という同一の鍵を共有してしまう**（実測で確認済み）。
 * そのため `net.isIP` が 6 と判定した後、8 グループへ完全展開してから
 * 射影レンジかどうかを数値で判定し、射影であれば下位 32 ビットを IPv4 の
 * 点付き 10 進へ復元して `v4:` 名前空間へ落とす。`::ffff:203.0.113.7` と
 * `203.0.113.7` は同一クライアントなので、同一の鍵になるのが正しい。
 *
 * 射影レンジ以外の `::/96`（`::1`・`::`・非推奨の IPv4 互換アドレス）は
 * 意図して `v6:0:0:0:0` のままにする。これらは実 IP を名乗る経路（Caddy 越し
 * の `X-Forwarded-For`）には現れないアドレスなので、まとまることが実害にならない。
 */
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** IPv6 のグループ数（16 ビット × 8 = 128 ビット）。 */
const IPV6_GROUPS = 8;
/** /64 に相当するグループ数。 */
const IPV6_PREFIX_GROUPS = 4;
/** IPv4 射影アドレス（::ffff:0:0/96）の上位 6 グループ（96 ビット）の固定値。 */
const IPV4_MAPPED_PREFIX_GROUPS = [0, 0, 0, 0, 0, 0xffff];
/** 鍵に使うソルトの最小バイト数（HMAC-SHA256 の出力長と揃える。F5）。 */
const SALT_MIN_BYTES = 32;

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

/**
 * `net.isIP` が 6 と判定した文字列を、8 グループすべての数値配列に展開する。
 * /64 への丸めと IPv4 射影アドレスの判定は、どちらもこの展開結果を土台にする
 * （F1: /64 だけを見ると射影アドレスの IPv4 部が丸めで消えるため、判定には
 * 8 グループ全体が要る）。
 */
function expandIPv6Groups(address: string): number[] {
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
  return expanded.slice(0, IPV6_GROUPS).map((group) => parseInt(group, 16) || 0);
}

/** 展開済みの 8 グループから、上位 64 ビット（/64）の正規形を作る。 */
function ipv6PrefixFromGroups(groups: number[]): string {
  return groups
    .slice(0, IPV6_PREFIX_GROUPS)
    .map((group) => group.toString(16))
    .join(":");
}

/**
 * 展開済みの 8 グループが IPv4 射影アドレス（`::ffff:0:0/96`）なら、
 * 下位 32 ビットを復元した IPv4 の点付き 10 進を返す。射影でなければ `null`。
 */
function ipv4MappedAddress(groups: number[]): string | null {
  const isMapped = IPV4_MAPPED_PREFIX_GROUPS.every(
    (expected, index) => groups[index] === expected,
  );
  if (!isMapped) return null;
  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  const a = (high >> 8) & 0xff;
  const b = high & 0xff;
  const c = (low >> 8) & 0xff;
  const d = low & 0xff;
  return `${a}.${b}.${c}.${d}`;
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
  if (family === 6) {
    const groups = expandIPv6Groups(address);
    const mapped = ipv4MappedAddress(groups);
    // IPv4 射影アドレスは v4: 名前空間へ落とす（F1）。それ以外は /64 に丸める。
    if (mapped !== null) return `v4:${mapped}`;
    return `v6:${ipv6PrefixFromGroups(groups)}`;
  }
  return null;
}

/**
 * ソルトを固定した鍵の導出関数を作る。
 *
 * ソルトはプロセス起動時に 1 度だけ生成し、env にも設定にも置かない
 * （`docs/adr/0012` D3）。再起動をまたぐと鍵が変わるが、揮発インメモリ設計
 * （憲法 原則 III）と整合するので受け入れる。
 *
 * ソルトが {@link SALT_MIN_BYTES} バイト未満なら throw する（F5）。
 * 正規形（`v4:<IP>` 等）は探索空間の狭い既知の文字列なので、ソルトが短い・
 * 空だと HMAC の鍵がほぼ無いのと同じになり、鍵から IP を総当たりで
 * 逆算できてしまう。**長さだけを検証し、中身（全ゼロ等）までは見ない**。
 * 弱いパターンは全ゼロに限らず列挙しきれないため、呼び出し側が
 * ドキュメントどおり `randomBytes(32)` を使っている前提に立つ。
 */
export function createClientKeyDeriver(
  salt: Uint8Array,
): (forwardedFor: string | undefined) => string | null {
  if (salt.length < SALT_MIN_BYTES) {
    // メッセージにソルトの中身は含めない。長さだけを伝える。
    throw new Error(`salt must be at least ${SALT_MIN_BYTES} bytes long (got ${salt.length})`);
  }
  return (forwardedFor) => {
    const normalized = normalizeClientAddress(forwardedFor);
    if (normalized === null) return null;
    return createHmac("sha256", salt).update(normalized).digest("base64url");
  };
}
