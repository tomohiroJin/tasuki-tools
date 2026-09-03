<!--
Sync Impact Report
==================
- Version change: 2.1.3 → 2.1.4（PATCH: 正本のパスを docs/constitution.md へ移し、
  Governance の改版手続きから「依存テンプレート（plan/spec/tasks）との整合」を削除。
  原則 I〜XI は 1 文字も変えていない）
- Rationale: #71。spec-kit 経路（.specify/ の道具部分と .claude/skills/speckit-* 10 本）を
  廃止した。setup-plan.sh が exit 0 でリポジトリ直下に幽霊 specs/ を作る一方、実運用の
  設計文書は docs/superpowers/ で回っており、10 本のスキルは AGENTS.md から 1 つも
  案内されていなかった。憲法の正本が .specify/memory/ に同居していたため、docs/ 直下へ
  移して三層（憲法・ADR・ガイド）を揃えた。Governance の「依存テンプレートとの整合」は
  .specify/templates/ の消滅で宛先を失うため削除した。「すべての plan は Constitution
  Check ゲートを通過しなければならない」は残す — テンプレートを名指ししておらず、
  docs/superpowers/plans/ の 4 本が ## Constitution Check 節として体現しているため。
  ゲートの空文化を検出する話は #155 の領分。
  【2026-09-04 訂正（#155）】直前の「4 本」は誤り。実測ではゲートを持つ実装計画は
  3 本（#69 / #113 / #119）で、うち #113 の見出しは ## Constitution Check ではなく
  ## 規約チェック（Constitution Check）である。#155 の起票時の数え違いを、確かめずに
  ここへ写した。**記述は当時のまま残し、誤りだったことをこの注記で記録する。**
  原則にも決定にも影響しないため版は上げない。実測の正本は
  docs/superpowers/specs/2026-09-04-plan-constitution-gate-design.md とする。
- Modified principles: なし（原則 I〜XI は不変）
- Templates requiring updates:
  - 削除 .specify/templates/ — spec-kit 経路ごと廃止（#71）。以後、依存テンプレートは無い
  - OK AGENTS.md — **見出しに変更が無いため同期作業は不要**（原則 I〜XI の 11 本一致を
    確認済み）

---

Previous release: 2.1.2 → 2.1.3

- Version change: 2.1.2 → 2.1.3（PATCH: 原則 VII に走査対象の健全性という適用範囲を
  追記。原則の追加・削除・実質的な拡張は無い）
- Rationale: #135。検査が静かに効かなくなる経路のうち、申し送りにあった 6 経路と
  作業中に新たに見つかった 1 経路（計 7 経路）が「宣言と実体がずれても誰も言わない」
  という同一の機序だった（ハードコードの走査対象・非再帰のグロブ・実行時に静かに
  空になる走査）。原則 VII の既存 MUST（新しい検査を追加したら壊して赤を確認する／
  既存テストの恒真化を変異検査で確かめる）は「検査そのものの健全性」を要求している
  が、走査対象という前提が健全であることまでは明文化していなかった。決定は
  docs/adr/0014 に置き、憲法からはその適用範囲だけを示す（docs/adr/0002 の
  書き分け。DoD・PR 粒度と同じ構造）。既存 MUST の対象範囲を言い直しただけで新しい
  義務を課していないため PATCH とする。既存 MUST の適用先を「検査対象という前提」
  という新しいクラスへ広げる読み方をすれば MINOR と取る余地があることを、
  2.1.1→2.1.2 の先例に倣い記録しておく。
- Modified principles:
  - VII. 検査は壊して確かめる — 3 項目目に走査対象の健全性を適用範囲として追記。
    規範の強さ・見出しは不変。既存 2 項目は変更なし
