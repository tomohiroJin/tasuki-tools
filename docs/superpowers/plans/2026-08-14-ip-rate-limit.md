# IP 単位のレート制限（#103）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** timer-sync と poker-sync の入室失敗レート制限を、接続単位から IP 単位（IPv6 は /64）へ移し、再接続による回避を塞ぐ。

**Architecture:** 新パッケージ `@tasuki/rate-limit` に「クライアント鍵の導出」と「トークンバケツ」を置き、両 sync から使う。生 IP は adapter の変数スコープを出ず、`X-Forwarded-For` を HMAC-SHA256（起動ごとのランダムソルト）した値だけを持ち回る。本番では bind と `X-Forwarded-For` の両方を fail-closed で守る。

**Tech Stack:** TypeScript / Bun（両 sync の実行）/ vitest（新パッケージ・poker-sync）/ bun test（timer-sync）/ Playwright（E2E）/ Caddy 2.11.4（E2E の実断片経路）

**設計正本:** [`docs/superpowers/specs/2026-08-14-ip-rate-limit-design.md`](../specs/2026-08-14-ip-rate-limit-design.md)
**数値・閾値・実測値はすべて設計正本にある。この計画には転記しない**（同じ表を 2 か所に置くと必ず食い違う）。

## Global Constraints

- 作業は `/home/vscode/tasuki-work`（overlay）で行う。`/workspaces/claym/local/Tasuki` では行わない
- コミットメッセージは Conventional Commits ＋ 日本語（`docs/adr/0003`・`.claude/rules/git-workflow.md`）
- 新しい依存は追加しない。`node:crypto` と `node:net` のみ使う
- 生の IP アドレスを変数スコープの外へ持ち出さない（`docs/adr/0012` D3）
- ログ・snapshot・永続化へ IP（生・ハッシュとも）を出さない（`docs/adr/0012` D3）
- 秘密・資格情報をログへ出さない。ログは `apps/timer-sync/src/application/log/` のロガ経路を通す（`docs/adr/0012` D1）
- 変異検査は作業ツリーが clean でないと動かない。回す前にコミットする
- `node scripts/check-links.mjs` は `git ls-files` を見る。新規ファイルは `git add` してから走らせる

---

## Task 1: 実断片経路で `X-Forwarded-For` が届くことを実測する

