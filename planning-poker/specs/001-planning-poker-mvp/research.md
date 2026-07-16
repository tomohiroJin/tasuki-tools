# Research: プランニングポーカー MVP

**Date**: 2026-07-16 | **Plan**: [plan.md](./plan.md)

Technical Context に NEEDS CLARIFICATION はない（技術スタックは憲法で固定済み）。
本書では実装方式レベルの未確定事項を Decision / Rationale / Alternatives 形式で確定する。

## R1. 状態同期モデル: 秘匿込みスナップショット配信

- **Decision**: サーバーが「受信者ごとに秘匿処理した部屋状態スナップショット」を毎回全量配信する。
  投票受付中は他者の票を `hasVoted: boolean` に落とし、選択値は本人宛のスナップショットにのみ含める。
  公開後は全票を含める。差分（パッチ）配信は行わない。
- **Rationale**: SC-004（公開前の票は通信内容にも露出しない）をサーバー側の投影
  （プロジェクション）で構造的に保証できる。クライアントは受信スナップショットで
  画面を丸ごと置き換えるだけになり、順序・差分適用のバグが原理的に消える。
  1 ルーム 20 人・状態も小さいため全量配信のコストは無視できる。
- **Alternatives considered**:
  - 差分イベント配信 — 帯域は減るがクライアントに状態機械の複製が必要になり、
    公開前の票の秘匿漏れリスク（イベントに生値が乗る）が増えるため不採用。
  - クライアント側で票を隠す — 通信内容に生値が乗り SC-004 に違反するため不採用。

## R2. Bun WebSocket サーバー構成: Bun.serve + トピック pub/sub

- **Decision**: `Bun.serve` の WebSocket ハンドラを使い、ルーム ID をトピックとした
  `ws.subscribe(roomId)` / `server.publish(roomId, ...)` で配信する。ただし R1 の
  受信者別秘匿スナップショットが必要な場面（投票受付中）は、ルーム内の各接続へ
  個別 `ws.send` する。HTTP エンドポイントは持たない（ルーム作成も WS メッセージで行う）。
- **Rationale**: Bun 組み込みの pub/sub はルーム単位のブロードキャストに十分で、
  追加依存ゼロ（憲法原則 II）。ルーム作成を WS に寄せることで API 面が単一プロトコルに
  統一され、契約テストが1系統で済む。
- **Alternatives considered**:
  - HTTP（ルーム作成）+ WS（同期）の併用 — 面が2つになり契約・テストが分散するため不採用。
  - Socket.IO 等のライブラリ — 追加依存であり憲法原則 II に反するため不採用。

## R3. 参加者トークンの保存: localStorage にルーム ID 別で保存

- **Decision**: 参加成功時にサーバーが発行する `participantToken`（`crypto.randomUUID()`）を
  クライアントが `localStorage` にキー `poker:participant:<roomId>` で保存する。
  再接続時はこのトークンを join メッセージに添えて送り、一致すれば同一参加者として復帰する。
- **Rationale**: 仕様の Clarification（同じブラウザからの再接続で投票状態ごと復帰）を
  満たす最小構成。ルーム ID 別に保存することで複数ルームの掛け持ちにも耐える。
  ルームは揮発なので古いトークンが溜まっても実害はない（参加失敗時に削除する）。
- **Alternatives considered**:
  - sessionStorage — タブを閉じただけで復帰不能になり、モバイルのタブ再生成に弱いため不採用。
  - Cookie — WS ハンドシェイクでの取り回しが煩雑で利点がないため不採用。

## R4. ID 生成: crypto.randomUUID()（ルーム ID は短縮形）

- **Decision**: 参加者 ID・トークンは `crypto.randomUUID()`。ルーム ID は UUID から
  英数字のみを取り出した先頭 8 文字（衝突時は再生成）とし、招待リンクは
  `/poker/room/<roomId>` 形式とする。
- **Rationale**: Bun・ブラウザ双方の標準 API で追加依存ゼロ。ルーム ID を短くするのは
  URL の手動共有・読み上げに耐えるための UX 上の判断。同時数十ルーム規模では
  8 文字（約 2.8×10^12 通り）で衝突は実質無視でき、レジストリ照合で再生成もする。
