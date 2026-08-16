# 設計: #72 の再定義と E1（規範の空白を埋める）

**Issue:** [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67) 段階 E）
**ディレクトリ:** `docs/superpowers/specs/`
**ステータス:** Draft（利用者レビュー待ち）
**基準コミット:** main `4449f20`（2026-08-17 実測）

## 概要

#72「ADR に沿ったリファクタリング（振る舞い不変）」を、6 つの部分系へ分解し、
その第 1 部分系 **E1（規範の空白を埋める）** を設計する。

E1 は **`apps/` と `packages/` を 1 行も変えない**。決めるだけの段階であり、
適用は E2〜E6 が行う。

## 背景

### #72 の本文は起票時点（2026-08-05）の記述で、4 点が現状と食い違う

| 本文の記述 | 2026-08-17 の実測 |
|---|---|
| timer-sync 3,834 行 / 34 ファイル | **4,710 行 / 42 ファイル**（`src` のテスト除く） |
| poker-sync 約 300 行 / 3 ファイル | **660 行 / 5 ファイル**（うち `server.ts` が 426 行） |
| `App.tsx` が 600 行超 | **848 行** |
| 「例外と `Result` の使い分けが層ごとに明文化されていない」 | **無効。** ADR-0005（#68）が全体標準として明文化済み。既存パッケージは準拠済みで、#72 は退化させないだけ |

前提の「#68 が完了していること」は満たされている。

### #72 は ADR が 1 本も無い時点で起票された

本文の「分かっている適用先」は当時の見立てであり、本文自身が「段階 A の結論次第で
増減します」と書いている。段階 A（#68）が終わり横断 ADR は 14 本になったが、
**本文が挙げた `App.tsx` と core 間の表現統一について、形を決めた ADR は無い。**

**訂正（敵対的検証・下記「敵対的検証の結果」節）:** 当初「構造について MUST を持つのは
ADR-0004 と憲法 VI のみ」と書いたが、これは横断 ADR しか見ていなかった。
`docs/timer/adr/` の 0002・0003・0007 にも構造の MUST がある。

利用者の判断: **先に ADR を追加してから直す。** したがって E 段階が
「規範を決める作業（本来は A 段階の仕事）」を含む。

### 本文の PR 粒度の記述が現行規範と食い違う

本文は「1 つの PR で 1 つの構造変更」だが、ADR-0013 /
`docs/guides/pr-granularity.md` の既定は「**1 Issue = 1 PR**」である。
本設計では #72 を親とし、E1〜E6 を sub-Issue として各 1 PR とする。
分割の根拠はガイドの理由 1（独立して revert したい単位が複数ある）と
理由 3（危険度の異なる変更が混ざっている）。

## 分解

| | 部分系 | 中身 | 依存 | 危険度 |
|---|---|---|---|---|
| **E1** | 規範の空白を埋める | ADR-0007 追記 / ADR-0015・0016 新設 / `docs/poker/adr/0001` 新設 / ガイド更新 / sub-Issue 起票。**`apps/` `packages/` は不変** | — | 低 |
| **E2** | poker-sync のポート/アダプタ再編 | `server.ts` 426 行を `ports/` `adapters/` `application/` へ分解し、組み立てを 1 関数へ集約（ADR-0004 の MUST）。**ログ出力を増やさない**（増やすと ADR-0012 の繰り越し条件が発火してロガ導入が必須になる） | — | 高 |
| **E3** | ドメインの副作用除去 | `packages/timer-core/src/problem.ts:70` の `Date.now()` をポート注入へ。根拠は憲法 VI と `docs/timer/adr/0002`（どちらも既存）であり、**E1 の新 ADR には依存しない** | — | 中 |
| **E4** | web 層の再編 | timer-web / poker-web を ADR-0015 へ寄せる | E1 | 高 |
| **E5** | core 間の表現統一 | 両 core を ADR-0016 へ寄せる | E1 | 中 |
| **E6** | テスト規約の解消 | 構造監査の未達指標を 0 へ（ADR-0006 と `docs/timer/adr/0009`）。**SC039c は `packages/*-core` の公開 API を削る作業を含む**ため E5 と衝突しうる | E2・E4・E5 | **中〜高** |