**なぜ最初か:** 設計全体がこの前提に乗っている。手書きの Caddyfile では実測済みだが、リポジトリの実断片（`handle` ＋ `rewrite` ＋ `reverse_proxy`）では未測定（設計正本 §3.1 の「この実測の限界」）。ここが崩れると以降のタスクはすべて無駄になる。

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-ip-rate-limit-design.md`（§3.1 に実測結果を追記）

**Interfaces:**
- Consumes: なし
- Produces: なし（後続タスクは「XFF が届く」という事実に依存する）

- [ ] **Step 1: 計測用のバックエンドと Caddy 設定を作る**

```bash
mkdir -p /tmp/xff-live/apps
cat > /tmp/xff-live/echo.mjs <<'EOF'
import { createServer } from 'node:http';
const port = Number(process.argv[2]);
createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    url: req.url,
    xff: req.headers['x-forwarded-for'] ?? null,
    xrealip: req.headers['x-real-ip'] ?? null,
  }));
}).listen(port, '127.0.0.1');
EOF
# 実断片をそのままコピーする（1 バイトも変えない。e2e/harness/caddy.ts と同じ方針）
cp deploy/timer/caddy/10-timer-ws.conf /tmp/xff-live/apps/
cp deploy/poker/caddy/20-poker.conf   /tmp/xff-live/apps/
cat > /tmp/xff-live/Caddyfile <<'EOF'
{
	admin off
	auto_https off
}
:18099 {
	import /tmp/xff-live/apps/*.conf
}
EOF
```

- [ ] **Step 2: 起動して XFF を偽装した要求を投げる**

```bash
node /tmp/xff-live/echo.mjs 8787 &
node /tmp/xff-live/echo.mjs 3311 &
~/.cache/tasuki-e2e/caddy-2.11.4/caddy run --config /tmp/xff-live/Caddyfile --adapter caddyfile &
sleep 2
echo '--- timer /timer/ws ---'
curl -s -H 'X-Forwarded-For: 9.9.9.9' -H 'X-Real-IP: 9.9.9.9' http://127.0.0.1:18099/timer/ws
echo; echo '--- poker /poker/ws ---'
curl -s -H 'X-Forwarded-For: 9.9.9.9' http://127.0.0.1:18099/poker/ws
```

期待: どちらも `"xff":"127.0.0.1"`（偽装値 `9.9.9.9` が消える）。`"url":"/ws"`（`rewrite` が効いている）。
timer 側は `"xrealip":"9.9.9.9"`（素通し＝使ってはいけない証拠）。

**この期待が外れたら止まること。** 外れた場合は設計正本 §3.1 と D5 の見直しが要る。先へ進まない。

- [ ] **Step 3: 後始末（ポートを解放する）**

```bash
pkill -f 'caddy run --config /tmp/xff-live/Caddyfile'
pkill -f '/tmp/xff-live/echo.mjs'
sleep 1
ss -tlnp 2>/dev/null | grep -E ':(18099|8787|3311)' && echo '掴んだまま' || echo '解放済み'
```

- [ ] **Step 4: 設計正本へ実測結果を追記する**

`§3.1` の「**この実測の限界**」の段落を、実測できた事実に置き換える。実断片（`10-timer-ws.conf` /
`20-poker.conf`）を通しても上書きされること、`rewrite` を挟んでもパスが `/ws` になり XFF は変わらないことを、
実行した日付とともに書く。

- [ ] **Step 5: コミット**

```bash
git add docs/superpowers/specs/2026-08-14-ip-rate-limit-design.md
git commit -m "docs: 実断片経路で X-Forwarded-For が届くことを実測して設計正本へ反映する"
```

---

## Task 2: `@tasuki/rate-limit` — クライアント鍵の導出

> ⚠️ **このタスクは完了済み。以下に埋め込まれたコードはレビュー前の版であり、そのまま
> 書き写すと修正済みの欠陥が復活する。**実装の正本は `packages/rate-limit/` の
> コミット済みソース（`fcc8d8b..e2d4fab`）。敵対的レビューで直した点:
>
> 1. **IPv4 射影アドレス（`::ffff:0:0/96`）は `v4:` 名前空間へ落とす。**
>    下記 Step 3 のテスト `expect(normalizeClientAddress("::ffff:192.0.2.1")).toBe("v6:0:0:0:0")`
>    と Step 5 の実装は**誤り**（射影は上位 64 ビットが全ゼロなので、全 IPv4 が単一の鍵に
>    落ちていた）。設計正本 §5.2 の推論の誤りが根因で、訂正済み
> 2. **`index.ts` から `normalizeClientAddress` を公開しない**（生の IP が公開 API から出る。
>    `docs/adr/0012` D3）。下記 Step 1・Step 5 の `index.ts` は**誤り**
> 3. **`createClientKeyDeriver` は `salt` が `Uint8Array` で 32 バイト以上であることを検査する**
>    （長さだけの検査では `ArrayBuffer` が素通りし、鍵なし HMAC と同一の鍵になる）

**Files:**
- Create: `packages/rate-limit/package.json`
- Create: `packages/rate-limit/tsconfig.json`
- Create: `packages/rate-limit/vitest.config.ts`
- Create: `packages/rate-limit/src/index.ts`
- Create: `packages/rate-limit/src/client-key.ts`
- Create: `packages/rate-limit/tests/client-key.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `normalizeClientAddress(forwardedFor: string | undefined): string | null`
  - `createClientKeyDeriver(salt: Uint8Array): (forwardedFor: string | undefined) => string | null`
  - **戻り値が `null` は「クライアント IP を特定できなかった」。呼び出し側が代替の鍵を決める。**

- [ ] **Step 1: パッケージの骨組みを作る**

`packages/protocol` と同じ形にする（ソース直接公開・ビルドなし）。

`packages/rate-limit/package.json`:

```json
{
  "name": "@tasuki/rate-limit",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

`packages/rate-limit/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

`packages/rate-limit/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: workspace へ取り込む**

```bash
corepack pnpm install
```

期待: `packages/rate-limit` が workspace として認識される（`pnpm ls -r --depth -1` に `@tasuki/rate-limit` が出る）。

- [ ] **Step 3: 失敗するテストを書く**

`packages/rate-limit/tests/client-key.test.ts`:

```ts
/**
 * クライアント鍵の導出のテスト。
 *
 * ここで守りたいのは 1 点に尽きる。**同じ /64 に属するアドレスが、表記の違いで
 * 別の鍵になってはならない。** 別の鍵になると、攻撃者は表記を変えるだけで
 * レート制限を回避できる（設計正本 §3.2）。
 */
import { describe, it, expect } from "vitest";
import { normalizeClientAddress, createClientKeyDeriver } from "../src/index.js";

describe("normalizeClientAddress", () => {
  describe("X-Forwarded-For の刈り込み", () => {
    it("単一の値をそのまま採る", () => {
      expect(normalizeClientAddress("203.0.113.7")).toBe("v4:203.0.113.7");
    });

    it("複数あるときは最後の要素を採る（Caddy が追記する形でも実クライアントになる）", () => {
      expect(normalizeClientAddress("9.9.9.9, 203.0.113.7")).toBe("v4:203.0.113.7");
    });

    it("前後の空白を無視する", () => {
      expect(normalizeClientAddress("  203.0.113.7  ")).toBe("v4:203.0.113.7");
    });

    it("ヘッダが無ければ null", () => {
      expect(normalizeClientAddress(undefined)).toBeNull();
    });

    it("空文字なら null", () => {
      expect(normalizeClientAddress("")).toBeNull();
    });

    it("IP として読めない値なら null", () => {
      expect(normalizeClientAddress("unknown")).toBeNull();
    });

    it("先行ゼロつきの IPv4 は不正として null（表記を一意に保つ）", () => {
      expect(normalizeClientAddress("01.2.3.4")).toBeNull();
    });
  });

  describe("IPv6 は /64 へ丸める", () => {
    it("同義の表記はすべて同じ鍵になる", () => {
      const expected = "v6:2001:db8:0:0";
      for (const notation of [
        "2001:db8::1",
        "2001:DB8::1",
        "2001:0db8::1",
        "2001:db8:0:0::1",
        "2001:db8::0:1",
        "2001:0db8:0000:0000:0000:0000:0000:0001",
        "[2001:db8::1]",
        "2001:db8::1%eth0",
      ]) {
        expect(normalizeClientAddress(notation), notation).toBe(expected);
      }
    });

    it("下位 64 ビットが違っても同じ鍵になる", () => {
      expect(normalizeClientAddress("2001:db8::dead:beef")).toBe(
        normalizeClientAddress("2001:db8::1"),
      );
    });

    it("上位 64 ビットが違えば別の鍵になる", () => {
      expect(normalizeClientAddress("2001:db8:0:1::1")).not.toBe(
        normalizeClientAddress("2001:db8:0:2::1"),
      );
    });

    it("埋め込み IPv4 は下位 32 ビットなので /64 に影響しない", () => {
      expect(normalizeClientAddress("::ffff:192.0.2.1")).toBe("v6:0:0:0:0");
      expect(normalizeClientAddress("2001:db8::192.0.2.1")).toBe("v6:2001:db8:0:0");
    });

    it("全ゼロの短縮形も扱える", () => {
      expect(normalizeClientAddress("::")).toBe("v6:0:0:0:0");
    });
  });

  describe("IPv4 と IPv6 は名前空間が混ざらない", () => {
    it("接頭辞で区別される", () => {
      expect(normalizeClientAddress("0.0.0.0")).toBe("v4:0.0.0.0");
      expect(normalizeClientAddress("::")).toBe("v6:0:0:0:0");
    });
  });
});

describe("createClientKeyDeriver", () => {
  const salt = new Uint8Array(32).fill(7);

  it("同じ正規形からは同じ鍵が出る", () => {
    const derive = createClientKeyDeriver(salt);
    expect(derive("2001:db8::1")).toBe(derive("2001:DB8::99"));
  });

  it("違う正規形からは違う鍵が出る", () => {
    const derive = createClientKeyDeriver(salt);
    expect(derive("203.0.113.7")).not.toBe(derive("203.0.113.8"));
  });

  it("ソルトが違えば同じアドレスでも鍵が変わる", () => {
    const a = createClientKeyDeriver(new Uint8Array(32).fill(1));
    const b = createClientKeyDeriver(new Uint8Array(32).fill(2));
    expect(a("203.0.113.7")).not.toBe(b("203.0.113.7"));
  });

  it("鍵に生の IP が現れない", () => {
    const derive = createClientKeyDeriver(salt);
    const key = derive("203.0.113.7");
    expect(key).not.toBeNull();
    expect(key).not.toContain("203.0.113.7");
    expect(key).not.toContain("203");
  });

  it("アドレスを特定できなければ null を返す", () => {
    const derive = createClientKeyDeriver(salt);
    expect(derive(undefined)).toBeNull();
    expect(derive("unknown")).toBeNull();
  });
});
```

- [ ] **Step 4: テストが落ちることを確かめる**

```bash
cd packages/rate-limit && corepack pnpm vitest run
```

期待: FAIL（`../src/index.js` が解決できない、または `normalizeClientAddress is not a function`）

- [ ] **Step 5: 実装を書く**

`packages/rate-limit/src/client-key.ts`:

```ts
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
```

`packages/rate-limit/src/index.ts`:

```ts
export { normalizeClientAddress, createClientKeyDeriver } from "./client-key.js";
```

- [ ] **Step 6: テストが通ることを確かめる**

```bash
cd packages/rate-limit && corepack pnpm vitest run
```

期待: PASS（全件）

- [ ] **Step 7: 構造監査の基準が動いていないことを確かめる**

```bash
cd /home/vscode/tasuki-work && node scripts/audit-structure.mjs
```

期待: 判定が PASS のまま。**もし SC032 などの母数が変わって FAIL になったら、
基準値の更新が必要かどうかを判断してから進む**（黙って基準を書き換えない）。

- [ ] **Step 8: lint と typecheck**

```bash
cd packages/rate-limit && corepack pnpm lint && corepack pnpm typecheck
```

期待: いずれも 0 件

- [ ] **Step 9: コミット**

```bash
cd /home/vscode/tasuki-work
git add packages/rate-limit pnpm-lock.yaml
git commit -m "feat: クライアント鍵の導出を @tasuki/rate-limit に新設する

- X-Forwarded-For の最後の要素だけを採る（Caddy が上書きでも追記でも正しい）
- IPv6 は /64 へ丸める。表記ゆれを数値展開で吸収し、回避経路を塞ぐ
- 起動ごとのソルトで HMAC-SHA256 し、生の IP をモジュールの外へ出さない"
```

---

## Task 3: `@tasuki/rate-limit` — トークンバケツ

> ⚠️ **このタスクは完了済み。Step の `index.ts` は誤り** — `normalizeClientAddress` を
> 再エクスポートしてはならない（Task 2 の注記 2 を参照）。正本はコミット済みソース。

**Files:**
- Create: `packages/rate-limit/src/token-bucket.ts`
- Create: `packages/rate-limit/tests/token-bucket.test.ts`
- Modify: `packages/rate-limit/src/index.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface RateLimiter { shouldReject(key: string, now: number): boolean; consume(key: string, now: number): void; sweep(now: number): void; size(): number }`
  - `createTokenBucketLimiter(options: { capacity: number; refillPerSec: number; sweepThreshold?: number }): RateLimiter`
  - `DEFAULT_CAPACITY: number` / `DEFAULT_REFILL_PER_SEC: number`（閾値の正本）
  - **呼び出し側は「`shouldReject` → 照会 → `consume`」の順で使う**（設計正本 D3）

- [ ] **Step 1: 失敗するテストを書く**

`packages/rate-limit/tests/token-bucket.test.ts`:

```ts
/**
 * トークンバケツのテスト。
 *
 * `now` を引数で受けるので、実時間に一切依存しない（タイマーも sleep も使わない）。
 */
import { describe, it, expect } from "vitest";
import { createTokenBucketLimiter } from "../src/index.js";

const T0 = 1_000_000;

describe("createTokenBucketLimiter", () => {
  describe("バースト", () => {
    it("容量ぶんまでは連続して消費できる", () => {
      const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
      for (let i = 0; i < 3; i++) {
        expect(limiter.shouldReject("k", T0), `${i} 回目`).toBe(false);
        limiter.consume("k", T0);
      }
      expect(limiter.shouldReject("k", T0)).toBe(true);
    });

    it("鍵ごとに独立している", () => {
      const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
      limiter.consume("a", T0);
      expect(limiter.shouldReject("a", T0)).toBe(true);
      expect(limiter.shouldReject("b", T0)).toBe(false);
    });

    it("一度も使っていない鍵は拒否しない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
      expect(limiter.shouldReject("未使用", T0)).toBe(false);
    });
  });

  describe("補充", () => {
    it("1 秒で 1 個補充される", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.consume("k", T0);
      expect(limiter.shouldReject("k", T0)).toBe(true);
      expect(limiter.shouldReject("k", T0 + 999)).toBe(true);
      expect(limiter.shouldReject("k", T0 + 1_000)).toBe(false);
    });

    it("容量を超えて溜まらない", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.consume("k", T0);
      // 1 時間放置しても、消費できるのは容量ぶんだけ
      const later = T0 + 3_600_000;
      limiter.consume("k", later);
      limiter.consume("k", later);
      expect(limiter.shouldReject("k", later)).toBe(true);
    });

    it("持続レートは refillPerSec に収束する", () => {
      const limiter = createTokenBucketLimiter({ capacity: 5, refillPerSec: 1 });
      // まずバーストを使い切る
      for (let i = 0; i < 5; i++) limiter.consume("k", T0);
      // 以後は 1 秒に 1 件しか通らない
      let passed = 0;
      for (let s = 1; s <= 10; s++) {
        const now = T0 + s * 1_000;
        if (!limiter.shouldReject("k", now)) {
          limiter.consume("k", now);
          passed++;
        }
      }
      expect(passed).toBe(10);
    });
  });

  describe("掃除", () => {
    it("満タンに戻ったエントリを捨てる", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      expect(limiter.size()).toBe(1);
      limiter.sweep(T0 + 2_000);
      expect(limiter.size()).toBe(0);
    });

    it("まだ回復途中のエントリは残す", () => {
      const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
      limiter.consume("k", T0);
      limiter.consume("k", T0);
      limiter.sweep(T0 + 1_000);
      expect(limiter.size()).toBe(1);
    });

    it("しきい値を超えても、前回の掃除から間隔が空くまでは走らない", () => {
      // capacity 2 / refill 1 なので、掃除の最小間隔は 2 秒
      const limiter = createTokenBucketLimiter({
        capacity: 2,
        refillPerSec: 1,
        sweepThreshold: 2,
      });
      limiter.consume("a", T0);
      limiter.consume("b", T0);
      limiter.consume("c", T0); // ここで初回の掃除が走る（前回が無いので間隔条件は満たす）
      // 全部フレッシュなので何も消えない
      expect(limiter.size()).toBe(3);
      // 直後にもう 1 件消費しても、間隔が空いていないので掃除は走らない
      limiter.consume("d", T0 + 1);
      expect(limiter.size()).toBe(4);
      // 間隔が空けば走り、回復済みのものが消える
      limiter.consume("e", T0 + 10_000);
      expect(limiter.size()).toBe(1);
    });
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

```bash
cd packages/rate-limit && corepack pnpm vitest run tests/token-bucket.test.ts
```

期待: FAIL（`createTokenBucketLimiter is not a function`）

- [ ] **Step 3: 実装を書く**

`packages/rate-limit/src/token-bucket.ts`:

```ts
/**
 * 失敗回数のレート制限（トークンバケツ）。
 *
 * ## なぜ窓ではなくバケツか
 *
 * 窓（直近 N 秒の失敗回数）は、持続レートとバースト耐性を 1 つの数で表してしまう。
 * 「10 回 / 10 秒」は持続 1 回/秒を意味すると同時に、瞬間的な 10 件超の集中も禁じる。
 * 同一 NAT 配下の複数人が一斉に再接続すると、正規利用者が締め出される。
 * バケツなら持続レート（補充速度）とバースト耐性（容量）を独立に決められる。
 *
 * ## 呼び出しの順序（重要）
 *
 * **`shouldReject` → 資源の照会 → `consume`** の順で使うこと。照会してから判定すると、
 * バケツが空のときに「見つからない」という応答が返り、**攻撃者はトークンを消費せずに
 * 存在確認を続けられる**（レート制限が無意味になる）。判定と消費を別の関数に分けて
 * あるのは、この順序を呼び出し側が選べないようにするためではなく、
 * **順序を明示的に書かせるため**である。
 *
 * ## 保持するもの
 *
 * 鍵ごとに残量と最終更新時刻の 2 値だけ。タイムスタンプの配列は持たない。
 */

/** 鍵ごとの残量。`updatedAt` からの経過時間で補充量を後から計算する（遅延評価）。 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface RateLimiter {
  /** 残量が 1 未満なら true。**資源を照会する前に呼ぶこと。** */
  shouldReject(key: string, now: number): boolean;
  /** 失敗が確定したときだけ呼ぶ。トークンを 1 つ消費する。 */
  consume(key: string, now: number): void;
  /** 満タンに戻ったエントリを捨てる。 */
  sweep(now: number): void;
  /** 保持しているエントリ数（検査・テスト用）。 */
  size(): number;
}

export interface TokenBucketOptions {
  /** 瞬間的に許す失敗の件数。 */
  capacity: number;
  /** 1 秒あたりの補充数 = 持続レート。 */
  refillPerSec: number;
  /** この件数を超えたときだけ掃除を検討する。既定 1000。 */
  sweepThreshold?: number;
}

/** 既定の容量。値の正本は設計正本 `2026-08-14-ip-rate-limit-design.md` D2。 */
export const DEFAULT_CAPACITY = 60;
/** 既定の補充速度（＝持続レート）。値の正本は同上。 */
export const DEFAULT_REFILL_PER_SEC = 1;

export function createTokenBucketLimiter(options: TokenBucketOptions): RateLimiter {
  const { capacity, refillPerSec } = options;
  const sweepThreshold = options.sweepThreshold ?? 1_000;
  /** 空から満タンへ戻るのに要する時間。掃除の最小間隔にも使う。 */
  const refillFullMs = (capacity / refillPerSec) * 1_000;
  const buckets = new Map<string, Bucket>();
  /** 前回の掃除時刻。初回は必ず走らせたいので負の無限大から始める。 */
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  function tokensAt(bucket: Bucket, now: number): number {
    const refilled = bucket.tokens + ((now - bucket.updatedAt) / 1_000) * refillPerSec;
    return Math.min(capacity, refilled);
  }

  function sweep(now: number): void {
    for (const [key, bucket] of buckets) {
      if (tokensAt(bucket, now) >= capacity) buckets.delete(key);
    }
    lastSweepAt = now;
  }

  /**
   * 掃除を試みる。
   *
   * **件数だけを条件にしてはいけない。** エントリが全部フレッシュだと 1 件も消えず、
   * 件数はしきい値以上のまま残る。すると次の消費でもまた全走査が走り、O(n) が毎回になる。
   * 前回の掃除からの経過時間も条件に入れて、最悪でも `refillFullMs` に 1 回へ抑える。
   */
  function maybeSweep(now: number): void {
    if (buckets.size <= sweepThreshold) return;
    if (now - lastSweepAt < refillFullMs) return;
    sweep(now);
  }

  return {
    shouldReject(key, now) {
      const bucket = buckets.get(key);
      return bucket !== undefined && tokensAt(bucket, now) < 1;
    },
    consume(key, now) {
      const bucket = buckets.get(key);
      const remaining = (bucket === undefined ? capacity : tokensAt(bucket, now)) - 1;
      buckets.set(key, { tokens: Math.max(0, remaining), updatedAt: now });
      maybeSweep(now);
    },
    sweep,
    size: () => buckets.size,
  };
}
```

`packages/rate-limit/src/index.ts` を差し替える:

```ts
export { normalizeClientAddress, createClientKeyDeriver } from "./client-key.js";
export {
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
  type RateLimiter,
  type TokenBucketOptions,
} from "./token-bucket.js";
```

- [ ] **Step 4: テストが通ることを確かめる**

```bash
cd packages/rate-limit && corepack pnpm vitest run
```

期待: PASS（Task 2 のぶんも含めて全件）

- [ ] **Step 5: lint と typecheck**

```bash
cd packages/rate-limit && corepack pnpm lint && corepack pnpm typecheck
```

期待: いずれも 0 件

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add packages/rate-limit
git commit -m "feat: トークンバケツを @tasuki/rate-limit に追加する

- 持続レート（補充速度）とバースト耐性（容量）を独立に決められる形にする
- 判定と消費を別関数に分け、照会より前に判定する順序を呼び出し側へ明示させる
- 掃除は件数と前回からの経過時間の両方を条件にし、毎回の全走査を避ける"
```

---

## Task 4: timer-sync — adapter がクライアント鍵を導出する（振る舞いは変えない）

このタスクでは鍵を**作って配線するだけ**で、レート制限にはまだ使わない。外から見える振る舞いは変わらない。

**Files:**
- Modify: `apps/timer-sync/src/adapters/ws-adapter.ts`
- Modify: `apps/timer-sync/src/create-sync-server.ts`
- Modify: `apps/timer-sync/package.json`（`@tasuki/rate-limit` を依存に追加）
- Create: `apps/timer-sync/test/ws-adapter.client-key.test.ts`

**Interfaces:**
- Consumes: `createClientKeyDeriver` from `@tasuki/rate-limit`
- Produces:
  - `WsAdapterOptions.deriveClientKey?: (forwardedFor: string | undefined) => string | null`
  - `WsAdapterOptions.onConnect?: (connId: string, rateKey: string) => void`
  - **`onConnect` は Origin 検査・接続数上限を通った接続についてのみ、`connId` 採番の直後に呼ばれる**
  - **`rateKey` はクライアント鍵。特定できなければ `connId` が入る**

- [ ] **Step 1: 依存を足す**

`apps/timer-sync/package.json` の `dependencies` に追加する:

```json
"@tasuki/rate-limit": "workspace:*",
```

```bash
corepack pnpm install
```

- [ ] **Step 2: 失敗するテストを書く**

`apps/timer-sync/test/ws-adapter.client-key.test.ts`:

```ts
/**
 * WsAdapter がクライアント鍵を導出して onConnect へ渡すことのテスト。
 *
 * `ws`（npm）の WebSocket はコンストラクタでリクエストヘッダを足せるので、
 * X-Forwarded-For を持つ接続を実際に張って確かめられる。
 */
import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";
import { createClientKeyDeriver } from "@tasuki/rate-limit";
import { testLogger } from "./support/test-logger.js";

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

/** onConnect が受け取った (connId, rateKey) を集める */
function startAdapter(): { url: string; seen: Array<[string, string]> } {
  const seen: Array<[string, string]> = [];
  adapter = new WsAdapter({
    port: 0,
    host: "127.0.0.1",
    allowedOrigins: [],
    onMessage: async () => {},
    onDisconnect: () => {},
    onConnect: (connId, rateKey) => seen.push([connId, rateKey]),
    deriveClientKey: createClientKeyDeriver(new Uint8Array(32).fill(9)),
    logger: testLogger,
  });
  return { url: `ws://127.0.0.1:${adapter.port}`, seen };
}

describe("WsAdapter のクライアント鍵", () => {
  it("X-Forwarded-For があれば、そこから導いた鍵を onConnect へ渡す", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url, { headers: { "x-forwarded-for": "203.0.113.7" } });
    await waitOpen(ws);
    await Bun.sleep(50);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).not.toBe(connId);
    expect(rateKey).not.toContain("203.0.113.7");
    ws.close();
  });

  it("同じ /64 の別アドレスからは同じ鍵になる", async () => {
    const { url, seen } = startAdapter();
    const a = new WebSocket(url, { headers: { "x-forwarded-for": "2001:db8::1" } });
    await waitOpen(a);
    const b = new WebSocket(url, { headers: { "x-forwarded-for": "2001:DB8::dead:beef" } });
    await waitOpen(b);
    await Bun.sleep(50);

    expect(seen).toHaveLength(2);
    expect(seen[0]![1]).toBe(seen[1]![1]);
    a.close();
    b.close();
  });

  it("X-Forwarded-For が無ければ connId が鍵になる", async () => {
    const { url, seen } = startAdapter();
    const ws = new WebSocket(url);
    await waitOpen(ws);
    await Bun.sleep(50);

    expect(seen).toHaveLength(1);
    const [connId, rateKey] = seen[0]!;
    expect(rateKey).toBe(connId);
    ws.close();
  });
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