- Templates requiring updates:
  - OK .specify/templates/plan-template.md — Constitution Check は動的参照のみ。変更不要
  - OK .specify/templates/spec-template.md — 憲法への直接参照なし。変更不要
  - OK .specify/templates/tasks-template.md — 憲法への直接参照なし。変更不要
  - OK AGENTS.md — **見出しに変更が無いため同期作業は不要**（AGENTS.md が転記するのは
    見出しのみ。「VII. 検査は壊して確かめる」のまま。原則 I〜XI の 11 本一致を確認済み）

---

Previous release: 2.1.1 → 2.1.2

- Version change: 2.1.1 → 2.1.2（PATCH: 原則 IX ① に粒度の判断基準の正本の指し先を
  追記。原則の追加・削除・実質的な拡張は無い）
- Rationale: #119。「1 つの論理的変更」の粒度が明文化されておらず、実質的にコミット
  単位まで細かくなっていた。#116（PR 1 本・10 コミット）と #136（PR 1 本・39 コミット）が
  意図的な先行実践として出され、説明コスト（PR 本文の文字数÷差分行数）が #113 の
  4.0〜115.1 から 0.9〜1.0 へ落ち、レビュー・revert のいずれでも支障が出なかった。
  判断基準は docs/guides/pr-granularity.md に置き、憲法からはその指し先だけを示す
  （docs/adr/0002 の書き分け。DoD と同じ構造）。決定そのものは docs/adr/0013。
  MUST の数・強さ・対象は変えず、既存の語が何を指すかの参照先を示すだけなので
  「明確化」と判断した。参照先の新設を「実質的な拡張」と取れば MINOR と読む余地が
  あることを記録しておく。新しい義務を課していないため PATCH とする。
- Modified principles:
  - IX. 小さく回す — 1 項目目に正本の指し先を追記。規範の強さ・見出しは不変。
    2 項目目（DoD）・3 項目目（デプロイ）は変更なし
- Templates requiring updates:
  - OK .specify/templates/plan-template.md — Constitution Check は動的参照のみ。変更不要
  - OK .specify/templates/spec-template.md — 憲法への直接参照なし。変更不要
  - OK .specify/templates/tasks-template.md — 憲法への直接参照なし。変更不要
  - OK AGENTS.md — **見出しに変更が無いため同期作業は不要**（AGENTS.md が転記するのは
    見出しのみ。「IX. 小さく回す」のまま。原則 I〜XI の 11 本一致を確認済み）

---

Previous release: 2.1.0 → 2.1.1

- Version change: 2.1.0 → 2.1.1（PATCH: 原則 XI の文言修正。原則の追加・削除・
  実質的な拡張は無い）
- Rationale: #136 の最終レビュー M4。原則 XI の 1 項目目「秘密（トークン・鍵・合言葉）は
  環境変数のみに置く（MUST）」という列挙が、docs/adr/0011 のデータ分類と噛み合って
  いなかった。同 ADR はルームの合言葉（パスフレーズ）を分類「資格情報」に置き、実装は
  in-memory Map に保持する。字義どおり読むと憲法の MUST に反する。意図していたのは
  AI_UNLOCK_KEY のような分類「秘密」の値であり、それが誤読されない文言へ直した。
- Modified principles:
  - XI. 秘密と個人情報を持ち込まない — 1 項目目の文言のみ。規範の強さ・見出しは不変
- Templates requiring updates:
  - OK .specify/templates/plan-template.md — 動的参照のみ。変更不要
  - OK .specify/templates/spec-template.md — 憲法への直接参照なし。変更不要
  - OK .specify/templates/tasks-template.md — 憲法への直接参照なし。変更不要
  - OK AGENTS.md — **見出しに変更が無いため同期作業は不要**（AGENTS.md が転記するのは
    見出しのみ。「XI. 秘密と個人情報を持ち込まない」のまま。原則 I〜XI の 11 本一致を確認済み）

---

Previous release: 2.0.0 → 2.1.0

- Version change: 2.0.0 → 2.1.0（MINOR: 原則 XI の追加。既存原則の変更・削除は無い）
- Rationale: #136（セキュリティの規範）。脅威モデルは
  docs/plans/archive/tdd-mob-pro-timer-spec-v3.0-final.md の 7 節に実在したが、
  archive の設計文書に埋もれ実装とも乖離していた。横断 ADR（0011・0012）へ
  昇格・現行化し、その拠りどころを憲法へ据える。