推奨順: **E1 → E2 → E3 → E4 → E5 → E6。**
E6 が最後なのは、E2 と E4 がテストを書き換えるため先行すると二度手間になるから。
E2・E3 は E1 と独立なので並行できる。

### 構造監査の実測（2026-08-17・main `4449f20`）

```
走査対象: src 9 パッケージ / 167 件、test 10 パッケージ / 249 件
SC029 | 15                    | 0    | 未達
SC030 | 3                     | 0    | 未達
SC031 | 3                     | 0    | 未達
SC032 | 1132/1345（84.2%）    | 100% | —
SC039 | 分岐 0 / データ 0 行 / 公開記号 34 件 | 0 | —
```

SC029 は 7 → 15、SC032 は 97.3% → 84.2% へ増えているが、これは #135 が
走査対象を広げた結果であって退化ではない。

## E1 の決定

### 前提となる判断（利用者と合意済み）

**抽象化の基準は憲法 X / ADR-0007 を維持し、「利用者」の数え方だけを明確化する。**

ADR-0004 のポート/アダプタは、本番アダプタが 1 つしか無くても
「テストが別のアダプタを注入する」ことで利用者が 2 つになる。ADR-0004 の根拠
（#80 で実 WS 試験が組めた）は予測ではなく実測であり、この読み方は抜け道ではない。

### 成果物と置き場（ADR-0002 の書き分け規則に従う）

| | 成果物 | 置き場 | 種別 |
|---|---|---|---|
| ① | 「テストの差し替えも利用者に数える」 | `docs/adr/0007` へ**追記** | 決定の細目 |
| ② | web 層の構造標準 | `docs/adr/0015`（新規・横断） | 決定 |
| ③ | core のドメイン表現規約 | `docs/adr/0016`（新規・横断） | 決定 |
| ④ | poker が直接遷移を採る根拠 | `docs/poker/adr/0001`（新規。ディレクトリごと新設） | 決定 |
| ⑤ | 層対応表・判断フローへの反映 | `docs/guides/architecture.md` | 手順 |
| ⑥ | #72 の再定義と E2〜E6 の起票 | GitHub Issues（EARS） | 要求 |

**①をガイドへ移設しない理由:** ADR-0007 の 3 基準は ADR の「決定」節そのものであり、
ADR-0002 は ADR を「追記のみ。覆すときは Superseded」と定めている。ガイドへ移すと
決定節を空にする書き換えになる。したがって追記とし、ガイドは新設しない
（二重正本を作らないため）。

**憲法を改版しない理由:** ②③は「実装の形」の決定であって「何を守るか」の宣言ではない。
`docs/constitution.md` 原則 N という形の宣言を持つ横断 ADR は 0004・0005・0006・0007 の
4 本のみで、0008 以降は持たない（14 本を grep して確認。表記ゆれで拾えていない可能性は
あるため断定はしない）。**憲法を触らないので、ADR-0002 決定 5 の `AGENTS.md` 見出し
同期は発生しない。**

### ① `docs/adr/0007` への追記

> 基準 1 の「利用者（呼び出し箇所）」には、テストからの差し替え利用を数える。
> ポートに対する本番アダプタが 1 つしか無くても、テストが別のアダプタを注入して
> 使うなら利用者は 2 つである。
> **ただし「テストを書けば 2 つ目になる」を理由に抽出してはならない。差し替えを
> 行うテストが現に存在する（または同じ PR で追加される）ことを条件とする。**

最後の 1 文が無いと基準が恒真になり、どんな抽出も「テストを書けば 2 つ目」で
正当化できてしまう（#149 が残した削除判定手順が恒真だった件と同型）。

既存の 3 基準は 1 文字も変えない。

### ② `docs/adr/0015` — web 層の構造標準

決定は責務の分離のみを書き、ディレクトリ対応はガイド（⑤）に置く。

1. **副作用のない判断は純粋関数として切り出す（MUST）。** 画面遷移の決定・
   エラー種別からの行動決定・表示文言の組み立てを、コンポーネントやフックの中に
   埋めない。