```bash
cd apps/timer-sync && bun test test/ws-adapter.client-key.test.ts
```

期待: FAIL（`onConnect` が呼ばれず `seen` が空、または型エラー）

- [ ] **Step 4: `ws-adapter.ts` を変更する**

`WsAdapterOptions` に 2 つ足す（`logger` の直前）:

```ts
  /**
   * `X-Forwarded-For` からレート制限の鍵を導く。未指定なら鍵は作らない。
   * **生の IP はこの関数の中だけに存在し、戻り値はハッシュ済みの不透明な文字列である**
   * （`docs/adr/0012` D3）。
   */
  deriveClientKey?: (forwardedFor: string | undefined) => string | null;
  /**
   * 接続が受理された（Origin・接続数の検査を通った）ときに 1 度だけ呼ばれる。
   * `rateKey` はクライアント鍵。特定できなければ `connId` が入る。
   */
  onConnect?: (connId: string, rateKey: string) => void;
```

`ConnectionData` に足す:

```ts
interface ConnectionData {
  connId: string;
  origin: string;
  /** `X-Forwarded-For` から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
}
```

`handleFetch` の `upgrade` 呼び出しを差し替える:

```ts
  private handleFetch(req: Request, server: Bun.Server<ConnectionData>): Response | undefined {
    const origin = req.headers.get("origin") ?? "";
    // **鍵はここで作る。** 生の IP をこの行より先へ持ち出さない（ADR 0012 D3）。
    const clientKey =
      this.options.deriveClientKey?.(req.headers.get("x-forwarded-for") ?? undefined) ?? null;
    if (server.upgrade(req, { data: { connId: "", origin, clientKey } })) return undefined;
```

`handleOpen` の末尾（`this.missedPongs.set(connId, 0);` の直後）に足す:

```ts
    this.options.onConnect?.(connId, ws.data.clientKey ?? connId);
```

- [ ] **Step 5: `create-sync-server.ts` を変更する**

ファイル冒頭の import に足す:

```ts
import { createClientKeyDeriver } from "@tasuki/rate-limit";
import { randomBytes } from "node:crypto";
```

`wsAdapter = new WsAdapter({` の直前に足す:

```ts
  // レート制限の相関ソルト。**プロセス起動ごとに 1 度だけ生成し、env にも設定にも置かない**
  // （ADR 0012 D3）。再起動で鍵が変わるのは揮発インメモリ設計と整合するので受け入れる。
  const deriveClientKey = createClientKeyDeriver(randomBytes(32));
```

`new WsAdapter({ ... })` のオプションへ足す（`logger,` の直後）:

```ts
    deriveClientKey,
```

- [ ] **Step 6: テストが通ることを確かめる**

```bash
cd apps/timer-sync && bun test test/ws-adapter.client-key.test.ts
```

期待: PASS（3 件）

- [ ] **Step 7: 既存のテストが壊れていないことを確かめる**

```bash
cd apps/timer-sync && bun test
```

期待: 全件 PASS（438 件。**件数が減っていないことを `passed` の数で確認する**。
括弧内の総数だけを見ると `.skip` の増加を見落とす）

- [ ] **Step 8: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/timer-sync packages pnpm-lock.yaml
git commit -m "feat(timer-sync): WS アダプタでクライアント鍵を導出する

- X-Forwarded-For の読み取りと HMAC 化を upgrade の場所に閉じ込め、
  生の IP を application 層へ渡さない（ADR 0012 D3）
