# Tasuki 単一 monorepo 統合 — 設計（epic #15）

- **対象 Issue**: epic [#15]、子 [#16]（S1）/ [#17]（S2）/ [#18]（S3）/ [#19]（S4）/ [#20]（S5）
- **関連 Issue**: [#50]（CI 未実行）/ [#51]（deploy スクリプトの実態乖離）
- **作成日**: 2026-08-04
- **前提**: PR #12 は 2026-07-23 にマージ済み。S1 の依存は解消されている

---

## 1. 現状（2026-08-04 実測）

### 1.1 リポジトリ構成

git ルート `Tasuki/` の直下に、**独立した 2 つの monorepo が並んでいる**。

```
Tasuki/
├── tdd-mob-pro-timer/    pnpm-workspace.yaml / turbo.json / pnpm-lock.yaml / tsconfig.base.json / eslint.config.mjs
│   └── packages/core  apps/web  apps/sync
└── planning-poker/       pnpm-workspace.yaml / turbo.json / pnpm-lock.yaml / tsconfig.base.json
    └── packages/core  apps/web  apps/sync
```

ディレクトリ名（`packages/core` / `apps/web` / `apps/sync`）が完全に衝突している。

### 1.2 設定・バージョンの差分

| 項目 | timer | poker |
|---|---|---|
| パッケージ名 | `@tdd-mob/core` `/web` `/sync` | `@planning-poker/core` `/web` `/sync` |
| pnpm | 9.15.0 | **11.5.0** |
| turbo | ^2.3.3 | **^2.5.4** |
| TypeScript | ^5.7.2 | **^5.8.3** |
| React | ^18.3.1 | **^19.1.0** |
| eslint | あり（eslint 10 + typescript-eslint、flat config） | **タスク自体が無い** |
| tsconfig.base | `declaration` `declarationMap` `sourceMap` `noImplicitReturns` `isolatedModules` `esModuleInterop`、`lib: [ES2022, DOM]` | `noEmit` `verbatimModuleSyntax` `exactOptionalPropertyTypes`、`lib: [ES2022]` |
| sync の build | `tsc --project tsconfig.json`（デプロイ時に別途 `bun build`） | `bun build --target=bun --outdir=dist` |
| web の vite base | 既定（`/`） | `/poker/` |
| 規模 | 40,071 行 / テスト 1,625 件 | 2,746 行 / テスト 99 件 |

poker のテスト内訳（実測・17.9 秒で全緑）: core 6 ファイル 67 件 / sync 6 ファイル 22 件 / web 1 ファイル 10 件。

### 1.3 本番の実態 — Issue の前提が成立していない

`ssh niku9` と `curl` による実測:

- 稼働している systemd ユニットは **`tasuki-sync.service` のみ**。`poker-sync.service` は存在しない
- `/opt/tasuki/` には timer の `server.js` のみ。`/opt/tasuki/planning-poker/` は存在しない
- 本番 Caddyfile の `tasuki.niku9.click` ブロック（196 行目〜）に **poker の記述が一切無い**
- `/poker/` が 200 を返すのは **timer の SPA フォールバックが timer の `index.html` を返しているだけ**

```
/       の md5 : 29dc9db90afebefe954fa22c4162d85a   <title>TDD Mob Pro Timer</title>
/poker/ の md5 : 29dc9db90afebefe954fa22c4162d85a   ← 完全一致
/ws      → 426 (WebSocket)      /poker/ws → 200 (ただの index.html)
```

**planning-poker は一度も本番デプロイされていない。** したがって #16 の BDD「`/` と `/poker` にアクセスすると従来どおり timer と poker が動作する」、#18 の「既存 URL（`/` と `/poker`）は不変」は、守るべき挙動として**現時点では存在しない**。

### 1.4 その他

- リポジトリは **PUBLIC**（`tomohiroJin/tasuki-tools`、既定ブランチ `main`）。GitHub Actions の実行時間は無料枠の制約を受けない
- CI は一度も走っていない（[#50]）。ワークフローが `tdd-mob-pro-timer/.github/workflows/ci.yml` にあり、GitHub はルート直下の `.github/workflows/` しか読まないため

---

## 2. 決定事項

| # | 論点 | 決定 | 理由 |
|---|---|---|---|
| D1 | poker の本番公開時期 | **S4 の LP 公開と同時** | 玄関（LP）ができてから導線ごと出す。露出のタイミングを揃える |
| D2 | epic の進め方 | **epic 設計 1 本 → 段階ごとに plan・実装・PR** | 全体の一貫性を先に固定しつつ、各段を独立してレビュー・出荷できる |
| D3 | 設定統一の範囲 | **完全統一**（tsconfig / React / eslint / ツール版すべて） | 規約を 1 つにし、S5 の共通化を素直にする |
| D4 | React の統一先 | **19（timer を上げる）** | 破壊的変更の該当が実質 1 箇所。主要依存も 19 対応済み |
| D5 | #50 / #51 の扱い | **#50 は先行 PR、#51 は S2 へ統合** | S1 の大規模構造変更を CI で守る。#51 は S2 でどのみち書き直す |
| D6 | S1 の PR 分割 | **2 つ**（S1-a 移動・リネーム / S1-b React 19・tsconfig 統合） | 「移動だけ」と「型を触る」を分離し、退行原因を切り分け可能にする |
| D7 | LP の実装方式 | **Vite + React** | 既存 2 アプリと同じ道具立て。S5 の UI キット共有に乗せられる |

### D4 の根拠（実測）

timer web（`src` + `test`）における React 19 破壊的変更の該当箇所:

| パターン | 件数 |
|---|---|
| `useRef()`（引数なし・19 で必須） | 0 |
| `propTypes` / `defaultProps` | 0 |
| `ReactDOM.render` / `hydrate` / `unmountComponentAtNode` | 0 |
| `react-dom/test-utils` | 0 |
| 文字列 ref | 0 |
| `forwardRef` | 0 |
| `React.FC` | 0 |
| **`JSX.Element` / `JSX.IntrinsicElements`** | **1**（`src/ui/components/Markdown.tsx:219`） |

依存の peer 対応: `lucide-react` v1.17.0 → `^16.5.1 \|\| ^17 \|\| ^18 \|\| ^19`、`@testing-library/react` v16.3.2 → `^18.0.0 \|\| ^19.0.0`。いずれも 19 を許容済み。

**退路**: S1-b で typecheck と全 1,724 件のテストを回し、React 19 起因のランタイム退行が解消不能と判明した場合は、**poker を 18 へ下げる方向へ切り替える**（poker は React 19 固有 API を使っておらず `createRoot` のみ。影響は 2,746 行・web テスト 10 件に限定される）。

### D3 の根拠（実測）

**poker の厳格フラグ → timer に適用**（`tsc --noEmit`）:

| フラグ | timer-core | timer-sync | timer-web | 計 |
|---|---|---|---|---|
| `verbatimModuleSyntax` | 0 | 0 | 0 | **0 件** |
| `exactOptionalPropertyTypes` | 1 | 9 | 11 | **21 件** |

**timer の厳格フラグ → poker に適用**: `noImplicitReturns` / `isolatedModules` / `esModuleInterop` とも **全て 0 件**。

つまり完全統一の追加コストは `exactOptionalPropertyTypes` の 21 件（`TS2375` / `TS2379` / `TS2412`＝オプショナル prop へ `undefined` を明示的に渡している箇所）のみ。core の 1 件（`packages/core/src/problem.ts:37`）は sync / web にも波及する。

---

## 3. 到達点のアーキテクチャ

```
Tasuki/                              # 単一 pnpm workspace + turbo（lockfile も 1 つ）
├── .github/workflows/ci.yml         # 単一 CI
├── package.json                     # ルートのみ
├── pnpm-workspace.yaml              # packages/*  apps/*
├── pnpm-lock.yaml                   # 1 つだけ
├── turbo.json                       # 1 つだけ
├── tsconfig.base.json               # 1 つだけ
├── eslint.config.mjs                # 1 つだけ
├── packages/
│   ├── timer-core/                  @tasuki/timer-core
│   ├── poker-core/                  @tasuki/poker-core
│   └── shared/                      S5 で新設（sync-kit / protocol / ui）
├── apps/
│   ├── timer-web/                   @tasuki/timer-web       →  /timer/
│   ├── timer-sync/                  @tasuki/timer-sync      →  :8787
│   ├── poker-web/                   @tasuki/poker-web       →  /poker/
│   ├── poker-sync/                  @tasuki/poker-sync      →  :3311
│   └── landing/                     @tasuki/landing         →  /       （S3 で新設）
├── deploy/
│   ├── deploy.sh                    # 共通ドライバ: deploy.sh <app>
│   ├── timer/  poker/  landing/     # アプリ別の service / Caddy 断片 / env 例
│   └── README.md
├── docs/
│   ├── timer/                       ← tdd-mob-pro-timer/docs（ARCHITECTURE.md, adr/, experiments/）
│   ├── poker/                       ← planning-poker/specs
│   ├── plans/  superpowers/  BACKLOG.md
├── scripts/                         ← tdd-mob-pro-timer/scripts
├── .specify/                        ← planning-poker/.specify
└── .claude/skills/                  ← planning-poker/.claude/skills（speckit 一式）
```

### 命名規約

| 対象 | 規約 | 例 |
|---|---|---|
| npm スコープ | `@tasuki/` | `@tasuki/timer-core` |
| パッケージ名 | `<tool>-<layer>` | `timer-core` `poker-sync` |
| ディレクトリ名 | パッケージ名と一致 | `packages/timer-core` `apps/poker-sync` |
| systemd ユニット | `tasuki-<tool>-sync`（**S2 で要判断**、下記） | `tasuki-timer-sync` |
| Caddy 断片 | `Caddyfile.<app>` | `Caddyfile.timer` |

> **systemd ユニット名の改名は決定事項ではない。** 既存の本番ユニット名は `tasuki-sync` で、稼働中である。改名は「旧停止 → 新起動」の切り替えを伴い、失敗すればサービス断になる。得られるのは命名の一貫性だけで、機能上の利得は無い。
> **S2 の plan で次の 2 案を比較して決める**: (a) `tasuki-sync` を timer 用として据え置き、poker は `tasuki-poker-sync` で新規追加する（本番断のリスクゼロ。命名は非対称になる）/ (b) 規約どおり改名する（切り戻し手順を用意し、利用者のいない時間帯に実施）。
> **既定は (a)** とし、改名する積極的な理由が S2 で見つかった場合のみ (b) を採る。

### tsconfig.base.json（統合後）

両者の和集合を base に置き、**出力を持つパッケージだけ**が `noEmit: false` + `declaration` + `outDir` を上書きする。

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],                     // DOM は web 側で追加（下記の実測により core / sync は不要）
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,    // poker から採用（timer 21 件を修正）
    "verbatimModuleSyntax": true,          // poker から採用（timer 0 件）
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true                          // 既定は出力なし
  }
}
```

`lib` から `DOM` を外す点は実測で裏を取っている。timer の現行 base は `["ES2022", "DOM"]` だが、`timer-core` を `--lib ES2022` のみで typecheck すると **0 件**であり、`src` 配下に DOM API（`document` / `window` / `HTMLElement` / `localStorage` / `navigator` / `fetch` / `AudioContext`）の使用は **0 箇所**。`timer-sync` は既にパッケージ側で `lib: ["ES2022"]` を指定している。DOM が要るのは web 2 つだけで、いずれも自分の tsconfig で `["ES2022", "DOM", "DOM.Iterable"]` を指定済み。

### turbo.json

timer 版をベースにする（`globalDependencies` と `passThroughEnv` を持つため）。`globalDependencies` は `eslint.config.mjs` / `tsconfig.base.json` を指し、これらの変更でキャッシュが無効化される。

---

## 4. 段階ごとの設計

### S0（#50・先行）— ルート CI を通す

**目的**: S1 の大規模構造変更を CI の網の下で行う。

- `tdd-mob-pro-timer/.github/workflows/ci.yml` を **ルートの `.github/workflows/ci.yml` へ移す**
- 現構成（2 monorepo）向けに、`tdd-mob-pro-timer` と `planning-poker` それぞれで `pnpm install` → `turbo run typecheck lint test build` を実行するジョブにする
- **pnpm のバージョン解決に注意**: 現行 workflow は `pnpm/action-setup@v4` で `version: 9` を固定しているが、poker は `packageManager: pnpm@11.5.0` を宣言しており不整合になる。2 つのディレクトリで版が異なるため、**`corepack enable` で各ディレクトリの `packageManager` 宣言に従わせる**（`action-setup` の固定版は使わない）
- **poker に無いタスクを叩かない**: 現行 workflow は `pnpm typecheck` / `pnpm lint` / `pnpm test:unit` / `pnpm build` を実行するが、poker には **`lint` も `test:unit` も存在しない**（実測: poker の scripts は `build` / `test` / `typecheck` のみ）。S0 の poker ジョブは `typecheck` / `test` / `build` に絞る。`lint` は S1-b で、`test:unit` は必要なら S1 で足す
- **完了条件**: PR に checks が表示され、緑になること

この workflow は S1 で単一ワークスペース向けに書き直される（使い捨て前提・ファイル 1 つ）。

### S1（#16）— ルート monorepo の骨格化

#### S1-a: ディレクトリ移動・リネーム・ワークスペース統合

**コードの振る舞いは一切変えない。**

移動（すべて `git mv` で履歴を保つ）:

| 移動元 | 移動先 |
|---|---|
| `tdd-mob-pro-timer/packages/core` | `packages/timer-core` |
| `tdd-mob-pro-timer/apps/web` | `apps/timer-web` |
| `tdd-mob-pro-timer/apps/sync` | `apps/timer-sync` |
| `planning-poker/packages/core` | `packages/poker-core` |
| `planning-poker/apps/web` | `apps/poker-web` |
| `planning-poker/apps/sync` | `apps/poker-sync` |
| `tdd-mob-pro-timer/docs` | `docs/timer` |
| `tdd-mob-pro-timer/README.md` | `docs/timer/README.md` |
| `planning-poker/specs` | `docs/poker/specs` |
| `planning-poker/README.md` | `docs/poker/README.md` |
| `tdd-mob-pro-timer/scripts` | `scripts` |
| `tdd-mob-pro-timer/deploy` | `deploy/timer` |
| `planning-poker/deploy` | `deploy/poker` |
| `planning-poker/.specify` | `.specify` |
| `planning-poker/.claude/skills` | `.claude/skills` |

統合（各 1 つに）: `package.json`（name `tasuki`、`packageManager: pnpm@11.5.0`、devDeps 統合）/ `pnpm-workspace.yaml`（`packages/*` `apps/*` + `allowBuilds: esbuild: true`）/ `turbo.json` / `tsconfig.base.json` / `eslint.config.mjs`。lockfile は削除して 1 つ再生成する。

リネーム（**実測 470 箇所 / 183 ファイル**。行数では 459 行）:

| 旧 | 新 | 出現 | 行 | ファイル |
|---|---|---|---|---|
| `@tdd-mob/core` `/sync` `/web` | `@tasuki/timer-core` `/timer-sync` `/timer-web` | 448 | 437 | 167 |
| `@planning-poker/core` `/sync` `/web` | `@tasuki/poker-core` `/poker-sync` `/poker-web` | 22 | 22 | 16 |

追随が必要な設定: `apps/timer-web/vite.config.ts` の alias 9 本、`apps/timer-sync/tsconfig.json` と `apps/timer-web/tsconfig.json` の `paths`、各 `vitest.config.ts`。

#### 「緑のまま静かに壊れる」もの — 最優先で潰す

移動しても**エラーにならず、検査が黙って無効化される**箇所。テストも lint も緑のまま通るため、意識して確認しないと気づけない。

1. **eslint の React フックルールが死ぬ**
   `eslint.config.mjs:64` は `files: ["apps/web/src/**/*.{ts,tsx}"]` で React ブロックを限定している。`apps/timer-web/src/` へ移すと**このパターンは何にもマッチせず**、`react-hooks/rules-of-hooks` と `react-hooks/exhaustive-deps`（いずれも `error` 指定）が静かに無効化される。**lint は緑のまま通る。**
   → `files: ["apps/*-web/src/**/*.{ts,tsx}"]` へ一般化する。
   **確認方法**: 依存配列をわざと壊した一時変更で `lint` が落ちることを確かめる。