2. **WebSocket の接続状態とメッセージ配線は同期フック 1 本に集約する（MUST）。**
   画面コンポーネント（`App.tsx` を含む）が同期クライアントのイベントハンドラを
   直接持たない（MUST NOT）。
3. **画面コンポーネントは表示に徹する。** 状態は同期フックか純粋関数から受け取る。

**根拠（実測）:** 1 は timer-web が実証している（`ui/screen.ts` `error-action.ts`
`host-change.ts` `problem-generation.ts` `join-driver-intent.ts`
`connection-status.ts` `notice-message.ts` `room-param.ts`）。2 は poker-web が
実証している（`hooks/useSync.ts`）。**どちらも予測ではなく、現に片方で動いている。**
timer-web の `App.tsx` が 848 行あるのは 2 を持たないためで、`useState` 12 個・
`useRef` 9 個・105〜377 行の 272 行 `useEffect` 1 本が同居している。

### ③ `docs/adr/0016` — core のドメイン表現規約

**決定 1: 表現の選択基準**

イベントの履歴・再生・段階適用が要るドメインは Decider（`decide` / `evolve`）を採る。
状態遷移だけで足りるドメインは直接遷移関数 ＋ `Result` を採る。
**どちらを採ったかと理由を、そのアプリの ADR（`docs/<app>/adr/`）に記録する（MUST）。**

**決定 2: どちらを採っても必ず揃える点（MUST）**

| 揃える点 | 現状 | 直す対象 |
|---|---|---|
| ドメイン操作の失敗は `Result` で表す | 両方準拠（ADR-0005） | なし |
| `index.ts` は公開記号を明示列挙する。`export *` を使わない（MUST NOT） | timer 準拠 / poker 未 | `packages/poker-core/src/index.ts` 1 ファイル |
| ドメインエラーは判別子と機械可読な詳細のみを持つ。表示文言は文言生成関数が担う | timer 準拠 / poker 未 | poker-core の `RoundError` `RoomError` と文言 5 箇所 |
| ドメイン内で `Date.now()` / `Math.random()` を呼ばない（MUST NOT） | poker 準拠 / timer 未 | `timer-core/src/problem.ts:70` 1 箇所（= E3） |

**この表は「片方が準拠し片方が未達」の項目だけを並べている。** 4 項目のうち
3 項目が poker 側、1 項目が timer 側を直す形になり、一方へ寄せる案と違って
方向が実測で決まっている。

**`export *` の実測:** `packages/*/src` と `apps/*/src` を全走査した結果、
`export *` は `packages/poker-core/src/index.ts` の 6 行のみ。timer-core は
FR-110 で明示列挙へ置換済み。

**エラー型の実需（ADR-0007 基準 3 を満たす根拠）:** `apps/poker-sync/src/server.ts:244`
と `:333` が `result.error.message` をそのまま WS へ流している。E2 で
アプリケーション層を切るとき、文言を core とアプリケーション層のどちらが持つかを
決めないと配線できない。「揃えるため」ではなく「E2 が進まないため」の実需である。

**両 core の現状（実測）:**

| | `packages/timer-core`（4,234 行 / 14 ファイル） | `packages/poker-core`（462 行 / 7 ファイル） |
|---|---|---|
| 状態遷移 | `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` ＋ `evolve(agg, event, now): Aggregate` | `castVote(room, participantId, card): Result<Room, RoundError>` など 5 関数 |
| 中間表現 | `DomainEvent` を挟む | 挟まない |
| エラー型 | `{ type: "DuplicateName"; name: string }` 等。文言を持たず `displayMessageFor()` が生成 | `{ code: 'not-voting'; message: '現在は投票を受け付けていません' }` 等。文言を同梱 |
| `index.ts` | 公開記号を明示列挙 | `export * from './deck'` ほか 6 行 |
| 決定の記録 | `docs/timer/adr/0002` が Decider を定める | **ADR が 1 本も無い** |

### ④ `docs/poker/adr/0001` — poker は直接遷移を採る

