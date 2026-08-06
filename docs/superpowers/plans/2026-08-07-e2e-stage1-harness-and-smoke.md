# E2E 第 1 段（ハーネス + 静的テスト + @smoke）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本番と同一の Caddy 断片・実ビルド成果物・実 sync サーバーを立ち上げ、`/`・`/timer/`・`/poker/` の 3 系統が外から見て正しく振る舞うことを CI で毎 PR 確認できるようにする。

**Architecture:** 新規トップレベルパッケージ `e2e/` を作る。`harness/` が Caddy と 2 つの sync を起動・停止し、`specs/` の Playwright シナリオがブラウザを使わない HTTP 確認（`@smoke`）を行う。Caddy を立てずに検証できるもの（設定ファイルの生成規則、断片とデプロイ定義の整合）は `tests/` の vitest に置き、`pnpm test` の速い側で落とす。

**Tech Stack:** Playwright 1.62.1（版を完全固定）/ vitest 3 / Caddy 2.11.4 / Bun（sync サーバーの実行）/ turbo / pnpm 11.5.0 / Node 22.13 以上

**設計文書:** `docs/superpowers/specs/2026-08-07-e2e-foundation-design.md`

## Global Constraints

- **Playwright は `1.62.1` に完全固定する。** `^` や `~` を付けない。chromium revision 1234（151.0.7922.34）と 1 対 1 で対応しており、ずれると root 所有の `/opt/playwright-browsers` へ書こうとして失敗する
- **Caddy は `2.11.4` に固定する。** 「最新」を取らない
- **`deploy/*/caddy/*.conf`（断片 5 本）の内容を 1 バイトも書き換えない。** 設置（コピー）はする
- **`deploy/caddy/tasuki.conf` はアドレス行 1 行だけを差し替える。** それ以外の差分が出たら失敗させる
- **`data-testid` を追加しない。** 第 1 段はブラウザを使わないので、そもそも選択子は登場しない
- **ポートは固定**: Caddy `18080` / timer-sync `8787` / poker-sync `3311`
- **テストファイルの拡張子**: Playwright のシナリオは `specs/*.spec.ts`、vitest の静的テストは `tests/*.test.ts`。**vitest の既定 include は `*.spec.ts` も拾うので、明示的に絞る**
- コメント・docstring は日本語。テストには Given / When / Then をコメントで明示する（SC-032 の規約）
- TypeScript: `any` 禁止、`const` 優先、名前付きエクスポート優先（`playwright.config.ts` の default export のみ例外）
- 各タスクの最後に必ずコミットする。コミットメッセージは Conventional Commits + 日本語

## ファイル構成

| ファイル | 責務 |
|---|---|
| `e2e/package.json` | パッケージ定義。3 つの web アプリを `workspace:*` 依存として宣言（turbo の `^build` を効かせるため） |
| `e2e/tsconfig.json` | `tsconfig.base.json` を継承 |
| `e2e/vitest.config.ts` | 静的テストの include を `tests/**/*.test.ts` に限定（`specs/*.spec.ts` を拾わせない） |
| `e2e/playwright.config.ts` | ターゲット解決・タイムアウト・証跡の設定。**default export はここだけの例外** |
| `e2e/harness/target.ts` | `local` / `production` の解決と取り違え防止（純関数） |
| `e2e/harness/site-config.ts` | 本番サイトブロックからローカル用を生成（純関数） |
| `e2e/harness/paths.ts` | リポジトリルートと各種パスの解決 |
| `e2e/harness/browsers.ts` | Chromium の要求 revision が導入済みかの検査 |
| `e2e/harness/preflight.ts` | ポート占有・残骸・dist の検査 |
| `e2e/harness/caddy.ts` | Caddy の取得・断片の設置・起動・停止・撤去 |
| `e2e/harness/www.ts` | `/var/www/*` の symlink 張り替えと復旧 |
| `e2e/harness/sync.ts` | timer-sync / poker-sync の起動と停止 |
| `e2e/harness/global-setup.ts` | 上記の組み立て。Playwright の globalSetup |
| `e2e/tests/target.test.ts` | ターゲット解決の静的テスト |
| `e2e/tests/site-config.test.ts` | 「差分はアドレス行 1 行だけ」の静的テスト |
| `e2e/specs/routing.spec.ts` | `@smoke` 6 本 |
| `apps/landing/tests/caddy-fragment-port.test.ts` | 断片の `reverse_proxy` ポートと `app.env` の `PORT` の一致 |
| `.github/workflows/ci.yml`（修正） | `e2e` ジョブの追加 |
| `pnpm-workspace.yaml` / `turbo.json` / `package.json` / `.gitignore`（修正） | 登録 |

---

### Task 1: `e2e` パッケージを作り、ワークスペースに登録する

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/tsconfig.json`
- Create: `e2e/vitest.config.ts`
- Create: `e2e/tests/workspace.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `turbo.json`
- Modify: `package.json`（ルート）
- Modify: `.gitignore`

**Interfaces:**
- Consumes: なし
- Produces: `@tasuki/e2e` パッケージ。`pnpm test` から vitest が、`pnpm e2e` から Playwright が呼べる状態

- [ ] **Step 1: 「まだ登録されていない」ことを示す失敗するテストを書く**

`e2e/tests/workspace.test.ts` を作る。

```ts
/**
 * e2e パッケージがワークスペースに正しく登録されていることを固定する。
 *
 * このテストが `pnpm test`（＝ turbo run test）で実行されること自体が、
 * 登録が効いている証拠になる。glob の追加を忘れると、このファイルは
 * 存在するのに一度も実行されない（＝ 静かに効かなくなる典型）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot(process.cwd());

describe('e2e パッケージの登録', () => {
  it('Given ワークスペース定義 / When glob を読む / Then e2e が含まれる', () => {
    // Given: pnpm-workspace.yaml
    const yaml = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    // When / Then: e2e が packages の glob に含まれる
    expect(yaml).toMatch(/^\s*-\s*["']?e2e["']?\s*$/m);
  });

  it('Given e2e の依存宣言 / When 読む / Then 3 つの web アプリを依存として持つ', () => {
    // Given: turbo の ^build は package.json の依存宣言を根拠にする。
    //        ここが抜けると `pnpm e2e` 単独実行で dist がビルドされない。
    const pkg: unknown = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'e2e', 'package.json'), 'utf8'),
    );
    // When: dependencies を取り出す
    const deps =
      typeof pkg === 'object' && pkg !== null && 'dependencies' in pkg
        ? (pkg as { dependencies: Record<string, string> }).dependencies
        : {};
    // Then: 3 つとも workspace 依存として宣言されている
    expect(deps['@tasuki/timer-web']).toBe('workspace:*');
    expect(deps['@tasuki/poker-web']).toBe('workspace:*');
    expect(deps['@tasuki/landing']).toBe('workspace:*');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work && pnpm test 2>&1 | grep -i e2e`
Expected: e2e のタスクが**そもそも実行されない**（ワークスペースに登録されていないため出力に現れない）

- [ ] **Step 3: `e2e/package.json` を作る**

```json
{
  "name": "@tasuki/e2e",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "e2e": "TASUKI_E2E_TARGET=local playwright test",
    "e2e:prod": "TASUKI_E2E_TARGET=production playwright test --grep \"@smoke|@core\"",
    "lint": "eslint harness specs tests --no-error-on-unmatched-pattern",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tasuki/landing": "workspace:*",
    "@tasuki/poker-web": "workspace:*",
    "@tasuki/timer-web": "workspace:*"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@types/node": "^22.10.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.0"
  }
}
```

`--no-error-on-unmatched-pattern` を付けているのは、`harness/` と `specs/` を作るのが
後続タスクだから。付けないと eslint が exit 2 で落ち、**CI がルートで `pnpm lint` を
フィルタなしに実行するため CI ごと壊れる**。

3 つの web アプリは**コードとしては使わない**。turbo の `^build` に「先にビルドせよ」と
伝えるためだけの宣言なので、`e2e/package.json` の先頭にその旨のコメントは書けない（JSON）。
代わりに `e2e/README.md` は作らず、`e2e/harness/paths.ts` の冒頭に理由を書く（Task 5）。

- [ ] **Step 4: `e2e/tsconfig.json` を作る**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["harness", "specs", "tests", "playwright.config.ts", "vitest.config.ts"]
}
```

`DOM` を入れているのは、後段（第 2 段）で Playwright の型が DOM 型を参照するため。

- [ ] **Step 5: `e2e/vitest.config.ts` を作る**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vitest の既定 include は `**/*.{test,spec}.?(c|m)[jt]s?(x)` で、
    // **Playwright のシナリオ（specs/*.spec.ts）まで拾ってしまう**。
    // 拾うと Playwright の test 関数が vitest 上で実行され、意味不明な失敗になる。
    // ここで明示的に tests/ の *.test.ts だけに絞る。
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: `pnpm-workspace.yaml` に glob を足す**

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "e2e"
```

- [ ] **Step 7: `turbo.json` に `e2e` タスクを足す**

`tasks` に次の 2 つを追加する。

```json
    "e2e": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "e2e:prod": {
      "cache": false
    },
    "@tasuki/e2e#test": {
      "dependsOn": []
    }
```

`e2e:prod` に `dependsOn` を付けないのは、**本番ターゲットではローカルの成果物を
一切使わない**から。ここでビルドを走らせると、本番を見ているつもりでローカルの
ビルドが通ったことに安心してしまう。

`@tasuki/e2e#test` で `dependsOn` を空に上書きするのが要点。共通の `test` タスクは
`dependsOn: ["^build"]` を持つため、これが無いと **`pnpm test` を叩くたびに
3 つの web アプリのビルドが走る**（e2e が依存を宣言した副作用）。静的テストに
ビルドは要らない。

- [ ] **Step 8: ルート `package.json` にスクリプトを足す**

`scripts` に追加する。

```json
    "e2e": "turbo run e2e",
    "e2e:prod": "turbo run e2e:prod"
```

- [ ] **Step 9: `.gitignore` に証跡の出力先を足す**

「テスト・カバレッジ」の節に 1 行足す。

```
e2e/test-results/
```

- [ ] **Step 10: 依存を導入する**

Run: `cd /home/vscode/tasuki-work && corepack pnpm install`
Expected: `@tasuki/e2e` が認識され、`@playwright/test 1.62.1` が入る

- [ ] **Step 11: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && corepack pnpm test 2>&1 | grep -A3 '@tasuki/e2e:test'`
Expected: `Tests  2 passed (2)`

- [ ] **Step 12: `pnpm test` が web アプリをビルドしていないことを確認する**

```bash
cd /home/vscode/tasuki-work
rm -rf apps/landing/dist
corepack pnpm test >/dev/null 2>&1
ls apps/landing/dist 2>&1        # ここで「無い」ことを確認する
corepack pnpm build >/dev/null   # 後続タスクのために戻す
```
Expected: `ls` が `No such file or directory`（Step 7 の上書きが効いている証拠）。
**確認したら必ず `pnpm build` で戻すこと。** 消したままだと後続タスクの preflight が落ちる

- [ ] **Step 13: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e pnpm-workspace.yaml turbo.json package.json .gitignore pnpm-lock.yaml
git commit -m "chore: e2e パッケージを新設してワークスペースに登録する（#73）

- turbo の ^build を効かせるため 3 つの web アプリを workspace 依存として宣言する
- @tasuki/e2e#test で dependsOn を空に上書きし、pnpm test がビルドを引き起こさないようにする
- vitest の include を tests/**/*.test.ts に絞り、Playwright の spec を拾わせない"
```

---

### Task 2: ターゲット解決と取り違え防止

**Files:**
- Create: `e2e/harness/target.ts`
- Test: `e2e/tests/target.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `LOCAL_BASE_URL: string`（`'http://127.0.0.1:18080'`）
  - `type Target = { kind: 'local' | 'production'; baseURL: string }`
  - `resolveTarget(env: Record<string, string | undefined>): Target`（違反時は `Error` を投げる）

