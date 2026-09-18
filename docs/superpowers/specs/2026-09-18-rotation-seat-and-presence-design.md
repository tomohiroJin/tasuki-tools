# 交代の輪の席と在席の扱いを揃える（#276）— 設計正本

- **Issue**: [#276](https://github.com/tomohiroJin/tasuki-tools/issues/276)（親 [#95](https://github.com/tomohiroJin/tasuki-tools/issues/95)）
- **前段**: [#246](https://github.com/tomohiroJin/tasuki-tools/issues/246)（S4b・D21 で適格判定を在席へ） /
  [#247](https://github.com/tomohiroJin/tasuki-tools/issues/247)・[#248](https://github.com/tomohiroJin/tasuki-tools/issues/248)（S5a / S5b・R5 / R6 で一覧を在席で絞る） /
  [#249](https://github.com/tomohiroJin/tasuki-tools/issues/249)（S5c・同じ型の穴を 1 つ塞いだ）
- **関連**: [`docs/adr/0017`](../../adr/0017-bounded-contexts-and-packages.md)（文脈分割） /
  #95 設計正本 [`2026-09-06-shared-identity-and-rooms-design.md`](2026-09-06-shared-identity-and-rooms-design.md) /
  [#22](https://github.com/tomohiroJin/tasuki-tools/issues/22)（同名の呼び分け・FR-084）

## 1. 範囲

**交代の輪の席について、サーバーが既に知っている事実を画面へ届ける。**

#95 は段を追って「在席」を入れてきたが、**交代の輪は在席と独立**で、timer を離れても席は残る
（意図どおり。戻ってきたとき順番が保たれる）。この非対称から、**「サーバーは席について知っているが、
画面はその事実を受け取っていない」**という形の欠陥が出ている —— その席がなぜ飛ばされるのか、
次に実際に誰が運転するのか、輪に居る同名の人をどう呼び分けるか。Issue 本文が挙げる 3 件も、
実測で出た残り（§2）も、すべてこの形に当てはまる。

本設計はそれらを**同じ 1 つの欠陥の別々の顔**として扱い、wire を 1 度広げて同時に閉じる。
個別に直すと、直した数は数えられても**同じ形の穴が残っているかが分からない**。

### 本 Issue で扱わないもの

- **`config.members` の畳み込み。** 輪の表示からは外れるが、読み手が 2 つ残る（§3.5）。
  畳むのは別 Issue の仕事である
- **`participants` を在席で絞る決定（R5 / R6）の見直し。** 一覧の絞り込みは正しい。
  足りないのは輪の側の情報であって、一覧の側ではない
- **現ドライバー切断の 30 秒猶予（`PresenceManager`）の仕様変更**（§3.6）。
  猶予中の見え方が読めるかは #250（S6）の材料へ回す

## 2. Issue #276 本文との差異

本文の 3 件はいずれも**事実である**（§3 で実測）。ただし射程が本文より広い。

### 2.1 「次は誰か」の素朴な計算は 3 箇所ある

本文は「次:」の欄（`apps/timer-web/src/ui/Session.tsx:158`）だけを挙げるが、
`(currentIndex + 1) % len` 相当は 3 箇所で独立に計算されている。

| 場所 | 何を出しているか |
|---|---|
| `Session.tsx:158` | 「次:」の欄 |
| `components/TeamOrbit.tsx:26` | 周回図で次ドライバーを朱の枠線で示す |
| `rotation-status.ts:43` | `turnsAway`（後述） |

### 2.2 ずれるのは「次は誰か」だけではなく、順番に関する数字すべて

`rotation-status.ts:43` の `turnsAway = (i - currentIndex + len) % len` は**飛ばされる席を
数に入れている**。これは `RotationLineup` の **「あと3人・約15分後」「次です」「あなた: あと2人」**
の元である。離席者が輪に居ると、**全員の「自分の番まであと何分」がずれる**。

本文の主張 2 の射程は「次:の欄が食い違うことがある」ではなく、**輪の順番に関する数字が
すべてずれる**である。

### 2.3 番が飛ぶ理由は 3 つあるが、輪の帯は 1 つしか示していない

| 理由 | 輪の帯（`RotationLineup`）に出るか |
|---|---|
| 一時離脱中（`entry.eligible === false`） | **出ない**（参加者一覧 `RosterPanel` にだけ chip が出る） |
| 別の画面に居る（離席） | 出る（「別の画面」） |
| 切断している | **出ない**（本文の主張 1） |

本文は 2 つ目と 3 つ目だけを問題にするが、1 つ目も同じ穴である。

### 2.4 呼び名の非対称は本文の記述より 1 段細かい

本文は「離席者どうしが同名だと呼び分けられない」とする。実測すると、**片方だけ在席の場合に
離席側にだけ識別子が付く**という非対称もある（§3.3）。

## 3. 実測した事実（2026-09-18・main `74f2839`）

### 3.1 印が付く条件と、番が飛ぶ条件がずれている

- 印（`isAway`）が付くのは **`participants` に居ない席**
  （`apps/timer-web/src/ui/rotation-names.ts` の `isAway: presentName === undefined`）
- `participants` に載るのは `showsInTimer`（`apps/tasuki-sync/src/application/timer-snapshot-dto.ts`）を
  満たす人で、その条件は **timer に在席 または 接続 0 本**。つまり**切断した人は載る**
- 番が飛ぶのは `computeIneligibleIndices`（`apps/tasuki-sync/src/application/handlers.ts:923`）が
  選ぶ席で、その条件は **timer に在席していない**。切断した人はここに入る

したがって**切断した人は、印が付かないまま番を飛ばされる**。

### 3.2 現ドライバーの切断だけは別経路で、30 秒の猶予がある

`apps/tasuki-sync/src/application/presence.ts` の `PresenceManager` が
`DRIVER_ABSENCE_GRACE_MS = 30 * 1000` を張る。**輪の他の席には掛からない。**

### 3.3 呼び名の実測

`rotationMembers` に与える `participants` は在席で絞られているため、`participantLabel` の
曖昧判定がそこに載らない人を見ない。

| 状況 | 出る呼び名 |
|---|---|
| 同名 2 人が**両方離席** | `Bob` / `Bob`（識別子が付かない） |
| 同名 2 人の**片方だけ在席** | `Bob` / `Bob（ID: 2222）`（**離席側にだけ付く**） |
| 切断者（`presence: "offline"`） | `isAway` が立たない（§3.1 の裏取り） |

### 3.4 呼び名の判定対象を `seats` だけにすると退行する

現在の判定対象 `participants` には**輪の外の見学者も含まれる**。`seats` へ単純に差し替えると、
**輪の席の人と見学者が同名のときに、いま付いている識別子が消える**。

### 3.5 `config.members` には輪の表示以外に読み手が 2 つある

| 場所 | 用途 |
|---|---|
| `apps/timer-web/src/App.tsx:98` | 自分の名前が引けないときの縮退（`config.members[0]`） |
| `apps/timer-web/src/sync/snapshot-intents.ts:121` | 完成時のローカル記録に載せる表示名 |

### 3.6 UI 文言の書体サブセット

`packages/ui/src/tokens/fonts.css` の `-base` 層の `unicode-range` に対して実測した。

| 文言 | 判定 |
|---|---|
| 未接続 / 切断中 / 離脱中 / 一時離脱中 | base 層に収まる |
| 接続が切れているため、ドライバーの順番は回りません | base 層に収まる |
| 一時離脱中のため、ドライバーの順番は回りません | base 層に収まる |
| 交代できる人がいません | base 層に収まる |
| **見送り中** | **「送」が base 層に無い**（ext 層 210KB を引く） |

**「見送り」という語は使わない。** 既存語彙の「離脱中」（`RosterPanel.tsx:236` の chip）と
「接続中 / 再接続中…」（`StatusStrip.tsx:50-51`）の系列に揃える。

## 4. 決定

### D1. 適格判定はサーバーが持つ。画面は結果を受け取るだけにする

一次情報（誰がどのツールに在席しているか）はサーバーにしかない。画面が再計算する案は、
`showsInTimer` の裏返しの規則を画面側にもう 1 本置くことになり、食い違いの余地を残したまま
箇所を増やす。#249 が「二重実装を避ける」として理由添えに留めた判断を、サーバー権威の側へ倒す。

### D2. 席ごとの理由と「次の番」を wire に載せる

`snapshot.room.session` に 2 つ足す（`packages/timer-core/src/wire.ts` と `schemas.ts`）。

```ts
/** 輪の席 1 つ分。rotation と同じ順・同じ長さ。 */
interface Seat {
  id: string;            // member の participantId / proxy の id
  displayName: string;   // 絞っていない名簿から引く（proxy はラベル）
  isProxy: boolean;
  skipReason: "stood-down" | "away" | "disconnected" | null;  // null = 番が回る
}

seats: Seat[];
nextIndex: number | null;
```

`seats` は自分で `id` を持つので、画面は**添字ではなく id で照合できる**。
`config.members` の「長さが一致するときだけ添字で引く」という応急処置
（`rotation-names.ts` の docstring が"最悪の壊れ方"と警告する経路）は輪の表示から外れる。

### D3. 理由の優先順位は `stood-down` > `disconnected` / `away`

`computeIneligibleIndices` が `entry.eligible === false` を先に見ているので、それに揃える。
揃えないと**画面とサーバーが別々の理由を言う**。

### D4. `disconnected` と `away` の見分けは既存の区別をそのまま使う

名簿の人が timer に在席していないとき、接続 0 本なら `disconnected`、1 本以上なら `away`。
これは `showsInTimer` が既に持っている区別であり、**新しい判定は書かない**。
代理（proxy）は在席の概念を持たないので `stood-down` にしかならない。

### D5. 適格判定の実装は 1 本にする

`seatSkipReason(entry, watchingTimer, byId): SkipReason | null` を
`timer-snapshot-dto.ts` に 1 つだけ置き、**`computeIneligibleIndices` はこの関数が `null` を
返さない席の添字を集めるだけ**にする。

`computeIneligibleIndices` は `handlers.ts` から `timer-snapshot-dto.ts` へ移し、export する
（`handlers.ts` は既に同ファイルから 3 つ import している）。

**これをやらないと、本設計自身がサーバー内に 2 つ目の適格判定を作る** ——
直そうとしている欠陥と同じ形になる。

### D6. `nextIndex` は「次の交代で実際にドライバーになる席」

`nextEligibleIndex` は全席が不適格なとき `currentIndex` を返すため、そのままでは
「次は現ドライバー」と区別が付かない。`buildTimerSnapshotRoom` 側で先に振り分ける。

- 輪が空 → `null`
- 不適格の集合が席数と同数 → `null`（サーバーは現状維持へ縮退する・R15）
- **席が 2 つ以上あり、`nextEligibleIndex(...)` の戻り値が `currentIndex` と同じ → `null`**
  （最終レビューで追加。適格なのが現ドライバーの席だけのとき、`nextEligibleIndex` は
  「全席不適格」のときと同じく `currentIndex` を返し、「次は現ドライバー」と区別が付かない。
  2 人ルームで相方が離席する場面で最も起きやすく、放置すると画面が「Current Driver: あや」の
  直下に「次: あや」を出す。「交代しても運転者が変わらないなら人名を出さない」へ倒し、
  既存の「交代できる人がいません」と表示を揃える。**席が 1 つだけの輪はこの分岐に入らない**
  ——`(0+1)%1 = 0` で自分が次になるのは #276 より前からの既存の振る舞いで、射程外）
- それ以外 → `nextEligibleIndex(...)` の戻り値

### D7. `seats` / `nextIndex` は `RoomSchema` で必須にする

省略可にすると画面側にフォールバック経路が残り、D2 で畳んだはずの 2 経路が別の形で戻る。

代償として、**配布順序を誤った（画面を先に配った）場合の壊れ方**が変わる。旧サーバーの
snapshot が検証に落ち、既存の「壊れた snapshot」経路（`sync/stale-frame.ts`・`sync/dispatch.ts`）へ
乗る。**黙って空の輪を見せるより、そちらのほうがよい**という判断である。

⚠ **この経路は Task 1・Task 2 でユニットテストの経路として実測済みである
（本番実機での確認ではない）。** `indicatesStaleRoom` が `room.session.seats` /
`room.session.nextIndex` を「画面を古い側へ倒す」と判定することは Task 1
（`597c7bc`・`apps/timer-web/test/sync/stale-frame.test.ts:51-55`）で固定し、
`session.seats` を欠いた snapshot が実際に `room.session.seats` の経路で検証に
落ちることは Task 2（`e766210`・`apps/timer-web/test/sync/dispatch.test.ts:202-221`）で
固定した。D7 を作り直す必要は無い。

### D8. `config.members` と `session.rotation` は残す

`config.members` は §3.5 の読み手 2 つがあるため。`session.rotation` は自分の位置の算出と
現ドライバーの同定が読んでいるため。どちらも輪の表示からは外れる。

### D9. 呼び名の判定対象は `seats` と `participants` の和集合にする

`seats` だけにすると §3.4 の退行が起きる。和集合（id で重複排除）なら「同じ画面に並ぶ人全員」を
見るので、離席者どうしの同名も見学者との同名も両方が守られる。

### D10. `RotationMember.isAway` は `skipReason` へ改名する

意味が「timer に居ない」から「番が回らない」へ変わる。名前を据え置くと、同じ語が別の意味を
指すことになる。

### D11. 帯に出す印は 3 種。現ドライバーと自分には特例を置く

| `skipReason` | 印 | 読み上げ・title |
|---|---|---|
| `stood-down` | 離脱中 | 一時離脱中のため、ドライバーの順番は回りません |
| `away` | 別の画面 | 別の画面を見ているため、ドライバーの順番は回りません |
| `disconnected` | 未接続 | 接続が切れているため、ドライバーの順番は回りません |

- **現ドライバーの席**では「順番は回りません」が嘘になる（その人はいま運転中である）。
  状態だけを言う形にする —— 「接続が切れています」「別の画面を見ています」「一時離脱中です」
- **自分の席**が飛ばされるとき、`buildSelfSummary` の `あと${turnsAway}人` は
  `turnsAway` が `null` だと「あとnull人」になる。「あなた: 番が回りません（未接続）」の形にする

印は**色ではなく文字で示す**（WCAG 1.4.1・既存の `AWAY_LABEL` の方針を継ぐ）。

### D12. `Session.tsx` の `isNextAway` は削除する

次の席は定義上必ず適格になるため、この判定は恒真に偽になる。恒真な述語は
「検査しているように見えて何も守っていない」状態を作る。
`nextIndex` が `null` のときだけ「次: —（交代できる人がいません）」を出す。

### D13. `turnsAway` は適格な席だけを数える

- 席が飛ばされるなら `turnsAway` / `minutesAway` は `null`（「あと N 人」を出さず理由を出す）
- 適格な席は、現在地から**交代の向きへ**歩いて、飛ばされる席を数えずに何番目かを数える
- `isNext` は自前計算をやめ、`nextIndex` と一致するかで決める
- **現ドライバーの席は、飛ばされる状態でも `turnsAway` は 0 である**（`isCurrent` が先に効く）。
  運転中の人に「あと N 人」も「番が回りません」も出さない

## 5. EARS と検査の対応

| # | 振る舞い（EARS） | 何で確かめるか |
|---|---|---|
| E1 | 交代の輪に席を持つ人が番を飛ばされる状態にあるとき、システムはその理由が分かる形で示すこと | `timer-web`: 帯の 3 種の印（`RotationLineup`）／`tasuki-sync`: `seatSkipReason` の 4 分岐と D3 の優先順位 |
| E2 | 利用者が「次は誰か」を見るとき、システムは実際に次にドライバーになる人を示すこと | `tasuki-sync`: 交代を起こして `nextIndex` の席が実際にドライバーになること／`timer-web`: `Session` と `TeamOrbit` が `nextIndex` を使うこと |
| E3 | 利用者が「自分の番がいつ来るか」を見るとき、システムは飛ばされる席を数に入れないこと | `timer-web`: 飛ばされる席を挟んだ `computeRotationStatus` の `turnsAway` |
| E4 | 輪に同名の人が並ぶとき、システムはその席が在席していなくても呼び分けること | `timer-web`: 離席者どうしの同名／見学者との同名（D9 の退行防止） |
| E5 | 輪のどの席にも番が回らないとき、システムは「次」を人名で示さないこと | `tasuki-sync`: `nextIndex === null`／`timer-web`: 「交代できる人がいません」 |

### 検査を恒真にしないための注意

`computeIneligibleIndices` と `seats[].skipReason` は D5 により**同じ関数から出る**。
したがって「両者が一致する」というテストは**恒真**になる（#274 で 3 件作って 3 件とも
直した型）。一致の検査は書かず、**実際に交代を起こして、理由の付いた席が飛ばされること**を
確かめる。

## 6. 進める順序

1. **D7 の前提を実測する。** `seats` を欠いた snapshot が届いたとき画面に何が見えるか。
   違っていれば D7 を作り直す
2. wire と `RoomSchema` を広げる（欠けた snapshot が落ちること＋**揃った snapshot は通ること**の
   対照実行を置く）
3. サーバー: `seatSkipReason` の新設と `computeIneligibleIndices` の移設・一般化、
   `buildTimerSnapshotRoom` への `seats` / `nextIndex` の追加
4. 画面: `rotation-names` → `rotation-status` → `Session` / `TeamOrbit` / `RotationLineup`
5. 変異検査に `seatSkipReason` の分岐を落とす変異を足す
6. E2E は**既存タグの範囲**で見る（新しいタグは足さない）

## 7. 配布

`deploy/deploy.sh` の `timer` は web dist の転送を終えてから `server.js` を転送し、
再起動する順で進む（画面が先に生きる。#274 の「玄関」と「同期サーバー」は別コマンドで
順序を選べたが、`timer` は画面とサーバーが同じ 1 コマンドの内側にあるため選べない）。

D7 で `seats` / `nextIndex` を `RoomSchema` の必須項目にしたため、web 転送後・再起動前の
窓で新規に読み込んだ画面は旧サーバーの snapshot（`seats` を欠く）を検証に落とし、
`sync/stale-frame.ts` の経路で「最新ではありません」を見る。#274 と同じ向きだが理由が
違う（あちらは新しいコマンドに対する `INVALID_COMMAND`、こちらは新しいフィールドの
必須化）。

窓は再起動で閉じる。再起動自体がインメモリのルームを全消滅させるため、影響は
「配布中に新規読み込み・再読み込みをした利用者が数十秒それを見る」に留まる。すでに
開いている画面（旧バンドルのまま）はこの窓の影響を受けない。

`timer` 内部の転送順序（画面→サーバー）はこの Issue の範囲では変更しない。配布時に
確認する手順は `deploy/timer/NOTES.md` の順序表を参照する。

## 8. 申し送り

- **`config.members` の畳み込み**（§3.5 の読み手 2 つ）
- **現ドライバー切断の 30 秒猶予と帯の印の関係**（§3.2）。猶予中は「未接続と出ているが
  まだ現ドライバー」になる。表示としては正しいが、利用者が「なぜまだこの人なのか」を
  読めるかは確認していない。#250（S6）の材料へ
- **設計の誤りが下流へ写った実例（Task 9 で是正）**: #276 の計画・ブリーフは「同期サーバー
  （`deploy.sh timer`）を先に配る」という、`deploy/deploy.sh` の実際のフローでは
  実行不可能な指示を持っていた。この誤りは §7（旧版）だけでなく、実装時に書かれた
  コード注釈 2 箇所（`apps/tasuki-sync/src/application/timer-snapshot-dto.ts` の
  D7 の説明・`packages/timer-core/src/schemas.ts` の `SessionStateSchema` のコメント）
  にも「したがって配布は同期サーバーが先」という同じ誤りとして写っていた。
  設計の誤りは実装・レビューへ同じ向きに伝播する、という型の実例である