- 受理した接続について onConnect(connId, rateKey) を 1 度だけ呼ぶ
- この時点ではまだレート制限に使わない。外から見える振る舞いは変わらない"
```

---

## Task 5: timer-sync — レート制限を IP 単位へ差し替える

**Files:**
- Create: `apps/timer-sync/src/application/rate-limit-gate.ts`
- Delete: `apps/timer-sync/src/application/join-rate-limiter.ts`
- Modify: `apps/timer-sync/src/application/handlers.ts`
- Modify: `apps/timer-sync/src/application/command-handlers/room-join.ts`
- Modify: `apps/timer-sync/src/application/command-handlers/ai-unlock.ts`
- Modify: `apps/timer-sync/src/create-sync-server.ts`
- Delete: `apps/timer-sync/test/join-rate-limiter.test.ts`
- Create: `apps/timer-sync/test/rate-limit-gate.test.ts`
- Modify: `apps/timer-sync/test/join-rate-limit.test.ts`

**Interfaces:**
- Consumes: `createTokenBucketLimiter` / `DEFAULT_CAPACITY` / `DEFAULT_REFILL_PER_SEC` from `@tasuki/rate-limit`、`WsAdapterOptions.onConnect`（Task 4）
- Produces:
  - `interface RateLimitGate { open(connId: string, rateKey: string): void; close(connId: string): void; shouldReject(connId: string, now: number): boolean; consume(connId: string, now: number): void }`
  - `createRateLimitGate(limiter: RateLimiter): RateLimitGate`
  - `makeHandlers` の戻り値に `handleConnectionOpen(connId: string, rateKey: string): void` が増える
  - `RoomJoinDeps` / `AiUnlockDeps` の `joinRateLimiter` と `joinFailMax` が `rateLimitGate: RateLimitGate` に置き換わる

- [ ] **Step 1: ゲートの失敗するテストを書く**

`apps/timer-sync/test/rate-limit-gate.test.ts`:

```ts
/**
 * createRateLimitGate() のテスト。
 *
 * ゲートは「connId → クライアント鍵」の対応だけを持ち、数える仕事は
 * @tasuki/rate-limit のバケツに委ねる。**同一 IP の複数接続が同じバケツを共有する**
 * ことがこの層の存在理由である（接続を張り直しても窓がリセットされない）。
 */
import { describe, it, expect } from "bun:test";
import { createTokenBucketLimiter } from "@tasuki/rate-limit";
import { createRateLimitGate } from "../src/application/rate-limit-gate.js";

const T0 = 1_000_000;