2. **eslint のテスト緩和ブロックが poker に効かない**
   `eslint.config.mjs:77` は `files: ["**/test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"]`。timer は `test/`（単数）、**poker は `tests/`（複数形）**。統一時に `**/test{,s}/**` 相当で両方をカバーする。

3. **`scripts/audit-structure.mjs` が別物を走査する**
   `REPO_ROOT = path.resolve(__dirname, "..")` と `loadPackage("packages/core")` / `("apps/sync")` / `("apps/web")` が新レイアウトでは存在しないパスを指す。SC 判定のパス組み立ても同様。
   なお本スクリプトと `mutation-check.mjs` は **package.json / CI のどのタスクからも呼ばれていない手動ツール**（実測: 参照 0 ファイル）。壊れても自動では気づけない。

4. **変異検査が空振りする**
   `scripts/mutations/*.patch`（**9 件**）はパッチ内が `packages/core/test/...` 等のパス前提。`scripts/mutation-check.mjs:150` は git pathspec に `":(exclude)tdd-mob-pro-timer/scripts/mutation-check.mjs"` を**直書き**している。

5. **デプロイが不能になる**
   `deploy/timer/deploy.sh` — `ROOT_DIR` の算出（`dirname/..` → `dirname/../..`）、`--filter @tdd-mob/web` → `--filter @tasuki/timer-web`、`bun build apps/sync/src/server.ts` → `apps/timer-sync/src/server.ts`。

