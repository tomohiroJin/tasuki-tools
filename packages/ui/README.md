# @tasuki/ui

Tasuki の共通ビジュアル「**夜のカードテーブル**」。深緑のフェルト、象牙のカード、真鍮のアクセント。

`apps/poker-web` と `apps/landing` が共有する。**`apps/timer-web` は使わない**（Tailwind ベースの
別系統で、既に確立した見た目があるため）。

## 使い方

利用側の CSS の**先頭**で読み込む。固有のスタイルは後に書く（同じ詳細度なら後勝ち）。

```css
@import '@tasuki/ui';

/* ここから下にアプリ固有のスタイル */
```

必要な部分だけ読むこともできる。

```css
@import '@tasuki/ui/tokens.css';   /* 色・書体・角丸・影の変数だけ */
@import '@tasuki/ui/card.css';     /* カード表現だけ */
```

書体（Fraunces / Zen Kaku Gothic New）は**このパッケージでは読み込まない**。
利用側の `index.html` で読む（どこから配信するかはアプリの事情によるため）。

## 中身

| ファイル | 内容 |
|---|---|
| `tokens.css` | 色・書体・角丸・影のカスタムプロパティ（`:root`） |
| `base.css` | フェルトの背景（照明 + 織り目）、`html` / `body` / 見出し / リンク / `.page` |
| `controls.css` | `button`（真鍮のチップ）/ `input[type=text]` / `label` / `.badge` |
| `card.css` | `.card`（象牙の札・内枠・コーナーピップ）/ `.card.small`（めくり演出） |

## トークン

| 変数 | 用途 |
|---|---|
| `--felt-950` 〜 `--felt-700` | 卓のフェルト（濃い順） |
| `--ivory` / `--ivory-dim` | 文字と札の地 |
| `--ink` / `--ink-soft` | 札の上に載る文字 |
| `--gold` / `--gold-bright` / `--gold-deep` | 真鍮のアクセント（ボタン・見出し・強調） |
| `--rose` | 警告・エラー |
| `--line` | 罫・枠 |
| `--font-display` | 数字と見出し（Fraunces。イタリックで使うと札の数字らしくなる） |
| `--font-body` | 本文（Zen Kaku Gothic New） |
| `--card-radius` / `--shadow-card` | 札の角丸と影 |

## 約束事

- **`.card` の中の数字は `.card-face` に入れ、コーナーピップは `data-label` 属性で渡す。**
  `::after` が `attr(data-label)` を出す
- `.card.small` はめくり演出（`flip-in`）を持つが、**遅延は利用側で指定する**
  （一覧の何番目かはアプリの都合のため）
- 動きを抑える設定（`prefers-reduced-motion`）は `base.css` が一括で面倒を見る

## ここに**入れていない**もの

- **伏せ札の裏模様**: 現時点で poker の座席インジケータ（`.seat-card.facedown`）でしか
  使っておらず、利用者が 1 つしかないため poker 側に残している。LP でも要るようになったら
  そのとき抽出する
- **書体の読み込み**: 配信元がアプリの事情に依存するため、利用側の `index.html` で行う
