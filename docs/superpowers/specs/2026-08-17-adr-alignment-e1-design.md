# 設計: #72 の再定義と E1（規範の空白を埋める）

**Issue:** [#72](https://github.com/tomohiroJin/tasuki-tools/issues/72)（親 epic [#67](https://github.com/tomohiroJin/tasuki-tools/issues/67) 段階 E）
**ディレクトリ:** `docs/superpowers/specs/`
**ステータス:** Draft（利用者レビュー待ち）
**基準コミット:** main `4449f20`（2026-08-17 実測）

## 概要

#72「ADR に沿ったリファクタリング（振る舞い不変）」を、6 つの部分系へ分解し、
その第 1 部分系 **E1（規範の空白を埋める）** を設計する。

E1 は**規範を決め、現行 ADR と実態のずれを解消する段階**である。振る舞いを変える
コード変更（ポート/アダプタ再編・画面の分割など）は行わず、それらは E2・E3・E4・E6 が担う。
E1 が触るコードは `scripts/check-links.mjs` と `apps/timer-web/src/App.tsx` の
docstring 2 行のみで、`packages/` は 1 行も変えない。

**当初は「`apps/` `packages/` を 1 行も変えない」としていたが、利用者判断
（2026-08-17）により、現行 ADR と実態のずれを後続 Issue へ切り出さず #72 の中で
解消する方針となったため、その範囲でコードに触れる。**

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
本設計では #72 を親とし、E1・E2・E3・E4・E6 を sub-Issue として各 1 PR とする。
分割の根拠はガイドの理由 1（独立して revert したい単位が複数ある）と
理由 3（危険度の異なる変更が混ざっている）。

## 分解

| | 部分系 | 中身 | 依存 | 危険度 |
|---|---|---|---|---|
| **E1** | 規範の空白を埋める＋**現行 ADR の実態整合** | ADR-0007 追記 / ADR-0015・0016 新設 / `docs/poker/adr/0001` 新設 / **timer ADR 0007・0008 へ追記** / ガイド更新 / #72 本文の再定義 / sub-Issue 起票。コード変更は `scripts/check-links.mjs` と `App.tsx` の docstring 2 行のみ | — | 低〜中 |
| **E2** | poker-sync のポート/アダプタ再編＋**エラー型の是正** | `server.ts` 426 行を `ports/` `adapters/` `application/` へ分解し、組み立てを 1 関数へ集約（ADR-0004 の MUST）。**ADR-0016 決定 2 のエラー型是正（poker-core ＋ `server.ts:244,:333` ＋ poker-web）を同じ PR で行う**（同一ファイル群のため分けると二度触る）。**ログ出力を増やさない**（増やすと ADR-0012 の繰り越し条件が発火する） | — | 高 |
| **E3** | ドメインの副作用除去 | `packages/timer-core/src/problem.ts:70` の `Date.now()` をポート注入へ。根拠は憲法 VI と `docs/timer/adr/0002`（どちらも既存）であり、**E1 の新 ADR には依存しない** | — | 中 |
| **E4** | web 層の再編 | timer-web を ADR-0015 へ寄せる（**poker-web は既に準拠**） | E1 | 高 |
| **E6** | 公開面とテスト規約の解消 | 構造監査の未達指標を 0 へ（ADR-0006）。**`poker-core/src/index.ts` の `export *` 撤去（ADR-0016 決定 2）と SC039c の公開記号削減は同じ作業面**なのでここに置く | E2・E4 | **中〜高** |

推奨順: **E1 → E2 → E3 → E4 → E6**（5 本）。
E6 が最後なのは、E2 と E4 がテストを書き換えるため先行すると二度手間になるから。
E2・E3 は E1 と独立なので並行できる。

**当初は E5（core 間の表現統一）を独立させて 6 本としていたが、2 回目の敵対的検証で
E5 に固有のコード作業が無いことが判明したため解消した**（下記「欠陥 5」）。
**E5 は欠番のままにする。** 番号を詰めると、解消の経緯を記した「欠陥 5」の記述と
対応が取れなくなるため。

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
| ⑥ | #72 の完了条件の再定義と E2・E3・E4・E6 の起票 | GitHub Issues（EARS） | 要求 |
| ⑦ | **`docs/timer/adr/0007`・`0008` へ実態の追記** | 各 ADR の末尾へ**追記** | 記録の整合 |
| ⑧ | **`apps/timer-web/src/App.tsx:39-40` の docstring 修正** | コード | ⑦のコード側 |

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
timer-web の `App.tsx` が 848 行あるのは 2 を持たないためで、`useState` 11 個・
`useRef` 10 個に加え、`SyncClient` のコールバック本体が render 本体の 132〜377 行に
直書きされ、377 行の `handlersRef` へ毎レンダー同期されている。

### ③ `docs/adr/0016` — core のドメイン表現規約

**決定 1: 表現の選択基準**

イベントの履歴・再生・段階適用が要るドメインは Decider（`decide` / `evolve`）を採る。
状態遷移だけで足りるドメインは直接遷移関数 ＋ `Result` を採る。
**どちらを採ったかと理由を、そのアプリの ADR（`docs/<app>/adr/`）に記録する（MUST）。**

**決定 2: どちらを採っても必ず揃える点（MUST）**

| 揃える点 | 現状 | 直す対象 | 宛先 |
|---|---|---|---|
| ドメイン操作の失敗は `Result` で表す | 両方準拠（ADR-0005） | なし | — |
| `index.ts` は公開記号を明示列挙する。`export *` を使わない（MUST NOT） | timer 準拠 / poker 未 | `packages/poker-core/src/index.ts` 1 ファイル | **E6** |
| ドメインエラーは判別子と機械可読な詳細のみを持つ。表示文言は文言生成関数が担う | timer 準拠 / poker 未 | poker-core の `RoundError` `RoomError` と文言 6 箇所（`RoundError` 由来 5 ＋ `RoomError` 由来 1）、`poker-sync/server.ts:244,:333`、poker-web | **E2** |
| ドメイン内で `Date.now()` / `Math.random()` を呼ばない（MUST NOT） | poker 準拠 / timer 未 | `timer-core/src/problem.ts:70` 1 箇所 | **E3** |

**文言生成関数の置き場:** timer の `displayMessageFor()` は `@tasuki/timer-core` から
export されている（`App.tsx:36` が import）。つまり「文言生成関数が担う」は
「core の外に出す」という意味ではない。poker も同様に **poker-core 内の別モジュール**
へ置き、`poker-sync` は `code` から文言を引く。**WS で送る文字列は 1 文字も変えない**
（振る舞い不変）。

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
| 状態遷移 | `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` ＋ `evolve(agg, event, now): Aggregate` | `castVote(room, participantId, card): Result<Room, RoundError>` ほか 8 関数 |
| 中間表現 | `DomainEvent` を挟む | 挟まない |
| エラー型 | `{ type: "DuplicateName"; name: string }` 等。文言を持たず `displayMessageFor()` が生成 | `{ code: 'not-voting'; message: '現在は投票を受け付けていません' }` 等。文言を同梱 |
| `index.ts` | 公開記号を明示列挙 | `export * from './deck'` ほか 6 行 |
| 決定の記録 | `docs/timer/adr/0002` が Decider を定める | **ADR が 1 本も無い** |

### ④ `docs/poker/adr/0001` — poker は直接遷移を採る

`docs/poker/adr/` ディレクトリごと新設する（ADR-0002 採番規約 3）。
`README.md` も作る（`docs/timer/adr/README.md` に揃える）。

- **決定:** poker のドメインは直接遷移関数 ＋ `Result` を採る
- **根拠:** ドメインが 462 行 / 8 遷移関数であり、イベント履歴・再生の要求が現に無い
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
| 8 | `docs/timer/adr/0007` へ追記（トークン保持は `application/token-store.ts` へ切り出し済み。決定の意図＝モジュールグローバル回避は維持） |
| 9 | `docs/timer/adr/0008` へ追記（BYOK 休眠残置は #28 T010・コミット `7d7a73c` で撤去済み。サーバー常駐生成の決定本体は有効） |
| 10 | `apps/timer-web/src/App.tsx:39-40` の docstring を実装に合わせる（削除済み `key-storage` への言及を消す） |
| 11 | #72 本文の完了条件を再定義し、E2・E3・E4・E6 を sub-Issue として起票（EARS 記法） |

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
3. `docs/poker/adr/` 配下に壊れたパス参照を一時的に置くと **check-links が終了コード 1 になる**ことを実測した（破壊検証。壊れたこと自体を `grep` で先に確認し、確認後に元へ戻す。**壊した状態をコミットしない**）
4. **`git diff --stat` で `packages/` の差分が 0 行**であり、`apps/` の差分は
   `App.tsx` の docstring 2 行のみである
5. `docs/timer/adr/0007` と `0008` に実態の追記があり、**既存の「決定」節の差分が 0 行**である
6. `apps/timer-web/src/App.tsx` から、削除済み `key-storage` への言及が消えている
   （`grep -rn "key-storage" apps/ packages/` が 0 件）
7. **#72 本文の完了条件が再定義され**、E2・E3・E4・E6 が Issue として起票されている

## E2・E3・E4・E6 の起票に書くこと

各 Issue に共通で、①どの ADR の MUST が未達か（実測値つき）②EARS の受け入れ基準
③その Issue が入れる機械検査 ④振る舞い不変の示し方 を書く。

**「検査は各適用 Issue が入れる」を宛先として固定する。** E1 で検査を先に足すと、
E1 はコードを直さないので CI が赤になるためである。

| Issue | 入れる機械検査 |
|---|---|
| E2 | poker-sync に `create-sync-server.ts` が実在し、`server.ts` とテストの両方がそれを経由する |
| E3 | `packages/*-core` 配下に `Date.now()` / `Math.random()` が 0 件 |
| E4 | `sync/client` を import してよいファイルの**許可リスト**（同期フック 1 本のみ）。素朴な grep では書けない（フック自身は import してよい）ので、無状態の許可リスト方式にする |
| E6 | `packages/*-core/src/index.ts` に `export *` が 0 件。加えて既存の構造監査 SC029〜SC039（新設不要） |

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

### 欠陥 3（重大）— 完了条件が字義どおりには満たせない → **#72 の定義を変えて対処する**

#72 の完了条件「ADR に書いた構造と、実際のコードが一致している」を字義どおり適用すると、
**timer ADR は epic #15 の改名前パス（`packages/core` `apps/sync` `apps/web`）で
書かれているため永久に一致しない。** ADR は追記のみで書き換えられない。

**対処（利用者判断・2026-08-17）: 後続 Issue へ切り出さず、#72 の中でけりを付ける。**
先送りすると新しい振る舞いの実装がその分だけ遅れるため。**#72 の完了条件を次のとおり
再定義し、Issue 本文を書き換える。**

> **現在も有効な ADR の決定が、実際のコードと一致している。一致しない箇所は、
> コードを直すか、ADR へ追記して経緯を残すかのどちらかで解消されている。**
>
> - 改名前のパス表記など「当時の記録として正しい」記述は一致の対象外とする
>   （ADR は追記のみであり、書き換えは規則違反）
> - `Superseded` が宣言済みの ADR（`docs/timer/adr/0005` `0010`）は対象外
> - **決定の手段と実装が食い違う箇所は、#72 の中で ADR へ追記して解消する**

この再定義により、**欠陥 2 の 2 件は E1 の作業範囲に入る**（下記 ⑦）。

### 欠陥 4（中）— E2 が ADR-0012 の繰り越しを踏みうる

`docs/adr/0012` 決定 D1 は対象を `apps/timer-sync` に限定し、**poker-sync へのロガ導入を
明示的に繰り越している**（「繰り越し先は、poker 側のログ出力が `listening` 以外にも
増えるときとする」）。E2 が再編の過程でログ出力を足すと、**この条件が発火してロガ導入が
E2 の必須作業になる。** E2 の Issue に「ログ出力を増やさない」を明記する。

なお `scripts/audit-log-hygiene.mjs` は `apps/poker-sync/src` を走査対象に含むため、
許可マーカーの無い直接出力は増やせない（ADR-0012・**MUST NOT**）。検査は既に効いている。

### 申し送りは残さない — 未検証だった 3 点をすべて実測した（2026-08-17）

| 対象 | 結果 |
|---|---|
| `docs/timer/adr/0003`（`ServerClock` 一本化） | **一致。** `ServerClock` の 6 フィールドは `packages/timer-core/src/aggregate.ts:32-` に実在。`apps/timer-web/src/ui/use-now-tick.ts` の `setInterval` は 200ms ごとに `now` を更新して**再描画するだけ**で、残り時間は状態から導出している。クライアントがローカル時計でカウントを進めてはいない |
| `docs/timer/adr/0005`（秘密ゼロ BYOK） | **問題なし。** 本文・README とも `Superseded by ADR-0008` を宣言済み |
| ADR-0015 の根拠（推定だった 2 点） | **実測で確認。** 下記 |

**ADR-0015 の根拠の実測:**

- timer-web の切り出し済み 9 関数（`ui/screen.ts` `error-action.ts` `host-change.ts`
  `problem-generation.ts` `join-driver-intent.ts` `connection-status.ts` `room-param.ts`
  `sync/notice-message.ts` `sync/sync-url.ts`）は、**すべて副作用 0 件・React フック 0 件**
  （`Date.now` `Math.random` `fetch` `localStorage` `window.` `document.` と
  `useState` `useEffect` `useRef` を grep）。12〜63 行の小さな純粋関数である
- poker-web の `hooks/useSync.ts` は **176 行**で、`wsRef` と `open` / `close` / `message`
  の 3 リスナを 1 つの `useEffect` に閉じ込め、接続まわりの状態 7 個を保持している。
  **WS 配線の集約は実在する**

### ついでに測った 2 点

- **`docs/timer/adr/0004`（full snapshot 同期）は一致。** `packages/timer-core/src/schemas.ts`
  に `type: v.literal("snapshot")` が 1 件のみで、差分・revision の型は無い
- **`docs/timer/adr/0008` の不一致は「BYOK 休眠残置」の 1 節だけ。** 決定の本体である
  サーバー常駐生成は実在する（`apps/timer-sync/src/adapters/claude-cli-problem-provider.ts` /
  `application/ai-limits.ts`）

## 敵対的検証 2 回目（2026-08-17）

1 回目の修正後の設計に対して、**「24 本すべて測った・不一致は 5 件」という数え上げ
そのものを壊しにいった。** 結果、数え上げは持ちこたえたが**分解に 2 件の重大な誤り**が出た。

### 欠陥 5（重大）— E5 に固有のコード作業が無い。6 部分系は 5 本に減る

ADR-0016 決定 2 の 4 項目の行き先を実際に追うと、E5 に残るものが無い。

| 項目 | 実際の行き先 |
|---|---|
| `Result` を返す | 両方準拠。作業なし |
| `index.ts` の明示列挙 | poker-core 単独。**公開面の話なので E6（SC039c）と同じ作業面** |
| エラー型 | poker-core ＋ `poker-sync/server.ts:244,:333` ＋ poker-web。**E2 が触るファイル群と同一** |
| `Date.now()` | **E3** |

決定 1（表現の選択基準）は文書のみで、コード作業を生まない。
PR 粒度ガイドの「**分けた方が丁寧に見えるは理由にならない**」に照らして **E5 を解消**し、
エラー型を E2 へ、`index.ts` を E6 へ移した。

### 欠陥 6（重大）— 旧の順序が二度手間を作っていた

旧案は E2（poker-sync 再編）→ E5（poker-core のエラー型）の順だった。エラー型を変えると
`server.ts:244` と `:333` を**再び触る**ことになる。欠陥 5 の解消で消えた。

### 欠陥 7（中）— E2 の振る舞い不変の証拠を E2E に期待できない

**poker の E2E は `e2e/specs/poker.spec.ts` の 2 件のみ**（`test(` を実測）。
E2 の安全網は実質 **`apps/poker-sync/tests` の 84 件 / 14 ファイル**と
`packages/poker-core` の 48 件 / 6 ファイルである。E2 の Issue に
「主たる特性テストは単体 84 件。**変異検査で恒真化を確かめる**」を明記する。

### 欠陥 8（中）— E4 の機械検査を素朴な grep で書けない

「画面コンポーネントが同期クライアントを直接 import していない」は、
**同期フック自身は import してよい**ため単純な有無検査にならない。
実測では `sync/client` を import しているのは **`apps/timer-web/src/App.tsx` の 1 ファイルのみ**。
検査は**無状態の許可リスト方式**（この import を許すのは同期フック 1 本だけ）で書く。
手書きの字句解析は 3 度続けて検出漏れを作った実績があるので採らない。

### 欠陥 9（小）— 破壊検証の手順に抜けがある

完了条件 3 の破壊検証で `docs/poker/adr/0001` を一時的に壊すが、
**壊した状態をコミットしない**ことを手順へ明記する。

### 欠陥 10（小）— E1 の危険度「低」は甘い

E1 は `scripts/check-links.mjs` を変更する。ここが壊れると全文書検査が死ぬ。
`scripts/check-links.test.mjs` があるため致命ではないが、**「低」ではなく「低〜中」**とする。

### 壊せなかった主張（生き残ったもの）

- **ADR-0001 決定 1「timer はトークン層だけを読む」は一致。**
  `apps/timer-web/src/index.css:5` は `@import '@tasuki/ui/tokens.css';` のみで、
  要素層を読んでいない（同ファイル 2 行目に「要素層は…」と明記もある）
- **poker-web は ADR-0015 の MUST 2 に既に準拠。** `App.tsx:3` が `usePokerSync` 経由で、
  `.tsx` に `WebSocket` の直接使用は無い。**E4 の対象は timer-web 側だけ**
- **check-links に到達性検査は無い**（`docs/README.md` は `LIVE_DOCS` の 1 エントリに過ぎない）。
  完了条件 2 の「到達できる」は、`docs/adr/README.md` にリンクを足せば
  **リンク先の実在検査**として機械的に効く

### この検証の限界（正直に書く）

**下の 24 本の表は、各 ADR につき代表的な決定を 1 つ測ったもので、
全決定を網羅的に照合したものではない。** 例えば ADR-0001 は決定が 5 つあるが、
検証したのは決定 1（トークン層と要素層の分離）と ui のディレクトリ実在のみである。
**「24 本すべて一致を確認した」ではなく「24 本すべてについて代表的な決定を測り、
5 件の不一致を見つけた」が正確な主張である。**

## ADR 24 本の実態一致（2026-08-17 実測・main `4449f20`）

「けじめを付ける」ため、**横断 14 本とアプリ固有 10 本のすべて**について実態との一致を
測った。宛先が空欄のものは対処不要である。

### 横断 ADR（`docs/adr/`）

| ADR | 一致の状況 | 宛先 |
|---|---|---|
| 0001 デザインシステムの範囲 | **一致**。`packages/ui/src/{tokens,elements,fonts}` が実在（#78 で適用済み） | — |
| 0002 文書体系の三層 | 文書規範。コードは対象外 | — |
| 0003 アジャイル運用 | プロセス規範。コードは対象外 | — |
| 0004 ポート/アダプタ標準 | **不一致**。poker-sync が `ports/` `adapters/` `application/` を持たない | **E2** |
| 0005 Result と境界検証 | **一致**。`neverthrow` 6 / `valibot` 5 パッケージを `package.json` で実測 | — |
| 0006 テスト規約 | **不一致**。SC029 15 / SC030 3 / SC031 3 / SC032 84.2% | **E6** |
| 0007 抽象化の基準 | 判断基準。コードは対象外。「利用者」の数え方を追記する | **E1 ①** |
| 0008 依存と供給網 | **一致**。`pnpm-workspace.yaml` に `minimumReleaseAge: 10080` / `allowBuilds` / `overrides` が実在 | — |
| 0009 CI の範囲と検査 | **一致**。`.github/workflows/ci.yml` のジョブは `ci` `audit` `e2e` `docs` `quality` の 5 本 | — |
| 0010 trustPolicy | **一致**。`trustPolicy: no-downgrade` と `trustPolicyExclude` が実在 | — |
| 0011 脅威モデルとデータ分類 | 設計規範。コードは対象外 | — |
| 0012 ログ・秘密・露出 | **一致**。`audit-log-hygiene` が終了コード 0（走査 9 パッケージ / 120 ファイル）。ただし `.tsx` 47 件は射程外（既知の限界・#157） | — |
| 0013 PR 粒度 | プロセス規範。**#72 本文の「1 PR で 1 つの構造変更」が既定「1 Issue = 1 PR」と食い違う** | **E1 ⑪** |
| 0014 走査対象の健全性 | **一致**。#135・#158 で適用済み | — |

### アプリ固有 ADR（`docs/timer/adr/`）

| ADR | 一致の状況 | 宛先 |
|---|---|---|
| 0001 モノレポ + 共有 core | 決定は有効。本文は改名前パスで書かれた当時の記録（#33 が追記済み） | — |
| 0002 Decider と純粋ドメイン | **不一致 1 件**。「`Date.now()` をドメイン内で呼ばない」に `problem.ts:70` が違反 | **E3** |
| 0003 サーバー権威 `ServerClock` | **一致**。6 フィールドが `aggregate.ts:32-` に実在。`use-now-tick.ts` は再描画のみでローカル計数をしていない | — |
| 0004 full snapshot 同期 | **一致**。`schemas.ts` に `snapshot` 型 1 件のみ、差分・revision の型は無い | — |
| 0005 秘密ゼロ + BYOK | `Superseded by ADR-0008` を宣言済み。対象外 | — |
| 0006 Result と境界検証 | `docs/adr/0005` へ昇格済み | — |
| 0007 揮発インメモリ | **不一致**。トークン保持は `application/token-store.ts` へ切り出し済みで、決定が指定した「`makeHandlers` のクロージャ内 `Map`」ではない | **E1 ⑦** |
| 0008 サーバー常駐 AI 生成 | **不一致 1 節**。決定本体（サーバー常駐生成）は実在するが、「BYOK 休眠残置」の 2 ファイルは `7d7a73c` で撤去済み | **E1 ⑦⑧** |
| 0009 テスト規約 | `docs/adr/0006` へ昇格済み | — |
| 0010 設計文書の正本 | `Superseded by docs/adr/0002` を宣言済み。対象外 | — |

**まとめ: 24 本のうち不一致は 5 件**（横断 0004・0006、timer 0002・0007・0008）。
うち **2 件は E1 が追記で解消**し、残る 3 件は E2・E3・E6 がコードで解消する。

## スコープ外

- `apps/` `packages/` の**構造**変更 → E2・E3・E4・E6（E1 が触るのは docstring 2 行のみ）
- 憲法の改版 → 不要と判断（上記）
- `docs/timer/adr/` の LIVE 化 → 実測により見送り（上記。理由の記述のみ直す）
- ADR 整合の**別 Issue 切り出し** → **撤回した。**#72 の中で行う（利用者判断・2026-08-17）
- 構造監査の未達指標の解消 → E6
- 振る舞いを変える改善 → #72 の外（epic #67 の制約）

## 関連

- `docs/constitution.md` 原則 VI（依存は内向き）・VII（検査は壊して確かめる）・VIII（記録が正本）・IX（小さく回す）・X（抽象は実需で）
- `docs/adr/0002`（文書体系の三層構造）/ `0004`（ポート/アダプタ標準）/ `0005`（Result と境界検証）/ `0006`（テスト規約）/ `0007`（抽象化の基準）/ `0013`（PR 粒度）/ `0014`（走査対象の健全性）
- `docs/timer/adr/0002`（Decider パターン。「`Date.now()` をドメイン内で呼ばない」を含む）
- `docs/guides/architecture.md` / `pr-granularity.md` / `definition-of-done.md` / `ears-writing.md`
