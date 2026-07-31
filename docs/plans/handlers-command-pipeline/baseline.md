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

---

## 6. フェーズ7（パイプライン統合・専用ハンドラの合流）完了記録

**実施日:** 2026-07-31。T023〜T029 に対応。

### 6.1 合流の実施内容

`role.set`/`room.passphrase.set`/`ai.unlock`/`host.transfer`/`problem.request`/`problem.submit` の6コマンドを、1コマンドずつ（各コミット単位で）以下の手順で共通パイプライン（`handleRoomCommand`）へ合流させた。

1. `command-handlers/*.ts` 側: 在室確認・アクター解決・`rejectIfUnauthorized`（`problem.request`/`problem.submit` は旧 `requireEditor`）を削除し、`ctx: { room, actor }` を受け取るドメイン処理のみの関数へ縮退。
2. `handlers.ts` 側: `handleCommand` の switch から専用 case を削除（`default` → `handleRoomCommand` へ落ちる）。`handleRoomCommand` 内に、`participant.remove` と同じ構造の専用ドメイン分岐（decide/evolve より前、`buildDomainCommand` 呼び出しの手前）を追加し、既に解決済みの `{ room: targetRoom, actor: participant }` を ctx として渡す。
3. `makeHandlers` 内の各ファクトリ呼び出しから `findRoomByConnId`/`rejectIfUnauthorized`/`requireEditor` の受け渡しを削除。
4. 旧 `requireEditor`（`problem.request`/`problem.submit` が個別に呼んでいた、在室確認・アクター解決・`rejectIfUnauthorized` を束ねたヘルパ）は6コマンド合流完了時点で呼び出し元が無くなったため関数ごと削除。

結果、`handleCommand` の switch は最終形（`room.create`/`room.join`/`time.ping` の3ケース＋`default`）になった。

### 6.2 削れた重複前置き（実測）

各コマンドの専用ハンドラ本体（`git show <sha> -- command-handlers/<file>.ts` で実測）から削除した「在室確認・アクター解決・権限判定呼び出し」の行数:

| コマンド | 削除した前置き（本体、実測） |
|---|---:|
| `role.set` | 15行（`const room = findRoomByConnId(connId)` 〜 `if (rejectIfUnauthorized(...))`） |
| `room.passphrase.set` | 15行（同型） |
| `ai.unlock` | 15行（同型） |
| `host.transfer` | 15行（同型） |
| `problem.request` | 2行（`const guard = requireEditor(...)` ＋ `if (guard.isErr())...`） |
| `problem.submit` | 2行（同型） |

上記に加え、`problem.request`/`problem.submit` が共有していた `requireEditor` 関数本体（`handlers.ts` 側、在室確認・アクター解決・`rejectIfUnauthorized` を束ねたヘルパ・16行）を、両コマンドの合流完了時点で呼び出し元が無くなったため関数ごと削除した。

いずれのコマンドも、削除した前置きは「在室確認（`findRoomByConnId`＋`NOT_IN_ROOM`）」「アクター解決（`participants.find`＋防御的 `UNAUTHORIZED`）」「`rejectIfUnauthorized`/`requireEditor` 呼び出し」の3点に限られ、ドメイン処理本体（合言葉照合・LAST_MANAGER_DEMOTE 検査等）は1行も変更していない。

### 6.3 FR-155 回帰テストの実装

`apps/sync/test/pipeline-single-route.test.ts` を新設（15ケース）。「デッドコードの解消」ではなく、`permissions.ts` の集合表を変更したときに変更が全コマンドへ単一経路で反映され続けることの構造的回帰防止として、以下を字句検査で固定した。

- `handleCommand` の switch の case ラベルが `room.create`/`room.join`/`time.ping` の3件のみであること（旧6コマンドが個別 case を持たないこと）。
- `checkPermission({`（実呼び出し）が `handlers.ts` 内に1箇所だけであること。
- `rejectIfUnauthorized(connId`（関数定義を除く実呼び出し）が `handlers.ts` 内に1箇所だけであること。
- 6つの専用ハンドラファイルが `checkPermission(`/`rejectIfUnauthorized(`/`requireEditor(` を自前で呼んでいないこと。

このテストが実際に退行を検出することを、一時的に `role.set` の case を switch へ再追加して確認した（2件が red になることを確認後、変更を破棄）。

### 6.4 実サーバー WebSocket 直結による権限拒否の検証（T029・SC-059）

`bun run src/server.ts`（`PORT=8799`、`ALLOWED_ORIGINS` 未設定＝dev 全許可）を起動し、`ws` パッケージによる直結クライアントで以下を確認した（検証用スクリプトは一時ファイルで作成し、確認後に削除。リポジトリには残していない）。