- Added principles:
  - XI. 秘密と個人情報を持ち込まない
- Templates requiring updates:
  - OK .specify/templates/plan-template.md — 動的参照のみ。変更不要
  - OK .specify/templates/spec-template.md — 憲法への直接参照なし。変更不要
  - OK .specify/templates/tasks-template.md — 憲法への直接参照なし。変更不要
  - OK AGENTS.md — 見出し同期済み（原則 I〜XI の 11 本一致）

---

Previous release: 1.0.0 → 2.0.0

- Version change: 1.0.0 → 2.0.0（MAJOR: 適用範囲を poker MVP から Tasuki 全体へ拡張し、
  原則の削除・再定義を伴うため）
- Rationale: #68（規範とアーキテクチャの確立）。本憲法は poker MVP 単体の企画時に
  書かれたものであり、Tasuki が timer・poker を含む複数ツール・複数エージェント運用の
  実践場へ育った現状と乖離していた（`docs/adr/0002` 背景）。全面書き直しにより、
  プロジェクト全体を貫く原則へ再定義する。
- Modified principles:
  - I. テスト駆動開発（NON-NEGOTIABLE） → I. テスト駆動開発（NON-NEGOTIABLE）を継承
    （`packages/core` 限定の記述を撤廃し、全パッケージへ一般化）
  - II. 技術スタックの固定 → II. 技術選定は ADR を通す（固定から、ADR による変更容認へ緩和）
  - III. 3パッケージ構成と揮発インメモリ → III. 揮発インメモリと単純運用
    （3パッケージ構成の強制を撤廃し、揮発インメモリの意味を保存）
  - IV. 型安全なエラー処理とスキーマ検証 → IV. 境界の型安全（境界検証 MUST・Result 型 MUST・
    例外を投げない MUST NOT は意味を保存。ただし旧 IV の「検証に失敗した入力は握りつぶさず、
    明示的なエラーとして処理する（MUST）」は独立した MUST として撤廃 — 詳細は Removed sections）
  - V. 実画面検証による完了定義 → V. 実画面検証（`apps/web` 限定の記述を撤廃し一般化）
- Added principles:
  - VI. 依存は内向き（ドメインの純粋性とポート/アダプタ構成）
  - VII. 検査は壊して確かめる（検査自体の健全性検証・変異検査）
  - VIII. 記録が正本（ADR/Issue/振り返りの役割分担と SOT）
  - IX. 小さく回す（1 PR = 1 論理変更・デプロイ回数の抑制）
  - X. 抽象は実需で（早すぎる抽象化の抑止）
