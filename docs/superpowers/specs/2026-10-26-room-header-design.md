# ルーム画面の共通の見出し（#447 段 1）— 設計

- **日付**: 2026-10-26・**実測時点**: main `25e95de0`
- **Issue**: #447（本文の EARS と完了条件・2026-10-26 のコメント「設計で決めること D1〜D7」）
- **段の分け方**: 段 1（#447-1）は共通の見出しの部品と、agenda・roulette・topic・poker への適用、玄関の札の順。段 2（#447-2）は timer のロビーとセッション（D3〜D5）。この設計は段 1 だけを決める
- **決め方**: D1〜D7 は利用者の指示（2026-10-26「推奨通りとして全て判断して」）で、コメントの推奨をそのまま採った。推奨に書いていなかった細部は統括が決め、§6 に理由を残す

## 1. いまの姿（コードで確かめたもの）

| アプリ | 戻るリンク | 招待 |
|---|---|---|
| topic | `TopicRoom.tsx` が `.ui-page-header` を組み、その下に `components/InviteLink.tsx` | URL とコピー。URL の `<span>` に名前が無い |
| roulette | `RouletteRoom.tsx` が `.ui-page-header` を組む | 脇の最後の「仲間を招く」パネルの中に `components/InviteLink.tsx`（320px で円盤を押し下げないため脇へ置いた・spec §6.7 の 3 版） |
| agenda | `AgendaRoom.tsx` が `.ui-page-header` を組む（映している間は描かない） | **ルームの画面に招待が無い**。`components/InviteLink.tsx` と `copy.ts` の `INVITE_*` はあるが、どこからも使われていない（#447 本文の表の「写しが 3 つ」は、3 つ目が死んだ写しだった） |
| poker | `RoomPage.tsx` が `.ui-page-header` のクラスで独自に組む。見出しの隣に「お題を隠す」「記録する」の切り替え（`.room-title`） | `RoomPage.tsx` の中の `InviteLink`（関数）。URL の `<span>` に名前が無い |

ルームコードと QR は、ルームの画面では timer（`ui/components/InvitePanel.tsx`）だけが出す。QR の開け閉めの型は玄関（`apps/landing/src/screens/RoomChoice.tsx`）にある。

玄関の札（`apps/landing/src/tools.ts` の `TOOLS`）は作った順の timer → poker → topic → roulette → agenda。

## 2. 決めたこと

### D1 部品の置き場所

React の部品 `RoomHeader` を `packages/invite-ui` に置く。見た目は `packages/ui` の CSS（新しい `components/room-header.css`）が持つ。`packages/ui` は CSS だけ、という ADR 0022 の決めごとは保つ。新しいパッケージは作らない（#247 で、新しいパッケージは検査を 5 本落とした）。

`invite-ui` はこれまでフックだけのパッケージだった（ADR 0020）。部品を 1 つ持つことを ADR 0020 に追記する。

### D2 見出しに入れるもの（全アプリで同じ）

1 行目: 道具名（`h1`）と、選択画面へ戻るリンク（両端）。poker の切り替えのように、道具に固有のボタンは見出しの隣に差し込める（`titleExtras`）。

2 行目: ルームコード、参加用 URL、QR の開け閉め、URL のコピー（よく使うコピーを末尾に置く。玄関と同じ並び）。

QR は普段は閉じている。開け閉めのボタンで開く（玄関と同じ型・同じ文言）。開いたときに初めて qrcode を読み込む（`useInviteQr` の `enabled`）。

### D3〜D5 timer

段 2（#447-2）で決める。段 1 では timer を触らない。

### D6 文言の持ち方

見出しの文言は部品の側の 1 か所（`packages/invite-ui/src/room-header-copy.ts`）に置く。アプリの `copy.ts` からは `BACK_LINK`・`INVITE_*` を消す。入室を待つ画面の戻るリンクも、部品側の文言を読む。

文言は、既にどこかの画面に出ている言い回しから選ぶ（§3）。新しい字は増やさないが、書体の base 層に収まるかは `invite-ui` の試験で確かめる。

### D7 検証

- 5 アプリのルーム画面を 320px と PC 幅（1280px）で、変更の前後に撮って並べる。timer は段 1 では変えないので、後で比べるための基準として撮る
- 既存の E2E と a11y の検査は緑のまま。新しいタグは足さない
- 部品の変異検査を足す。ID は **474〜483** を #447-1 に予約する（段 2 と #449 は別の帯を使う）

## 3. 文言（正本は `room-header-copy.ts`）

| 用途 | 文言 | どこで使われていたか |
|---|---|---|
| 戻るリンク | `選択画面へ戻る` | 5 アプリ |
| ルームコードの見出し | `ルーム` | 玄関の選択画面（`hub-label`） |
| コピーのボタン | `招待リンクをコピー` | topic・roulette・poker |
| コピーした | `コピーしました` | 同上 |
| コピーできない | `コピーできません（URL を選択してください）` | 同上 |
| QR を開く | `QR コードを表示` | 玄関 |
| QR を閉じる | `QR コードを閉じる` | 玄関 |
| QR の代替テキスト | `参加用 URL の QR コード` | 玄関 |
| QR の準備中 | `QR コードを準備しています…` | 玄関 |
| QR を作れない | `QR コードを表示できません。URL を選んでコピーしてください。` | 玄関 |