describe("createRateLimitGate", () => {
  it("同じ鍵で開いた別々の接続はバケツを共有する", () => {
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));
    gate.open("conn-1", "key-A");
    gate.open("conn-2", "key-A");

    gate.consume("conn-1", T0);

    expect(gate.shouldReject("conn-2", T0)).toBe(true);
  });

  it("鍵が違えば独立している", () => {
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));
    gate.open("conn-1", "key-A");
    gate.open("conn-2", "key-B");

    gate.consume("conn-1", T0);

    expect(gate.shouldReject("conn-2", T0)).toBe(false);
  });

  it("接続を閉じて張り直しても、同じ鍵ならバケツは引き継がれる", () => {
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));
    gate.open("conn-1", "key-A");
    gate.consume("conn-1", T0);
    gate.close("conn-1");

    gate.open("conn-2", "key-A");

    expect(gate.shouldReject("conn-2", T0)).toBe(true);
  });

  it("open していない connId は connId 自身を鍵にする（in-process テストの経路）", () => {
    const gate = createRateLimitGate(createTokenBucketLimiter({ capacity: 1, refillPerSec: 1 }));

    gate.consume("conn-1", T0);

    expect(gate.shouldReject("conn-1", T0)).toBe(true);
    expect(gate.shouldReject("conn-2", T0)).toBe(false);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

```bash
cd apps/timer-sync && bun test test/rate-limit-gate.test.ts
```

期待: FAIL（`rate-limit-gate.js` が見つからない）

- [ ] **Step 3: ゲートを実装する**

`apps/timer-sync/src/application/rate-limit-gate.ts`:

```ts
/**
 * 接続 ID とクライアント鍵の橋渡し。
 *
 * ## なぜ 1 枚挟むのか
 *
 * ハンドラは `connId` しか持っていない。一方、数える単位はクライアント鍵（IP の HMAC）
 * である。この対応表をここに閉じ込めることで、ハンドラ側の呼び出しは `connId` のまま
 * 変わらず、`@tasuki/rate-limit` は接続という概念を知らずに済む。
 *
 * ## 未登録の connId が自分自身を鍵にする理由
 *
 * 業務ロジックのテストは WS アダプタを通さず `handlers.handleCommand("conn-1", ...)` を
 * 直接呼ぶ。その経路では `open()` が呼ばれないので鍵が無い。`connId` へ落とすことで、
 * それらのテストは従来どおり「接続ごとに独立」の挙動で動き続ける。
 *
 * ## 保持期間
 *
 * 対応表のエントリは接続の生存期間だけ存在する（`open` で入り `close` で消える）。
 * `docs/adr/0012` D3 の改訂で明示的に許されている保持である。
 */
import type { RateLimiter } from "@tasuki/rate-limit";

export interface RateLimitGate {
  /** 接続の受理時に、その接続が属するクライアント鍵を登録する。 */
  open(connId: string, rateKey: string): void;
  /** 接続クローズ時に対応を捨てる。 */
  close(connId: string): void;
  /** **資源を照会する前に呼ぶ。** 残量が無ければ true。 */
  shouldReject(connId: string, now: number): boolean;
  /** 失敗が確定したときだけ呼ぶ。 */
  consume(connId: string, now: number): void;
}

export function createRateLimitGate(limiter: RateLimiter): RateLimitGate {
  /** connId → クライアント鍵 */
  const keys = new Map<string, string>();
  const keyOf = (connId: string): string => keys.get(connId) ?? connId;

  return {
    open(connId, rateKey) {
      keys.set(connId, rateKey);
    },
    close(connId) {
      keys.delete(connId);
    },
    shouldReject: (connId, now) => limiter.shouldReject(keyOf(connId), now),
    consume: (connId, now) => limiter.consume(keyOf(connId), now),
  };
}
```

- [ ] **Step 4: ゲートのテストが通ることを確かめる**

```bash
cd apps/timer-sync && bun test test/rate-limit-gate.test.ts
```

期待: PASS（4 件）

- [ ] **Step 5: `handlers.ts` を差し替える**

import を差し替える。

```ts
// 削除: import { createJoinRateLimiter } from "./join-rate-limiter.js";
import { createTokenBucketLimiter, DEFAULT_CAPACITY, DEFAULT_REFILL_PER_SEC } from "@tasuki/rate-limit";
import { createRateLimitGate } from "./rate-limit-gate.js";
```

`const JOIN_FAIL_MAX = 30;` から `const joinRateLimiter = ...;` までのブロックを置き換える:

```ts
  // 入室失敗のレート制限（コード・合言葉の総当たりの緩和）。
  // **数える単位は接続ではなくクライアント（IP の HMAC）である**（#103・ADR 0011 S1）。
  // 接続単位だと再接続で窓がリセットされ、総当たりを止められなかった。
  //
  // ★ room.join と ai.unlock は「総当たりの緩和」という同じ目的のため、
  // 意図的に同一インスタンスのバケツを共有する。makeHandlers 内で 1 度しか生成しない
  // ことで共有が構造的に保証される。コマンドごとに別インスタンスを作ると、
  // ai.unlock の総当たり対策が黙って弱まる。
  const rateLimitGate = createRateLimitGate(
    createTokenBucketLimiter({
      capacity: DEFAULT_CAPACITY,
      refillPerSec: DEFAULT_REFILL_PER_SEC,
    }),
  );
```

`createRoomJoinHandler({ ... })` の引数から `joinRateLimiter,` と `joinFailMax: JOIN_FAIL_MAX,` を消し、`rateLimitGate,` を足す。
`createAiUnlockHandler({ ... })` も同様。

`handleConnectionClose` を差し替え、`handleConnectionOpen` を足す:

```ts
  /** 接続の受理時。この接続が属するクライアント鍵を登録する。 */
  function handleConnectionOpen(connId: string, rateKey: string): void {
    rateLimitGate.open(connId, rateKey);
  }

  /** 接続クローズ時の後始末。connId → 鍵の対応を捨てる（マップのリーク防止）。 */
  function handleConnectionClose(connId: string): void {
    rateLimitGate.close(connId);
  }
```

`makeHandlers` の `return` に `handleConnectionOpen,` を足す（`handleConnectionClose,` の隣）。

- [ ] **Step 6: `room-join.ts` を差し替える**

import を差し替える:

```ts
// 削除: import type { JoinRateLimiter } from "../join-rate-limiter.js";
import type { RateLimitGate } from "../rate-limit-gate.js";
```

`RoomJoinDeps` を差し替える:

```ts
  /** room.join と ai.unlock が共有する単一インスタンス（makeHandlers で1度だけ生成）。 */
  rateLimitGate: RateLimitGate;
```

（`joinFailMax: number;` の行は削除する）

分解代入と判定を差し替える:

```ts
  const { store, broadcaster, codeGen, tokenStore, rateLimitGate, sendError } = deps;
```

```ts
    // **ルームを照会する前に判定する。** 照会してから判定すると、残量が無いときに
    // ROOM_NOT_FOUND が返り、攻撃者はトークンを消費せずに存在確認を続けられる。
    if (rateLimitGate.shouldReject(connId, now)) {
      sendError(connId, "JOIN_RATE_LIMITED", errorMessageFor("JOIN_RATE_LIMITED"));
      return err("JOIN_RATE_LIMITED");
    }
```

`joinRateLimiter.recordFailure(connId, now);` を 2 箇所とも `rateLimitGate.consume(connId, now);` にする。

- [ ] **Step 7: `ai-unlock.ts` を差し替える**

import・`AiUnlockDeps`・分解代入を `room-join.ts` と同じ要領で差し替える。
判定は次のとおり:

```ts
    // 合言葉の照合より前に判定する（join と同じバケツを共有）。
    if (rateLimitGate.shouldReject(connId, now)) {
      sendError(connId, "RATE_LIMITED", errorMessageFor("RATE_LIMITED"));
      return err("RATE_LIMITED");
    }
```

`joinRateLimiter.recordFailure(connId, now);` を `rateLimitGate.consume(connId, now);` にする。

- [ ] **Step 8: `create-sync-server.ts` に `onConnect` を配線する**

`new WsAdapter({ ... })` のオプションへ、`onDisconnect` の直前に足す:

```ts
    onConnect: (connId, rateKey) => {
      handlers.handleConnectionOpen(connId, rateKey);
    },
```

- [ ] **Step 9: 古いモジュールとテストを消す**

```bash
cd /home/vscode/tasuki-work
git rm apps/timer-sync/src/application/join-rate-limiter.ts
git rm apps/timer-sync/test/join-rate-limiter.test.ts
```

- [ ] **Step 10: 統合テストを書き換える**

`apps/timer-sync/test/join-rate-limit.test.ts` には、**#103 が塞ごうとしている回避経路
そのものを固定しているテストがある**。

> `it("接続クローズで失敗履歴が解放され、再び試行できる（マップのリーク防止）")`

これは「接続を張り直せば窓がリセットされる」という現行の挙動を正しいものとして
検査している。IP 単位へ移すと**必ず落ちる。落ちるのが正しい。**
実装を戻すのではなく、このテストを逆向きに書き換える。

ファイル全体を次で置き換える。

```ts
/**
 * 入室失敗のレート制限（#103 で接続単位 → クライアント単位へ移した）。
 *
 * ## 以前との違い
 *
 * かつては接続クローズで失敗履歴が解放され、張り直せば再び試行できた。
 * **それが総当たりの回避経路だった**（ADR 0011 S1）。いまは鍵がクライアント
 * （IP の HMAC）なので、接続を閉じても残量は戻らない。
 *
 * WS アダプタを通さない in-process の経路では `open()` が呼ばれないため、
 * 鍵は connId へ落ちる（rate-limit-gate.ts の docstring 参照）。
 * このファイルは `handlers.handleConnectionOpen` を明示的に呼んで、
 * 「同じクライアントの別接続」を組み立てる。
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

const badJoin = (handlers: ReturnType<typeof makeHandlers>, conn: string) =>
  handlers.handleCommand(conn, {
    command: "room.join",
    code: "NOPE99",
    displayName: "Bob",
    hasAiKey: false,
  });

describe("入室失敗のレート制限", () => {
  let handlers: ReturnType<typeof makeHandlers>;
  let broadcaster: SpyBroadcaster;
  let store: InMemoryRoomStore;
  const conn = "spam-conn";

  beforeEach(() => {
    broadcaster = new SpyBroadcaster();
    store = new InMemoryRoomStore();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1_000_000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  it("連続失敗が容量を超えると JOIN_RATE_LIMITED で拒否する", async () => {
    // Given（容量までは ROOM_NOT_FOUND）
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      await badJoin(handlers, conn);
      expect(broadcaster.errorsTo(conn).at(-1)?.code, \`${i} 回目\`).toBe("ROOM_NOT_FOUND");
    }

    // When
    await badJoin(handlers, conn);

    // Then
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });

  it("接続を張り直しても、同じクライアントなら残量は戻らない（#103 の核心）", async () => {
    // Given（1 本目の接続で使い切る）
    handlers.handleConnectionOpen("conn-1", "client-A");
    for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin(handlers, "conn-1");
    await badJoin(handlers, "conn-1");
    expect(broadcaster.errorsTo("conn-1").at(-1)?.code).toBe("JOIN_RATE_LIMITED");

    // When（切断して、同じクライアントから新しい接続を開く）
    handlers.handleConnectionClose("conn-1");
    handlers.handleConnectionOpen("conn-2", "client-A");
    await badJoin(handlers, "conn-2");

    // Then（かつてはここで ROOM_NOT_FOUND に戻っていた。それが回避経路だった）
    expect(broadcaster.errorsTo("conn-2").at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });

  it("別のクライアントは独立している", async () => {
    // Given
    handlers.handleConnectionOpen("conn-1", "client-A");
    for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin(handlers, "conn-1");

    // When
    handlers.handleConnectionOpen("conn-2", "client-B");
    await badJoin(handlers, "conn-2");

    // Then
    expect(broadcaster.errorsTo("conn-2").at(-1)?.code).toBe("ROOM_NOT_FOUND");
  });

  /**
   * 残量が無いとき、**実在するルームコード**でも JOIN_RATE_LIMITED を返すこと。
   * ここが逆順（照会してから判定）だと、攻撃者はトークンを消費せずに
   * 「そのコードが実在するか」を数え切れないほど試せる（設計正本 D3）。
   */
  it("残量が無いとき、実在するコードでも JOIN_RATE_LIMITED を返す", async () => {
    // Given
    const created = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "ホスト",
    });
    expect(created.isOk()).toBe(true);
    const code = store.list()[0]!.code;

    handlers.handleConnectionOpen(conn, "client-A");
    for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin(handlers, conn);

    // When
    await handlers.handleCommand(conn, {
      command: "room.join",
      code,
      displayName: "侵入者",
      hasAiKey: false,
    });

    // Then
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });
});
```

**`handlers.handleConnectionOpen` を `makeHandlers` の戻り値へ公開していないと、
このテストは型エラーになる。** Step 5 で足していることを確認すること。

- [ ] **Step 11: timer-sync のテストを全部走らせる**

```bash
cd apps/timer-sync && bun test
```

期待: 全件 PASS。**`passed` の件数を確認する。** `join-rate-limiter.test.ts` を消したぶんは減る。

- [ ] **Step 12: 実 WS 越しの回帰も確かめる**

```bash
cd /home/vscode/tasuki-work && corepack pnpm turbo run test --filter=@tasuki/timer-sync --filter=@tasuki/timer-core
```

期待: PASS

- [ ] **Step 13: lint と typecheck**

```bash
cd apps/timer-sync && corepack pnpm lint && corepack pnpm typecheck
```

期待: いずれも 0 件

- [ ] **Step 14: コミット**

```bash
cd /home/vscode/tasuki-work
git add -A apps/timer-sync
git commit -m "feat(timer-sync): 入室失敗のレート制限を IP 単位へ移す

- 接続単位の窓を廃し、クライアント鍵（IP の HMAC）で共有するバケツに置き換える。
  再接続で窓がリセットされる回避経路を塞ぐ（ADR 0011 S1）
- 判定をルーム照会より前に固定する。逆順だと残量が無いときに ROOM_NOT_FOUND が返り、
  トークンを消費せずに存在確認を続けられる
- room.join と ai.unlock がバケツを共有する制約は維持する"
```

---

## Task 6: timer-sync — 二段の fail-closed

**Files:**
- Modify: `apps/timer-sync/src/config.ts`
- Modify: `apps/timer-sync/src/adapters/ws-adapter.ts`
- Modify: `apps/timer-sync/src/create-sync-server.ts`
- Modify: `apps/timer-sync/test/config.test.ts`
- Create: `apps/timer-sync/test/fail-closed.test.ts`

**Interfaces:**
- Consumes: `WsAdapterOptions.deriveClientKey`（Task 4）
- Produces:
  - `SyncConfig.requireClientAddress: boolean`
  - `WsAdapterOptions.requireClientAddress?: boolean`
  - **close reason `"Client address required"`（Origin 拒否の `"Origin not allowed"` と区別する）**
  - **クライアント鍵の検査は Origin 検査より前に置く**

- [ ] **Step 0: 本番の `HOST` を実測する（設計正本 §7）**

**このタスクをマージする前に必ず行う。** 本番の `tasuki-sync.env` が `HOST=0.0.0.0` だった場合、
起動時 fail-closed をそのままデプロイすると**サービスが止まる**。
実ファイルは追跡外なので、リポジトリからは分からない。

SSH が要るので、**利用者に依頼するか、`TASUKI_SSH_HOST` が使える状態で実行する**。
読み取りだけで、変更は行わない。

```bash
ssh "$TASUKI_SSH_HOST" "grep -E '^HOST=' /opt/tasuki/tasuki-sync.env || echo HOST未設定"
ssh "$TASUKI_SSH_HOST" "grep -rn header_up /etc/caddy/ 2>/dev/null || echo header_upなし"
```

期待:

- `HOST` が未設定、または `127.0.0.1` / `::1` / `localhost` のいずれか
- `X-Forwarded-For` を書き換える `header_up` が無い

**どちらかが外れたら、このタスクを進める前に設計正本 §7 と D5・D6 を見直す。**
実測できない場合は「未実測」と記録し、**この検査を入れたままデプロイしない**。

- [ ] **Step 1: 失敗するテストを書く**

`apps/timer-sync/test/fail-closed.test.ts`:

```ts
/**
 * 本番の二段 fail-closed のテスト（#103・設計正本 D6）。
 *
 * ## なぜクライアント鍵の検査を Origin より前に置くか
 *
 * どちらも close コードは 1008 で、reason でしか区別できない。Origin を先に見ると、
 * 「Caddy を迂回した直結が拒否される」ことを確かめたいテストが、実は Origin 拒否を
 * 見ているだけ、という空振りになる。前に置けば、Origin ヘッダを持たない素の接続でも
 * 「クライアント鍵が無いこと」を理由に拒否されたと確定できる。
 */
import { describe, it, expect, afterEach } from "bun:test";
import { WebSocket } from "ws";
import { loadSyncConfig } from "../src/config.js";
import { createSyncServer, type SyncServer } from "../src/create-sync-server.js";

let server: SyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** close の (code, reason) を待つ。 */
function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

describe("起動時の fail-closed（HOST）", () => {
  it("本番でループバック以外を指定すると起動を拒否する", () => {
    expect(() =>
      loadSyncConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://example.com",
        HOST: "0.0.0.0",
      }),
    ).toThrow(/HOST/);
  });

  it("本番でも 127.0.0.1 なら通る", () => {
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      HOST: "127.0.0.1",
    });
    expect(config.host).toBe("127.0.0.1");
  });

  it("本番でも ::1 なら通る", () => {
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      HOST: "::1",
    });
    expect(config.host).toBe("::1");
  });

  it("本番以外なら 0.0.0.0 でも通る", () => {
    const config = loadSyncConfig({ HOST: "0.0.0.0" });
    expect(config.host).toBe("0.0.0.0");
  });
});

describe("接続時の fail-closed（X-Forwarded-For）", () => {
  it("本番でヘッダが無い接続は Origin 拒否とは違う理由で閉じられる", async () => {
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      PORT: "0",
      HOST: "127.0.0.1",
    });
    server = createSyncServer(config);
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`);

    const closed = await waitClose(ws);

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe("Client address required");
  });

  it("本番でヘッダがあれば繋がる", async () => {
    const config = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://example.com",
      PORT: "0",
      HOST: "127.0.0.1",
    });
    server = createSyncServer(config);
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`, {
      headers: { "x-forwarded-for": "203.0.113.7", origin: "https://example.com" },
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("本番以外ならヘッダが無くても繋がる", async () => {
    const config = loadSyncConfig({ PORT: "0", HOST: "127.0.0.1" });
    server = createSyncServer(config);
    const ws = new WebSocket(`ws://127.0.0.1:${server.wsAdapter.port}`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

```bash
cd apps/timer-sync && bun test test/fail-closed.test.ts
```

期待: FAIL（`loadSyncConfig` が throw しない・close されず open してしまう）

- [ ] **Step 3: `config.ts` を変更する**

`SyncConfig` に足す:

```ts
  /**
   * 本番かどうか。true のとき、クライアント IP を特定できない接続を拒否する
   * （#103・ADR 0012 D6）。
   */
  requireClientAddress: boolean;
```

ファイル上部に足す:

```ts
/**
 * ループバックとみなすホスト名の許可リスト。
 *
 * **禁止リストではなく許可リストにする。** 「外部に開いた値」を列挙する方式は、
 * 書き漏らした表記がそのまま防御の穴になる。
 */
const LOOPBACK_HOSTS = new Set(["localhost", "::1", "[::1]"]);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || /^127\.\d+\.\d+\.\d+$/.test(host);
}
```

`loadSyncConfig` の中、`ALLOWED_ORIGINS` の検査の直後に足す:

```ts
  const isProduction = env["NODE_ENV"] === "production";
  const host = env["HOST"] ?? "127.0.0.1";

  if (isProduction && !isLoopbackHost(host)) {
    throw new Error(
      `本番（NODE_ENV=production）では HOST をループバックに限定します（受け取った値: ${host}）。` +
        "Caddy を迂回した直接接続は X-Forwarded-For を偽装できるため、" +
        "レート制限が無効化されます。起動を中止します。",
    );
  }
```

`return` の `host:` を `host,` に変え、末尾に `requireClientAddress: isProduction,` を足す。