- Removed sections（旧「追加制約」節ごと解消）:
  - 「既存の timer（`packages/timer-core` / `apps/timer-*`）には手を入れない（MUST NOT）」
    — `docs/adr/0002` の背景で述べたとおり、#78 で timer 側のデザインを作り直した現状と
    すでに矛盾していたため撤廃。デプロイの単純運用は新 III へ引き継ぐ。
  - 「3パッケージ構成を維持する（MUST）」（旧 III） — Tasuki が timer・poker 等の
    複数ツールを持つ現状ではパッケージ構成の固定は成立しないため撤廃。
    揮発インメモリの原則そのものは新 III へ意味を保存する。
  - 「技術スタックは以下に固定する（MUST NOT）」（旧 II） — plan 工程での代替技術の
    再検討を一律禁止する運用は硬直的すぎたため、ADR による記録を条件に変更を
    容認する新 II へ緩和。
  - 「公開方式」「同居ポリシー」「MVP スコープ外」等、poker MVP 固有の運用細則
    （旧「追加制約」節） — 全体憲法にはそぐわないため撤廃。個別ツールの運用細則は
    各アプリの ADR・ガイドへ委ねる。
  - 旧 IV の「検証に失敗した入力は握りつぶさず、明示的なエラーとして処理する（MUST）」
    — 新 IV では「境界で Valibot 検証を行う（MUST）」「失敗は `Result` 型で表現する
    （MUST）」「ドメイン層で例外を制御フローに使わない（MUST NOT）」のみを残し、
    「握りつぶさない」という独立した MUST は撤廃した。これにより、コード内参照のうち
    IV の 3 番目（`apps/poker-sync/tests/protocol-errors.test.ts:15`。不正メッセージの
    ハンドリングを検証するテストの説明）の根拠は、「不正入力を明示的なエラーとして扱う」
    という強い主張から、「境界で検証を行う（MUST）」という一般的な根拠へ薄まる。
    参照コメント自体・テストの実装は変更しないため参照は引き続き成立するが、
    根拠の強さが変わった点を記録する。
  - 旧「開発ワークフロー」節（3 つの MUST: spec-kit フルワークフロー
    `constitution → specify → plan → tasks → implement` の順守／仕様・計画・タスクの
    成果物を `specs/` 配下に保存／コミットメッセージ・ブランチ命名を Conventional
    Commits に従わせる） — 節ごと撤廃。理由: `docs/adr/0002` の三層構造では「今日どう書くか」の
    手順はガイドの領分であり、憲法（めったに変えない原則の宣言）に手順を書くのは層の
    混同にあたるため。移送先: 後続 PR で新設するガイド群（`docs/guides/`）。
    Conventional Commits の規約は開発手順ガイドへ再収載予定。spec-kit ワークフロー
    順守・成果物の `specs/` 配下保存も同様にガイドで扱う。
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check は
    `[Gates determined based on constitution file]` の動的参照のみで、
    旧憲法の条項名・原則名への静的参照は無し。変更不要（確認済み）。
  - ✅ .specify/templates/spec-template.md — 憲法への直接参照なし、変更不要。
  - ✅ .specify/templates/tasks-template.md — 憲法への直接参照なし、変更不要。
  - ✅ AGENTS.md — 憲法の見出しを転記した薄い複製を持つ（`docs/adr/0002` 決定 5）。
    本改版に合わせて見出し同期済み（原則 I〜X の 10 本一致。#68 Task 4 で対応）。
- Preserved references（コード内から憲法の原則を名指しするコメント。本改版で意味を
  変更しないことを確認した。**件数は書かない。**

  もとの本文は「コード内「憲法原則 N」参照 **7 箇所**」と書いていた。#165 の作業中に
  実測したところ、**腐っていたのは数ではなく数える鍵のほうだった**:

  - **逐語の綴り「憲法原則」（空白なし）で数える限り、7 は #165 の直前まで正しかった**
    （2026-08-17 に base `705a9b6` で計測して 7 件）。
  - #165 でルーム保管が `adapters/in-memory-room-store.ts` と `ports/room-store.ts` へ
    分かれた際、綴りが「憲法 原則 III」（空白あり）になり、**逐語の鍵では原則 III の
    参照が 1 件も引けなくなった**（同じ鍵での計測は 7 → 6）。数を直しても直らない壊れ方である。
  - 綴りを問わず原則を名指しするコメントまで数えると、**#165 以前から一覧に無いものが
    既にあった**（`apps/timer-sync/src/server.ts` / `packages/rate-limit/src/client-key.ts` /
    `packages/rate-limit/src/token-bucket.ts` / `apps/timer-sync/src/application/log/ref-encoder.ts`
    ほか）。この読み方では 7 は最初から実物と合っていない。

  どちらの読み方でも「7」は維持できないので、数え上げそのものをやめた。
  **現在の所在は `grep -rn '憲法' --include='*.ts' --include='*.tsx' .` で引く。**
  名指しの書き方は `憲法原則 IV` `憲法 原則 III` `憲法 VI` など揺れているので、
  「憲法」だけを鍵に引くこと。原則を指さない参照（`憲法 追加制約` 等）も混ざるため、
  引いた結果は上位集合であり、原則への参照かどうかは目で選り分ける。以下は本改版の
  時点で意味の保存を確認した参照であり、その後に足されたものまで含む網羅一覧ではない）:
  - III（揮発インメモリ）: `apps/poker-sync/src/adapters/in-memory-room-store.ts`
  - IV（境界の型安全）: `apps/poker-sync/src/adapters/ws-adapter.ts` /
    `apps/poker-web/src/hooks/useSync.ts` /
    `apps/poker-sync/tests/protocol-errors.test.ts` /
    `packages/poker-core/src/protocol.ts` / `packages/poker-core/src/round.ts` /
    `packages/poker-core/src/room.ts`