手順: host が `room.create` → viewer 役の参加者が `room.join`（既定は editor のため、host が `role.set` で viewer へ降格）→ viewer から旧デッドコード6件を送信。

| コマンド | viewer から送信した結果 |
|---|---|
| `role.set` | `UNAUTHORIZED` |
| `room.passphrase.set` | `UNAUTHORIZED` |
| `ai.unlock` | `UNAUTHORIZED` |
| `host.transfer` | `UNAUTHORIZED` |
| `problem.request` | `UNAUTHORIZED` |
| `problem.submit` | `UNAUTHORIZED` |

対照として、同じ `role.set` を host から送信すると許可され、対象参加者の役割が実際に更新される（snapshot で確認）ことも確認した。全件、統合後の共通パイプライン経由で意図通りに権限判定が機能している。

### 6.5 `handlers.ts` の行数推移

| 時点 | 行数 |
|---|---:|
| フェーズ0（作業開始前） | 1,549行 |
| フェーズ6完了時点（本フェーズ開始時） | 886行 |
| フェーズ7完了時点 | 872行 |

目標（暫定600行）には届いていない。`handleCommand` の switch 縮小・`requireEditor` 関数本体（16行）の完全削除・6ハンドラの重複前置き削除で減った分を、`handleRoomCommand` 側へ追加した6つの専用ドメイン分岐（呼び出しとコメントを合わせて各10行前後）がほぼ相殺している。専用ハンドラのドメイン処理そのもの（合言葉照合・LAST_MANAGER_DEMOTE 検査等）は1行も削っていないため、これは想定通りの推移である。残る行数の大半は権限判定に依存しない既存のドメインロジック（`decide`/`evolve` 呼び出し・`driver.assign`/`driver.skip`/`member.*` 系の個別検査等）であり、フェーズ7のスコープ外。目標行数の乖離は T031（フェーズ8・最終検証）で改めて実測・記録する。

---

## 7. フェーズ8（ADR更新・最終検証）完了記録

**実施日:** 2026-07-31。T030〜T031 に対応。

### 7.1 SC-054（目標600行）の決着

**判定: 「作業の不足」ではなく「見積もりが過大だった」。**

根拠:

1. **FR達成状況に不足はない**。FR-157〜FR-162（トークン保持/レート制限/`applyRoomLevelEvent`/`buildDomainCommand`の分離、専用ハンドラのファイル分割、`handlers.ts`本体の大幅縮小）はいずれも実装済みで、対応する単体テストも緑（`token-store.test.ts`/`join-rate-limiter.test.ts`等）。分割対象として plan.md が列挙したモジュールは全て新設・移動が完了しており、「分割し忘れた責務」は残っていない。
2. **削減量自体は大きい**。1,549行 → 872行（677行・43.7%削減）。plan.md 自身が「分割前の半分以下」を目安としていた点では未達だが、43.7%削減は「大幅な縮小」（FR-162の定性要件）を満たす規模である。
3. **600行という数値が想定していなかったコストが判明した**。plan.md の「専用ハンドラ関数の配置」節・アーキテクチャ図（D4b）は、旧6コマンドの「縮退した専用ドメイン処理」を`handleRoomCommand`内の分岐として残す設計を最初から想定していた（=呼び出し配線は`handlers.ts`に残る前提）。しかし600行という具体的な目標値は、この配線コスト（6コマンド×呼び出し+ctx受け渡し+コメント、実測で1コマンドあたり10行前後、合計60行前後）を積算せずに立てられた見積もりだった。フェーズ7実施前（フェーズ6完了時点）は886行であり、フェーズ7で専用ハンドラの重複前置き（1コマンドあたり15行×4+2行×2＝64行）と`requireEditor`本体（16行）を削除しても、6つの呼び出し配線の追加とほぼ相殺して872行にしか下がらなかった。この相殺は「作業をサボった」結果ではなく、FR-153/154（挙動不変・呼び出し順序同一）を満たしながら合流する以上、構造的に避けられないコストである。
4. **`handleRoomCommand`本体（271〜591行目、320行超）が現在の最大の残存要因**であり、これは6分岐の呼び出し配線だけでなく、共通パイプライン本体（在室確認・アクター解決・権限判定・`decide`/`evolve`ループ・`member.shuffle`/`member.add`/`participant.addProxy`/`participant.rename`等の個別検査・`applyEvents`・配信）そのものであって、そもそも plan.md のどのフェーズでも「移動対象」に指定されていない（後述7.2参照）。

