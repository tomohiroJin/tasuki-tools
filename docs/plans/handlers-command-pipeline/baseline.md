# ベースライン記録 — handlers-command-pipeline（Issue #26 / #28 B-2 / #33 論点4）

**対象:** `tdd-mob-pro-timer`（ブランチ `refactor/handlers-single-pipeline`）
**測定日:** 2026-07-31 ・ **測定方法:** 本ファイル記載の `grep`/`wc` コマンドを `tdd-mob-pro-timer/` 直下で実行（自動走査スクリプトは新設していない。件数はすべて手動計測であり、以後の検証はこのファイルのコマンドを再実行して比較する）。

---

## 1. `handlers.ts` の構造的事実

| 項目 | 値 | 計測コマンド |
|---|---:|---|
| 総行数 | **1,549 行** | `wc -l apps/sync/src/application/handlers.ts` |
| `handleCommand` の switch（専用ルート） | **9 ケース** | `sed -n '191,265p' handlers.ts \| grep -c 'case "'` — `room.create` / `room.join` / `time.ping` / `role.set` / `room.passphrase.set` / `ai.unlock` / `host.transfer` / `problem.request` / `problem.submit` |
| `buildDomainCommand` の switch（default ルート内） | **17 ケース** | 同様に計測。`session.act` / `session.complete` / `session.reset` / `config.set` / `member.add` / `member.remove` / `member.move` / `phase.set` / `handoff.note.set` / `session.abort` / `participant.addProxy` / `participant.rename` / `driver.skip` / `driver.resume` / `driver.assign` / `problem.edit` / `problem.mode.set` |
| `applyRoomLevelEvent` の switch（イベント適用） | **15 ケース**（`return agg` の集約無変更15件は`evolve`側） | 同様に計測 |
| `handleRoomCommand` 内で個別分岐する追加コマンド | `participant.remove`（1）・`member.shuffle`（1・switch外） | 目視確認 |
| 専用の `async function handle*` 関数の数 | **11 個** | `grep -c "async function handle" handlers.ts` |
| `makeHandlers()` 内の可変 `Map` | **4 個**（`hostTokens` / `roomPassphrases` / `resumeTokens` / `joinFailures`。5個目の `names` は `rotationDisplayNames` 内のローカル変数でクロージャ状態ではない） | `grep -n "= new Map" handlers.ts` |

**ルームスコープの到達可能コマンド総数（`permissions.ts` の `REGISTERED_COMMANDS`）: 25 個。**
内訳は `apps/sync/src/application/handlers.ts` 冒頭コメント「対象コマンド（ルームスコープかつ到達可能な25コマンド）」と一致（`participant.remove` を含む）。
在室前提コマンドは `room.create` / `room.join` / `time.ping` / `presence.ping` の**4個**。
`presence.ping` は `apps/sync/src/server.ts:122` で `handleCommand` を呼ぶ**手前**に横取りされており、`handlers.ts` の外で完結している（`presenceManager.handlePing(connId)`）。したがって現状「在室前提としないコマンド」は型ではなくファイル間の暗黙の分岐で表現されている。

### 二重ルートの内訳（Issue #26 表の実測による裏付け）

| ルート | 個数 | コマンド |
|---|---:|---|
| 専用ハンドラ（`handleCommand` の switch が直接分岐） | 9 | 上表参照（うち3個は在室前提外: `room.create`/`room.join`/`time.ping`） |
| `handleRoomCommand`（`default`） | 19（= 25 − 6。在室前提の room-scoped 側6個が専用ハンドラに割かれている） | `role.set`/`room.passphrase.set`/`ai.unlock`/`host.transfer`/`problem.request`/`problem.submit` を除く全19 |

### デッドコード6件（Issue #26 表を実測で再確認）

| コマンド | 実際の検査位置（専用ハンドラ内） | 集合表の記載（`authorize()`=`checkPermission()` に到達しない） |
|---|---|---|
| `role.set` | `handleRoleSet` 内 `rejectIfUnauthorized`（811行目） | `HOST_ONLY_BEFORE_START` |
| `room.passphrase.set` | `handleRoomPassphraseSet` 内（868行目） | `HOST_ONLY_BEFORE_START` |
| `ai.unlock` | `handleAiUnlock` 内（910行目） | `HOST_ONLY_BEFORE_START` |
| `host.transfer` | `handleHostTransfer` 内（958行目） | `HOST_ONLY_BEFORE_START` |
| `problem.request` | `requireEditor`（994行目） | `EDITOR_PLUS_COMMANDS` |
| `problem.submit` | `requireEditor`（1019行目） | `EDITOR_PLUS_COMMANDS` |