- Follow-up TODOs:
  - `packages/timer-core/src/problem.ts:70` の `Date.now()` は VI（依存は内向き）の
    既知の逸脱（ドメイン内で時刻という副作用に直接依存している）。適用段階（#72）で
    アダプタへ注入する形に直す。
-->

# Tasuki Constitution

## 前文

Tasuki は二本柱で成り立つプロジェクトである。

1. **実用ツール集** — timer・poker をはじめ、チームの実務で実際に使われる
   ツール群を提供する。
2. **AI 駆動開発の実践場** — MCP・spec-kit・複数 AI エージェントを用いた
   開発プロセス自体を試し、育てる場である。

本憲法は、この二本柱の両方に共通して適用される原則を定める。個別ツール固有の
設計判断は ADR（`docs/adr/` および `docs/<app>/adr/`）に、日々の実装手順は
ガイド（`docs/guides/`）に記す（三層構造。`docs/adr/0002`）。

## Core Principles

### I. テスト駆動開発（NON-NEGOTIABLE）

TDD は必須である。Red-Green-Refactor サイクルを厳守すること:
テストを書く → テストが失敗することを確認する → 実装する → テストが通る →
リファクタリングする。

- すべてのパッケージ・アプリはこのサイクルに従って実装する（MUST）
- テストより先に実装コードを書いてはならない（MUST NOT）
- テストが失敗する状態でタスクを完了扱いにしてはならない（MUST NOT）

### II. 技術選定は ADR を通す

現行スタック（TypeScript / React / Bun / pnpm / turbo / Vite / Valibot /
neverthrow）を基本とする。

- 上記スタックの範囲内での実装は自由に行ってよい（MAY）
- 新しい技術・ライブラリの追加、既存スタックからの変更は、ADR に記録した
  上で行う（MUST）
- ADR による記録なしに技術選定を変更してはならない（MUST NOT）

### III. 揮発インメモリと単純運用

同期サーバーが保持する共有状態は永続化を持たない。再起動やデプロイでルーム等の
共有状態が消える前提で設計する。

- 同期サーバーが保持する共有状態はすべて揮発インメモリで保持する（MUST）
- サーバー側にデータベース・永続ストレージを導入してはならない（MUST NOT）
- デプロイは一連の変更をまとめて 1 回で行い、単純な運用を保つ（MUST）
- クライアント側のローカル保存（設定・完成記録などの履歴）はこの限りではない。
  対象はあくまで同期サーバーが持つ共有状態である

### IV. 境界の型安全

外部入力は境界で検証し、ドメイン操作は型で失敗を表現する。

- 外部からの入力（WebSocket メッセージ等）は Valibot によるスキーマ検証を
  境界で必ず行う（MUST）
- ドメイン操作の失敗は neverthrow の `Result` 型で表現する（MUST）
- ドメイン層で例外を制御フローとして使用してはならない（MUST NOT）
- 契約による設計（DbC）は「事前条件 = 境界検証・不変条件 = 型」で表す

### V. 実画面検証

テストが緑であること・型検査が通ることだけをもって「完了」と言わない。

- 利用者が実際に通る経路（実画面・実プロトコル）で動作を確かめる（MUST）
- ユニットテストはレイアウト崩れ・アセットパス・実配信環境の問題を検出
  できないことを前提に、それらは実経路の確認で補う（MUST）

