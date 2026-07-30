# ベースライン — Lobby / RosterPanel の実測差分（Issue #28 C-4）

**測定日:** 2026-07-31 ・ **ブランチ:** `refactor/roster-row-unify` ・ **対象:**
`tdd-mob-pro-timer/apps/web/src/ui/Lobby.tsx`（430行）・
`tdd-mob-pro-timer/apps/web/src/ui/components/RosterPanel.tsx`（420行）

> 本ファイルは実装を読んだ結果の実測記録である。spec.md の要件・SC はここに書いた差分を根拠にする。
> **判定できなかった差分（意図的仕様か実装漏れか）には `[要確認]` を付ける（最大3個）。**

## 0. 前提として分かったこと（重要）

`participantLabel` / `canTransferHostTo` / `canRemoveParticipant` / `canReorderRotation` の
**判定規則そのものはすでに 1 箇所（`src/ui/participant-label.ts`）に統合済み**である。
同ファイルの JSDoc に「Issue #28・T067/T068・FR-107」という記載があり、PR #31（C-3 相当）で
判定ロジックの重複は解消済みと分かる。

**したがって C-4 で残っているのは「判定規則」の重複ではなく、その判定結果を使って
実際に行（`<li>`）を描画する JSX 実装そのものが 2 系統ある**、という点である。
`Lobby.tsx` 217〜341行目のインライン `<li>` と、`RosterPanel.tsx` 187〜348行目の
`renderRow()` が、同じ判定関数の戻り値を使いながら、別々のマークアップ・別々のボタン部品
（`RowIconButton` vs `MiniButton`）・別々の並び順ロジックで描画している。

> **2026-07-31 レビュー追記**: 行全体を単一コンポーネント（`variant` 分岐）にまとめる案は
> レビューで不採用となった。実測（本ファイル 2〜4節）を突き合わせると、実際に**実装まで
> 一致している**重複は「在席ドット」と「退出確認ダイアログの生成」の2箇所のみで、
> バッジ構成・ボタン部品（`RowIconButton`/`MiniButton`）は見た目・情報量とも別物である。
> 一本化の単位は「部品層」に改め、実装が一致する部品だけを共有コンポーネント化する
> （詳細は spec.md / plan.md）。

## 1. 使用箇所

| コンポーネント | 使用元 | 画面 | 主要な権限フラグ |
|---|---|---|---|
| `Lobby.tsx` の参加者一覧 | `App.tsx:585`（`mode === "lobby"`） | ロビー（セッション開始前） | `isHost` |
| `RosterPanel.tsx` | `Session.tsx:447`（セッションタブ）・`Session.tsx:532`（ルームタブ） | セッション画面（開始後） | `canManageOthers` |

`RosterPanel` 自体は `Session.tsx` 内で2回使われているが、**これは同一コンポーネントの再利用であり
C-4 が問題にする「二重実装」ではない**（props が違うだけ）。二重実装は Lobby と RosterPanel の間にある。

## 2. 表示する情報の差分

| 項目 | Lobby | RosterPanel | 差分の性質 |
|---|---|---|---|
| 名前ラベル（同名区別） | `participantLabel()` 経由 | `participantLabel()` 経由 | **一致**（規則は共有済み） |
| 在席ドット | `presenceDotClass()` | `presenceDotClass()` + `presenceLabel()` の `sr-only` テキスト | RosterPanel のみ sr-only テキストがある。**a11y の後退**であり意図的仕様変更ではないと判断（要件化） |
| ドライバー順バッジ | `ドライバーN` / `見学` の文字チップ | 番号のみの丸バッジ（見学には何も付かず、セクション見出し「見学」で表現） | 表現方法が違うだけで情報量は同値 |
| 役割バッジ | `主催者` のみ（host 限定） | `主催者`（host）・`観覧`（viewer） | **RosterPanel の方が情報が多い**（Lobby は viewer を明示しない） |
| 代理バッジ | 無し | `代理`（isPlaceholder） | Lobby は代理参加者の概念を可視化していない |
| 一時離脱バッジ | 無し | `離脱中`（driverEligible === false） | Lobby はセッション未開始のため driverEligible の概念自体が使われない場面 |
| 現ドライバー表示 | 無し（session 未開始のため「今」が無い） | `▶ 今` | 前提が異なる（Lobby には現ドライバー概念がない） |
| 一覧の構造 | フラットな `<ul>`（参加順） | ドライバー/見学の2セクションに分割し、ドライバーは現ドライバー起点の巡回順にソート | **表示順序が異なる**。Lobby は参加順、RosterPanel はターン順 |

## 3. 操作の差分（Issue 本文が名指しした4操作＋その他）