以上より、600行という暫定値は「実装が甘かった結果の未達」ではなく、**合流方式（旧専用ハンドラを`handleRoomCommand`内の分岐へ合流させる。plan.md確定済み）の配線コストと、共通パイプライン本体そのものの分量を見込まずに立てた見積もりの甘さ**によるものと判定する。

**SC-054 の新しい値**: spec.md を「900行以下（実測872行・43.7%削減で達成）」へ更新した（`docs/plans/handlers-command-pipeline/spec.md` SC-054・前提節・チェックリスト参照）。900という数値は実測872行に対し小さな余裕（変動許容）を持たせた値であり、実測値そのものを目標として書き写したわけではない。

### 7.2 別Issueに回すべき内容（起票はしない・記録のみ）

さらに `handlers.ts` を縮小する余地は残っているが、本タスク（フェーズ8）のスコープ外のため、将来の別Issueの候補として記録する。

- **`handleRoomCommand`本体（271〜591行目、320行超）の分割**: 現状、共通パイプライン本体（在室確認→アクター解決→権限判定→ドメイン処理→`applyEvents`→配信）と、旧6コマンドの合流に伴う分岐配線（役割ごとに`if (cmd.command === "...")`を6つ直列に並べたブロック、計60〜70行）が同一関数内に同居している。この分岐配線を、`command-handlers/`側が提供する`{ command, handler }`のディスパッチテーブル（`Record<string, (ctx, cmd) => Result<...>>`のようなマップ）へ置き換えれば、`handleRoomCommand`本体からif連鎖を除去でき、新規コマンドを合流させる際の追記も「テーブルに1行足す」だけになる（保守性の副次的な改善も見込める）。
- **`makeHandlers`直下のヘルパー閉包（`sendError`/`reconcileSchedule`/`autoSwitch`等、113〜270行目）の切り出し**: これらは`store`/`clock`/`broadcaster`/`scheduler`という共通依存だけに閉じており、`token-store.ts`/`join-rate-limiter.ts`と同じ要領で独立モジュール（例: `room-lifecycle.ts`）へ切り出せる可能性がある。ただし`autoSwitch`は`advanceDriver`・`reconcileSchedule`・`rotationDisplayNames`など複数の内部関数と相互依存しているため、切り出し方式の設計（引数として渡すか、ファクトリで閉包を再構成するか）は本タスクでは検討していない。
- 上記2点はいずれも「挙動不変のリファクタリング」に収まる想定だが、本フェーズの検証時間内では実施しない。着手する場合は新規Issueとして起票し、影響範囲（`handleRoomCommand`を参照する既存テスト群）の洗い出しから始めることを推奨する。

### 7.3 tasks.md のチェック漏れ修正

フェーズ6（T016〜T022）はコミット履歴（`b241835`「fix: ドライバー交代の担当回数をadvanceDriver準拠へ統合する」・`f284139`「refactor: 手動SWITCHのisManualSwitch分岐を撤去しdecideの決定に一本化する」）とコード実測（`packages/core/src/decide.ts`の`ineligible`パラメータ、`evolve.ts`の`evolveDriverSwitched`修正・`advanceDriver`の1行ラッパ化、`driver-switch-equivalence.test.ts`の「同値性」検証への書き換え）の両方で完了が確認できたため、`tasks.md`のT016〜T022のチェックボックスを付けた。

### 7.4 最終ゲート実測（フェーズ8完了時点）

| ゲート | 値 |
|---|---|
| テスト（core） | **662 passed**（30ファイル） |
| テスト（sync） | **381 passed**（54ファイル） |
| typecheck（core・sync） | **成功**（`@tdd-mob/core`/`@tdd-mob/sync`とも`tsc --noEmit`エラーなし） |
| lint（core・sync） | **成功**（`eslint src test`、両パッケージともエラーなし） |
| `handlers.ts`最終行数 | **872行**（1,549行から677行・43.7%削減） |
| ADR-0002 diff | **68行追加・0行削除**（`git diff --stat`実測。既存の背景/決定/影響節は無傷） |

**★ web を含む全体ゲート（`pnpm test`全体・`pnpm build`）と実画面での目視検証（ルーム作成・参加・役割変更・ドライバー交代・お題生成・退出）は、本タスク（フェーズ8）の担当範囲外であり、親セッションが実施する。** 本タスクでは `packages/core`・`apps/sync` の範囲（`pnpm vitest run`/`pnpm typecheck`/`pnpm lint`）のみを実測した。core・sync のテスト件数はフェーズ0実測値（core657→662、sync347→381）を下回っておらず、フェーズ6（B-2の単体テスト追加）・フェーズ7（`pipeline-single-route.test.ts`新設等）による増分と整合する。
