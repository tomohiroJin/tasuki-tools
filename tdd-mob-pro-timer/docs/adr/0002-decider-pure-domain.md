# ADR-0002: Decider パターンと純粋ドメイン

- **ステータス**: Accepted
- **関連要件**: FR-008（不変条件）, SC-010, FR-001〜FR-010

## 背景

セッション状態（ローテーション・現ドライバー・一時停止・担当回数・タイマー）は、交代・追加/削除・
一時停止・再開・リセットなど多くの操作で変化します。状態遷移が手続き的に散らばると、不変条件
（「ローテーション人数と担当回数配列の長さが一致」「現ドライバー指標が有効範囲内」）が壊れやすく、
テストも困難になります。

## 決定

状態遷移を **Decider パターン**（`decide` / `evolve`）に分離し、ドメインを純粋関数で構成します。

- `decide(cmd, agg, now): Result<DomainEvent[], DomainError>` — コマンドを検証して
  発生すべきイベントを返す。副作用なし。例外を投げず `Result` で表現。
- `evolve(agg, event, now): Aggregate` — イベントを適用して次状態を返す全域関数。
- 時刻は引数 `now` として注入し、`Date.now()` をドメイン内で呼ばない。

## 影響

- **利点**: `now` を引数化したことで時刻依存遷移を決定論的にテストでき、fast-check による
  プロパティテストで「任意操作列でも不変条件が保たれる」ことを検証できる（SC-010）。
  サーバーとソロが同じ `decide`/`evolve` を呼ぶため挙動が一致する。
- **代償**: 「コマンド→イベント→状態」の二段構えにより記述量が増える。ルームレベルの状態
  （phase・problem・participants）は集約（session+clock）の外側にあるため、`apps/sync` の
  `applyRoomLevelEvent` がイベントをルームへ反映する役割を担う（集約 evolve とルーム適用の二層）。
- 完成記録の ID 生成のみ単調増加カウンタを用いるため厳密には純粋でないが、ドメインの状態遷移
  ロジックからは分離している。

## 更新

**対応:** Issue #26 / #28 の B-2（`refactor/handlers-single-pipeline` ブランチ）

### 破れていた点

`session.act SWITCH`（ドライバーの手動交代）に限り、`decide` が返す決定（`DriverSwitched`
イベントの `nextIndex`）が採用されず、`apps/sync` の `handleRoomCommand` がその結果を捨てて
`advanceDriver`（`packages/core/src/evolve.ts`）の結果へ差し替えていた。原因は次の不一致:

- `decideSessionAct("SWITCH")` は `ineligible`（driverEligible===false の対象外集合）を
  考慮せず、機械的に隣の位置を交代先として返していた。
- `evolveDriverSwitched` は交代先（`nextIndex`）が適用前の `currentIndex` と等しいかどうかを
  見ずに、常に `driverCounts`/`totalSwitches` を加算していた。
- 一方 `advanceDriver` は「交代先が現ドライバーと同じなら加算しない」分岐を独自に持っており、
  この2つの経路は同値ではなかった。

fast-check によるプロパティテスト（`driver-switch-equivalence.test.ts`）が、両者が同値でない
ことを示す最小の反例を確定させていた: `rotation=["p1"]`（輪1人）・`currentIndex=0`・
`ineligible=∅` の入力で、`evolve(DriverSwitched, nextIndex=currentIndex)` は
`driverCounts=[1]`・`totalSwitches=1` を返す一方、`advanceDriver` は
`driverCounts=[0]`・`totalSwitches=0` を返し、決定と適用が食い違っていた。

`handlers.ts` はこの食い違いを、`isManualSwitch` 分岐（`decide` の結果を捨てて
`advanceDriver` を呼び直すコード）で個別に回避しており、これが Decider パターンの
「決定（`decide`）と適用（`evolve`）を分離する」契約からの逸脱だった。

### 採用した決定

交代回数の意味論は **`advanceDriver` 準拠**を正とする。すなわち、交代先が現ドライバーと
同じ場合は `driverCounts`/`totalSwitches` を加算しない（タイマーの残量再アンカーは
加算の有無に関わらず必ず行う）。これは**現在の本番挙動を保存する方向**の選択であり、
利用者に見える値（セッション画面の「交代 N 回」表示・完成記録に残る担当回数）は
統合前後で変わらない。

### 解消の方法

1. `decide` の `session.act SWITCH` に任意の `ineligible?: ReadonlySet<number>` を追加し、
   `nextEligibleIndex`（`aggregate.ts` の既存関数）で対象外を飛ばした交代先を計算できる
   ようにした（省略時は従来通り隣の位置）。
2. `evolveDriverSwitched` を「`nextIndex === prevIndex` なら `driverCounts`/`totalSwitches`
   を加算せず、タイマーの再アンカーのみ行う」意味論に修正した。
3. `advanceDriver` を、修正後の `evolveDriverSwitched` を呼ぶだけの1行ラッパ
   （`nextEligibleIndex` → `evolve(DriverSwitched)`）へ縮退させ、内部にあった
   「交代／現状維持」の重複した2分岐実装を削除した。
4. `handleRoomCommand` の `isManualSwitch` 上書き分岐（`decide` の結果を捨てて
   `advanceDriver` を呼び直すコード）を撤去し、`session.act SWITCH` も他のコマンドと
   同じ「`decide` → `evolve` ループ」に統一した。手動交代時は `decide` を呼ぶ前に
   `ineligible` 集合（`computeIneligibleIndices`）を注入することで、決定ロジックを
   `decide` 側の1箇所に集約した。

この結果、「決定は `decide`・適用は `evolve`」という Decider パターンの契約が、
`session.act SWITCH` の経路でも他コマンドと同様に成立するようになった。

### 今回のスコープ外（意図的に据え置いた箇所）

`driver.skip`（即時繰り上げ）と `autoSwitch`（タイマー発火による自動交代）は、
コマンド起点ではなく `Room` の直接操作であるため、今回の統合後も引き続き
`advanceDriver` を直接呼ぶ設計のまま残した。これらをコマンド経由（`decide` 経由）の
決定に統一すべきかどうかは、本更新のスコープ外として今後の検討課題に残す。

### ADR-0002 自体の結論への影響

Decider パターン（`decide`/`evolve` による決定と適用の分離）という設計判断そのものは
変わらず有効である。今回の統合は、この契約から逸脱していた1経路（手動 SWITCH）を
契約に沿う形へ是正したものであり、ADR-0002 の「決定」節・「影響」節の内容を覆すもの
ではない。