`docs/poker/adr/` ディレクトリごと新設する（ADR-0002 採番規約 3）。
`README.md` も作る（`docs/timer/adr/README.md` に揃える）。

- **決定:** poker のドメインは直接遷移関数 ＋ `Result` を採る
- **根拠:** ドメインが 462 行 / 5 遷移関数であり、イベント履歴・再生の要求が現に無い
  （同期はスナップショット方式）。ADR-0007 基準 3（パターンは変更が現に困難な
  ときに限る）に照らして Decider の実需が無い
- **影響:** 将来イベント履歴が要るようになったら Superseded にする

### ⑤ `docs/guides/architecture.md` の更新

- 層対応表に web 層の内部責務（純粋関数 / 同期フック / 画面）の行を足す
- 判断フローに core の表現選択（Decider か直接遷移か）の問いを足す
- **poker-sync の注記（標準形に従っていない旨）は E2 の完了まで残す**

## 足回り: check-links の走査対象

`scripts/check-links.mjs` の `DORMANT_DOCS` に
`{ prefix: "docs/poker/", reason: "poker の作業記録。記録として保持する" }` がある。

**新設する `docs/poker/adr/0001` はこの前方一致に飲まれ、コードパス検査の対象外に
なる。** 現役の規範文書が「作業記録」として静かに検査から外れる、#135 が塞いだ
経路と同型の事故である。

**対処:** `LIVE_DOCS` に `docs/poker/adr/` を追加する。`isLiveDoc()` は
`LIVE_DOCS` のみを見るため、`DORMANT_DOCS` に重複して一致しても問題ない。
`checkConstants()` が実在を要求するので、ディレクトリ作成と同じ PR で足す。

### `docs/timer/adr/` は休眠のままにする（実測に基づく判断）

同じ穴が timer の ADR 10 本にもある。片側だけ直すのを避けるため
`docs/timer/adr/` を `LIVE_DOCS` へ足して実測した。

```
15 件の問題があります（走査 203 ファイル）    ← 終了コード 1
```

**15 件すべてが `packages/core` `apps/sync` `apps/web` という epic #15 の改名前の
パス参照だった。** ADR は「追記のみ・当時の記述を保つ」規則であり、書き換えれば
規則違反、`MISSING_PATH_EXCEPTIONS` に 15 件足せば例外表が肥大する。

したがって **`docs/timer/adr/` は正当に休眠**である。ただし `DORMANT_DOCS` の理由が
「timer の作業記録」では実態と違うので、**理由を「改名前のパスを含む当時の記録。
ADR は追記のみのため書き換えない」に書き直す**（記録の修正であって決定の変更ではない）。

## 作業手順

| | 作業 |
|---|---|
| 1 | `docs/adr/0007` へ追記（既存 3 基準は 1 文字も変えない） |
| 2 | `docs/adr/0015`（web 層）を新規作成 |
| 3 | `docs/adr/0016`（core 表現）を新規作成 |
| 4 | `docs/poker/adr/` を新設し `0001` と `README.md` を作成 |
| 5 | `scripts/check-links.mjs` の `LIVE_DOCS` に `docs/poker/adr/` を追加、`DORMANT_DOCS` の timer の理由を修正 |
| 6 | `docs/adr/README.md` に 0015・0016 を追加 |
| 7 | `docs/guides/architecture.md` の層対応表・判断フローを更新 |
| 8 | #72 本文を再定義し、E2〜E6 を sub-Issue として起票（EARS 記法） |

## DoD 8 項目の当てはめ

**E1 は「文書のみの PR」ではない。** `scripts/check-links.mjs` を変更するため、
`ci-scope.mjs` の判定（`changedFiles.some((f) => !f.endsWith(".md"))`）により
**フル CI が走る**。文書のみ PR の高速経路には乗らない。