#### ディレクトリ名を直書きしている追跡ファイル（実測 20 個）

上記 4・5 に加えて、以下も追随させる（スコープ名 `@planning-poker/...` の誤検出を除いた実数）:

- ドキュメント: ルート `README.md`、`docs/timer/README.md`、`docs/timer/ARCHITECTURE.md`、`docs/timer/adr/0010-design-doc-source.md`、`docs/poker/README.md`
- poker の deploy: `Caddyfile.poker` / `README.md` / `poker-sync.service`
- poker の SDD 成果物: `.specify/memory/constitution.md`、`docs/poker/specs/001-planning-poker-mvp/{plan,tasks}.md`

#### lockfile 再生成のリスク

2 つの lockfile を捨てて 1 つ作り直すため、`^` 範囲の transitive dependency が**黙って新しい版へ上がる**。バージョン統一の意図しない副作用と混ざると原因の切り分けが難しくなる。
→ 再生成後に `pnpm list --depth=1` の差分を確認し、意図しない major 更新が無いことを見る。退行が出た場合は lockfile の差分を先に疑う。

CI（`.github/workflows/ci.yml`）を単一ワークスペース向けに書き直す。

**受け入れ確認**:

- ルートで `turbo run test` が全緑（**1,724 件** = timer 1,625 + poker 99）
- ルートで `turbo run typecheck` / `lint` / `build` が全緑
- `turbo run build --filter=@tasuki/poker-web` で timer 側が対象外になる
- ルートに `pnpm-workspace.yaml` / `turbo.json` / `package.json` / `pnpm-lock.yaml` / `tsconfig.base.json` / `eslint.config.mjs` が **1 つずつ**
- **「静かに壊れる」もの 5 点の生存確認**:
  - React フックルールが生きている（依存配列をわざと壊した一時変更で `lint` が落ちる）
  - poker の `tests/` にも eslint が効いている
  - `node scripts/audit-structure.mjs` が新レイアウトを走査して完走する
  - `node scripts/mutation-check.mjs` が **9 変異すべてを検出**する
  - `deploy/timer/deploy.sh` が本番へ通る