- [ ] **Step 1: 失敗するテストを書く**

`e2e/tests/target.test.ts`

```ts
/**
 * ターゲットの取り違えを防ぐ。
 *
 * シェルに前回の TASUKI_E2E_BASE_URL が残ったまま `pnpm e2e` を叩くと、
 * ローカル向けのつもりで本番へ全シナリオを流す事故が起きる。
 * 逆に本番向けの実行で変数が空だと、本番を確認したつもりでローカルを見る。
 * **どちらの向きも起動前に落とす。**
 */
import { describe, it, expect } from 'vitest';
import { LOCAL_BASE_URL, resolveTarget } from '../harness/target';

describe('resolveTarget', () => {
  it('Given TASUKI_E2E_TARGET=local かつ BASE_URL 未設定 / When 解決する / Then ローカルの固定 URL になる', () => {
    // Given / When
    const target = resolveTarget({ TASUKI_E2E_TARGET: 'local' });
    // Then
    expect(target).toEqual({ kind: 'local', baseURL: LOCAL_BASE_URL });
    expect(LOCAL_BASE_URL).toBe('http://127.0.0.1:18080');
  });

  it('Given local なのに BASE_URL が残っている / When 解決する / Then 落ちる', () => {
    // Given: 前回の本番実行の変数が残った状態
    const env = { TASUKI_E2E_TARGET: 'local', TASUKI_E2E_BASE_URL: 'https://example.com' };
    // When / Then: 本番へ流す前に落とす
    expect(() => resolveTarget(env)).toThrow(/TASUKI_E2E_BASE_URL/);
  });

  it('Given production かつ https の公開 URL / When 解決する / Then その URL になる', () => {
    // Given / When
    const target = resolveTarget({
      TASUKI_E2E_TARGET: 'production',
      TASUKI_E2E_BASE_URL: 'https://tasuki.example.com',
    });
    // Then
    expect(target).toEqual({ kind: 'production', baseURL: 'https://tasuki.example.com' });
  });

  it('Given production かつ末尾スラッシュ付き / When 解決する / Then 末尾スラッシュを取り除く', () => {
    // Given: baseURL に末尾スラッシュがあると Playwright の相対パス解決がずれる
    const target = resolveTarget({
      TASUKI_E2E_TARGET: 'production',
      TASUKI_E2E_BASE_URL: 'https://tasuki.example.com/',
    });
    // Then
    expect(target.baseURL).toBe('https://tasuki.example.com');
  });

  it('Given production なのに BASE_URL が無い / When 解決する / Then 落ちる', () => {
    expect(() => resolveTarget({ TASUKI_E2E_TARGET: 'production' })).toThrow(/TASUKI_E2E_BASE_URL/);
  });

  it('Given production なのに http / When 解決する / Then 落ちる', () => {
    // Given: 本番は必ず TLS。http を許すと誤った対象を見て緑になる
    const env = { TASUKI_E2E_TARGET: 'production', TASUKI_E2E_BASE_URL: 'http://tasuki.example.com' };
    expect(() => resolveTarget(env)).toThrow(/https/);
  });

  it.each([
    'https://localhost',
    'https://127.0.0.1:18080',
    'https://10.1.2.3',
    'https://192.168.1.5',
    'https://172.16.0.1',
  ])('Given production なのにローカル宛の %s / When 解決する / Then 落ちる', (url) => {
    // Given: 本番のつもりでローカルを見る事故を塞ぐ
    const env = { TASUKI_E2E_TARGET: 'production', TASUKI_E2E_BASE_URL: url };
    expect(() => resolveTarget(env)).toThrow(/ローカル/);
  });

  it('Given TASUKI_E2E_TARGET が未設定 / When 解決する / Then 落ちる', () => {
    // Given: playwright.config.ts を直接叩かれた場合。既定値を持たせない
    expect(() => resolveTarget({})).toThrow(/TASUKI_E2E_TARGET/);
  });

  it('Given TASUKI_E2E_TARGET が想定外の値 / When 解決する / Then 落ちる', () => {
    expect(() => resolveTarget({ TASUKI_E2E_TARGET: 'staging' })).toThrow(/TASUKI_E2E_TARGET/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/target.test.ts`
Expected: FAIL — `Failed to resolve import "../harness/target"`

- [ ] **Step 3: `e2e/harness/target.ts` を実装する**

```ts
/**
 * E2E の実行対象（ターゲット）を解決する。
 *
 * ローカルの入口は固定ポートにしている。動的に確保すると、その値を
 * playwright.config.ts へ渡す経路が別途必要になるうえ、ポートの占有検査が
 * そのまま二重起動の排他として使えなくなる。
 */

/** ローカルのハーネスが待ち受ける入口。Caddy がこのポートで listen する。 */
export const LOCAL_BASE_URL = 'http://127.0.0.1:18080';

export interface Target {
  readonly kind: 'local' | 'production';
  readonly baseURL: string;
}

/** ローカル宛と判断するホスト名・IP。本番ターゲットでこれらを見たら事故。 */
const LOCAL_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^\[?::1\]?$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * 環境変数からターゲットを決める。
 *
 * **既定値を持たせない。** 「何も指定しなければローカル」にすると、
 * 本番向けの環境変数が残ったシェルで事故が起きる。
 */
export function resolveTarget(env: Record<string, string | undefined>): Target {
  const kind = env['TASUKI_E2E_TARGET'];
  const rawBaseUrl = env['TASUKI_E2E_BASE_URL']?.trim() ?? '';

  if (kind !== 'local' && kind !== 'production') {
    throw new Error(
      `TASUKI_E2E_TARGET は 'local' か 'production' を指定してください（受け取った値: ${JSON.stringify(kind)}）。` +
        ' ルートから `pnpm e2e` または `pnpm e2e:prod` を実行すると自動で設定されます。',
    );
  }

  if (kind === 'local') {
    if (rawBaseUrl !== '') {
      throw new Error(
        `ローカル実行なのに TASUKI_E2E_BASE_URL が設定されています（${rawBaseUrl}）。` +
          ' 本番向けの変数が残っている可能性があります。`unset TASUKI_E2E_BASE_URL` してください。',
      );
    }
    return { kind: 'local', baseURL: LOCAL_BASE_URL };
  }

  if (rawBaseUrl === '') {
    throw new Error('本番実行には TASUKI_E2E_BASE_URL が必要です（例: https://tasuki.example.com）。');
  }

  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error(`TASUKI_E2E_BASE_URL が URL として解釈できません: ${rawBaseUrl}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`本番は https のみ許可します（受け取った値: ${rawBaseUrl}）。`);
  }
  if (isLocalHost(url.hostname)) {
    throw new Error(
      `本番ターゲットにローカル宛の URL が指定されています: ${rawBaseUrl}。` +
        ' 本番を確認したつもりでローカルを見る事故を防ぐため拒否します。',
    );
  }

  return { kind: 'production', baseURL: rawBaseUrl.replace(/\/+$/, '') };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/target.test.ts`
Expected: PASS（10 件）

- [ ] **Step 5: わざと壊して落ちることを確認する**

`isLocalHost` の `return` を `return false;` に一時変更してテストを実行する。

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/target.test.ts`
Expected: FAIL（ローカル宛を拒否する 5 件が落ちる）。確認したら変更を戻す

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/harness/target.ts e2e/tests/target.test.ts
git commit -m "feat: E2E のターゲット解決と取り違え防止を入れる（#73）

