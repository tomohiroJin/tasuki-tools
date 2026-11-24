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
  `apps/sync` と `apps/web` が同じ `decide`/`evolve` を共有するため挙動が一致する。
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

## 追記（2026-11-23・#660）— ランダム交代の袋を集約に持ち、乱数は順列で受ける（Proposed）

- **この追記のステータス**: **Proposed**（2026-11-23 起案。採択は人が決める。ADR 本体の Accepted は変わらない）
- **関連**: [#660](https://github.com/tomohiroJin/tasuki-tools/issues/660) /
  [`docs/adr/0016`](../../adr/0016-core-domain-representation.md)（集約の表し方） /
  `docs/constitution.md` 原則 VI（依存は内向き）

### 問い

交代のたびに次のドライバーをランダムに決めるモード（設定の `rotationMode: "random"`）を足す。
画面は交代の前から「次: 〈名前〉」を出しているので、交代の時点で乱数を引くと、予告と違う人に替わる。
乱数はドメインの外（同期サーバーの `RandomSource`）にある。次の 3 つを決める。

1. 次に替わる人を、どこが、いつ決めるか
2. 乱数をドメインへどう渡すか
3. 偏りをどう抑えるか

### 決めたこと（案）

1. **集約が袋を持ち、次に替わる人は袋から導く。** `SessionState.randomRotation`（輪の順のモードでは `null`）に、
   引く順 `order` と、この周で運転した人 `drove` を席の識別子で持つ。次に替わる席は
   `nextDriverIndex`（`packages/timer-core/src/aggregate.ts`）が、輪・袋・適格でない席から求める。
   **交代（`decide` の SWITCH・`advanceDriver`）・運転中の人を外したときの次の担当・snapshot の予告（`session.nextIndex`）が、
   同じこの関数を呼ぶ。** 「次に替わる人」を値として持たないので、予告した人が適格でなくなったとき
   （一時離脱・切断・見学・輪から外れた）の選び直しに、別の経路が要らない（在席の変化は `decide` を通らない）。
2. **乱数は順列で受ける。** 同期サーバーが席の添字の順列（`[0..len-1]` の一様な並べ替え）を作り、
   `decide` のコマンド（`session.act` の START・SWITCH、`session.reset`、`config.set`）の `randomOrder` と
   `advanceDriver` の引数で渡す。`member.shuffle` の `order` と同じ形で、ドメインは乱数を引かない。
   `decide` は順列でない `randomOrder` を `InvalidIndex` で断る。`advanceDriver` は `Result` を返さないので、
   順列でなければ引く順を作り直さずに替わる（時間切れの交代を止めると、残り 0 のまま予約が発火し続ける）。
   輪の順のモードでは、同期サーバーは順列を作らない（乱数を引かない）。
3. **1 周の中で全員が 1 回ずつ、順番だけをランダムにする。** 候補は、いまの運転者でも不適格でもない席。
   その中で、この周でまだ運転していない人を引く順の先頭から選ぶ。全員が運転し終えていたら、引く順の先頭の人から
   次の周を始める（`drove` を交代先の 1 人に戻す）。引く順は交代・開始・リセットのたびに作り直す。
   - 引く順を作り直したあとに入った席は、引く順の人の後ろに輪の順で並ぶものとして読む。まだ運転していないので、
     この周のうちに番が回る。次の交代で作り直した引く順に入る
   - 指名（`driver.assign`）は、指名された人を `drove` に足すだけで、周を始め直さない
   - 袋を進めた結果は、イベント（`DriverSwitched`・`MemberRemoved`・`SessionStarted`・`SessionReset`・`ConfigSet`）が運ぶ。
     `evolve` は、集約がランダム交代のときだけそれを写す。モードを変えるのは `ConfigSet` だけ
4. **ナビゲーターの定義は変えない。** 直前に実際に運転した人（`previousDriverId`・#374）のまま。
   ランダムに交代すれば、ナビゲーターも入れ替わる。
5. **wire に足すのは設定の `rotationMode` だけ。** 予告は今までと同じ `session.nextIndex` に載せ、袋は載せない
   （`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の台帳 14）。

### 採らなかった案

- **「次に替わる人」を値として集約に持つ**（#660 の本文の案）: 予告した人が適格でなくなるたびに引き直しが要る。
  適格かどうかは名簿の在席で決まり、在席の変化（`presence.ts`）は `decide` を通らないので、引き直しの経路が
  コマンドの外に増える。引く順を持って導けば、同じ結果を経路を増やさずに得られる。
- **ドメインが種から擬似乱数を作る**: 経路は減るが、「乱数はサーバーが持つ」（ルーレット・`member.shuffle` と同じ）から外れる。
- **毎回、直前の人を除いた全員から等しく引く**: 同じ人が何度も当たり、誰かが長く当たらないことが起きる。
- **ナビゲーターも別に引く**: ドライバーと同じ人になる場合などの扱いが増える。

### #660 の本文と違う点

- **セッション中はモードを切り替えられない。** 本文は「セッション中に切り替えたら、次の交代から効く」としているが、
  `config.set` はセッション中に断る（`CONFIG_LOCKED_IN_SESSION`・#402 設計 D7）。設定の欄（`SessionConfigPanel`）も
  ロビーにしか無い。この決まりは変えていない。切り替えはロビーで行い、次のセッションから効く。
  ドメイン（`decide` の `config.set`）は走行中の切り替えも扱える（単体で確かめている）ので、
  セッション中の切り替えを入れるなら、D7 の例外と画面の置き場を決めればよい。
- **配る順は `deploy/timer/NOTES.md` に書いた。** 本文は `deploy/README.md` としているが、README の配布の注記は
  配ったあとの記録で、アプリごとの配る前の注意は各 `NOTES.md` にある（#402・#95 と同じ置き場）。
- **時間切れの交代の E2E は無い。** 交代間隔の最小が 3 分なので、E2E は手動の交代と選び直しを見る。
  時間切れ（`autoSwitch`）で予告した人へ替わることは、同期サーバーのテスト
  （`apps/tasuki-sync/test/random-rotation.test.ts`）が見る。
- **運転中の人を外したとき、ほかの全員が不適格なら、位置で次の席の人が運転者になる**（輪の順のモードと同じ・#376）。
  その人は、指名と同じく `drove` に足す（#660 のレビュー）。
- **開始前（ロビー）に先頭の席を外したときは、袋から引かず輪の順で詰める。** ロビーの「運転中の席」は運転していない。
  袋から引くと開始の運転者が輪の途中の席になり、画面が最初の開始をリセットで送る（#660 の 2 巡目のレビュー）。