- `deploy/timer/deploy.sh` で本番へデプロイし、`/` が従来どおり動作する（配信中の `assets/index-*.js` ハッシュがローカルビルドと一致すること、`/ws` が 426 を返すこと、`tasuki-sync` の `NRestarts=0` と PID 据え置き）

> **本番デプロイの前提**: devcontainer には SSH 秘密鍵が無く、コンテナを作り直すたびに消える。デプロイ前に鍵の存在を確認し、無ければ再発行して公開鍵をホスト側で登録する必要がある。また再起動でルームは全消滅する（揮発インメモリ設計）ため、**利用者のいない時間帯に実施する**。

#### S1-b: React 19 化と tsconfig 統合

- `apps/timer-web`: `react` / `react-dom` / `@types/react` / `@types/react-dom` を 19 系へ
- `apps/timer-web/src/ui/components/Markdown.tsx:219`: `JSX.IntrinsicElements` → `React.JSX.IntrinsicElements`
- `tsconfig.base.json` に `exactOptionalPropertyTypes` / `verbatimModuleSyntax` を追加し、**21 件の型エラーを修正**
- eslint を全パッケージへ適用（poker 側に `lint` スクリプトを追加）

**受け入れ確認**: `turbo run typecheck lint test build` が全緑。timer web を実画面で確認（ルーム作成 → 参加 → 同期）。