- **Alternatives considered**:
  - nanoid — 定番だが追加依存になるため不採用（憲法原則 II）。
  - 連番 ID — 推測可能で他人のルームに入れてしまうため不採用。

## R5. サブパス /poker/ 配信と WS URL

- **Decision**: Vite の `base: '/poker/'` を設定し、ルーティングは React Router を使わず
  自前の軽量ルーティング（`location.pathname` の `/poker/` 以下をパース + History API）で
  トップ／ルームの2画面を切り替える。WS 接続先は `wss://<host>/poker/ws`（開発時は
  Vite の proxy で `ws://localhost:<syncPort>` へ転送、本番は Caddy がリバースプロキシ）。
- **Rationale**: 画面遷移が実質2状態しかないため Router 導入は過剰（追加依存の回避、
  憲法原則 II)。WS を同一オリジンのサブパスに寄せることで CORS・証明書の問題を回避し、
  開発と本番の差を proxy 設定だけに閉じ込められる。
- **Alternatives considered**:
  - React Router — 2画面には過剰な追加依存のため不採用。
  - WS を別ポート直結（本番） — 混在コンテンツ・FW の問題を招くため Caddy 経由に統一。

## R6. ホスト繰上の判定: 参加順（joinedAt 昇順）の先頭

- **Decision**: 参加者に参加順序（単調増加の連番）を持たせ、ホスト切断時は接続中の
  参加者のうち参加順が最も早い者へ権限を移す。判定はドメイン層（core）の純関数で行う。
- **Rationale**: 仕様 FR-012（最先着への繰上）そのまま。壁時計ではなく単調連番を
  使うことで同時参加でも順序が一意に定まり、テストが決定的になる。
- **Alternatives considered**:
  - タイムスタンプ比較 — 同時参加で衝突し非決定的になるため不採用。

## R7. テスト戦略: core は純粋単体、sync はインプロセス結合

- **Decision**: `packages/core` は Vitest で純粋関数・状態機械の単体テスト（TDD の主戦場）。
  `apps/sync` は **`bun run` でサーバーをサブプロセス起動**（ポート 0 で空きポートを取得し、
  起動完了と実ポートを標準出力の1行 JSON で通知）し、Vitest から実 WebSocket クライアントで
  「join → vote → reveal → next round」等のプロトコルシナリオを検証する結合テストとする。
  テストヘルパがサブプロセスの起動待ち・終了（teardown での kill）を担う。
  web のロジック（hooks・ルーティング関数）は Vitest 単体テストを書き、画面の見た目は
  憲法原則 V に従い実画面目視で検証する（quickstart.md にシナリオを定義）。
- **Rationale**: `Bun.serve` は Bun ランタイム専用 API であり、Node 上で動く Vitest プロセス内
  ではインプロセス起動できない。サブプロセス方式なら本番同一のランタイム（Bun）でサーバーを
  動かしつつ、テストランナーは憲法で固定された Vitest のままにできる。起動は百 ms オーダーで
  suite 単位で使い回せば Red-Green-Refactor の回転速度も保てる。
- **Alternatives considered（起動方式）**:
  - Vitest からのインプロセス起動 — `Bun.serve` が Node ランタイムで動作せず実行不能のため不採用。
  - `bun test` への乗り換え — テストフレームワークが二重化し憲法原則 II（Vitest 固定）に反するため不採用。
- **Alternatives considered**:
  - E2E ブラウザ自動テスト（Playwright 等）の必須化 — MVP では過剰。実画面検証は
    憲法原則 V の目視で担保し、自動 E2E は将来の拡張とする。

## R8. モノレポ構成: pnpm workspace + turbo タスクパイプライン

- **Decision**: `pnpm-workspace.yaml` で `packages/*` と `apps/*` を登録。`turbo.json` で
  `build` / `test` / `typecheck` を定義し、`core → web/sync` の依存順ビルドを
  turbo に任せる。リンター（ESLint/Biome 等）は固定スタック外の追加依存となるため導入しない
  （品質は strict TypeScript + typecheck + テストで担保）。web/sync からは `@planning-poker/core` を workspace プロトコルで参照する。
- **Rationale**: 憲法で固定されたツールチェーンの標準的な使い方であり、
  tdd-mob-pro-timer の実績構成のミラーでもある。
- **Alternatives considered**: なし（憲法で固定済み）。