**これらは実際には `checkPermission()` を呼んでいる**（`rejectIfUnauthorized`/`requireEditor` はどちらも内部で `checkPermission` を呼ぶ）。

**フェーズ0（T001-事前確認）での行番号再検証結果**: `wc -l apps/sync/src/application/handlers.ts` = **1,549行**（総行数、乖離なし）。`grep -n "rejectIfUnauthorized\|requireEditor("` により、`role.set`=811行目・`room.passphrase.set`=868行目・`ai.unlock`=910行目・`host.transfer`=958行目・`problem.request`(`requireEditor`呼び出し)=994行目・`problem.submit`(`requireEditor`呼び出し)=1019行目・`requireEditor`内の`rejectIfUnauthorized`呼び出し=1062行目を実測し、**計画文書記載の全行番号（811/868/910/958/994/1019/1062）と完全一致することを確認した**。`baseline.md` の更新は不要。

**★親セッションによる確定結論（解決済み・以後この結論を正とする）**: Issue #26 本文の「`HOST_ONLY_COMMANDS`/`EDITOR_PLUS_COMMANDS` に登録されているが `authorize()` に到達しないデッドコードが6件ある」という主張は、**現在の実装に対しては古い（実態と食い違っている）**。6コマンドはすべて `rejectIfUnauthorized`（`role.set` 811行目・`room.passphrase.set` 868行目・`ai.unlock` 910行目・`host.transfer` 958行目）または `requireEditor`→`rejectIfUnauthorized`（`problem.request` 994行目→1062行目・`problem.submit` 1019行目→1062行目）経由で `checkPermission()` に実際に到達しており、`rejectIfUnauthorized`（1076行目付近）は `checkPermission()` を単独の判定として呼ぶ。`HOST_ONLY_COMMANDS`/`EDITOR_PLUS_COMMANDS` は `permissions.ts` 内部の集合として生きており、宙に浮いた別テーブルではない。Issue #22 で権限判定が `checkPermission()` に統合された際に、この6コマンドの経路も追随済みであったと考えられる（Issue #26 起票時点の記述がその後の Issue #22 の変更に追随していない）。

この確定を受け、**「デッドコードの解消」は本タスクの目的から外す**。ただし「経路が2つに分かれていること自体が将来の見落としを生む」という構造的リスクは実在する（Issue #22 の実装中に同種の見落としが3回起きた実績あり）ため、**この構造的動機は「集合表への登録が実際の判定へ到達することを機械的に検証する回帰テスト」（FR-155＝旧FR-006）として spec.md に残す**。この回帰テストは `permissions-differential.test.ts`（25コマンド×3役割×2対象のオラクル突き合わせ）を拡張し、集合表への1コマンドの追加/削除ミューテーションを想定したケースを追加する形で実装する（既存オラクルとの関係は plan.md 参照）。旧 spec.md `[要確認]` 2番はこの結論をもってクローズする。

---

## 2. B-2（decide/evolve と advanceDriver の不一致）

`packages/core/test/driver-switch-equivalence.test.ts` が fast-check で確定した反例:

| 入力 | `evolve(DriverSwitched, nextIndex=currentIndex)` | `advanceDriver` |
|---|---|---|
| `rotation=["p1"]`, `currentIndex=0`, `ineligible=∅` | `driverCounts=[1]`, `totalSwitches=1` | `driverCounts=[0]`, `totalSwitches=0` |

原因は `evolveDriverSwitched`（`packages/core/src/evolve.ts:168-200`）が **`nextIndex` と現在の `currentIndex` の異同を見ずに無条件で `driverCounts`/`totalSwitches` を加算する**ため。`advanceDriver`（同ファイル121-152行目）は交代先が現状と同じなら加算せずタイマーだけ再アンカーする分岐を別に持つ。

`decideSessionAct("SWITCH")`（`packages/core/src/decide.ts:184-195`）は `ineligible` を受け取らず `(currentIndex+1)%rotation.length` を機械的に返すため、輪が1人のときだけでなく、**ineligible を考慮した交代（自分以外全員 ineligible）でも `advanceDriver` と食い違う**（`decide` は隣を指すが `advanceDriver` は現状維持を返す）。