## 4. 部品の形

```tsx
<RoomHeader title={PAGE_HEADING} backHref={hubPathFor(roomCode)} roomCode={roomCode} inviteUrl={sync.inviteUrl} titleExtras={…} />
```

- `<header class="ui-room-header">` が全体。1 行目は既存の `.ui-page-header`（`h1` と `.ui-page-header-back`）
- 2 行目は `.ui-room-header-invite`。ルームコード（`.ui-room-header-code`）と、既存の `.ui-invite`（URL の `.ui-invite-url` と、QR・コピーのボタン）
- QR は `hidden` の付いた `.ui-room-header-qr`。開け閉めのボタンは `aria-expanded` と `aria-controls`
- URL は `<span>` のままにする（E2E の `e2e/support/poker.ts` が `.ui-invite-url` の字を読む）。**`<span>` に `aria-label` は付けない**。`<span>` は役割の無い要素で、ARIA 1.2 はこの要素に名前を付けることを禁じている。agenda と roulette の写しにあった `aria-label` は消える。読み上げでは URL の字そのものが読まれる

## 5. 置く位置

ルームの画面で、`main` の最初の子にする（バナーより後）。roulette は、脇の「仲間を招く」パネルをやめて見出しへ移す。320px では見出しが今より 1〜2 行高くなり、円盤が少し下がる（§8 R6 で改めた）。EARS の「どのアプリも同じ位置に」を優先した（§6 R1）。

agenda は、映している間は見出しごと描かない（今と同じ）。

見出しが高くなるので、roulette の円盤の大きさの式（`--wheel-size`）と agenda の進行表の枠の高さの式（`run.css` の `100dvh - 14rem`）の見込みが変わる。値は撮影で確かめてから直す（実装の段では変えない）。撮影と実測（見出しは 320px で 44px・1280px で 52px 高くなった）で、ルーレットの式を 24rem→26rem・16rem→19.25rem、agenda の枠を 14rem→17.25rem にした。

入室を待つ画面（`JOINING_HEADING` の画面）は変えない。招待を出すのは、入室が成立したルームの画面だけにする。

## 6. 統括が決めたこと（推奨に無かった細部）

- **R1 roulette の招待を見出しへ移す**: 脇に置いた理由（320px で円盤を押し下げない）より、EARS の「同じ位置」を優先した。撮影で円盤が画面の外へ出るほど下がったら、段 1 の中で直す（§8 R6 で改めた）
- **R2 URL の `<span>` の `aria-label` をやめる**: 揃える向きを「付ける」ではなく「付けない」にした。§4 の理由による
- **R3 入室を待つ画面は対象外**: EARS の「ルーム画面を開いたとき」は、入室が成立した画面と読んだ。待つ画面にはまだ招待の中身（名簿の成立）が無い
- **R4 ルームコードはコピーのボタンを持たない**: 推奨の D2 は「ルームコード」の表示だけを挙げていた。参加は URL で足りる（ADR 0018 決定 2）
- **R5 コピーの結果は、ボタンの字を差し替えて知らせる**（topic・roulette・poker の今の型）。玄関の `role="status"` の一文は持ち込まない。見出しに行を足すと 320px で高くなるため

## 7. 玄関の札の順

`TOOLS` を timer → poker → roulette → topic → agenda に並べ替える。`whereLabel` は ID で名前を引くので、並べ替えても在席の表示は変わらない。

## 8. 実装中に足した決め（2026-10-26・撮影の後）

- **R6 狭い幅（40rem 未満）では、招待の行を「仲間を招く」のボタンでたたむ**: Task 3 の後に 320×640 で撮ると、見出しが約 210px 高くなり、ルーレットの止まった札が下端の帯（回す）に隠れた。ルーレットの設計（`2026-10-12-facilitator-roulette-design.md` の 3 版・利用者が 2026-10-12 に承認）が招待を脇へ移したのは、まさにこれを避けるためだった。R1 はその前提を崩していた
  - 決め: 40rem 未満では、見出しの 2 行目（ルームコード・URL・QR・コピー）を最初はたたみ、1 行目の下に「仲間を招く」のボタン（`aria-expanded`）を出す。押すと 2 行目が開く。40rem 以上ではボタンを出さず、2 行目は常に見える
  - これで「どのアプリも同じ位置・同じ文言」（#447 の EARS）を保ったまま、狭い幅で見出しが増やす高さはボタン 1 つ分にとどまる。ルーレットの 10-12 の決め（招待で円盤を押し下げない）の理由も守る
  - 文言「仲間を招く」は玄関の選択画面の見出しと同じ（base 層に収まる）
  - 40rem は部品層の並びの切り替え（`actions.css`）と同じ境目
  - 費用: 狭い幅では、topic と poker で URL を見るのに 1 回押す手間が増える