- [ ] **Step 4: `ws-adapter.ts` を変更する**

`WsAdapterOptions` に足す（`deriveClientKey` の直後）:

```ts
  /**
   * true のとき、クライアント鍵を導けなかった接続を拒否する（本番の fail-closed）。
   * Caddy を迂回した直結は X-Forwarded-For を持たないため、ここで落ちる。
   */
  requireClientAddress?: boolean;
```

`handleOpen` の**先頭**（Origin 検査より前）に足す:

```ts
    // クライアント鍵の検査は Origin より前に置く。**どちらも 1008 なので、
    // 後ろに置くと「直結が拒否される」ことを確かめるテストが Origin 拒否を
    // 見ているだけ、という空振りになる。**
    if (this.options.requireClientAddress === true && ws.data.clientKey === null) {
      ws.close(1008, "Client address required");
      return;
    }
```

- [ ] **Step 5: `create-sync-server.ts` を変更する**

`new WsAdapter({ ... })` のオプションへ、`deriveClientKey,` の直後に足す:

```ts
    requireClientAddress: config.requireClientAddress,
```

- [ ] **Step 6: テストが通ることを確かめる**

```bash
cd apps/timer-sync && bun test test/fail-closed.test.ts
```

期待: PASS（7 件）

- [ ] **Step 7: 管理面が巻き込まれていないことを確かめる**

```bash
cd apps/timer-sync && bun test test/ws-adapter.admin.test.ts test/admin.test.ts test/config.admin.test.ts
```

期待: PASS。**`/status` と `/admin/rooms` は WebSocket ではなく HTTP なので、
XFF の検査を通らない。** ここが落ちるなら検査の位置が間違っている。

- [ ] **Step 8: timer-sync のテストを全部走らせる**

```bash
cd apps/timer-sync && bun test
```

期待: 全件 PASS

- [ ] **Step 9: lint と typecheck とコミット**

```bash
cd apps/timer-sync && corepack pnpm lint && corepack pnpm typecheck
cd /home/vscode/tasuki-work
git add apps/timer-sync
git commit -m "feat(timer-sync): 本番の fail-closed を二段で入れる

- 起動時: HOST がループバック以外なら起動を拒否する。Caddy 迂回の直結を
  原理的に消し、ufw の設定状態への依存を切る
- 接続時: クライアント IP を特定できない接続を 1008 で閉じる。
  reason を Origin 拒否と分け、検査が取り違えないようにする
- クライアント鍵の検査は Origin 検査より前に置く
- 管理エンドポイントは HTTP 経路なので対象外"
```

---

## Task 7: poker-sync — クライアント鍵と fail-closed

**Files:**
- Modify: `apps/poker-sync/package.json`
- Modify: `apps/poker-sync/src/config.ts`
- Modify: `apps/poker-sync/src/server.ts`
- Modify: `apps/poker-sync/tests/raw-ws-client.ts`
- Modify: `apps/poker-sync/tests/config.test.ts`
- Create: `apps/poker-sync/tests/fail-closed.test.ts`

**Interfaces:**
- Consumes: `createClientKeyDeriver` from `@tasuki/rate-limit`
- Produces:
  - `PokerSyncConfig.requireClientAddress: boolean`
  - `ConnectionData.clientKey: string | null`（`fetch` で設定）
  - `ConnectionData.rateKey: string`（`handleOpen` で設定。それまでは空文字）
  - `RawConnectOptions.forwardedFor?: string`

- [ ] **Step 1: 依存を足す**

`apps/poker-sync/package.json` の `dependencies` に追加する:

```json
"@tasuki/rate-limit": "workspace:*",
```

```bash
corepack pnpm install
```

- [ ] **Step 2: 生 WS クライアントにヘッダを足せるようにする**

`apps/poker-sync/tests/raw-ws-client.ts` の `RawConnectOptions` に足す:

```ts
  /** X-Forwarded-For ヘッダの値。省略すると送らない（Caddy 迂回の直結を模す）。 */
  forwardedFor?: string;
```

ハンドシェイクの組み立てに足す（`originLine` の隣）:

```ts
      const forwardedLine =
        options.forwardedFor === undefined ? '' : `X-Forwarded-For: ${options.forwardedFor}\r\n`;
```

`socket.write` のテンプレートで `originLine +` の直後に `forwardedLine +` を挟む。

- [ ] **Step 3: 失敗するテストを書く**

`apps/poker-sync/tests/fail-closed.test.ts`:

```ts
/**
 * poker-sync の本番 fail-closed（#103・設計正本 D6）。
 * timer-sync と同じ規律を poker にも入れる。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { loadPokerSyncConfig } from '../src/config';
import { startServer, type TestServer } from './helpers';
import { connectRaw } from './raw-ws-client';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('起動時の fail-closed（HOST）', () => {
  it('本番でループバック以外を指定すると起動を拒否する', () => {
    expect(() =>
      loadPokerSyncConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://example.com',
        HOST: '0.0.0.0',
      }),
    ).toThrow(/HOST/);
  });

  it('本番でも 127.0.0.1 なら通る', () => {
    const config = loadPokerSyncConfig({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    expect(config.host).toBe('127.0.0.1');
  });

  it('本番以外なら 0.0.0.0 でも通る', () => {
    expect(loadPokerSyncConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });
});

describe('接続時の fail-closed（X-Forwarded-For）', () => {
  it('本番でヘッダが無い接続は Origin 拒否とは違う理由で閉じられる', async () => {
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    const client = await connectRaw(server.port);

    const closed = await client.waitForClose();

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });

  it('本番でヘッダがあれば繋がる', async () => {
    server = await startServer({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: 'https://example.com',
      HOST: '127.0.0.1',
    });
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    client.send({ type: 'create-room', name: 'テスト' });
    const msg = (await client.nextText()) as { type: string };

    expect(msg.type).toBe('joined');
    client.close();
  });
});
```

- [ ] **Step 4: テストが落ちることを確かめる**

```bash
cd apps/poker-sync && corepack pnpm vitest run tests/fail-closed.test.ts
```

期待: FAIL

- [ ] **Step 5: `config.ts` を変更する**

`PokerSyncConfig` に `requireClientAddress: boolean;` を足す。
`loadPokerSyncConfig` に、timer-sync と**同じ内容**の許可リストと検査を足す
（`LOOPBACK_HOSTS` / `isLoopbackHost` / `NODE_ENV=production` の HOST 検査）。
poker の既定 host は `(env['HOST'] ?? '').trim() || '127.0.0.1'` である点に注意し、
検査は**その解決後の値**に対して行う。`return` に `requireClientAddress: isProduction,` を足す。

- [ ] **Step 6: `server.ts` を変更する**

import に足す:

```ts
import { createClientKeyDeriver } from '@tasuki/rate-limit';
import { randomBytes } from 'node:crypto';
```

`const config = loadPokerSyncConfig(process.env);` の直後に足す:

```ts
/**
 * レート制限の相関ソルト。プロセス起動ごとに 1 度だけ生成し、env にも設定にも置かない
 * （ADR 0012 D3）。
 */
const deriveClientKey = createClientKeyDeriver(randomBytes(32));
```

`ConnectionData` に足す:

```ts
  /** X-Forwarded-For から導いた鍵。特定できなければ null。 */
  clientKey: string | null;
  /** レート制限の鍵。`connId` と同じく、受理されるまでは空文字。 */
  rateKey: string;
```

`Bun.serve` の `fetch` の `srv.upgrade` の `data` に足す:

```ts
          clientKey: deriveClientKey(req.headers.get('x-forwarded-for') ?? undefined),
          rateKey: '',
```

`handleOpen` の**先頭**（Origin 検査より前）に足す:

```ts
  // クライアント鍵の検査は Origin より前に置く（どちらも 1008 で、reason でしか区別できない）。
  if (config.requireClientAddress && ws.data.clientKey === null) {
    ws.close(1008, 'Client address required');
    return;
  }
```

`const connId = ...` の直後（`connections.set` の隣）に足す:

```ts
  ws.data.rateKey = ws.data.clientKey ?? connId;
```

- [ ] **Step 7: テストが通ることを確かめる**

```bash
cd apps/poker-sync && corepack pnpm vitest run tests/fail-closed.test.ts
```

期待: PASS（5 件）

- [ ] **Step 8: poker-sync のテストを全部走らせる**

```bash
cd apps/poker-sync && corepack pnpm vitest run
```

期待: 全件 PASS。**`heartbeat.test.ts` の「許容回数 2 回ぶんの欠落」は CI でまれに落ちる
既知のフレーキー（#139）。** 落ちたら 1 度だけ再実行し、通れば無関係と判断してよい。

- [ ] **Step 9: lint と typecheck とコミット**

```bash
cd apps/poker-sync && corepack pnpm lint && corepack pnpm typecheck
cd /home/vscode/tasuki-work
git add apps/poker-sync pnpm-lock.yaml
git commit -m "feat(poker-sync): クライアント鍵の導出と本番の fail-closed を入れる

- upgrade の場所で X-Forwarded-For を HMAC 化し、生の IP を持ち回らない
- 起動時に HOST をループバックへ限定し、接続時にクライアント鍵の不在を拒否する
- 生 WS クライアントに X-Forwarded-For を送る手段を足す（迂回の直結を模すため）"
```

---

## Task 8: poker-sync — レート制限の結線

**Files:**
- Modify: `packages/poker-core/src/protocol.ts`
- Modify: `apps/poker-sync/src/server.ts`
- Create: `apps/poker-sync/tests/rate-limit.test.ts`

**Interfaces:**
- Consumes: `createTokenBucketLimiter` / `DEFAULT_CAPACITY` / `DEFAULT_REFILL_PER_SEC`、`ConnectionData.rateKey`（Task 7）
- Produces: `ERROR_CODES` に `'rate-limited'` が加わる

- [ ] **Step 1: 失敗するテストを書く**

`apps/poker-sync/tests/rate-limit.test.ts`:

```ts
/**
 * poker-sync の入室失敗レート制限（#103）。
 *
 * poker には合言葉が無く、`check-room` が「無いときだけ応える」形の存在確認である。
 * ルーム ID の総当たりに対する防御はここしか無い。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_CAPACITY } from '@tasuki/rate-limit';
import { startServer, type TestServer } from './helpers';
import { connectRaw } from './raw-ws-client';


let server: TestServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

async function startProdServer(): Promise<TestServer> {
  return startServer({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://example.com',
    HOST: '127.0.0.1',
  });
}

describe('入室失敗のレート制限', () => {
  it('容量を超えた join-room は rate-limited になる', async () => {
    server = await startProdServer();
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      client.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      const msg = (await client.nextText()) as { code: string };
      expect(msg.code, `${i} 回目`).toBe('room-not-found');
    }

    client.send({ type: 'join-room', roomId: 'nope-final', name: '侵入者' });
    const msg = (await client.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    client.close();
  });

  it('check-room も同じバケツを消費する', async () => {
    server = await startProdServer();
    const client = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });

    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      client.send({ type: 'check-room', roomId: `nope${i}` });
      await client.nextText();
    }

    client.send({ type: 'check-room', roomId: 'nope-final' });
    const msg = (await client.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    client.close();
  });

  it('接続を張り直しても、同じ IP なら残量は引き継がれる', async () => {
    server = await startProdServer();
    const first = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      first.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      await first.nextText();
    }
    first.close();

    // 同じ IP で新しい接続を張る（従来はここで窓がリセットされていた）
    const second = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    second.send({ type: 'join-room', roomId: 'nope-final', name: '侵入者' });
    const msg = (await second.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    second.close();
  });

  it('別の IP は独立している', async () => {
    server = await startProdServer();
    const a = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      a.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      await a.nextText();
    }

    const b = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '198.51.100.9',
    });
    b.send({ type: 'join-room', roomId: 'nope-final', name: '通行人' });
    const msg = (await b.nextText()) as { code: string };

    expect(msg.code).toBe('room-not-found');
    a.close();
    b.close();
  });

  it('残量が無いとき、実在するルームでも rate-limited を返す（照会より前に判定する）', async () => {
    server = await startProdServer();
    const host = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '198.51.100.1',
    });
    host.send({ type: 'create-room', name: 'ホスト' });
    const joined = (await host.nextText()) as { type: string; roomId: string };
    expect(joined.type).toBe('joined');

    const attacker = await connectRaw(server.port, {
      origin: 'https://example.com',
      forwardedFor: '203.0.113.7',
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      attacker.send({ type: 'join-room', roomId: `nope${i}`, name: '侵入者' });
      await attacker.nextText();
    }

    attacker.send({ type: 'join-room', roomId: joined.roomId, name: '侵入者' });
    const msg = (await attacker.nextText()) as { code: string };

    expect(msg.code).toBe('rate-limited');
    host.close();
    attacker.close();
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

```bash
cd apps/poker-sync && corepack pnpm vitest run tests/rate-limit.test.ts
```

期待: FAIL（`rate-limited` ではなく `room-not-found` が返る）

- [ ] **Step 3: エラーコードを足す**

`packages/poker-core/src/protocol.ts` の `ERROR_CODES` に足す（`'server-busy'` の隣）:

```ts
  // 入室失敗のレート制限（#103）。総当たりの緩和であり、利用者の入力ミスとは別物。
  'rate-limited',
```

- [ ] **Step 4: `server.ts` にレート制限を結線する**

import に足す:

```ts
import {
  createTokenBucketLimiter,
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_PER_SEC,
} from '@tasuki/rate-limit';
```

`const deriveClientKey = ...` の直後に足す:

```ts
/**
 * 入室失敗のレート制限（#103）。**数える単位は接続ではなくクライアント（IP の HMAC）**。
 * 接続単位だと再接続で窓がリセットされ、ルーム ID の総当たりを止められない。
 *
 * poker には合言葉が無く、`check-room` が存在確認そのものなので、
 * join と check は同じバケツを共有する。
 */
const rateLimiter = createTokenBucketLimiter({
  capacity: DEFAULT_CAPACITY,
  refillPerSec: DEFAULT_REFILL_PER_SEC,
});
```

`handleJoinRoom` の先頭を差し替える:

```ts
function handleJoinRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'join-room' }>): void {
  const now = Date.now();
  // **ルームを照会する前に判定する。** 逆順だと、残量が無いときに room-not-found が返り、
  // 攻撃者はトークンを消費せずにルーム ID の存在確認を続けられる。
  if (rateLimiter.shouldReject(ws.data.rateKey, now)) {
    sendError(ws, 'rate-limited', '試行が多すぎます。しばらくしてからお試しください');
    return;
  }

  const entry = getRoom(msg.roomId);
  if (!entry) {
    rateLimiter.consume(ws.data.rateKey, now);
    sendError(ws, 'room-not-found', 'ルームが見つかりません');
    return;
  }
```

`handleCheckRoom` を差し替える:

```ts
function handleCheckRoom(ws: Ws, msg: Extract<ClientMessage, { type: 'check-room' }>): void {
  const now = Date.now();
  if (rateLimiter.shouldReject(ws.data.rateKey, now)) {
    sendError(ws, 'rate-limited', '試行が多すぎます。しばらくしてからお試しください');
    return;
  }

  if (!getRoom(msg.roomId)) {
    rateLimiter.consume(ws.data.rateKey, now);
    sendError(ws, 'room-not-found', 'ルームが見つかりません');
  }
}
```

`handleCheckRoom` の docstring に 1 段落足す:

```
 * **#103 で約束が 1 つ変わった。** レート制限に掛かると `rate-limited` を返すため、
 * 無音の意味は「生きている」から「生きている、または拒否された」になった。
 * 画面は参加フォームを出しておく作りなので、どちらでも待たせるだけで済む。
```

- [ ] **Step 5: テストが通ることを確かめる**

```bash
cd apps/poker-sync && corepack pnpm vitest run tests/rate-limit.test.ts
```

期待: PASS（5 件）

- [ ] **Step 6: poker-core と poker-web の回帰を確かめる**

```bash
cd /home/vscode/tasuki-work
corepack pnpm turbo run test --filter=@tasuki/poker-core --filter=@tasuki/poker-sync --filter=@tasuki/poker-web
```

期待: 全件 PASS。**`ERROR_CODES` を列挙しているテストがあれば件数が増える。**
落ちたら、そのテストが「一覧そのもの」を固定しているのか「特定コードの存在」を見ているのかを
読んでから直す。

- [ ] **Step 7: lint と typecheck とコミット**

```bash
cd /home/vscode/tasuki-work
corepack pnpm turbo run lint typecheck --filter=@tasuki/poker-core --filter=@tasuki/poker-sync
git add apps/poker-sync packages/poker-core
git commit -m "feat(poker-sync): 入室失敗のレート制限を IP 単位で入れる

- join-room と check-room が同じバケツを共有する。check-room は存在確認そのもので、
  poker には合言葉が無いため、ルーム ID の総当たりに対する唯一の防御になる
- 判定をルーム照会より前に固定する
- rate-limited を ERROR_CODES へ追加する（サーバーとクライアントの共通正本）"
```

---

## Task 9: E2E — 本番相当化と迂回拒否シナリオ

**Files:**
- Modify: `e2e/harness/sync.ts`
- Create: `e2e/specs/rate-limit.spec.ts`

**Interfaces:**
- Consumes: Task 6・Task 7 の fail-closed
- Produces: なし

- [ ] **Step 1: E2E を本番相当で起動する**

`e2e/harness/sync.ts` の `env` に足す（`ALLOWED_ORIGINS` の隣）:

```ts
        // 本番と同じ経路を通す（#103）。NODE_ENV が効くのは両アプリとも
        // ALLOWED_ORIGINS の fail-closed と、クライアント IP の必須化の 2 箇所だけで、
        // ALLOWED_ORIGINS は上で渡している。
        // **これを入れると、実 Caddy 断片で X-Forwarded-For が届かない場合に
        // 全シナリオが落ちる。** それが狙いで、静かに防御が消えるより先に気づける。
        NODE_ENV: 'production',
```

冒頭の docstring も、この意図を含む形へ更新する。

- [ ] **Step 2: E2E を走らせて、実 Caddy 経路が生きていることを確かめる**

```bash
cd /home/vscode/tasuki-work && corepack pnpm e2e
```

期待: 25 シナリオ全件 PASS。**落ちたら XFF が届いていない**ので、Task 1 の実測へ戻る。

- [ ] **Step 3: 迂回拒否のシナリオを書く**

`e2e/specs/rate-limit.spec.ts`:

```ts
/**
 * Caddy を迂回して sync へ直接繋いだ接続が拒否されることを、実配置で確かめる（#103）。
 *
 * ## なぜブラウザを使わないか
 *
 * 見たいのは「リバースプロキシを通らない接続」で、ブラウザからは作れない。
 * Node 組み込みの WebSocket で sync のポートへ直接繋ぐ。
 *
 * ## なぜ close の reason まで見るか
 *
 * Origin 拒否もクライアント鍵の不在も close コードは 1008 で、**コードだけでは
 * 区別できない**。reason を確かめないと、Origin 拒否を見ているだけの空振りになる。
 */
import { expect, test } from '@playwright/test';
import { PORTS } from '../harness/paths';

/** close の (code, reason) を待つ。 */
function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('close が来なかった')), 5_000);
    ws.addEventListener(
      'close',
      (event) => {
        clearTimeout(timer);
        resolve({ code: event.code, reason: event.reason });
      },
      { once: true },
    );
  });
}

test.describe('Caddy を迂回した直接接続', () => {
  test('timer-sync は直結を拒否する @core', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTS.timerSync}/ws`);

    const closed = await waitClose(ws);

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });

  test('poker-sync は直結を拒否する @core', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORTS.pokerSync}/ws`);

    const closed = await waitClose(ws);

    expect(closed.code).toBe(1008);
    expect(closed.reason).toBe('Client address required');
  });
});
```

- [ ] **Step 4: 新しいシナリオが通ることを確かめる**

```bash
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/rate-limit.spec.ts
```

期待: 2 件 PASS

- [ ] **Step 5: この検査が空振りしていないことを確かめる（破壊検証）**

`apps/timer-sync/src/adapters/ws-adapter.ts` の `requireClientAddress` の判定を
一時的に `false &&` で無効化し、上のシナリオが**落ちること**を確認する。
確認したら必ず元へ戻す。

```bash
cd e2e && TASUKI_E2E_TARGET=local corepack pnpm exec playwright test specs/rate-limit.spec.ts
```

期待（壊した状態）: FAIL。**通ってしまうなら、このテストは何も検証していない。**

- [ ] **Step 6: E2E を全部走らせる**

```bash
cd /home/vscode/tasuki-work && corepack pnpm e2e
```

期待: 27 シナリオ全件 PASS

- [ ] **Step 7: ポートを解放してコミット**

```bash
ss -tlnp 2>/dev/null | grep -E ':(8787|3311|18080)' && echo '掴んだまま' || echo '解放済み'
cd /home/vscode/tasuki-work
git add e2e
git commit -m "test(e2e): 本番相当で起動し、Caddy 迂回の直結が拒否されることを確かめる

- NODE_ENV=production を渡し、実 Caddy 断片で X-Forwarded-For が届くことを
  既存シナリオ全体で保証する（届かなければ全滅して即座に気づける）
- 直結の拒否は close の reason まで確かめる。1008 は Origin 拒否と共通で、
  コードだけでは取り違える"