| # | 項目 | E1 での扱い |
|---|---|---|
| 1 | ユニットテスト全緑 | **該当**。`scripts/check-links.test.mjs` に走査対象追加のテストを足す |
| 2 | E2E | 該当なし（利用者の経路は変わらない） |
| 3 | 新しい検査を壊して赤くなる確認 | **該当**。`docs/poker/adr/0001` にわざと実在しないパス参照を書き、check-links が終了コード 1 になることを実測する。**壊れたこと自体を先に `grep` で確認する** |
| 4 | 変異検査 | **該当**。`check-links.mjs` を書き換えるため |
| 5 | 実経路での確認 | 該当なし（画面・プロトコルは不変）。ただし `node scripts/check-links.mjs` は実行する |
| 6 | Tidy First | 該当なしの見込み |
| 7 | 文書への影響 | 本体そのもの |
| 8 | Issue の完了条件 | 下記 |

## 完了条件

1. `docs/adr/0007` に追記があり、**既存 3 基準の差分が 0 行**である（`git diff` で示す）
2. `docs/adr/0015` `0016` `docs/poker/adr/0001` が存在し、`docs/adr/README.md` から到達できる
3. `docs/poker/adr/` 配下に壊れたパス参照を一時的に置くと **check-links が終了コード 1 になる**ことを実測した（破壊検証。壊れたこと自体を `grep` で先に確認し、確認後に元へ戻す）
4. **`git diff --stat` で `apps/` と `packages/` の差分が 0 行**である
5. E2〜E6 が Issue として起票され、#72 本文が再定義されている

## E2〜E6 の起票に書くこと

各 Issue に共通で、①どの ADR の MUST が未達か（実測値つき）②EARS の受け入れ基準
③その Issue が入れる機械検査 ④振る舞い不変の示し方 を書く。

**「検査は各適用 Issue が入れる」を宛先として固定する。** E1 で検査を先に足すと、
E1 はコードを直さないので CI が赤になるためである。

| Issue | 入れる機械検査 |
|---|---|
| E2 | poker-sync に `create-sync-server.ts` が実在し、`server.ts` とテストの両方がそれを経由する |
| E3 | `packages/*-core` 配下に `Date.now()` / `Math.random()` が 0 件 |
| E4 | 画面コンポーネントが同期クライアントを直接 import していない |
| E5 | `packages/*-core/src/index.ts` に `export *` が 0 件 |
| E6 | 既存の構造監査 SC029〜SC039（新設不要） |

## 敵対的検証の結果（2026-08-17・この設計自身に対して）

設計をコミットしたあと、自分で潰しにいって見つけた欠陥。**4 件のうち 2 件は
#72 の完了条件そのものに関わる。**

### 欠陥 1（重大）— 「構造の MUST は ADR-0004 と憲法 VI のみ」は誤り

横断 ADR 14 本しか見ずに断定していた。`docs/timer/adr/` を読むと構造の MUST が 3 本ある。

| ADR | 構造の MUST | 実態との一致 |
|---|---|---|
| `docs/timer/adr/0002` | Decider（`decide`/`evolve`）。時刻は `now` で注入し `Date.now()` を呼ばない | **不一致 1 件**（`problem.ts:70`。= E3） |
| `docs/timer/adr/0003` | 時刻系を `ServerClock` に一本化し、残り時間・経過時間は状態から導出。クライアントはローカル時計で進めない | 未検証（E4 が触る領域） |
| `docs/timer/adr/0007` | ホストトークン・復帰トークンは `makeHandlers` のクロージャ内 `Map` に保持する | **不一致**（下記） |

### 欠陥 2（重大）— timer ADR の 2 本が実態と食い違っている

- **`docs/timer/adr/0007`**: 決定は「`makeHandlers` のクロージャ内 `Map` に保持」だが、
  実装は `apps/timer-sync/src/application/token-store.ts` へ切り出し済み。
  同ファイルの冒頭コメントが「`handlers.ts` の `makeHandlers` が抱えていた 3 個の
  可変 `Map`（`hostTokens` / `resumeTokens` / `roomPassphrases`）を…切り出したもの」と
  過去形で書いている。**意図（モジュールグローバルを避ける）は満たしているが、
  決定が指定した手段とは違う。**