### S2（#17）— アプリ別に独立デプロイできるようにする

```
deploy/
├── deploy.sh                # 共通ドライバ。deploy.sh <app>
├── lib/common.sh            # SSH ホスト解決・ビルド・rsync・再起動の共通処理
├── timer/
│   ├── app.env              # SERVICE / PORT / WEB_ROOT / APP_DIR / FILTER
│   ├── tasuki-timer-sync.service
│   └── Caddyfile.timer
├── poker/  …同構成（PORT=3311）
└── landing/                 # S3 で追加（service 不要・静的配信のみ）
```

- **#51 の再発防止を引き継ぐ**: 実行ユーザー・パスは `app.env` の変数で一元化し、systemd ユニットを生成するヒアドキュメントは変数展開されるクォートにする。README の手順はそのまま実行可能な形に保つ（既定 SSH ホストを実在しない値にしない）
- ホストの Caddyfile は `import /etc/caddy/tasuki/*.conf` するだけの構成にし、アプリ別断片を配置する

**受け入れ確認の制約（重要）**: D1 により poker は S4 まで非公開のため、「timer だけ再デプロイしても poker が落ちない」を**本番実機で確認できない**。

代替手段を置くが、**その証明力を過大に見積もらないこと**。ローカルで別プロセス・別ポートのサーバーを 2 つ立てて片方を再起動しても、落ちないのは当たり前で、ほとんど何も証明しない。本番で実際に効いてくるのは「**単一の Caddy プロセスが両アプリの設定断片を読んでおり、片方の断片を差し替えて `caddy reload` したときにもう片方の WebSocket が切れないか**」であり、これはローカルでは再現しない。