| 操作 | Lobby | RosterPanel | 判定 |
|---|---|---|---|
| ドライバー加入/離脱（自分） | ○ (`onJoinRotation`/`onLeaveRotation`) | ○（`SelfDriverToggle` 経由。行自体には出さない） | **一致**（実装場所が違うだけ） |
| ドライバー加入/離脱（他人・host） | ○ | ○（`onSkip`/`onResume` は「一時離脱」であり別概念。他人をrotationに入れる/外す操作は RosterPanel の行には無い） | **[要確認-1]** 下記参照 |
| ドライバー指名（現ドライバーに即指名） | **無し** | ○ (`onAssignDriver`) | **[要確認-1]** Issue 本文は「ドライバー指名」を Lobby/RosterPanel 共通の重複操作として書いているが、実装を読む限り Lobby にはこの操作自体が存在しない。重複ではなく**片方にしかない**。Issue の前提と実装が食い違う最重要点 |
| ドライバー順の並べ替え（上下） | ○ (`onMoveRotation`) | ○ (`onMove`) | **一致** |
| ホスト移譲 | ○ (`onTransferHost`) | ○ (`onTransferHost`) | **一致**（`canTransferHostTo` 共有） |
| 退出させる（外す） | ○ (`onRemoveParticipant`) | ○ (`onRemove`) | **一致**（`canRemoveParticipant` 共有・確認ダイアログも両方にある） |
| 役割切替（editor⇔viewer） | ○ (`onRoleSet`) | **無し** | **既知の仕様**（`test/ui/Lobby.role.test.tsx` の JSDoc に「開始前の担当」「開始前の権限範囲は変えない」と明記。host-spof-relaxation G6/D7 の設計判断であり実装漏れではない） |
| 改名 | **無し** | ○ (`onRename`) | **[要確認-2]** 開始前に改名できない理由がコード上に見当たらない。意図的仕様（開始後のみ改名可）か、単に実装されていないだけかを本仕様のレビューで確定する必要がある |
| 代理参加者の追加 | **無し** | ○ (`onAddProxy`) | **[要確認-3]** 代理（Web非接続の対面参加者）はロビーの時点で追加したい需要が自然にありそうだが、Lobby には導線が無い。意図的仕様か実装漏れかが不明 |

## 4. 判定（`[要確認]` は最大3件のルールに従い、上記3件に限定した）

- **[要確認-1]（最重要）**: Issue #28 本文 C-4 は「ドライバー加入/離脱・ドライバー指名・ホスト移譲・外す」を
  Lobby と RosterPanel の**共通の重複実装**として書いているが、実装を読む限り「ドライバー指名」
  （`onAssignDriver` ＝現ドライバーへの即時指名）は **RosterPanel にしか存在しない**。
  一本化の対象は「両方にある実装の重複を1つにする」ことであり、
  「片方にしかない操作をもう片方にも追加する」ことではない。
  **本作業ではドライバー指名を Lobby に新設しない**（新設は挙動追加であり別途の意思決定が要る）。
  spec.md の受け入れ基準はこの前提で書く。
- **[要確認-2]**: 改名（`onRename`）が Lobby に無い理由の記録が見当たらない。
- **[要確認-3]**: 代理参加者の追加（`onAddProxy`）が Lobby に無い理由の記録が見当たらない。

[要確認-2]・[要確認-3] はいずれも「無いものを一本化後にどちらへ寄せるか」という判断であり、
**本仕様は挙動を変えないリファクタリングである**ため、既定は「現状の可否をそのまま維持する」
（Lobby では引き続き改名・代理追加ができない）。これを変える場合は FR-115 と同型の
「挙動を変える変更として明示し、単独の変更単位に分離する」を要件に明記する。

> **2026-07-31 レビュー追記**: 在席の `sr-only` テキスト（本ファイル 38 行目の差分）についても
> 上記と同じ理由で「現状維持」を既定とする決定に改めた。spec.md の旧 FR-013（Lobby へ追加する）
> は撤回し、a11y 改善は本ブランチのスコープ外・別 Issue とする（spec.md「スコープ外 / 非目標」
> 節を参照）。理由: 本ブランチは「利用者に見える変更ゼロ」を中核制約とするため。

## 5. 現行ゲート値（作業開始時点）

| ゲート | 値 |
|---|---|
| `packages/core` テスト | 657 |
| `apps/sync` テスト | 347 |
| `apps/web` テスト | 534 |
| **計** | **1,538** |
| typecheck | 4/4 パッケージで成功 |
| lint | 3/3 パッケージで成功 |
| build | 3/3 パッケージで成功 |

**この 1,538 件を、作業完了後も下回らないこと**（減った場合は検証内容の削減とみなす）。

## 6. 既存テストの所在（タスク分割の参考）

| ファイル | 行数 | 対象 |
|---|---:|---|
| `test/ui/Lobby.rotation.test.tsx` | 331 | ドライバー加入/離脱・並べ替え |
| `test/ui/Lobby.host-transfer.test.tsx` | 75 | ホスト移譲 |
| `test/ui/Lobby.role.test.tsx` | 129 | 役割切替（editor/viewer） |
| `test/ui/Lobby.invite.test.tsx` | 126 | 招待（本件対象外） |
| `test/ui/Lobby.problem-gate.test.tsx` | 81 | お題ゲート（本件対象外） |
| `test/ui/Lobby.empty.test.tsx` | 73 | 空状態（本件対象外） |
| `test/ui/RosterPanel.test.tsx` | 986 | RosterPanel 全操作 |
| `test/ui/Session.roster.test.tsx` | 242 | Session 経由の RosterPanel 結合 |
