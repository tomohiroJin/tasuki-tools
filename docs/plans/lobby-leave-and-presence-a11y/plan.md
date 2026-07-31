# 実装計画: ロビーの自己退出導線 ＋ ロビー在席状態の sr-only テキスト
**入力:** spec.md ・ **ステータス:** Draft

## 技術コンテキストと意思決定

| 意思決定 | 選択 | 根拠 | 紐づく要件 |
|---|---|---|---|
| #37 不変条件判定 | `@tdd-mob/core` の `canRemoveParticipant(participants, targetParticipantId)` を Lobby.tsx から呼ぶ | Session.tsx の `SelfDriverToggle` 呼び出し箇所が既に同じ関数で `canLeaveRoom` を算出しており（420行目）、同じ不変条件を2箇所目で再実装すると「押せるのに拒否される」ズレが再発する（FR-080 相当のリスク） | FR-002 |
| #37 UI 実装単位 | 参加者行内に `GhostButton` を直接1つ追加（新規コンポーネント化しない） | Session.tsx の Room タブに同型のインライン実装が既にあり、1回しか使わない導線をコンポーネント化すると「実装が一致していない部品の統合」を招く（roster-row-unification の教訓） | FR-001, FR-004 |
| #37 確認ダイアログ | 課さない | spec.md FR-004（FR-079 の既存判断を踏襲） | FR-004 |
| #42 sr-only の置き場所 | `Lobby.tsx` の呼び出し側（`PresenceDot` の隣）に直接 `<span className="sr-only">` を置く | `RosterPanel.tsx` と同じパターンに揃える。`PresenceDot` に含めると「あえて出さない」選択肢を両画面から奪う。`PresenceDot` は変更しない（FR-007） | FR-006, FR-007 |
| #42 aria-live | 追加しない（現状維持） | Issue #42 の懸念（在席変化のたびに読み上げが割り込む）は、そもそも `aria-live` を新設しなければ発生しない。`RosterPanel.tsx` も参加者一覧の `<ul>` に `aria-live` を持たない（現状の実装踏襲） | FR-008 |

## 規約チェック（Constitution Check）

| 原則 | ステータス | 備考 |
|---|---|---|
| DRY | PASS | #37 は既存の `@tdd-mob/core` 不変条件関数を再利用。#42 は既存の `presenceLabel()` を再利用。新規ロジックの追加なし |
| SOLID（単一責任） | PASS | `PresenceDot` の責務（ドット描画のみ）を変更しない。ボタンは行コンポーネント内の1操作として既存の他ボタンと同じ粒度 |
| DbC（契約による設計） | PASS | 「ルームから抜ける」ボタンの有効/無効は `canRemoveParticipant` の戻り値と1対1で対応させる（事前条件を UI 側で先読みして disabled にする） |
| YAGNI | PASS | ロビー用の新規コンポーネント（`LobbySelfLeaveButton` 等）は作らない。1箇所にしか出現しないため関数抽出のみで十分 |
| SoT（信頼できる唯一の情報源） | PASS | 不変条件の正本は `@tdd-mob/core`、在席ラベルの正本は `presence.ts`。両方とも「呼ぶだけ」で新設しない |
| 担当領域の遵守 | PASS | `App.tsx` / `apps/sync/**` / `presence.ts` / `PresenceDot.tsx` は変更しない（spec.md スコープ外に明記） |

（違反なし。全 PASS）

## アーキテクチャ

変更は `Lobby.tsx` 内の参加者行レンダリング（`room.participants.map(...)`）に閉じる。
新規コンポーネントは作らない。

```
Lobby.tsx
  └ 参加者行 <li> (既存)
       ├ <PresenceDot presence={p.presence} />           ← 変更なし
       ├ <span className="sr-only">{presenceLabel(p.presence)}</span>  ← #42 で新規追加
       ├ 名前ラベル (既存)
       ├ ドライバー/見学バッジ (既存)
       ├ 操作エリア <span className="ml-auto ...">
       │    ├ isMe の場合:
       │    │    ├ 列から外れる / ドライバーに加わる (既存)
       │    │    └ ルームから抜ける (GhostButton, disabled=!canLeaveRoom)  ← #37 で新規追加
       │    └ !isMe && isHost の場合: 既存の各操作（変更なし）
```