`handlers.ts` は現在この不一致を「`decide` の結果を捨てて `advanceDriver` へ差し替える」ことで回避している（697-705行目・731-741行目）。

**ユーザーの決定（本タスク前提として確定済み）**: 正解は `advanceDriver` の意味論。`evolveDriverSwitched` を「`nextIndex === prevIndex` なら加算せずタイマーのみ再アンカー」に修正する。これにより `advanceDriver` は将来的に「`nextEligibleIndex` を計算して `evolve(DriverSwitched)` を呼ぶだけ」に単純化できる（現状の2分岐の重複コードが1本化される）。

---

## 3. ゲート現状値（T001 実測・2026-07-31）

**実測済み**（フェーズ0・T001）。`packages/core`・`apps/sync` は `pnpm vitest run` を各ディレクトリで実行して実測。`typecheck`/`lint`/`build` はリポジトリ直下で `pnpm typecheck` / `pnpm lint` / `pnpm build`（`turbo run`、3パッケージとも対象）を実行して実測。**`apps/web` の `pnpm vitest run`（jsdom、約17分）はこのフェーズでは実行していない**（担当タスクの作業方針により、web を含む全体ゲートは親セッションが回すため）。web のテスト件数は申告値 534 のまま未検証で据え置く。

| ゲート | 申告値 | 実測値 | 一致 |
|---|---|---|---|
| テスト（core） | 657 | **657 passed（29 ファイル）** | 一致 |
| テスト（sync） | 347 | **347 passed（50 ファイル）** | 一致 |
| テスト（web） | 534 | 未実測（本フェーズでは対象外。親セッションが実施） | — |
| typecheck | 4/4 パッケージ成功 | **4/4 成功**（`@tdd-mob/core`/`@tdd-mob/sync`/`@tdd-mob/web` 実行＋buildも実行） | 一致 |
| lint | 3/3 パッケージ成功 | **3/3 成功** | 一致 |
| build | 3/3 パッケージ成功 | **3/3 成功**（web の vite build 含む） | 一致 |

**結論**: core・sync は申告値と完全一致（657件・347件とも差分ゼロ）。typecheck/lint/build も申告通り全パッケージ成功。web のテスト件数のみ本フェーズの方針上未実測（親セッションの全体ゲートで確認する）。以後、core・sync については本実測値（657・347）を「下回らない」基準とする。

参考として本タスクで実測したテストファイル数（`it`/`test` の展開数ではない）:

| パッケージ | `test/**/*.test.ts(x)` ファイル数 |
|---|---:|
| `packages/core` | 29 |
| `apps/sync` | 50 |
| `apps/web` | 75 |

（`docs/plans/codebase-refactoring/baseline.md` の G5 完了時点＝615/327/523＝1,465件と、本タスクの申告値1,538件は一致しない。差は Issue #33 等の後続作業によるコミットの蓄積と考えられる。core/sync は今回実測で申告値と一致することが確認できたため、乖離があるとすれば web 側の可能性が高いが、本フェーズでは未検証。）

---

## 4. 安全ネットの構成

| ファイル | 行数 | 役割 |
|---|---:|---|
| `packages/core/test/permissions-differential.test.ts` | 250 | 25コマンド×3役割×2対象（自己/他者）の全組み合わせで `checkPermission` をオラクルと突き合わせる |
| `packages/core/test/driver-switch-equivalence.test.ts` | 153 | fast-check によるプロパティテスト。`evolve(DriverSwitched)` を修正した後は「全入力で一致する」方向へ更新が必要（現状は「一致しない」ことを検証する内容になっている） |
| `packages/core/test/driver-switch-characterization.test.ts` | 164 | 現状の `advanceDriver` の挙動を固定する特性テスト。B-2 修正後も**利用者に見える値は変えない**ため、このテストの期待値自体は変更不要のはず（`evolveDriverSwitched` 経由でも同じ結果になることの確認に転用できる） |

---

## 5. `docs/adr/0002-decider-pure-domain.md` の現状

54行。「決定」「影響」の2節構成。「影響」節は「利点」と「代償」に分かれる。
本タスクのスコープでは**「利点」節を編集しない**（Issue #33 論点2は別ブランチ）。追記は末尾に新設する `## 更新` セクションに限定する。