### VI. 依存は内向き

ドメインは外界に依存しない。

- ドメイン（`packages/*-core`）は純粋関数・純粋なデータ構造のみで構成する
  （MUST）
- I/O・時計・乱数などの副作用はアダプタとして境界に置き、ドメインへは注入
  する（MUST）
- 同期サーバーはポート/アダプタ構成を標準とする

### VII. 検査は壊して確かめる

検査そのものの健全性を検査する。

- 新しい検査を追加したら、対象を意図的に壊して赤になることを確認する
  （MUST）
- 既存の実装を書き換えたときは、既存テストが恒真化（何を壊しても通る状態）
  していないかを変異検査で確かめる（MUST）
- 検査の健全性には**走査対象の健全性**を含む。対象を失った検査・対象を
  最初から見ていない検査は、赤にならないまま何も検証しない（docs/adr/0014）

### VIII. 記録が正本

決定・要求・教訓はそれぞれの正本に記録する。

- 設計判断は ADR に、要求は Issue（EARS 記法）に、教訓は振り返りに記録する
  （MUST）
- 同じ内容の正本は 1 つに保つ（SOT: Single Source of Truth）。二重正本を
  作らない（MUST NOT）
- 契約（プロトコル・スキーマ等）には単一の情報源を宣言する（MUST）

### IX. 小さく回す

変更は小さく、確実に積む。

- 1 PR は 1 つの論理的変更に留める（MUST。粒度の判断基準は
  `docs/guides/pr-granularity.md` を正本とする）
- Definition of Done（DoD）を満たしてからマージする（MUST）
- デプロイは一連の作業がすべて完了した後に、まとめて 1 回で行う（MUST）

### X. 抽象は実需で

早すぎる抽象化を避ける。

- 利用者（呼び出し箇所）が 1 つしか無いものを抽出しない（MUST NOT）
- 20 行未満の重複は抽出しない
- 抽象化・パターンの導入は、変更容易性の実需（現に変更が困難になっている
  事実）があるときにのみ採用する

### XI. 秘密と個人情報を持ち込まない

預かる値は分類したうえで、必要な場所にだけ置く。

- サーバーが保持する分類「秘密」の値（漏れると運営者の資産・アカウントが侵害される
  トークン・鍵。管理トークンや AI 解錠キーがこれにあたる）は環境変数のみに置く
  （MUST）。**利用者が決めるルームの合言葉（パスフレーズ）は本項の対象ではない**
  — あれは分類「資格情報」であり、扱いは `docs/adr/0011` のデータ分類に従う
- 秘密・資格情報・個人に紐づく情報をログへ出してはならない（MUST NOT）
- ログ出力の経路は 1 本に集約し、規範が守られていることを機械的に検査する
  （MUST）
- 個人を識別しうる値を、目的に必要な期間を超えて保持してはならない（MUST NOT）
- 新しい入力・保持・出力を足すときは、`docs/adr/0011` のデータ分類のどれに
  当たるかを決めてから実装する（MUST）

## Governance

- 本憲法は本プロジェクトにおける他のすべてのプラクティス・ガイドラインに優先する
- **改版手続き**: 改版は ADR を伴う（原則の変更・削除・追加の理由と背景を ADR に
  記録する）。改版時は Sync Impact Report に変更内容を記録した上で、
  **AGENTS.md の憲法見出しの同期**を確認する（MUST）（`docs/adr/0002` 決定 5）
- **バージョニング**: セマンティックバージョニングに従う —
  MAJOR: 原則の削除・後方互換性のない再定義 /
  MINOR: 原則・セクションの追加または実質的な拡張 /
  PATCH: 文言修正・明確化
- **コンプライアンスレビュー**: すべての plan は Constitution Check ゲートを
  通過しなければならない。原則からの逸脱は Complexity Tracking での
  正当化なしに認めない

**Version**: 2.1.4 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-08-16