したがって S2 では:

1. **設定の分離を構成として担保する**（レビューで確認する事項）— 別ポート・別 systemd ユニット・別 Caddy 断片であること。共有される状態は Caddy プロセスのみであること
2. 本番では timer の再デプロイ後に `systemctl show tasuki-timer-sync -p ActiveState -p NRestarts -p MainPID` を 2 回（20 秒間隔）見て、クラッシュループが無いことを確認する
3. **「相互無干渉」の実証は S4 へ送る。S2 の完了条件からは外す**（#17 にその旨を明記し、#19 に申し送る）。S4 では poker の WebSocket セッションを繋いだまま timer を再デプロイし、poker 側が切れないことを実機で確認する

### S3（#18）— ツール選択 LP の新設

- `apps/landing` を **Vite + React** で新設（D7）
- 世界観は poker と同じ「夜のカードテーブル」。**S5 の UI キット抽出のうち「配色・カード表現」だけを S3 より先に出す**ことで、LP と poker の二重管理を避ける（epic #15 の記述どおり）
- 暫定公開パス `/home` で配信し、目視確認する
- **既存 URL（`/`）は不変**。`/poker` は元々未公開なので変化なし
- モバイル幅で縦積みになることを実機幅で確認（`frontend-design` 準拠）

### S4（#19）— timer を /timer へ移設し、ルートを LP にする

- `apps/timer-web` を `base: '/timer/'` でビルド、WebSocket を `/timer/ws` へ
- Caddy 断片を `/timer/*` 配信 + `/timer/ws` → `127.0.0.1:8787` へ
- LP を `/` に配置（旧 `/` の timer 配信を置換）、`/home` は撤去または `/` へリダイレクト
- **poker の初回本番デプロイをここで実施**（D1）。`/poker/` + `/poker/ws` → `:3311`
- S2 で送った「timer / poker の相互無干渉」を**本番実機で実証**する
- 旧 URL の挙動（`/` → LP）をドキュメント化

