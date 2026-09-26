# ADR-0021: お題を 4 つ目の文脈にし、ルームの全接続へ同じフレームで配る

- **ステータス**: Accepted（2026-09-25）
- **関連**: [#91](https://github.com/tomohiroJin/tasuki-tools/issues/91) /
  [設計正本](../superpowers/specs/2026-09-23-shared-topic-design.md)（§4 の T1〜T13・§10） /
  [`docs/adr/0016`](./0016-core-domain-representation.md)（ドメインの表現は選択制。決定 1 の記録先） /
  [`docs/adr/0017`](./0017-bounded-contexts-and-packages.md)（文脈の分割） /
  [`docs/adr/0007`](./0007-abstraction-criteria.md)（抽象の導入基準） /
  [`docs/adr/0012`](./0012-logging-secrets-and-disclosure.md)（D10） /
  [`docs/timer/adr/0005`](../timer/adr/0005-secret-zero-byok-problem.md)・
  [`docs/timer/adr/0008`](../timer/adr/0008-server-resident-ai-generation.md)（timer のお題の生成）

## 背景

お題は TDD Mob Pro Timer の中にしかなかった。timer の状態（`packages/timer-core` の `Problem`・
snapshot の `problem`）として持ち、作る手段（手入力・AI 生成・定型バンク）と解錠も timer の wire に載っていた。
利用者は、同じお題を poker やファシリテーター・ルーレットからも見られるようにし、
**それぞれは絡み合いつつ直接は関係を持たない**形を求めた（設計正本 §1）。

timer のお題の実装には、使われていない経路も残っていた。クライアントへ生成を委ねる経路
（代表・`hasAiKey`・`need-problem`・`problem.submit`）は、実クライアントが常に `hasAiKey: false` を
送るため一度も通らない（設計正本 §2）。

本文の Markdown の解析は、timer-web と topic-web（#91 PR 2）に同じ実装の写しが 2 つあった。
行区切り U+2028 / U+2029 で解析が返らなくなる不具合は、その 2 つを別々に直している
（コミット `de7608e`・変異 m94 / m95）。PR 3 で poker が 3 つ目の使い手になった。

実測と経緯の正本は設計正本に置く。ここには決定だけを書く。

## 決定

### 決定 1: お題は 4 つ目の文脈 `packages/topic-core` で、ルームの持ち物である

お題はルームごとに高々 1 つで、既定では持たない。**ツールのドメイン（`timer-core`・`poker-core`）は
`topic-core` に依存しない（MUST NOT）**。文脈をつなぐのはアプリ層である（`docs/adr/0017` 決定 2）。
依存の向きの正本は `scripts/audit-dependency-direction.mjs` の許可表 `ALLOWED` とする。

### 決定 2: お題の状態は、変わるたびにルームの全接続へ同じ `topic` フレームで配る

宛先はツールを問わない（お題・ハブ・timer・poker）。参加・復帰した接続にはその場で 1 通送る。
**各ツールのスナップショットへは埋め込まない（MUST NOT）。** 受け手（各 web アプリの同期の層）は、
**ツール固有のスキーマより先に** `topic-core` の `TopicFrameSchema` で `topic` フレームを見分ける（MUST）。
先に見分けないと、timer・poker は契約に合わないフレームとして捨て、「同期できていません」を出す（#209・#212）。

### 決定 3: お題を変えられるのはお題ツールの接続だけである

玄関・timer・poker は表示専用である。**拒否は接続の種類ごとのスキーマの振り分けで行う**
（`apps/tasuki-sync/src/adapters/ws-adapter.ts`）。お題のコマンドはハブ・timer・poker の接続が使う
スキーマに存在せず、届いても境界で不正なメッセージとして弾かれる。
**共通の処理（`handlers.ts`）にツール別の可否判定を戻さない（MUST NOT）**
（ツールごとの門 `tool-gate.ts` は #95 S5b で撤去している）。

### 決定 4: お題は timer のセッションをまたいで残る

下ろすのはお題ツールの操作だけである。#273 の「完了からロビーへ戻るとき、前のセッションのお題を
持ち越さない」は廃止した。お題はルームの持ち物で、timer の一区切りに縛られない。

### 決定 5: `topic-core` の表現は直接遷移関数 ＋ `Result` を採る

`docs/adr/0016` 決定 1 が MUST とする「どちらを採ったかと理由の記録」がこれである。
状態は 1 つのお題と生成の帳簿（生成中・定型へ落ちたか・AI 解錠）だけで、
イベントの履歴・再生・段階適用の要求が無い。Decider を採る根拠が無い（`docs/adr/0007` 基準 3）。

### 決定 6: 完成記録は、アプリ層が値として写したお題のタイトルだけを持つ

timer の完成記録（`CompletionRecord.topicTitle: string | null`）は、**お題の有無にかかわらず毎回作る**。
お題があれば、同期サーバーのアプリ層が完了の時点でお題の保管からタイトルを引き、
`session.complete` へ**文字列として**渡す。本文は写さない。これで `timer-core` は `topic-core` を知らずに済む（決定 1）。

### 決定 7: お題の本文の Markdown は `@tasuki/markdown` が解析し、描画は各アプリが持つ

`packages/markdown` は依存 0 の純粋な関数（ブロックと行内要素の木を返す解析と、リンク先の許可 `safeHref`）で、
React を知らない。描画は各アプリ（timer-web・poker-web・topic-web の `Markdown.tsx`）が持つ。

理由は 3 つある。

1. **写しが 2 つあり、同じ不具合を 2 箇所で別々に直した**（U+2028 / U+2029）。直し忘れの危険は写しの数だけ増える
2. **3 つ目の使い手（poker）が現れた。** `docs/adr/0007` の実需を満たす
3. **描画は各アプリの見た目の規約が違う**（見出しの段・クラス名・地の色）。共有すると、どれか 1 つの規約へ寄せることになる

## 却下した案

| 案 | 退けた理由 |
|---|---|
| 各ツールのスナップショットへお題を埋め込む | ツールの wire がお題に依存する。ツールを足すたびに埋め込みが増え、決定 1 の「直接は関係を持たない」が崩れる |
| 表示側がお題のために 2 本目の接続を張る | ルームの接続数が倍になる。同時接続の枠（`MAX_CONNECTIONS`）を食い、在席の数え方も複雑になる |
| Markdown の描画まで共有する（`packages/ui` などへ置く） | `packages/ui` は CSS と書体だけのパッケージで、TS のビルドも型検査も持たない（設計正本 T13）。数行の部品のために React の基盤を持ち込むことになる。描画の規約は各アプリで違う（決定 7 の理由 3） |

## 影響

- `packages/topic-core`・`packages/markdown`・`apps/topic-web` が増え、依存方向の許可表にそれぞれの欄がある
- timer から、お題の作成（編集・生成・解錠・ロビーでの自動用意・お題機能の切り替え）と、クライアントへ生成を委ねる経路が消えた。
  timer と poker はお題を読んで表示するだけになった
- AI 生成は同期サーバーのお題の文脈（`application/topic-generation.ts`・`adapters/claude-cli-topic-provider.ts`）へ移った。
  `docs/adr/0012` D10 の実装もここにある
- 旧 wire との互換は切った。配布中に新旧が混ざる窓が 3 つあり、再読込で閉じる
  （設計正本 §6。手順は `deploy/topic/NOTES.md` と `deploy/timer/NOTES.md`）
- 実装時に設計正本から外したことは設計正本 §10.1（PR 2）・§10.2（PR 3）に記録した。**本 ADR に転記しない**