```

---

## Task 10: 変異検査を足す

**Files:**
- Create: `scripts/mutations/m11-ipv6-prefix-full-address.patch`
- Create: `scripts/mutations/m12-rate-limit-check-after-lookup.patch`
- Modify: `scripts/mutation-check.mjs`

**Interfaces:**
- Consumes: Task 2・Task 5 の実装とテスト
- Produces: なし

- [ ] **Step 1: 作業ツリーを clean にする**

```bash
cd /home/vscode/tasuki-work && git status --short
```

期待: 出力なし。**汚れていると変異検査は実行を拒否する。**

- [ ] **Step 2: 変異 11（/64 の丸めを無効化）のパッチを作る**

`packages/rate-limit/src/client-key.ts` の `IPV6_PREFIX_GROUPS` を `4` から `8` に変える
（＝丸めをやめてアドレス全体を鍵にする）差分を作る。

```bash
cd /home/vscode/tasuki-work
sed -i 's/^const IPV6_PREFIX_GROUPS = 4;$/const IPV6_PREFIX_GROUPS = 8;/' packages/rate-limit/src/client-key.ts
git diff > scripts/mutations/m11-ipv6-prefix-full-address.patch
git checkout -- packages/rate-limit/src/client-key.ts
```

- [ ] **Step 3: 変異 12（判定と照会の順序を入れ替え）のパッチを作る**

`apps/timer-sync/src/application/command-handlers/room-join.ts` で、
`if (rateLimitGate.shouldReject(...)) { ... }` のブロックを `const room = store.get(cmd.code);` の
**後ろ**へ移す差分を作る。手で編集してから:

```bash
cd /home/vscode/tasuki-work
git diff > scripts/mutations/m12-rate-limit-check-after-lookup.patch
git checkout -- apps/timer-sync/src/application/command-handlers/room-join.ts
```

- [ ] **Step 4: `mutation-check.mjs` の `MUTATIONS` に 2 件足す**

配列の末尾に足す:

```js
  {
    id: 11,
    label: "IPv6 の /64 丸めを無効化（アドレス全体を鍵にする）",
    patch: "m11-ipv6-prefix-full-address.patch",
    pkg: "packages/rate-limit",
    tests: ["tests/client-key.test.ts"],
    note:
      "攻撃者が /64 内で送信元アドレスを回すだけでレート制限を回避できる欠陥。" +
      "同義表記が同じ鍵になることを固定しているテストが検出する。",
  },
  {
    id: 12,
    label: "レート制限の判定をルーム照会の後ろへ移す",
    patch: "m12-rate-limit-check-after-lookup.patch",
    pkg: "apps/timer-sync",
    tests: ["test/join-rate-limit.test.ts"],
    note:
      "残量が無いときに ROOM_NOT_FOUND が返り、トークンを消費せずに存在確認を" +
      "続けられる欠陥。設計正本 D3 が API を分けている理由そのもの。",
  },
```

- [ ] **Step 5: コミットしてから変異検査を走らせる**

```bash
cd /home/vscode/tasuki-work
git add scripts
git commit -m "test: IP 単位レート制限の変異を 2 件足す"
node scripts/mutation-check.mjs
```

期待: 12 件すべて「検出」。**対照実行（変異なしで緑になること）が先に走る**ので、
ランナーが空振りしていれば「検出」ではなくエラーで止まる。

- [ ] **Step 6: 対照が本当に効いていることを確かめる**

変異 11 のパッチを一時的に**空**（何も変えない差分）に差し替えて実行し、
「検出されなかった」と報告されることを確認する。確認したら元へ戻す。

期待: 変異 11 が**未検出**として報告される。ここで「検出」と出るなら、
その変異は何も変えていないのに検出されたことになり、検査が壊れている。

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git status --short
git add -A scripts
git commit --allow-empty -m "test: 変異検査の対照が効いていることを確認する" || true
```

---

## Task 11: 規範文書を更新する

**Files:**
- Modify: `docs/adr/0012-logging-secrets-and-disclosure.md`
- Modify: `docs/adr/0011-threat-model-and-data-classification.md`
- Modify: `docs/guides/security.md`

**Interfaces:**
- Consumes: Task 2〜8 で確定した閾値と設計
- Produces: なし

- [ ] **Step 1: ADR 0012 の D3 を改訂する**

決定 D3 の本文に、次の段落を足す。

```markdown
**相関キーの保持期間（2026-08-14 改訂・[#103](https://github.com/tomohiroJin/tasuki-tools/issues/103)）**:
相関キー（IP の HMAC 値）は、レート制限器のエントリと、それを生成した接続の、
**長い方**まで保持し、どちらも失われた時点で破棄する（**MUST**）。

本 ADR の初版は「レート制限の窓が閉じたら、ハッシュ値も破棄する」と書いていたが、
これは #103 の実装形が未定のまま書かれたものである（`docs/adr/0011` 決定4 が
「閾値は #103 自身が決める」と明記している）。長寿命の WebSocket 接続を IP 単位で
縛るには、接続の生存期間ぶん相関キーを覚える以外に方法がない。代案は 2 つとも
成立しなかった（IP を接続の受け入れだけに使う案は目標レートに 30 倍届かず、
バケツへの参照だけを接続に持たせる案は接続を多数張れば回避できる）。詳細は
設計正本 `docs/superpowers/specs/2026-08-14-ip-rate-limit-design.md` D7 を参照。
```

ADR のステータス欄に改訂日を記す。

- [ ] **Step 2: ADR 0011 の決定4 を更新する**

「**#103 実装後**」の前提レートを、仮定から実装値へ書き換える。
**数値は設計正本 D2 から引く**（この計画にも ADR 本文にも二重に書かない。
ADR には結論の数値だけを置き、導出は設計正本を参照する）。

あわせて次を明記する。

```markdown
**#103 実装後も、複数 IP へ分散する攻撃者は防げない**（実装済み・2026-08-14）。
単一 IP からの総当たりは 600 分の 1 に落ちるが、総レートは攻撃者が持つ IP 数に
比例する。ルームコードのエントロピー引き上げ（本決定が別 Issue へ送った対応）が
無ければ、S1 は解決しない。
```

脅威表の S1・S7 の「対策（現行）」欄も、実装済みの内容へ更新する。

- [ ] **Step 3: `docs/guides/security.md` に運用上の注意を足す**

```markdown
### sync サーバーの HOST（#103）

本番（`NODE_ENV=production`）では、`HOST` をループバック（`127.0.0.1` / `::1` /
`localhost`）以外に設定すると**起動を拒否します**。Caddy を迂回した直接接続は
`X-Forwarded-For` を偽装でき、レート制限を無効化したうえ他人の IP に濡れ衣を
着せられるためです。

同じ理由で、本番では `X-Forwarded-For` を持たない WebSocket 接続を拒否します。
Caddy の `reverse_proxy` はこのヘッダを常に付けるため、正常な経路では起きません。
**全員が繋がらなくなった場合は、まず Caddy の設定（`header_up X-Forwarded-For` の
有無）を疑ってください。**
```

- [ ] **Step 4: リンク検査**

```bash
cd /home/vscode/tasuki-work && git add docs && node scripts/check-links.mjs
```

期待: OK

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git commit -m "docs: IP 単位レート制限の実装に合わせて規範を更新する

- ADR 0012 D3 を改訂し、相関キーの保持期間を明記する。初版は #103 の実装形が
  未定のまま書かれており、長寿命接続を IP で縛る要求と両立しなかった
- ADR 0011 決定4 の仮定を実装値へ置き換え、分散攻撃を防げないことを明記する
- security.md に本番の HOST 制約と、繋がらなくなったときの調べ方を書く"
```

---

## Task 12: Issue を整える

**Files:** なし（GitHub の操作のみ）

**Interfaces:**
- Consumes: 設計正本 §2・§8・§9
- Produces: なし

- [ ] **Step 1: ufw の Issue を起票する**

Issue #103 の本文にある ufw の connlimit の内容をそのまま移す。
「#103 から切り出した。アプリ側の IP 単位レート制限は #103 が実装済み。
こちらはネットワーク層で同一 IP による接続枠の独占（ADR 0011 S7）を防ぐもの」と冒頭に書く。
着手前に `sudo ufw status verbose` の実測が要ることも残す。

```bash
gh issue create --title "chore: ufw に同一 IP の同時接続数制限（connlimit）を追加する" --body-file -
```

- [ ] **Step 2: ルームコードのエントロピーの Issue を起票する**

`docs/adr/0011` 決定4 が「別 Issue で扱う」と書いたまま起票されていなかったもの。
設計正本 §3.3・§3.4 の数値を**引用元を示して**載せる（表を丸ごと転記せず、
「設計正本 §3.4 のとおり」と参照したうえで結論の数値だけ書く）。

```bash
gh issue create --title "fix: ルームコードのエントロピーが下限（全探索 1 年）を満たしていない" --body-file -
```

- [ ] **Step 3: Issue #103 の本文を書き換える**

設計正本 §2 のとおり、ufw の内容を消し、アプリ側の実装の内容へ差し替える。
「振る舞い」節は設計正本 §6.1 の EARS をそのまま置く。
完了条件に **「本 Issue は S1 を解決しない（分散攻撃は防げない）」** を明記する。

```bash
gh issue edit 103 --body-file -
```

- [ ] **Step 3.5: 合言葉のエントロピー規範の Issue を起票する**

設計正本 §8 の申し送り。`AI_UNLOCK_KEY` とルームパスフレーズは運用者が決める文字列で、
長さ・文字種の規範が無い（#136 が指摘済み）。#103 で持続レートが 1 回/秒へ落ちる一方、
**初回バーストは 30 → 60 に増える**ため、短い合言葉の危険度は相対的に上がる。

```bash
gh issue create --title "docs: 合言葉（AI 解錠・ルームパスフレーズ）のエントロピー規範を定める" --body-file -
```

- [ ] **Step 4: 前提作業の結果を #103 へコメントする**

設計正本 §7 の 2 項目（本番の `HOST` と Caddy の `header_up`）の実測結果を、
実行日とともにコメントする。**実測していない場合は「未実測」と書く**（黙って省かない）。

- [ ] **Step 5: #66 へ申し送りをコメントする**

poker は本番未公開（`deploy/poker/app.env` に明記）なので、**poker 側の起動時 fail-closed は
#66 のデプロイ当日に本番で初めて走る**。#66 に次を伝える。

- poker-sync も `HOST` がループバック以外だと起動しない
- 本番の Caddy 設定はリポジトリと乖離しており、`/poker/ws` の `reverse_proxy` が
  `X-Forwarded-For` を付けることを設置時に確認する（付かないと全員が繋がらない）

```bash
gh issue comment 66 --body-file -
```

---

## PR の分け方

#119（PR の粒度の再検討）が未着手なので、現行の運用（憲法 原則 IX）に従って積み上げる。
`main` へは各段の base を張り替えながら順にマージし、`--delete-branch` は使わない。

| PR | タスク | 性格 |
|---|---|---|
| PR-0 | Task 1 | 設計の前提の実測（文書のみ） |
| PR-1 | Task 2・3 | 新パッケージ（純粋関数・単体テストのみ） |
| PR-2 | Task 4・5 | timer-sync の IP 化 |
| PR-3 | Task 6 | timer-sync の fail-closed |
| PR-4 | Task 7・8 | poker-sync |
| PR-5 | Task 9・10 | 検査（E2E・変異） |
| PR-6 | Task 11・12 | 規範と Issue |

**PR-1 は単独でマージしても振る舞いを変えない**（誰も使っていないパッケージが増えるだけ）。
**PR-2 も外から見える振る舞いは変わらない**（閾値は 30 → 60 に緩む方向で、
数える単位が接続からクライアントへ変わる）。振る舞いが変わるのは PR-3 以降である。