**確認**: `/` = LP、`/timer` = timer（WS 同期含む）、`/poker` = poker の 3 系統が並存。それぞれ実機で目視。

### S5（#20）— 共通コードの抽出

> **⚠ この節は 2026-08-05 に実測して書き換えた。** 当初の抽出候補は「両 sync に
> WS 同期基盤の重複がある」という**誰も測っていない見込み**で書かれており、
> 実際に読むと成り立たなかった。

抽出は 3 つに分かれ、進み方が違う。

#### ① `packages/ui` — 配色・カード表現（**完了**）

S3 のハード依存として先出しした。`apps/poker-web` と `apps/landing` が共有する。
`apps/timer-web` は Tailwind ベースの別系統なので使わない。

#### ② `packages/protocol` — 信頼境界のパース（**完了**）

`timer-sync` の WS アダプタと `poker-core`（poker の sync / web の両方が使う）が
`parseBoundaryMessage` を共有する。失敗の理由は `stage`（`json` / `schema`）だけを返し、
**エラーコードと文言は決め打ちしない**（timer は 2 つを区別し、poker は 1 つに畳むため）。

#### ③ `sync-kit` — WS 同期基盤（**実測の結果、そのままでは抽出できない**）

| 層 | timer | poker | 共有可能か |
|---|---|---|---|
| 規模 | 3,834 行 / 34 ファイル | 242 行 / 2 ファイル | — |
| **WebSocket 実装** | `ws` npm パッケージ | **`Bun.serve`** | **不可**（API が別物） |
| ルーム保管 | クラス + ポート。ソケットは別の Broadcaster が持つ | モジュール関数。エントリがルームとソケットを同梱 | 形が違う |
| ルームの寿命 | TTL 回収 + ハートビート + presence | 接続 0 で即破棄 | 方針が別 |
| 配信 | 3 メソッド（snapshot / sendTo / signal） | 受信者別スナップショットを 1 関数で | 別 |
| メッセージ定義 | `session.act` / `room.join` … | `vote` / `reveal` / `next-round` | ドメインが別 |

**そのままでは共有できる実体が無い。** 土台を揃えるには timer を `Bun.serve` へ寄せる必要があり、
それには**テスト基盤の移行が前提になる**（下記）。

##### なぜテスト基盤の移行が要るか

**vitest のワーカーは Node で起動されるため、テストプロセス内で `Bun.serve` を使えない**
（`bun x vitest` でも「Bun is not defined」）。poker が sync テストをサブプロセスで動かして
いるのはこの制約が理由。

timer の heartbeat テスト 4 件は `vi.useFakeTimers` と `vi.spyOn(globalThis, "clearInterval")`
を使っており、**アダプタが同一プロセスにいることが前提**。サブプロセス化すると
Issue #25（半開き接続の検出）の中核が検証できなくなる。

##### 決定: `apps/timer-sync` のテストを `bun test` へ移す

実行可能であることは実測済み。詳細は
[`docs/superpowers/plans/2026-08-05-bun-test-migration.md`](../plans/2026-08-05-bun-test-migration.md)。

#### 完了確認（③ の後）

- turbo の依存グラフで、shared 変更時に依存アプリのみ再ビルド・型チェックされることを確認
- 全テストが緑（リグレッションなし）

---

## 5. リスクと対処