## コンポーネントとインターフェース

- `Lobby.tsx`
  - 追加 import: `canRemoveParticipant`（`@tdd-mob/core`。ローカルの
    `participant-label.ts` の同名関数と衝突するため
    `import { canRemoveParticipant as canLeaveRoomInvariant } from "@tdd-mob/core";` の形で
    別名 import する）、`presenceLabel`（`./presence.js`、既存 import 済みか確認し
    無ければ追加）。
  - 参加者行内、`isMe` ブロックの中に `GhostButton` を1つ追加。
    `onClick={() => onRemoveParticipant?.(p.participantId)}`、
    `disabled={!canLeaveRoomInvariant(room.participants, p.participantId)}`、
    `title` は spec.md 前提2の文言。`onRemoveParticipant` が未指定なら描画しない
    （既存の他ボタンと同じ「ハンドラが無ければ導線を出さない」規約に合わせる）。
  - 参加者行内、`PresenceDot` の直後に
    `<span className="sr-only">{presenceLabel(p.presence)}</span>` を追加。
- 変更しないファイル: `presence.ts`、`PresenceDot.tsx`、`participant-label.ts`、
  `RosterPanel.tsx`、`App.tsx`、`apps/sync/**`。

## データモデル

変更なし。既存の `Room` / `Participant`（`@tdd-mob/core`）をそのまま使用する。

## API / インターフェース契約

新規 API なし。既存の `onRemoveParticipant?: (participantId: string) => void` を
自分の `participantId` で呼ぶだけ（サーバー側の `participant.remove` ハンドラは
既に自己対象を許可済み・変更不要）。

## プロジェクト構成

```
apps/web/src/ui/Lobby.tsx                 変更（#37, #42）
apps/web/test/ui/Lobby.test.tsx           変更・追加（#37, #42 のテストケース）
docs/plans/lobby-leave-and-presence-a11y/ 新規（本 spec/plan/tasks）
```

## エラー処理とセキュリティ

- サーバー側の権限判定・不変条件判定は既存のまま（`apps/sync/**` 変更なし）。
  UI 側の `disabled` はあくまで「押せるボタンを出しておいて後から拒否する」
  ユーザー体験を避けるための先読みであり、サーバー側の最終判定を置き換えるものではない。
- 新規の入力受付・外部通信は発生しないため、追加のセキュリティレビュー観点はない。

## テスト戦略

- 単体テスト（`apps/web/test/ui/Lobby.test.tsx`、jsdom + Testing Library 想定）:
  - #37: 自分の行に「ルームから抜ける」ボタンが表示される。
  - #37: クリックで確認ダイアログを経由せず即座に `onRemoveParticipant(自分のID)` が
    呼ばれる。
  - #37: 在室する編集者以上が自分1名のみのとき、ボタンが disabled になり、
    disabled 理由が `title` に出る。
  - #37: 他に編集者がいる場合は enabled のまま。
  - #37: ホストが他参加者を退出させる既存のボタン・確認ダイアログの挙動が変わらない
    （既存テストの回帰確認）。
  - #42: 各行に `presenceLabel()` に対応する `sr-only` テキストが存在する
    （`online`/`idle`/`offline` の3状態）。
  - #42: `<ul>` に新規 `aria-live` 属性が追加されていないことを確認（回帰ガード）。
- 影響範囲確認: `PresenceDot` を変更しないため `RosterPanel.test.tsx` /
  `PresenceDot.test.tsx` は実行するが変更は想定しない（回帰なしの確認のみ）。

## 段階分け（Sequencing）

1. #37: Red（失敗するテスト）→ Green（ボタン実装）→ Refactor。
2. #42: Red（失敗するテスト）→ Green（sr-only 追加）→ Refactor。
3. 各段階で `pnpm --filter @tdd-mob/web test -- src/ui/Lobby.test.tsx`（または対応する
   テストファイルパス）を実行し、通過を確認してからコミット。
4. #37 と #42 は依存関係が無いため、どちらを先にやってもよい。ただしコミットは
   Issue ごとに分ける（同一ファイルの diff が混ざらないよう、変更点を論理的に分離してから
   `git add` する）。

## 未解決の論点

なし。
