# ADR-0020: 招待のブラウザ操作を共有フックに集める

- **ステータス**: Accepted（2026-09-16）
- **関連**: [#269](https://github.com/tomohiroJin/tasuki-tools/issues/269)、
  [ADR-0017](./0017-bounded-contexts-and-packages.md)、[ADR-0015](./0015-web-layer-structure.md)

## 背景

玄関の選択画面にコピーと QR 表示が必要になった。timer はコピーと QR、poker は
コピーを既に持ち、失敗処理も異なる。3 つ目の操作実装を増やさず既存の処理を集める。

## 決定

- `packages/invite-ui` に `useCopyText` と `useInviteQr` を置き、3 アプリで使う。
  受け取るのは文字列だけ。ドメイン・同期クライアント・URL の組み立てには依存しない。
- `packages/ui` は CSS と静的資産のまま。表示の構造・スタイルは各画面が持ち、
  ブラウザ操作とその結果だけを共有する。画面から呼べるブラウザ操作フックとして
  [層の対応表](../guides/architecture.md)に位置づける。
- コピーは Clipboard API を優先し、使えない・拒否された場合は既存 poker の
  `execCommand` に縮退する。どちらも失敗したら手動選択を案内し、URL は常に表示する。
  一時要素・表示タイマーを片付け、古い非同期結果で別のコピー対象を上書きしない。
- QR は既存の `qrcode`（1.5.4）を動的 import して端末内で生成する。
  選択画面では表示ボタンを押した時に生成し、timer の従来の自動表示も維持する。
- URL の組み立ては引き続き `packages/sync-client/src/invite-url.ts` にあり、
  各同期フックから画面へ渡す。合言葉・復帰トークンを共有操作に渡さず、ログも出さない。

## 影響

React とブラウザ API に依存する共有フックが増えるが、ドメイン間の依存は増えない。
コピーの利用者は 3 アプリ、QR は 2 アプリで実在するため、ADR-0007 の実需を満たす。
外部ライブラリの追加・変更はなく、qrcode の依存宣言を timer から共有先へ移す。
依存方向と走査対象の宣言に新パッケージを含める。

## 追記（2026-09-27・#320）

決定の「表示の構造・スタイルは各画面が持ち」のうち**スタイル**は [ADR-0022](./0022-ui-components-layer.md) 決定 5 が
置き換えた。見た目の部品は `packages/ui` の部品層が持つ。**現行の正本は ADR-0022。** 表示の構造と、ブラウザ操作の共有は変わらない。

## 追記（2026-10-26・#447）

ルームの画面の見出し（道具名・戻るリンク・ルームコード・参加用 URL・QR・コピー）は、`packages/invite-ui` の React の部品 `RoomHeader` を使う。invite-ui はフックだけのパッケージから、見出しの部品を 1 つ持つパッケージになる。

- 決定の「表示の構造・スタイルは各画面が持ち」は、**ルームの見出しに限って**変わる。見出しの構造は `RoomHeader` が組み、道具に固有のボタンは `titleExtras` で隣に差し込む。他の表示の構造は各画面が持つまま。
- 見た目は `packages/ui` の `components/room-header.css` が持つ。`packages/ui` は CSS と静的資産だけ（[ADR-0022](./0022-ui-components-layer.md) の決めごとを保つ）。
- 見出しの文言の正本は `packages/invite-ui/src/room-header-copy.ts` の `ROOM_HEADER_TEXT` の 1 か所。画面に写しを置かない。
- 狭い幅（40rem 未満）では招待の行（ルームコード・URL・QR・コピー）を「仲間を招く」のボタンでたたむ。ルーレットの 320px の撮影で見出しが約 210px 高くなり、止まった札が下端の帯に隠れたため（[設計 §7 R6](../superpowers/specs/2026-10-26-room-header-design.md)）。40rem は `actions.css` の並びの切り替えと同じ境目。
- 部品は共有の部品として `scripts/audit-ui-components.mjs` の `SHARED_UI_ENTRIES` に登録する。部品の使われ方と容量は、その audit で数える。