| リスク | 影響 | 対処 |
|---|---|---|
| React 19 でランタイム退行 | timer の実画面が壊れる | S1-b で全 1,724 件 + 実画面確認。解消不能なら poker を 18 へ下げる方向へ切替（D4 の退路） |
| `exactOptionalPropertyTypes` の修正が振る舞いを変える | 型を通すために `undefined` を握り潰す修正をすると挙動が変わる | 修正は「型定義側に `\| undefined` を足す」を第一選択にし、値を落とす修正はしない |
| **eslint の React ルールが黙って無効化される** | フックの依存漏れが検出されなくなる。**lint は緑のまま** | `files` を `apps/*-web/src/**` へ一般化し、依存配列をわざと壊して lint が落ちることを確認する（S1-a の受け入れ条件） |
| `audit-structure.mjs` / 変異パッチのパス追随漏れ | 構造監査と変異検査が黙って無効化される。**どのタスクからも呼ばれない手動ツールなので自動では気づけない** | S1-a の完了確認に `node scripts/audit-structure.mjs` と `node scripts/mutation-check.mjs`（9 変異すべて検出）を含める |
| lockfile 再生成で transitive deps が上がる | 退行の原因がバージョン統一なのか依存更新なのか切り分けられなくなる | 再生成後に `pnpm list --depth=1` の差分を確認。退行時は lockfile 差分を先に疑う |
| deploy スクリプトのパス追随漏れ | S1 後にデプロイ不能 | S1-a で実際に本番へデプロイして `/` の動作を確認する（受け入れ条件） |
| 本番ユニット名の改名 | 切り替え中にサービス断 | **既定は改名しない**（`tasuki-sync` 据え置き）。改名する場合のみ S2 の plan で切り戻し手順を明示 |
| 再起動でルームが全消滅（揮発インメモリ設計） | 利用中のセッションが切れる | 仕様どおり。デプロイは利用者のいない時間帯に行う |
| timer web テストが約 11 分 | CI が遅く、ローカル検証も待ちが長い | リポジトリは PUBLIC で Actions 時間制約なし。ローカルはバックグラウンド実行を前提にする |

---

## 6. 実施順序

```
[#50 先行 PR]
      │
      ▼
   S1-a ─→ S1-b                      （#16 / 2 PR・唯一の必須ゲート）
      │
      ├──→ S2 ──────────────┐        （#17・デプロイ規約）
      │                     │（推奨）
      ├──→ S5-ui ─→ S3 ─────→ S4      （臨界路。S4 で poker 初公開）
      │      │        （必須）  ▲
      └──→ S5-rest ─────────────┘     （#20 の残り: sync-kit / protocol）
```

- **S1 は唯一の必須ゲート**。S1-a → S1-b を通すまで他は着手しない
- **`S5-ui`（配色・カード表現の抽出）は S3 のハード依存**として前倒しする。LP と poker で世界観を二重管理しないため（epic #15 の記述を本設計で決定に格上げ）
- `S5-rest`（`sync-kit` / `protocol` の抽出）は URL にもデプロイにも触れないため、S1 完了後いつでも着手・完了できる（スラック最大）
- S4 は合流点。S3（ハード依存）と S2（推奨依存）の後

---

## 7. Issue への反映が必要な差分

本設計の結果、以下は Issue 本文の記述と食い違う。着手時にコメントで申し送る。

| Issue | 現在の記述 | 実態・本設計 |
|---|---|---|
| #16 | 「`/` と `/poker` にアクセスすると従来どおり timer と poker が動作する」 | **poker は未デプロイ**。守るべきは `/` の timer のみ |
| #16 | 完了条件に CI が無い | #50 を先行 PR とし、S1 で単一ワークスペース向けに書き直す |
| #17 | 「timer だけ再デプロイしても poker が落ちない」を実機確認 | poker は S4 まで非公開。**この完了条件を S2 から外し、S4 へ送る**。S2 では設定の分離（別ポート・別ユニット・別 Caddy 断片）をレビューで担保するに留める |
| #18 | 「既存 URL（`/` と `/poker`）は不変」 | `/poker` は元々未公開。不変なのは `/` のみ |
| #19 | poker への言及は「影響を受けない」 | **poker の初回本番デプロイを S4 で実施する** |
| #20 | UI キット抽出の時期は「S3 より先出しすると手戻りが減る」（推奨） | **先出しを本設計の決定とする** |

[#15]: https://github.com/tomohiroJin/tasuki-tools/issues/15
[#16]: https://github.com/tomohiroJin/tasuki-tools/issues/16
[#17]: https://github.com/tomohiroJin/tasuki-tools/issues/17
[#18]: https://github.com/tomohiroJin/tasuki-tools/issues/18
[#19]: https://github.com/tomohiroJin/tasuki-tools/issues/19
[#20]: https://github.com/tomohiroJin/tasuki-tools/issues/20
[#50]: https://github.com/tomohiroJin/tasuki-tools/issues/50
[#51]: https://github.com/tomohiroJin/tasuki-tools/issues/51