- **`docs/timer/adr/0008`**: 決定は「BYOK は休眠残置。`apps/web/src/ai/{byok,key-storage}.ts`
  は UI から撤去し将来の再有効化に備えて残す」だが、**両ファイルとも既に削除済み**
  （コミット `7d7a73c`「refactor: BYOK 系の休眠コードを撤去する（#28 T010）」で削除）。
  現存するのは `apps/timer-web/src/ai/no-ai.ts` と `provider.ts` の 2 本のみ。
  `apps/timer-web/src/App.tsx:40` に `key-storage` を指す古いコメントが残っている。

**#33（`docs/plans/adr-alignment-post-refactor/`）が #28 後の ADR 整合を扱ったが、
論点 1〜3（ADR-0009・0002・0001）に限定しており、0007 と 0008 は取り残された。**

### 欠陥 3（重大）— 完了条件が字義どおりには満たせない

#72 の完了条件「ADR に書いた構造と、実際のコードが一致している」を字義どおり適用すると、
**timer ADR は epic #15 の改名前パス（`packages/core` `apps/sync` `apps/web`）で
書かれているため永久に一致しない。** ADR は追記のみで書き換えられない。

**対処:** 完了条件の射程を次のとおり限定して #72 本文へ明記する。

- **一致を求める対象**: 横断 ADR（`docs/adr/`）と、現行パスで書かれたアプリ固有 ADR
- **一致を求めない対象**: 改名前のパス・撤去済みの構成を記述している箇所
  （当時の記録として正しい）
- **決定の意図と実装の手段が食い違っている箇所**（`docs/timer/adr/0007`・`0008`）は
  **#72 では直さず、別 Issue（#33 と同型の「ADR を実態に合わせる」作業）へ切り出す。**
  ADR の追記は #72 の「振る舞い不変のリファクタリング」とは性質が違うため

### 欠陥 4（中）— E2 が ADR-0012 の繰り越しを踏みうる

`docs/adr/0012` 決定 D1 は対象を `apps/timer-sync` に限定し、**poker-sync へのロガ導入を
明示的に繰り越している**（「繰り越し先は、poker 側のログ出力が `listening` 以外にも
増えるときとする」）。E2 が再編の過程でログ出力を足すと、**この条件が発火してロガ導入が
E2 の必須作業になる。** E2 の Issue に「ログ出力を増やさない」を明記する。

なお `scripts/audit-log-hygiene.mjs` は `apps/poker-sync/src` を走査対象に含むため、
許可マーカーの無い直接出力は増やせない（ADR-0012・**MUST NOT**）。検査は既に効いている。

### 検証しきれていないもの（正直な申し送り）

- `docs/timer/adr/0003`（`ServerClock` 一本化）と実装の一致は未検証。**E4 の着手前に測る**
- ADR-0015 の根拠にした「timer-web の `ui/*.ts` が純粋関数である」「poker-web の
  `hooks/useSync.ts` が WS 配線を集約している」は、**ファイル名と配置から推定したもので、
  中身を読んで確かめていない。E4 の設計時に実測する**
- `docs/timer/adr/0005`（秘密ゼロ BYOK）は 0008 に置き換わっているように読めるが、
  Superseded の宣言があるかを確認していない

## スコープ外

- `apps/` `packages/` の変更 → E2〜E6
- 憲法の改版 → 不要と判断（上記）
- `docs/timer/adr/` の LIVE 化 → 実測により見送り（上記）
- 構造監査の未達指標の解消 → E6
- 振る舞いを変える改善 → #72 の外（epic #67 の制約）

## 関連

- `docs/constitution.md` 原則 VI（依存は内向き）・VII（検査は壊して確かめる）・VIII（記録が正本）・IX（小さく回す）・X（抽象は実需で）
- `docs/adr/0002`（文書体系の三層構造）/ `0004`（ポート/アダプタ標準）/ `0005`（Result と境界検証）/ `0006`（テスト規約）/ `0007`（抽象化の基準）/ `0013`（PR 粒度）/ `0014`（走査対象の健全性）
- `docs/timer/adr/0002`（Decider パターン。「`Date.now()` をドメイン内で呼ばない」を含む）
- `docs/guides/architecture.md` / `pr-granularity.md` / `definition-of-done.md` / `ears-writing.md`