- TASUKI_E2E_TARGET に既定値を持たせない（未指定は落とす）
- local なのに TASUKI_E2E_BASE_URL が残っていたら起動前に落とす
- production は https 必須かつローカル宛の URL を拒否する"
```

---

### Task 3: ローカル用サイトブロックの生成（差分はアドレス行 1 行だけ）

**Files:**
- Create: `e2e/harness/site-config.ts`
- Test: `e2e/tests/site-config.test.ts`

**Interfaces:**
- Consumes: `LOCAL_BASE_URL`（Task 2）
- Produces:
  - `PRODUCTION_ADDRESS_LINE: string`（`'<公開ドメイン> {'`）
  - `toLocalSiteConfig(productionConf: string, address: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`e2e/tests/site-config.test.ts`

```ts
/**
 * ローカル用サイトブロックの生成規則を固定する。
 *
 * 経路の本体（deploy/<app>/caddy/*.conf）は 1 バイトも書き換えない。書き換えるのは
 * サイトブロック（deploy/caddy/tasuki.conf）の**アドレス行 1 行だけ**で、
 * ドメインと TLS(ACME) がローカルで再現できないことだけが理由。
 *
 * **ここが緩むと「ローカルだけ通る設定」で緑になる。** 差分が 1 行であることを
 * 機械的に固定して、header や import を取りこぼす改変を落とす。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LOCAL_BASE_URL } from '../harness/target';
import { PRODUCTION_ADDRESS_LINE, toLocalSiteConfig } from '../harness/site-config';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const PRODUCTION_CONF = readFileSync(
  path.join(findRepoRoot(process.cwd()), 'deploy', 'caddy', 'tasuki.conf'),
  'utf8',
);

/** 行単位で異なる位置を返す。行数が違えば -1 を含めて返す。 */
function changedLineIndices(before: string, after: string): number[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length !== b.length) return [-1];
  const changed: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) changed.push(i);
  }
  return changed;
}

describe('toLocalSiteConfig', () => {
  const local = toLocalSiteConfig(PRODUCTION_CONF, LOCAL_BASE_URL);

  it('Given 本番のサイトブロック / When 走査する / Then アドレス行がちょうど 1 本ある（走査先を間違えていない）', () => {
    // 0 本だと以降の検査がすべて素通りする
    const hits = PRODUCTION_CONF.split('\n').filter((l) => l.trimEnd() === PRODUCTION_ADDRESS_LINE);
    expect(hits).toHaveLength(1);
  });

  it('Given 本番のサイトブロック / When ローカル用に変換する / Then 差分はちょうど 1 行', () => {
    // Given: 本番の内容
    // When: 変換する
    // Then: 変わったのは 1 行だけ
    expect(changedLineIndices(PRODUCTION_CONF, local)).toHaveLength(1);
  });

  it('Given 変換結果 / When 差分の行を見る / Then アドレス行だけが置き換わっている', () => {
    // Given / When
    const [index] = changedLineIndices(PRODUCTION_CONF, local);
    expect(index).toBeGreaterThanOrEqual(0);
    // Then
    expect(PRODUCTION_CONF.split('\n')[index as number]?.trimEnd()).toBe(PRODUCTION_ADDRESS_LINE);
    expect(local.split('\n')[index as number]).toBe(`${LOCAL_BASE_URL} {`);
  });

  it('Given 変換結果 / When import 行を探す / Then 断片の import が残っている', () => {
    // 断片が読まれなければ何を検証しても意味がない
    expect(local).toContain('import /etc/caddy/tasuki/apps/*.conf');
  });

  it.each([
    'Strict-Transport-Security',
    'X-Robots-Tag',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
  ])('Given 変換結果 / When ヘッダ %s を探す / Then 残っている', (header) => {
    // ヘッダは @smoke #6 の検証対象。ローカルで落ちると本番の設定を見ていないことになる
    expect(local).toContain(header);
  });

  it('Given アドレス行が 2 本ある設定 / When 変換する / Then 落ちる', () => {
    // Given: 想定外の形。黙って片方だけ置換すると壊れた設定が生まれる
    const broken = `${PRODUCTION_ADDRESS_LINE}\n${PRODUCTION_ADDRESS_LINE}\n`;
    // When / Then
    expect(() => toLocalSiteConfig(broken, LOCAL_BASE_URL)).toThrow(/1 本/);
  });

  it('Given アドレス行が無い設定 / When 変換する / Then 落ちる', () => {
    expect(() => toLocalSiteConfig('example.com {\n}\n', LOCAL_BASE_URL)).toThrow(/1 本/);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/site-config.test.ts`
Expected: FAIL — `Failed to resolve import "../harness/site-config"`

- [ ] **Step 3: `e2e/harness/site-config.ts` を実装する**

```ts
/**
 * 本番のサイトブロック（deploy/caddy/tasuki.conf）からローカル用を作る。
 *
 * **差し替えるのはアドレス行 1 行だけ。** ドメインと TLS(ACME) はローカルで
 * 再現できないためで、それ以外に理由は無い。header ブロックと
 * `import /etc/caddy/tasuki/apps/*.conf` はそのまま活かす。
 *
 * 断片（deploy/<app>/caddy/*.conf）はこの関数を通さない。あちらは内容を
 * 1 バイトも変えずに設置する。
 */

/** 本番のアドレス行。デプロイ時に sed で実ドメインへ置換される前の形。 */
export const PRODUCTION_ADDRESS_LINE = '<公開ドメイン> {';

/**
 * ローカル用のサイトブロックを生成する。
 *
 * @param productionConf `deploy/caddy/tasuki.conf` の内容
 * @param address 待ち受けアドレス（例: `http://127.0.0.1:18080`）
 * @throws アドレス行がちょうど 1 本でないとき
 */
export function toLocalSiteConfig(productionConf: string, address: string): string {
  const lines = productionConf.split('\n');
  const targets = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trimEnd() === PRODUCTION_ADDRESS_LINE);

  if (targets.length !== 1) {
    throw new Error(
      `アドレス行（${PRODUCTION_ADDRESS_LINE}）はちょうど 1 本である必要があります。` +
        `見つかった数: ${targets.length}。deploy/caddy/tasuki.conf の形が変わっていないか確認してください。`,
    );
  }

  const [target] = targets;
  const replaced = [...lines];
  replaced[target!.index] = `${address} {`;
  return replaced.join('\n');
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/site-config.test.ts`
Expected: PASS（11 件）

- [ ] **Step 5: わざと壊して落ちることを確認する**

`toLocalSiteConfig` の最後を `return replaced.join('\n').replace(/\theader \{[\s\S]*?\t\}\n/, '');`
に一時変更する（header ブロックを落とす改変）。

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/site-config.test.ts`
Expected: FAIL（差分 1 行の検査とヘッダ 5 件が落ちる）。確認したら変更を戻す

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/harness/site-config.ts e2e/tests/site-config.test.ts
git commit -m "feat: ローカル用サイトブロックの生成規則を固定する（#73）

- 差し替えるのはアドレス行 1 行だけであることをテストで機械的に固定する
- header 5 種と断片の import が残ることを併せて押さえる
- アドレス行がちょうど 1 本でなければ落とす"
```

---

### Task 4: 断片の `reverse_proxy` ポートと `app.env` の `PORT` の一致

**Files:**
- Create: `apps/landing/tests/caddy-fragment-port.test.ts`

**Interfaces:**
- Consumes: なし（`deploy/` を直接読む）
- Produces: なし（静的検査のみ）

既存の `apps/landing/tests/caddy-fragment-order.test.ts` の隣に置く。同じ対象
（`deploy/` 配下の断片）を見ているものを 1 箇所に集めるため。E2E では検出できるが、
落ちたときに「ポートが違う」と一目で分かるほうが速い。

- [ ] **Step 1: 失敗するテストを書く**

`apps/landing/tests/caddy-fragment-port.test.ts`

```ts
/**
 * Caddy 断片が転送するポートと、デプロイ定義（deploy/<app>/app.env）の PORT が
 * 一致していることを固定する。
 *
 * 同じ値を 2 つの別ファイルが持っているため、**食い違ってもどちらも正しく見える**。
 * 断片だけ直して app.env を忘れると、systemd は別のポートで起動し、
 * Caddy は誰も居ないポートへ転送する。どちらのファイルにも誤りが見当たらない状態になる。
 *
 * E2E でも検出できるが、あちらは Caddy とサーバーを立てる必要があり遅い。
 * ここは文字列の突き合わせだけなので `pnpm test` の速い側で落とす。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

const DEPLOY_ROOT = path.join(findRepoRoot(process.cwd()), 'deploy');

function appDirs(): string[] {
  return readdirSync(DEPLOY_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** 断片が転送する先のポートを集める（コメント行は除く）。 */
function proxiedPorts(): { port: string; source: string }[] {
  const found: { port: string; source: string }[] = [];
  for (const app of appDirs()) {
    const dir = path.join(DEPLOY_ROOT, app, 'caddy');
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.conf')) continue;
      const body = readFileSync(path.join(dir, name), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'));
      for (const line of body) {
        const match = /reverse_proxy\s+127\.0\.0\.1:(\d+)/.exec(line);
        if (match?.[1]) found.push({ port: match[1], source: path.join('deploy', app, 'caddy', name) });
      }
    }
  }
  return found;
}

/** app.env が宣言する PORT を集める。 */
function declaredPorts(): Map<string, string> {
  const ports = new Map<string, string>();
  for (const app of appDirs()) {
    const envPath = path.join(DEPLOY_ROOT, app, 'app.env');
    if (!existsSync(envPath)) continue;
    const match = /^PORT=(\d+)$/m.exec(readFileSync(envPath, 'utf8'));
    if (match?.[1]) ports.set(match[1], path.join('deploy', app, 'app.env'));
  }
  return ports;
}

describe('Caddy 断片の転送先ポート', () => {
  const proxied = proxiedPorts();
  const declared = declaredPorts();

  it('Given deploy 配下 / When reverse_proxy を集める / Then 2 本ある（走査先を間違えていない）', () => {
    // timer(8787) と poker(3311)。0 本だと以降の検査が素通りする
    expect(proxied.map((p) => p.port).sort()).toEqual(['3311', '8787']);
  });

  it('Given app.env / When PORT を集める / Then 2 本ある', () => {
    expect([...declared.keys()].sort()).toEqual(['3311', '8787']);
  });

  it('転送先のポートはすべて app.env が宣言している（食い違うと誰も居ないポートへ転送する）', () => {
    // Given: 断片の転送先
    // When: app.env の宣言と突き合わせる
    // Then: すべて対応がある
    const orphans = proxied.filter((p) => !declared.has(p.port));
    expect(orphans.map((o) => `${o.source} → 127.0.0.1:${o.port}`)).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが通ることを確認する（現状は一致しているので緑になる）**

Run: `cd /home/vscode/tasuki-work && corepack pnpm --filter @tasuki/landing test`
Expected: PASS

- [ ] **Step 3: わざと壊して落ちることを確認する**

`deploy/timer/app.env` の `PORT=8787` を `PORT=8788` に一時変更する。

Run: `cd /home/vscode/tasuki-work && corepack pnpm --filter @tasuki/landing test`
Expected: FAIL（3 件すべて落ちる）。確認したら `git checkout deploy/timer/app.env` で戻す

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add apps/landing/tests/caddy-fragment-port.test.ts
git commit -m "test: 断片の転送先ポートと app.env の PORT の一致を固定する（#73）

同じ値を 2 つの別ファイルが持つため、食い違ってもどちらも正しく見える。
E2E でも検出できるが、文字列の突き合わせで落とすほうが速く原因も明確になる。"
```

---

### Task 5: パス解決とブラウザの検査

**Files:**
- Create: `e2e/harness/paths.ts`
- Create: `e2e/harness/browsers.ts`
- Test: `e2e/tests/browsers.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `REPO_ROOT: string`
  - `WEB_ROOTS: readonly { link: string; dist: string }[]` — `/var/www/*` と dist の対応
  - `FRAGMENT_SOURCES: readonly string[]` — 断片 5 本の絶対パス
  - `SITE_CONF_SOURCE: string`、`CADDY_ETC_DIR`、`CADDY_APPS_DIR`、`TEST_RESULTS_DIR`、`LOG_DIR`
  - `requiredChromiumRevision(): string`
  - `assertChromiumInstalled(env: Record<string, string | undefined>): void`

- [ ] **Step 1: `e2e/harness/paths.ts` を実装する**

テストは付けない（定数とパス解決のみで、誤りは後続タスクの実行が即座に暴く）。

```ts
/**
 * ハーネスが触る場所の一覧。
 *
 * ここに集約する理由は 2 つ。1 つは後始末で消す対象を取りこぼさないため。
 * もう 1 つは、e2e/package.json が 3 つの web アプリを workspace 依存として
 * 宣言している理由がここを読めば分かるようにするため —— **コードとしては
 * 使わないが、turbo の `^build` に「先にビルドせよ」と伝えるための宣言**であり、
 * 実際に読むのは下の WEB_ROOTS が指す dist だけである。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'deploy')) && existsSync(path.join(dir, 'apps'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`リポジトリルートが見つからない（${from} から探索）`);
    dir = parent;
  }
}

export const REPO_ROOT = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

/** Caddy 断片が絶対値で宣言している配信元と、実際の成果物の対応。 */
export const WEB_ROOTS: readonly { readonly link: string; readonly dist: string }[] = [
  { link: '/var/www/tasuki', dist: path.join(REPO_ROOT, 'apps/timer-web/dist') },
  { link: '/var/www/tasuki-poker', dist: path.join(REPO_ROOT, 'apps/poker-web/dist') },
  { link: '/var/www/tasuki-home', dist: path.join(REPO_ROOT, 'apps/landing/dist') },
];

/** 経路の本体。**内容を 1 バイトも書き換えずに**設置する。 */
export const FRAGMENT_SOURCES: readonly string[] = [
  'deploy/timer/caddy/10-timer-ws.conf',
  'deploy/poker/caddy/20-poker.conf',
  'deploy/timer/caddy/30-timer-spa.conf',
  'deploy/timer/caddy/40-timer-legacy-room.conf',
  'deploy/landing/caddy/90-landing.conf',
].map((rel) => path.join(REPO_ROOT, rel));

export const SITE_CONF_SOURCE = path.join(REPO_ROOT, 'deploy/caddy/tasuki.conf');

/** 断片の import が絶対パス固定なので、ここへ設置するしかない。 */
export const CADDY_ETC_DIR = '/etc/caddy/tasuki';
export const CADDY_APPS_DIR = '/etc/caddy/tasuki/apps';

export const TEST_RESULTS_DIR = path.join(REPO_ROOT, 'e2e/test-results');
export const LOG_DIR = path.join(TEST_RESULTS_DIR, 'logs');

/** Caddy の版は固定する。「最新」を取ると、ある日突然赤くなって原因が分からない。 */
export const CADDY_VERSION = '2.11.4';
export const CADDY_CACHE_DIR = path.join(
  process.env['HOME'] ?? '/tmp',
  '.cache/tasuki-e2e',
  `caddy-${CADDY_VERSION}`,
);

/** ハーネスが使うポート。断片が絶対値で宣言しているため sync 側は変えられない。 */
export const PORTS = { caddy: 18080, timerSync: 8787, pokerSync: 3311 } as const;
```

- [ ] **Step 2: 失敗するテストを書く**

`e2e/tests/browsers.test.ts`

```ts
/**
 * Chromium の要求 revision が導入済みかを起動前に検査する。
 *
 * 検査しないと、Playwright が root 所有の /opt/playwright-browsers へ
 * 書こうとして、原因の分からないエラーになる。devcontainer のイメージが
 * 更新されたら、この検査が最初に教えてくれる。
 */
import { describe, it, expect } from 'vitest';
import { assertChromiumInstalled, requiredChromiumRevision } from '../harness/browsers';

describe('requiredChromiumRevision', () => {
  it('Given 導入済みの playwright-core / When 要求 revision を読む / Then 数字の文字列が返る', () => {
    // Given / When
    const revision = requiredChromiumRevision();
    // Then: browsers.json から読めている
    expect(revision).toMatch(/^\d+$/);
  });
});

describe('assertChromiumInstalled', () => {
  it('Given PLAYWRIGHT_BROWSERS_PATH が未設定 / When 検査する / Then 何もしない（Playwright に任せる）', () => {
    // Given: CI では Playwright が自分で ~/.cache へ入れる
    // When / Then: 落ちない
    expect(() => assertChromiumInstalled({})).not.toThrow();
  });

  it('Given 存在しないディレクトリを指す / When 検査する / Then 要求 revision を示して落ちる', () => {
    // Given: ずれた環境
    const env = { PLAYWRIGHT_BROWSERS_PATH: '/nonexistent-browsers-path' };
    // When / Then
    expect(() => assertChromiumInstalled(env)).toThrow(new RegExp(requiredChromiumRevision()));
  });

  it('Given この環境の PLAYWRIGHT_BROWSERS_PATH / When 検査する / Then 通る', () => {
    // Given: devcontainer には chromium-1234 が導入済み
    const configured = process.env['PLAYWRIGHT_BROWSERS_PATH'];
    if (configured === undefined) return; // CI では未設定なので検査しない
    // When / Then
    expect(() => assertChromiumInstalled({ PLAYWRIGHT_BROWSERS_PATH: configured })).not.toThrow();
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/browsers.test.ts`
Expected: FAIL — `Failed to resolve import "../harness/browsers"`

- [ ] **Step 4: `e2e/harness/browsers.ts` を実装する**

```ts
/**
 * Playwright が要求する Chromium の revision と、導入済みのものが合っているかを検査する。
 *
 * revision は Playwright の版に 1 対 1 で紐づく（実測: 1.62.x → 1234 / 1.61.x → 1228）。
 * そのため package.json では版を完全固定している。ここはその固定が崩れていないか、
 * あるいは実行環境のブラウザが更新されていないかを起動前に捕まえる関門。
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

interface BrowsersJson {
  readonly browsers: readonly { readonly name: string; readonly revision: string }[];
}

/** playwright-core の browsers.json が宣言する chromium の revision。 */
export function requiredChromiumRevision(): string {
  const require = createRequire(import.meta.url);
  // browsers.json は package.json の exports に載っていないため、
  // package.json を解決してから隣を読む。
  const pkgPath = require.resolve('playwright-core/package.json');
  const raw: unknown = JSON.parse(readFileSync(path.join(path.dirname(pkgPath), 'browsers.json'), 'utf8'));
  const parsed = raw as BrowsersJson;
  const chromium = parsed.browsers.find((browser) => browser.name === 'chromium');
  if (chromium === undefined) {
    throw new Error('playwright-core の browsers.json に chromium の項目がありません。');
  }
  return chromium.revision;
}

/**
 * 要求 revision が導入済みかを検査する。
 *
 * `PLAYWRIGHT_BROWSERS_PATH` が指定されているとき（devcontainer）だけ検査する。
 * 未指定なら Playwright が自分の管理下（~/.cache）へ入れるので、こちらは口を出さない。
 */
export function assertChromiumInstalled(env: Record<string, string | undefined>): void {
  const browsersPath = env['PLAYWRIGHT_BROWSERS_PATH'];
  if (browsersPath === undefined || browsersPath === '') return;

  const revision = requiredChromiumRevision();
  const expected = path.join(browsersPath, `chromium-${revision}`);
  if (existsSync(expected)) return;

  throw new Error(
    `Chromium revision ${revision} が ${browsersPath} に見つかりません（探した場所: ${expected}）。\n` +
      'playwright の版と実行環境のブラウザがずれています。package.json の @playwright/test の版を、' +
      '導入済みの revision に対応するものへ合わせてください。',
  );
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/browsers.test.ts`
Expected: PASS（4 件）

- [ ] **Step 6: 要求 revision がこの環境と一致していることを目視する**

Run: `cd /home/vscode/tasuki-work/e2e && node -e "import('./harness/browsers.ts')" 2>/dev/null || corepack pnpm vitest run tests/browsers.test.ts --reporter=verbose`
Expected: 4 件パス（`PLAYWRIGHT_BROWSERS_PATH` を使う 1 件も通っている＝ revision 1234 が実在する）

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/harness/paths.ts e2e/harness/browsers.ts e2e/tests/browsers.test.ts
git commit -m "feat: ハーネスのパス定義と Chromium revision の検査を入れる（#73）

- 触る場所を paths.ts に集約し、後始末で取りこぼさないようにする
- 要求 revision が導入済みでなければ起動前に落とす
  （検査しないと root 所有のディレクトリへ書こうとして原因不明のエラーになる）"
```

---

### Task 6: 起動前の検査（preflight）

**Files:**
- Create: `e2e/harness/preflight.ts`
- Test: `e2e/tests/preflight.test.ts`

**Interfaces:**
- Consumes: `PORTS`, `WEB_ROOTS`, `CADDY_ETC_DIR`（Task 5）、`assertChromiumInstalled`（Task 5）
- Produces:
  - `findBusyPorts(ports: readonly number[]): Promise<number[]>`
  - `describePortHolders(ports: readonly number[]): string`
  - `assertPortsFree(ports: readonly number[]): Promise<void>`
  - `assertNoCaddyLeftovers(): void`
  - `assertWebRootsSafe(): void`
  - `assertDistsBuilt(): void`
  - `runPreflight(env: Record<string, string | undefined>): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`e2e/tests/preflight.test.ts`

```ts
/**
 * 起動前の検査。1 つでも該当したら起動せず、理由を示して落とす。
 *
 * ポートの占有検査は**そのまま二重起動の排他になる**。別途ロックファイルを
 * 持たないのは、TOCTOU のある自作ロックより OS が保証する bind の排他のほうが
 * 確実だから。
 */
import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { assertPortsFree, findBusyPorts } from '../harness/preflight';

const servers: net.Server[] = [];

/** 指定ポートを掴む。テスト後に必ず解放する。 */
async function occupy(port: number): Promise<void> {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('findBusyPorts', () => {
  it('Given 誰も使っていないポート / When 検査する / Then 空になる', async () => {
    // Given: 使われていない高位ポート
    // When / Then
    await expect(findBusyPorts([19801, 19802])).resolves.toEqual([]);
  });

  it('Given 使用中のポート / When 検査する / Then そのポートが返る', async () => {
    // Given
    await occupy(19803);
    // When / Then
    await expect(findBusyPorts([19803, 19804])).resolves.toEqual([19803]);
  });
});

describe('assertPortsFree', () => {
  it('Given 使用中のポート / When 検査する / Then ポート番号を含めて落ちる', async () => {
    // Given
    await occupy(19805);
    // When / Then: 誰が掴んでいるかを調べる手掛かりが出る
    await expect(assertPortsFree([19805])).rejects.toThrow(/19805/);
  });

  it('Given 空きポート / When 検査する / Then 通る', async () => {
    await expect(assertPortsFree([19806])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/preflight.test.ts`
Expected: FAIL — `Failed to resolve import "../harness/preflight"`

- [ ] **Step 3: `e2e/harness/preflight.ts` を実装する**

```ts
/**
 * 起動前の検査。**1 つでも該当したら起動しない。**
 *
 * 黙って混ざるのが最悪の結果なので、迷ったら落とす方に倒す。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { assertChromiumInstalled } from './browsers';
import { CADDY_ETC_DIR, PORTS, WEB_ROOTS } from './paths';
import { resolveTarget } from './target';

/** 指定ポートのうち、bind できなかったものを返す。 */
export async function findBusyPorts(ports: readonly number[]): Promise<number[]> {
  const busy: number[] = [];
  for (const port of ports) {
    const isFree = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (!isFree) busy.push(port);
  }
  return busy;
}

/** 誰がポートを掴んでいるかを調べる。ss が無い環境でも落ちないようにする。 */
export function describePortHolders(ports: readonly number[]): string {
  try {
    const output = execFileSync('ss', ['-tlnp'], { encoding: 'utf8' });
    const lines = output
      .split('\n')
      .filter((line) => ports.some((port) => line.includes(`:${port} `)));
    return lines.length > 0 ? lines.join('\n') : '（ss の出力に該当行が見つかりませんでした）';
  } catch {
    return '（ss コマンドが使えないため、掴んでいるプロセスを特定できませんでした）';
  }
}

export async function assertPortsFree(ports: readonly number[]): Promise<void> {
  const busy = await findBusyPorts(ports);
  if (busy.length === 0) return;
  throw new Error(
    `ポートが使用中です: ${busy.join(', ')}\n` +
      '`pnpm dev` が動いているか、前回の E2E の残骸が残っています。\n' +
      `${describePortHolders(busy)}`,
  );
}

/**
 * 前回の残骸、あるいはこのマシンの本物の Caddy 設定を検出する。
 *
 * **どちらか区別できないので、存在したら必ず落とす。** 他人の設定を壊さないため。
 */
export function assertNoCaddyLeftovers(): void {
  if (!existsSync(CADDY_ETC_DIR)) return;
  throw new Error(
    `${CADDY_ETC_DIR} が既に存在します。\n` +
      '前回の E2E が異常終了した残骸か、このマシンの本物の Caddy 設定です。\n' +
      `中身を確認したうえで、残骸であれば \`sudo rm -rf ${CADDY_ETC_DIR}\` してください。`,
  );
}

/**
 * `/var/www/*` に本物のディレクトリが居ないかを確認する。
 *
 * symlink なら前回の残骸なので張り替えてよい。実ディレクトリは本物のサイトなので触らない。
 */
export function assertWebRootsSafe(): void {
  for (const { link } of WEB_ROOTS) {
    if (!existsSync(link)) continue;
    if (lstatSync(link).isSymbolicLink()) continue;
    throw new Error(
      `${link} が symlink ではなく実体として存在します。\n` +
        'このマシンで実際に配信している可能性があるため、E2E は触りません。',
    );
  }
}

export function assertDistsBuilt(): void {
  const missing = WEB_ROOTS.filter(({ dist }) => !existsSync(path.join(dist, 'index.html'))).map(
    ({ dist }) => dist,
  );
  if (missing.length === 0) return;
  throw new Error(
    `ビルド成果物がありません:\n${missing.join('\n')}\n` + '`pnpm build` を先に実行してください。',
  );
}

/** すべての検査をまとめて実行する。 */
export async function runPreflight(env: Record<string, string | undefined>): Promise<void> {
  resolveTarget(env); // ターゲットの取り違えをここでも落とす
  assertChromiumInstalled(env);
  assertNoCaddyLeftovers();
  assertWebRootsSafe();
  assertDistsBuilt();
  await assertPortsFree([PORTS.caddy, PORTS.timerSync, PORTS.pokerSync]);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `cd /home/vscode/tasuki-work/e2e && corepack pnpm vitest run tests/preflight.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: 実環境で preflight が通ることを目視する**

Run:
```bash
cd /home/vscode/tasuki-work && corepack pnpm build >/dev/null 2>&1 && cd e2e && \
  TASUKI_E2E_TARGET=local corepack pnpm exec tsx -e "
    import('./harness/preflight.js').then(m => m.runPreflight(process.env)).then(
      () => console.log('preflight OK'),
      (e) => { console.error(e.message); process.exit(1); });
  " 2>&1 | tail -5
```
Expected: `preflight OK`
（`tsx` が無ければ `corepack pnpm vitest run tests/preflight.test.ts` の緑をもって代替とし、
実環境での確認は Task 8 の起動で行う）

- [ ] **Step 6: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/harness/preflight.ts e2e/tests/preflight.test.ts
git commit -m "feat: E2E の起動前検査を入れる（#73）

- ポート占有検査をそのまま二重起動の排他とする（自作ロックの TOCTOU を避ける）
- /etc/caddy/tasuki が存在したら必ず落とす（残骸か本物かを区別できないため）
- /var/www に実体ディレクトリが居たら触らない
- 掴んでいるプロセスを ss で示して原因を追えるようにする"
```

---

### Task 7: Caddy の取得・設置・起動・撤去

**Files:**
- Create: `e2e/harness/caddy.ts`

**Interfaces:**
- Consumes: `paths.ts` の定数、`toLocalSiteConfig`（Task 3）、`LOCAL_BASE_URL`（Task 2）
- Produces:
  - `ensureCaddyBinary(): Promise<string>` — バイナリの絶対パスを返す
  - `installCaddyConfig(): void` — 断片 5 本と site.conf を設置し、設置数を検証する
  - `removeCaddyConfig(): void`
  - `startCaddy(binaryPath: string): Promise<ChildProcess>`
  - `stopCaddy(proc: ChildProcess): Promise<void>`

テストは付けない。ここは `sudo` と外部プロセスの塊で、実行してみることが唯一の検証になる。
正しさは Task 8 の `@smoke` #1 が通ることで担保する。

- [ ] **Step 1: `e2e/harness/caddy.ts` を実装する**

```ts
/**
 * Caddy の取得・設置・起動・撤去。
 *
 * ## なぜ設置（コピー）が要るのか
 *
 * `deploy/caddy/tasuki.conf` の import は **絶対パス固定**である。
 *
 *     import /etc/caddy/tasuki/apps/*.conf
 *
 * Caddyfile 側にこれを読み替える手段は無いので、断片を所定の場所へ置くしかない。
 * **置くだけで、内容は 1 バイトも変えない。**
 *
 * ## なぜ caddy validate を起動ゲートにしないのか
 *
 * import のグロブが 0 件マッチでも `Valid configuration` を返すため（実測）。
 * 断片が 1 本も読まれていない状態でも「通った」ことになってしまう。
 * 代わりに**設置した断片の数を数える**。
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CADDY_APPS_DIR,
  CADDY_CACHE_DIR,
  CADDY_ETC_DIR,
  CADDY_VERSION,
  FRAGMENT_SOURCES,
  LOG_DIR,
  PORTS,
  SITE_CONF_SOURCE,
  TEST_RESULTS_DIR,
} from './paths';
import { toLocalSiteConfig } from './site-config';
import { LOCAL_BASE_URL } from './target';

const CADDY_BINARY = path.join(CADDY_CACHE_DIR, 'caddy');
const CADDY_TARBALL_URL =
  `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}` +
  `/caddy_${CADDY_VERSION}_linux_amd64.tar.gz`;

/** 版を固定して取得し、キャッシュする。 */
export async function ensureCaddyBinary(): Promise<string> {
  if (existsSync(CADDY_BINARY)) return CADDY_BINARY;

  mkdirSync(CADDY_CACHE_DIR, { recursive: true });
  const tarball = path.join(CADDY_CACHE_DIR, 'caddy.tar.gz');
  execFileSync('curl', ['-fsSL', '-o', tarball, CADDY_TARBALL_URL], { stdio: 'inherit' });
  execFileSync('tar', ['-xzf', tarball, '-C', CADDY_CACHE_DIR, 'caddy'], { stdio: 'inherit' });
  execFileSync('chmod', ['+x', CADDY_BINARY]);
  return CADDY_BINARY;
}

/** ローカル用のトップ Caddyfile。本番のホスト側と同じく import 1 行だけ。 */
function writeTopCaddyfile(): string {
  mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  const filePath = path.join(TEST_RESULTS_DIR, 'Caddyfile');
  writeFileSync(filePath, `import ${CADDY_ETC_DIR}/site.conf\n`, 'utf8');
  return filePath;
}

/**
 * 断片 5 本と site.conf を設置する。
 *
 * 断片は内容を変えずにコピーする。site.conf だけアドレス行 1 行を差し替える。
 */
export function installCaddyConfig(): void {
  execFileSync('sudo', ['mkdir', '-p', CADDY_APPS_DIR]);

  for (const source of FRAGMENT_SOURCES) {
    execFileSync('sudo', ['install', '-m', '644', source, CADDY_APPS_DIR]);
  }

  const localSiteConf = toLocalSiteConfig(readFileSync(SITE_CONF_SOURCE, 'utf8'), LOCAL_BASE_URL);
  const staged = path.join(TEST_RESULTS_DIR, 'site.conf');
  mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  writeFileSync(staged, localSiteConf, 'utf8');
  execFileSync('sudo', ['install', '-m', '644', staged, path.join(CADDY_ETC_DIR, 'site.conf')]);

  // caddy validate は import が 0 件でも成功するため、設置数を自分で数える。
  const installed = execFileSync('sudo', ['ls', '-1', CADDY_APPS_DIR], { encoding: 'utf8' })
    .split('\n')
    .filter((name) => name.endsWith('.conf'));
  if (installed.length !== FRAGMENT_SOURCES.length) {
    throw new Error(
      `断片の設置数が合いません（期待 ${FRAGMENT_SOURCES.length} / 実際 ${installed.length}）: ${installed.join(', ')}`,
    );
  }
}

export function removeCaddyConfig(): void {
  execFileSync('sudo', ['rm', '-rf', CADDY_ETC_DIR]);
}

/** ポートが応答するまで待つ。 */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const net = await import('node:net');
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => socket.end(() => resolve(true)));
      socket.once('error', () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`ポート ${port} が ${timeoutMs}ms 以内に応答しませんでした。`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function startCaddy(binaryPath: string): Promise<ChildProcess> {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = createWriteStream(path.join(LOG_DIR, 'caddy.log'), { flags: 'w' });
  const proc = spawn(binaryPath, ['run', '--config', writeTopCaddyfile(), '--adapter', 'caddyfile'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.pipe(log);
  proc.stderr.pipe(log);
  await waitForPort(PORTS.caddy, 15_000);
  return proc;
}

export async function stopCaddy(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => proc.kill('SIGKILL'), 5_000);
  });
}
```

- [ ] **Step 2: Caddy が取得できることを確認する**

Run: `cd /home/vscode/tasuki-work && ls ~/.cache/tasuki-e2e/caddy-2.11.4/caddy 2>/dev/null || echo "未取得（Task 8 の起動で取得される）"`
Expected: どちらでもよい（Task 8 で実際に取得・起動する）

- [ ] **Step 3: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/harness/caddy.ts
git commit -m "feat: Caddy の取得・設置・起動・撤去を実装する（#73）

- 断片は内容を変えずに /etc/caddy/tasuki/apps/ へ設置する
  （tasuki.conf の import が絶対パス固定のため、置くしかない）
- caddy validate は import が 0 件でも成功するので起動ゲートにせず、
  設置した断片の数を数える
- 版は 2.11.4 に固定して取得しキャッシュする"
```

---

### Task 8: `/var/www` の張り替えと sync サーバーの起動

**Files:**
- Create: `e2e/harness/www.ts`
- Create: `e2e/harness/sync.ts`

**Interfaces:**
- Consumes: `WEB_ROOTS`, `PORTS`, `LOG_DIR`, `REPO_ROOT`（Task 5）、`LOCAL_BASE_URL`（Task 2）
- Produces:
  - `linkWebRoots(): void` / `unlinkWebRoots(): void`
  - `startSyncServers(): Promise<ChildProcess[]>` / `stopSyncServers(procs: ChildProcess[]): Promise<void>`

- [ ] **Step 1: `e2e/harness/www.ts` を実装する**

```ts
/**
 * `/var/www/*` を各 dist へ向ける。
 *
 * 断片が `root * /var/www/tasuki` を絶対値で宣言しており、Caddy 側に読み替える
 * 手段が無いため、環境側を断片に合わせる。
 *
 * **ubuntu-latest には /var/www が存在しない**ので、まず作る。
 */
import { execFileSync } from 'node:child_process';
import { WEB_ROOTS } from './paths';

export function linkWebRoots(): void {
  execFileSync('sudo', ['mkdir', '-p', '/var/www']);
  for (const { link, dist } of WEB_ROOTS) {
    execFileSync('sudo', ['ln', '-sfn', dist, link]);
  }
}

/**
 * 張った symlink を外す。
 *
 * preflight で「実体ディレクトリなら触らない」を確認済みなので、
 * ここで消すのは symlink だけである。
 */
export function unlinkWebRoots(): void {
  for (const { link } of WEB_ROOTS) {
    execFileSync('sudo', ['rm', '-f', link]);
  }
}
```

- [ ] **Step 2: `e2e/harness/sync.ts` を実装する**

```ts
/**
 * timer-sync / poker-sync を Bun で起動する。
 *
 * ポートは本番と同じ 8787 / 3311。断片が絶対値で宣言しているため変えられない。
 *
 * ALLOWED_ORIGINS にはローカルの入口 URL を渡す。両サーバーとも空で起動を
 * 拒否するのは NODE_ENV=production のときだけだが、Origin 検査を本番と同じ形で
 * 働かせるために明示的に渡す。
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { LOG_DIR, PORTS, REPO_ROOT } from './paths';
import { LOCAL_BASE_URL } from './target';

interface SyncSpec {
  readonly name: string;
  readonly entry: string;
  readonly port: number;
}

const SYNC_SERVERS: readonly SyncSpec[] = [
  { name: 'timer-sync', entry: 'apps/timer-sync/src/server.ts', port: PORTS.timerSync },
  { name: 'poker-sync', entry: 'apps/poker-sync/src/server.ts', port: PORTS.pokerSync },
];

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => socket.end(() => resolve(true)));
      socket.once('error', () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`ポート ${port} が ${timeoutMs}ms 以内に応答しませんでした。`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function startSyncServers(): Promise<ChildProcess[]> {
  mkdirSync(LOG_DIR, { recursive: true });
  const procs: ChildProcess[] = [];

  for (const server of SYNC_SERVERS) {
    const log = createWriteStream(path.join(LOG_DIR, `${server.name}.log`), { flags: 'w' });
    const proc = spawn('bun', ['run', server.entry], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(server.port),
        HOST: '127.0.0.1',
        ALLOWED_ORIGINS: LOCAL_BASE_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.pipe(log);
    proc.stderr.pipe(log);
    procs.push(proc);
  }

  await Promise.all(SYNC_SERVERS.map((server) => waitForPort(server.port, 20_000)));
  return procs;
}

export async function stopSyncServers(procs: readonly ChildProcess[]): Promise<void> {
  await Promise.all(
    procs.map(
      (proc) =>
        new Promise<void>((resolve) => {
          if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
          proc.once('exit', () => resolve());
          proc.kill('SIGTERM');
          setTimeout(() => proc.kill('SIGKILL'), 5_000);
        }),
    ),
  );
}
```

- [ ] **Step 3: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/harness/www.ts e2e/harness/sync.ts
git commit -m "feat: /var/www の張り替えと sync サーバーの起動を実装する（#73）

- ubuntu-latest には /var/www が無いので先に作る
- sync は本番と同じ 8787 / 3311 で起動する（断片が絶対値で宣言しているため）
- 標準出力とエラーは test-results/logs へ落とし、落ちたとき原因を追えるようにする"
```

---

### Task 9: 組み立てと最初の `@smoke`（3 系統の並存）

**Files:**
- Create: `e2e/harness/global-setup.ts`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/specs/routing.spec.ts`

**Interfaces:**
- Consumes: Task 2〜8 のすべて
- Produces: `pnpm e2e` が動く状態。`@smoke` #1 が通る

- [ ] **Step 1: `e2e/harness/global-setup.ts` を実装する**

```ts
/**
 * ハーネスの組み立て。
 *
 * production ターゲットでは**何も起動しない**。既に動いているサーバーへ
 * 外から当てるだけなので、ここは素通りする。
 *
 * ## 後始末について
 *
 * 正常終了・テスト失敗・SIGINT・SIGTERM では必ず解放する。
 * **SIGKILL では保証できない**（プロセスがハンドラを実行できないため）。
 * そのため preflight が残骸を必ず検出して落とすようにしてある。
 * 「次回起動時に気づける」ことで、この穴を埋めている。
 */
import type { ChildProcess } from 'node:child_process';
import { ensureCaddyBinary, installCaddyConfig, removeCaddyConfig, startCaddy, stopCaddy } from './caddy';
import { runPreflight } from './preflight';
import { startSyncServers, stopSyncServers } from './sync';
import { linkWebRoots, unlinkWebRoots } from './www';
import { resolveTarget } from './target';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const target = resolveTarget(process.env);
  if (target.kind === 'production') {
    return async () => {
      /* 起動していないので何もしない */
    };
  }

  await runPreflight(process.env);

  const binary = await ensureCaddyBinary();
  let syncProcs: ChildProcess[] = [];
  let caddyProc: ChildProcess | undefined;
  let stopped = false;

  const teardown = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (caddyProc !== undefined) await stopCaddy(caddyProc);
    await stopSyncServers(syncProcs);
    removeCaddyConfig();
    unlinkWebRoots();
  };

  // Ctrl-C / kill でも解放する。SIGKILL は捕捉できないため preflight に委ねる。
  process.once('SIGINT', () => void teardown().then(() => process.exit(130)));
  process.once('SIGTERM', () => void teardown().then(() => process.exit(143)));

  try {
    linkWebRoots();
    installCaddyConfig();
    syncProcs = await startSyncServers();
    caddyProc = await startCaddy(binary);
  } catch (error) {
    await teardown();
    throw error;
  }

  return teardown;
}
```

- [ ] **Step 2: `e2e/playwright.config.ts` を実装する**

```ts
/**
 * Playwright の設定。
 *
 * **このファイルの default export は規約（名前付きエクスポート優先）の例外。**
 * Playwright が default export を要求するため。
 */
import { defineConfig, devices } from '@playwright/test';
import { resolveTarget } from './harness/target';

const target = resolveTarget(process.env);
const isProduction = target.kind === 'production';
const isCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  globalSetup: './harness/global-setup.ts',
  outputDir: './test-results/artifacts',
  fullyParallel: true,
  // 本番は実サーバーの枠を無用に消費しないため逐次・再試行なし。
  workers: isProduction ? 1 : undefined,
  retries: isProduction ? 0 : isCi ? 1 : 0,
  timeout: isProduction ? 120_000 : 60_000,
  expect: { timeout: isProduction ? 10_000 : 5_000 },
  reporter: [['list'], ['html', { outputFolder: './test-results/html', open: 'never' }]],
  use: {
    baseURL: target.baseURL,
    navigationTimeout: isProduction ? 30_000 : 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 3: 失敗するシナリオを書く**

`e2e/specs/routing.spec.ts`

```ts
/**
 * 経路の確認（@smoke）。ブラウザを開かず HTTP だけで確かめる。
 *
 * ここが落ちるということは、Caddy 断片・base パス・リバースプロキシの
 * いずれかが壊れているということ。#73 が挙げた「検出できていないもの」の中核。
 */
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/timer/', '/poker/'] as const;

test.describe('@smoke 3 系統が並存する', () => {
  for (const pagePath of PAGES) {
    test(`Given 稼働中のサイト / When ${pagePath} を GET / Then 200 が返る`, async ({ request }) => {
      // Given: ハーネス（または本番）が動いている
      // When
      const response = await request.get(pagePath);
      // Then: 断片が欠けると包括フォールバックに吸われるが、それは 200 のまま。
      //       どのアプリが返っているかは資材の接頭辞（別シナリオ）で見分ける。
      expect(response.status(), `${pagePath} の応答`).toBe(200);
    });
  }
});
```

- [ ] **Step 4: 初回起動する（ハーネスが立ち上がることの確認）**

このタスクの成果物はハーネスそのものなので、シナリオは「ハーネスが動いた証拠」として
使う。先に失敗を見る TDD の形は取らない（起動しなければシナリオは実行にすら到達しない）。

Run: `cd /home/vscode/tasuki-work && corepack pnpm build && corepack pnpm e2e 2>&1 | tail -20`
Expected: 3 件パス。**失敗したら `e2e/test-results/logs/caddy.log`・`timer-sync.log`・
`poker-sync.log` を読んで原因を特定してから次へ進む**（この 3 つを残しているのは
まさにこのため）

なお `globalSetup` が後始末関数を返す形は Playwright 1.62.1 で動作を実測済み。

- [ ] **Step 5: ハーネスが本当に立ち上がっていることを確認する**

Run:
```bash
cd /home/vscode/tasuki-work && corepack pnpm e2e 2>&1 | tail -5 && \
  echo "--- 後始末の確認 ---" && \
  (ss -tlnp 2>/dev/null | grep -E ':(8787|3311|18080)' || echo "ポートは解放済み") && \
  (ls -d /etc/caddy/tasuki 2>/dev/null || echo "/etc/caddy/tasuki は撤去済み") && \
  (ls -l /var/www/tasuki 2>/dev/null || echo "/var/www の symlink は撤去済み")
```
Expected: 3 件パス。ポート解放済み・`/etc/caddy/tasuki` 撤去済み・symlink 撤去済み

- [ ] **Step 6: 中断でも後始末されることを確認する**

Run:
```bash
cd /home/vscode/tasuki-work && (corepack pnpm e2e & sleep 8; kill -INT %1; wait) 2>&1 | tail -3 ; \
  sleep 2 ; (ss -tlnp 2>/dev/null | grep -E ':(8787|3311|18080)' || echo "ポートは解放済み") ; \
  (ls -d /etc/caddy/tasuki 2>/dev/null || echo "/etc/caddy/tasuki は撤去済み")
```
Expected: ポート解放済み・`/etc/caddy/tasuki` 撤去済み

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/harness/global-setup.ts e2e/playwright.config.ts e2e/specs/routing.spec.ts
git commit -m "feat: E2E ハーネスを組み上げ、3 系統の並存を確認する（#73）

- production ターゲットでは何も起動しない
- 正常終了・失敗・SIGINT・SIGTERM で必ず解放する
  （SIGKILL は捕捉できないため、preflight の残骸検出で次回起動時に気づける）
- playwright.config.ts の default export は Playwright の要求による規約の例外"
```

---

### Task 10: `@smoke` 資材の実 GET

**Files:**
- Modify: `e2e/specs/routing.spec.ts`

**Interfaces:**
- Consumes: Task 9 の `routing.spec.ts`
- Produces: なし

- [ ] **Step 1: 失敗するシナリオを追記する**

`e2e/specs/routing.spec.ts` の末尾に追加する。

```ts
/** HTML から資材（js / css）の参照を抜き出す。 */
function extractAssetRefs(html: string): string[] {
  const refs: string[] = [];
  const pattern = /(?:src|href)="([^"]+)"/g;
  for (;;) {
    const match = pattern.exec(html);
    if (match === null) break;
    const ref = match[1];
    if (ref !== undefined && ref.includes('/assets/')) refs.push(ref);
  }
  return refs;
}

const ASSET_PREFIXES: Readonly<Record<string, string>> = {
  '/': '/assets/',
  '/timer/': '/timer/assets/',
  '/poker/': '/poker/assets/',
};

test.describe('@smoke 資材が正しい接頭辞を持ち、実際に取得できる', () => {
  for (const pagePath of PAGES) {
    test(`Given ${pagePath} の HTML / When 資材の参照を辿る / Then 接頭辞が正しく 200 で取得できる`, async ({
      request,
    }) => {
      // Given: 各アプリの index.html
      const html = await (await request.get(pagePath)).text();
      const refs = extractAssetRefs(html);

      // Then その1: 参照が 1 つ以上ある。0 件だと以降の検査が素通りする
      expect(refs.length, `${pagePath} に資材の参照が無い`).toBeGreaterThan(0);

      // Then その2: 接頭辞が正しい。ここが崩れるのが #76 F-1 と同じ壊れ方であり、
      //             どのアプリが返っているかの見分けにもなる
      const expectedPrefix = ASSET_PREFIXES[pagePath];
      for (const ref of refs) {
        expect(ref, `${pagePath} の資材参照`).toContain(expectedPrefix);
      }

      // Then その3: **実際に取得できる。** 文字列の一致だけだと、
      //             資材が配信されていなくても緑になる
      for (const ref of refs) {
        const asset = await request.get(ref);
        expect(asset.status(), `${ref} の取得`).toBe(200);
      }
    });
  }
});
```

- [ ] **Step 2: シナリオが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && corepack pnpm e2e 2>&1 | tail -10`
Expected: 6 件パス

- [ ] **Step 3: わざと壊して落ちることを確認する（資材を消す）**

```bash
cd /home/vscode/tasuki-work
ASSET=$(ls apps/landing/dist/assets/*.js | head -1)
mv "$ASSET" /tmp/claude-1000/-workspaces-claym-local-Tasuki/a5650bd3-2840-4aa6-b740-6ed9720fa86c/scratchpad/
corepack pnpm e2e 2>&1 | tail -10
mv "/tmp/claude-1000/-workspaces-claym-local-Tasuki/a5650bd3-2840-4aa6-b740-6ed9720fa86c/scratchpad/$(basename "$ASSET")" "$ASSET"
```
Expected: `/` の資材シナリオが FAIL（404 を検出）。戻したあと再実行して緑に戻ることを確認する

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/specs/routing.spec.ts
git commit -m "test: 資材の接頭辞に加えて実際に取得できることを確認する（#73）

文字列の一致だけだと、資材が配信されていなくても緑になる。
参照を辿って 200 を確認することで、配信事故と base パスの崩れの両方を捕まえる。"
```

---

### Task 11: `@smoke` リダイレクトの `Location`

**Files:**
- Modify: `e2e/specs/routing.spec.ts`

- [ ] **Step 1: 失敗するシナリオを追記する**

```ts
test.describe('@smoke 末尾スラッシュの救済', () => {
  for (const [from, to] of [
    ['/timer', '/timer/'],
    ['/poker', '/poker/'],
  ] as const) {
    test(`Given ${from} / When GET する / Then 301 で ${to} へ送られる`, async ({ request }) => {
      // Given / When: **追跡させない。** 既定では追跡され、最終的な 200 を見て
      //               「301 を確認したつもり」になる
      const response = await request.get(from, { maxRedirects: 0 });
      // Then
      expect(response.status()).toBe(301);
      // **行き先まで固定する。** 301 であることだけでは、行き先が壊れても緑になる
      expect(response.headers()['location']).toBe(to);
    });
  }
});

test.describe('@smoke 旧共有リンクの救済', () => {
  test('Given /?room=ABC123 / When GET する / Then 301 で /timer/ へクエリごと送られる', async ({
    request,
  }) => {
    // Given / When
    const response = await request.get('/?room=ABC123', { maxRedirects: 0 });
    // Then: クエリを落とす改変（redir @legacy-room /timer/ permanent）でも 301 は
    //       返り続けるため、Location の値まで固定しないと #76 J-1 と同じ壊れ方が素通りする
    expect(response.status()).toBe(301);
    expect(response.headers()['location']).toBe('/timer/?room=ABC123');
  });

  test('Given room の無い / / When GET する / Then 200 で玄関のまま', async ({ request }) => {
    // Given / When: 玄関の役割が損なわれていないこと
    const response = await request.get('/', { maxRedirects: 0 });
    // Then
    expect(response.status()).toBe(200);
  });
});
```

- [ ] **Step 2: シナリオが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && corepack pnpm e2e 2>&1 | tail -10`
Expected: 10 件パス

- [ ] **Step 3: わざと壊して落ちることを確認する（クエリの引き継ぎを外す）**

```bash
cd /home/vscode/tasuki-work
sed -i 's|redir @legacy-room /timer/?{query} permanent|redir @legacy-room /timer/ permanent|' \
  deploy/timer/caddy/40-timer-legacy-room.conf
corepack pnpm e2e 2>&1 | tail -10
git checkout deploy/timer/caddy/40-timer-legacy-room.conf
```
Expected: 旧共有リンクのシナリオが FAIL（`Location` が `/timer/` になり期待と違う）。
**301 のままでも落ちることが要点。** 戻したあと再実行して緑に戻ることを確認する

- [ ] **Step 4: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/specs/routing.spec.ts
git commit -m "test: リダイレクトを Location の値まで固定する（#73）

maxRedirects: 0 は「301 という事実を掴む」ためのもので、行き先の正しさとは無関係。
クエリの引き継ぎを外しても 301 は返り続けるため、値まで固定しないと
#76 J-1 と同じ壊れ方が素通りする。"
```

---

### Task 12: `@smoke` WS ハンドシェイクとヘッダ

**Files:**
- Modify: `e2e/specs/routing.spec.ts`

- [ ] **Step 1: 失敗するシナリオを追記する**

```ts
test.describe('@smoke WebSocket が SPA に吸われていない', () => {
  /**
   * 応答コードが違うのは実装の差。timer-sync（ws-adapter）は Upgrade が無ければ 426、
   * poker-sync は `url.pathname === '/ws'` を検査したうえで upgrade に失敗して 400 を返す。
   * 「200 でないこと」ではなく具体値で固定する。値が変わったら実装が変わったということ。
   *
   * **注意: これは timer 側の経路の正しさを保証しない。** timer-sync はパスを見ずに
   * 無条件で upgrade を試みるため、断片から `rewrite * /ws` を削っても 426 は返り続ける。
   * timer の経路の正しさは第 2 段の実接続（@core）に委ねる。
   */
  for (const [wsPath, expectedStatus] of [
    ['/timer/ws', 426],
    ['/poker/ws', 400],
  ] as const) {
    test(`Given ${wsPath} / When 素の GET を送る / Then ${expectedStatus} が返る（SPA の 200 ではない）`, async ({
      request,
    }) => {
      // Given / When
      const response = await request.get(wsPath);
      // Then
      expect(response.status()).toBe(expectedStatus);
    });
  }
});

test.describe('@smoke サイトブロックのヘッダ', () => {
  /**
   * Strict-Transport-Security も対象に含める。`header {}` の静的指定なので
   * TLS の有無に関係なく付与される（http でも実測で確認済み）。
   */
  const EXPECTED_HEADERS: Readonly<Record<string, string>> = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-robots-tag': 'noindex, nofollow',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'same-origin',
  };

  test('Given / / When GET する / Then 5 種のヘッダがすべて付いている', async ({ request }) => {
    // Given / When
    const headers = (await request.get('/')).headers();
    // Then
    for (const [name, value] of Object.entries(EXPECTED_HEADERS)) {
      expect(headers[name], `${name} の値`).toBe(value);
    }
  });
});
```

- [ ] **Step 2: シナリオが通ることを確認する**

Run: `cd /home/vscode/tasuki-work && corepack pnpm e2e 2>&1 | tail -10`
Expected: 13 件パス

- [ ] **Step 3: わざと壊して落ちることを確認する（WS の受けパスを変える）**

```bash
cd /home/vscode/tasuki-work
sed -i 's|^handle /timer/ws {|handle /timer/wsx {|' deploy/timer/caddy/10-timer-ws.conf
corepack pnpm e2e 2>&1 | tail -10
git checkout deploy/timer/caddy/10-timer-ws.conf
```
Expected: `/timer/ws` のシナリオが FAIL（`/timer/*` の SPA に吸われて 200 が返る）。
戻したあと再実行して緑に戻ることを確認する

- [ ] **Step 4: わざと壊して落ちることを確認する（poker の経路を殺す）**

**ファイルごと消さないこと。** 消すと `installCaddyConfig` の設置数検査（5 本）が先に
落ちてしまい、シナリオ側の検出力を確かめられない。ファイルは残したまま経路だけ壊す。

```bash
cd /home/vscode/tasuki-work
sed -i 's|^handle_path /poker/\*|handle_path /pokerx/*|' deploy/poker/caddy/20-poker.conf
corepack pnpm e2e 2>&1 | tail -15
git checkout deploy/poker/caddy/20-poker.conf
```
Expected: **`/poker/` の資材シナリオが FAIL**（LP の HTML が返り接頭辞が合わない）。
**3 系統の 200 シナリオは落ちない** —— 包括フォールバック（LP）が 200 を返し続けるため。
この非対称こそが「200 が返ることと正しいアプリが返ることは別」の実証なので、
**両方の結果を記録する**。戻したあと再実行して緑に戻ることを確認する

- [ ] **Step 5: コミット**

```bash
cd /home/vscode/tasuki-work
git add e2e/specs/routing.spec.ts
git commit -m "test: WS ハンドシェイクとサイトブロックのヘッダを確認する（#73）

- 応答コードは具体値で固定する（timer 426 / poker 400。実装の差）
- timer 側は断片の rewrite を削っても 426 が返り続けるため、
  この検査は timer の経路の正しさを保証しないことをコメントに残す
- HSTS は header{} の静的指定なので http でも付く。5 種すべてを対象にする"
```

---

### Task 13: CI ジョブの追加

**Files:**
- Modify: `.github/workflows/ci.yml`

**設計からの意図的な逸脱:** 設計文書では CI ジョブを第 3 段に置いていたが、**第 1 段へ
前倒しする**。このリポジトリは「CI がサブディレクトリにあり一度も走っていなかった」（#50）を
踏んでおり、検査を作ってから CI に載せるまでに間を空ける段取りは、その再演になる。

- [ ] **Step 1: `e2e` ジョブを追加する**

`.github/workflows/ci.yml` の `jobs:` 直下、既存の `ci:` ジョブの後に追加する。

```yaml
  # E2E は既存の検査と**並列の別ジョブ**にする。同じジョブに足すと、
  # ユニットテストの結果を見るのに E2E の所要時間を待つことになる。
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable

      # sync サーバーは両方とも Bun で起動する。
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: pnpm install --frozen-lockfile

      # Caddy 断片が root * /var/www/... を絶対値で宣言しているため、
      # 環境側を断片に合わせる。**ubuntu-latest に /var/www は無い。**
      - run: sudo mkdir -p /var/www

      # 版を固定してキャッシュする。「最新」を取ると、ある日突然赤くなる。
      - name: Cache Caddy
        uses: actions/cache@v4
        with:
          path: ~/.cache/tasuki-e2e
          key: caddy-2.11.4

      # Playwright の版は package.json で完全固定している。
      # revision は版に 1 対 1 で紐づくので、版をそのまま鍵にする。
      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-1.62.1-chromium
      - run: pnpm --filter @tasuki/e2e exec playwright install --with-deps chromium
        if: steps.playwright-cache.outputs.cache-hit != 'true'
      - run: pnpm --filter @tasuki/e2e exec playwright install-deps chromium
        if: steps.playwright-cache.outputs.cache-hit == 'true'

      - run: pnpm build
      - run: pnpm e2e

      # 落ちたときに原因が追えるように、Caddy と 2 つの sync のログまで残す。
      - name: Upload E2E artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-artifacts
          path: e2e/test-results/
          retention-days: 7
```

- [ ] **Step 2: ワークフローの構文を確認する**

Run: `cd /home/vscode/tasuki-work && node -e "
const yaml = require('fs').readFileSync('.github/workflows/ci.yml','utf8');
if (!/^  e2e:$/m.test(yaml)) throw new Error('e2e ジョブが見つからない');
if (!/sudo mkdir -p \/var\/www/.test(yaml)) throw new Error('/var/www の作成が無い');
if (!/pnpm e2e/.test(yaml)) throw new Error('pnpm e2e の実行が無い');
console.log('ワークフローの記述 OK');
"`
Expected: `ワークフローの記述 OK`

- [ ] **Step 3: コミット**

```bash
cd /home/vscode/tasuki-work
git add .github/workflows/ci.yml
git commit -m "ci: E2E ジョブを追加する（#73）

既存の検査と並列の別ジョブにする。設計では第 3 段に置いていたが、
検査を作ってから CI に載せるまで間を空ける段取りは #50（CI が一度も
走っていなかった）の再演になるため前倒しする。

- ubuntu-latest には /var/www が無いので先に作る
- Caddy と Playwright のブラウザは版を鍵にキャッシュする
- 失敗時は Caddy と 2 つの sync のログを含む証跡を artifact として残す"
```

---

### Task 14: 検査の実効性を記録し、設計文書を更新する

**Files:**
- Modify: `docs/superpowers/specs/2026-08-07-e2e-foundation-design.md`
- Modify: `deploy/deploy.sh`

**Interfaces:**
- Consumes: Task 10〜12 で実施した「わざと壊す」の結果
- Produces: なし

- [ ] **Step 1: 「わざと壊すと落ちる」の実施結果を記入する**

設計文書の該当表の「実施結果」欄に、Task 10 Step 3 / Task 11 Step 3 / Task 12 Step 3・4 で
**実際に観測した内容**を書く。**「落ちた」だけでは足りない。何が落ちたかを書く。**

記入例（実際の観測結果に置き換えること）:

| 壊し方 | 落ちるべきもの | 実施結果 |
|---|---|---|
| `10-timer-ws.conf` の `handle` のパスを変える | `@smoke` #5 | 2026-08-07 実施。`/timer/ws` が 200（SPA の HTML）を返し FAIL |

- [ ] **Step 2: 「追加した `aria` の一覧」に「なし」と書く**

第 1 段はブラウザを使わないので選択子は登場しない。**空欄のまま残さない。**

```markdown
| ファイル | 足したもの | なぜ既存の手段で掴めなかったか |
|---|---|---|
| （第 1 段では追加なし。第 1 段は HTTP のみで選択子を使わない） | — | — |
```

- [ ] **Step 3: CI を第 1 段へ前倒しした旨を設計文書に反映する**

「実装の段取り（3 分割）」の表を更新し、第 1 段に「CI ジョブ」を、第 3 段から
それを外す。理由（#50 の再演を避ける）を 1 文添える。

- [ ] **Step 4: `deploy.sh` の「確認:」ブロックに本番確認の案内を足す**

`deploy/deploy.sh` の末尾、`echo "確認:"` 以降に追記する。

```bash
echo "  3 アプリすべてを出し終えたら、外から通しで確認する（アプリ単位ではなくサイト全体）"
echo "    TASUKI_E2E_BASE_URL=https://<公開ドメイン> pnpm e2e:prod"
```

- [ ] **Step 5: すべての検査が通ることを確認する**

Run:
```bash
cd /home/vscode/tasuki-work && \
  corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && \
  corepack pnpm build && corepack pnpm e2e && \
  node scripts/audit-structure.mjs | tail -20
```
Expected: すべて成功。`audit-structure.mjs` は SC029=6 / SC030=3 / SC039=34 / SC032 が 98.0% 前後

- [ ] **Step 6: 後始末を確認する**

Run:
```bash
(ss -tlnp 2>/dev/null | grep -E ':(8787|3311|18080)' || echo "ポートは解放済み") ; \
(ls -d /etc/caddy/tasuki 2>/dev/null || echo "/etc/caddy/tasuki は撤去済み") ; \
(ls -l /var/www/tasuki 2>/dev/null || echo "/var/www の symlink は撤去済み")
```
Expected: 3 つとも「済み」

- [ ] **Step 7: コミット**

```bash
cd /home/vscode/tasuki-work
git add docs/superpowers/specs/2026-08-07-e2e-foundation-design.md deploy/deploy.sh
git commit -m "docs: E2E 第 1 段の実施結果を記録し、本番確認の案内を deploy.sh に足す（#73）

- 「わざと壊すと落ちる」を実際に試し、何が落ちたかまで記録する
- CI ジョブを第 1 段へ前倒しした理由を設計文書に反映する
- deploy.sh の確認ブロックに pnpm e2e:prod の案内を追記する
  （アプリ単位の deploy.sh には統合しない。本番確認は 3 系統が揃って初めて意味を持つ）"
```

---

## 完了の定義

- [ ] `pnpm test` に `@tasuki/e2e` の静的テストと `caddy-fragment-port.test.ts` が含まれ、緑
- [ ] `pnpm e2e` が 13 件緑（3 系統 3・資材 3・末尾スラッシュ 2・旧共有リンク 2・WS 2・ヘッダ 1）
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm build` が緑
- [ ] `audit-structure.mjs` の指標が悪化していない
- [ ] **わざと壊すと落ちることを 4 通り実際に確認し、何が落ちたかを設計文書に記録した**
- [ ] 実行後にポート 8787 / 3311 / 18080 が解放され、`/etc/caddy/tasuki` と `/var/www` の symlink が撤去されている
- [ ] CI に `e2e` ジョブが追加され、PR で実行される

## 第 1 段でやらないこと

- ブラウザを開くシナリオ（第 2 段: `@core`）
- 選択子と `aria` の追加（第 2 段）
- 招待 URL・再読込復帰などの回帰シナリオ（第 3 段）
- 本番ターゲットの実行（第 3 段。`e2e:prod` のスクリプトと案内だけ第 1 段で用意する）
