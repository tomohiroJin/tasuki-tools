# agenda（進行タイマー）固有の運用メモ

共通の手順は [`../README.md`](../README.md) を参照。

## 配布の手順（#429）

配るのは**利用者の明示の指示を得てから**で、**利用者が使っていない時間帯**に行う
（`deploy.sh timer` の再起動で timer・poker・お題・ルーレット・進行タイマーのルームがすべて消える）。
同期サーバー（`?tool=agenda`）と web を同じ回で配る。

> **2026-10-21 に配った**（`v4.3.0`）。初回の用意（web root と断片）を済ませてから、
> agenda・landing・timer の 3 本を下の順序どおり続けて流した。ほかのアプリに未配布の変更は無かった。
> 配った後の `pnpm e2e:prod` は全件通った。以下の手順は記録として残す。

### 順序

**agenda → landing → timer。** 静的な 2 本と timer は**間を空けずに続けて流す**。
同期サーバーを再起動するのは最後の `deploy.sh timer` だけである（ほかは `STATIC_ONLY=1`）。

| # | やること | なぜこの位置か |
|---|---|---|
| 1 | 初回の用意（下）で web root を作り、`caddy/60-agenda.conf` を設置して `caddy validate` → reload する（[`../caddy/README.md`](../caddy/README.md) の「設置」） | **置き忘れると `/agenda/` は包括フォールバック（玄関）に吸われ、札を押しても玄関が描き直されるだけになる** |
| 2 | `deploy.sh agenda` | ここから 4 までを続けて流す |
| 3 | `deploy.sh landing` | 玄関に 5 枚目の札が出る。静的の最後に回し、札が見えてから同期サーバーの再起動までを短くする |
| 4 | `deploy.sh timer` | web を配ってから同期サーバーを再起動する |
| 5 | 動作確認（下） | **`pnpm e2e:prod` は 4 まで配り終えてから流す** |

```bash
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh agenda
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh landing
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer    # 同期サーバーもここで入れ替わる
```

### 配布中の窓

いずれも再読込と同期サーバーの再起動で閉じる。

1. **新しい agenda-web × 旧い同期サーバー**: 旧いサーバーは `?tool=agenda` を知らず、1008（Unknown tool）で閉じる。画面は「接続中です…」のまま
2. **新しい landing × 旧い同期サーバー**: 5 枚目の札は見えるが、押した先は 1 と同じ
3. **古い landing × 新しい同期サーバー**: 名簿の `tools` に `"agenda"` が載る。古い玄関は対応表に無い綴りを隠さず生のまま出すので、「agenda にいます」と出る（再読込で「Agenda Timer にいます」に直る）

### 配った後の確認

```bash
HOST=https://<公開ドメイン>
# 断片を置き忘れても玄関が 200 を返すので、状態コードでは見分けられない。資材の接頭辞を見る
curl -s "$HOST/agenda/" | grep -o '/agenda/assets/' | head -1   # 1 行出れば正常
```

⚠ **（初回の配布の記録）配る前の本番へ `pnpm e2e:prod` の `@core` を当てると落ちる。** `/agenda/` がまだ無いので、
`/agenda/` を見る `@core` のテストが失敗する。配り終えてから流す。

## 第 2 段（くりかえし）の配布の順（#429）

シナリオの回数（くりかえし）を足した段の配り方。第 1 段の記録（上）は書き換えない。

> **2026-10-24 に配った**（`v4.4.0`。#435 のフィードバックの直しと #434 のサイトの外側も同じ回）。
> 下の順序どおり timer → agenda と流し、続けて landing → poker → topic → roulette の順に配った（#434 の head と
> 公開ファイルがどのアプリにも入ったため）。**この順は [`../roulette/NOTES.md`](../roulette/NOTES.md) の決め
> （未配布の変更がある静的アプリは landing の前）から外れていた**。全部を数十秒で続けて流し、接続 0 本の時間帯だったので
> 害は無かったが、次は静的アプリを landing の前に置く。
> 配った後の `pnpm e2e:prod` は、agenda の `@core` を含めて 55 passed・1 failed で、赤の 1 件は Caddy 側
> （404 の immutable・[`../caddy/README.md`](../caddy/README.md) の「#434 の配布」）。#437 で `site.conf` を入れ直した後は
> 全件通った。以下の手順は記録として残す。

**`deploy.sh timer` → `deploy.sh agenda` の順に流す。** 同期サーバー（timer の配布で入れ替わる）を先に新しくする。

- 理由: 古い同期サーバーは `v.strictObject` で回数のキーを拒む。新しい画面が先に出ると、回数 2 以上のシナリオを送った時点で
  コマンドが拒まれる。回数 1 は回数のキーを送らない（K10）ので、窓の間も回数 1 の操作は通る
- 逆順の窓（新しい画面 × 古い同期サーバー）は、回数 2 以上を読み込んだ操作だけが失敗する。再読込と同期サーバーの再起動で閉じる
- 同期サーバーを再起動するのは `deploy.sh timer` だけで、ルームがすべて消える。第 1 段と同じく、利用者の明示の指示を得て、使っていない時間帯に行う

```bash
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh timer    # 同期サーバーもここで入れ替わる
TASUKI_SSH_HOST=<ホスト別名> ./deploy/deploy.sh agenda
```

- 配るまで `pnpm e2e:prod` の agenda の `@core` は赤になる（本番にくりかえしの欄が無い）。配ってから流す
- 保存の版は 1 のまま。第 1 段の古いタブ（や v4.3.0 へ戻したとき）は、回数 2 以上の保存だけを一覧に出さない（中身は生のまま残る）
- 配布の窓の間（または v4.3.0 へ戻したとき）に古いタブで、隠れている回数つきの項目と同じ名前で保存すると、同じ名前の項目が 2 つ残る。新しいタブで同じ名前を保存するか削除すれば 1 つにまとまる。中身は消えない
- 配布の窓の間、開いたままの第 1 段の画面が回数 2 以上のルームのシナリオを「ルームに読み込む」で読み込み直すと、展開済みの区切りが回数なしで送られ、1 回分の平らなシナリオになる。新しい画面で読み込み直せば戻る

## 静的サイト

同期サーバーを持ちません。`app.env` に `STATIC_ONLY=1` を置いてあるため:

- `deploy.sh agenda` はビルドと転送だけを行う（バンドル・再起動は飛ばす）
- `setup.sh` は不要（systemd ユニットも sudoers も要らない）
- 用意するのは web root（`/var/www/tasuki-agenda`）と Caddy 断片だけ

## 初回の用意（ホスト側・root）

```bash
# web root を DEPLOY_USER 所有で作る（転送が sudo 不要になる）
sudo install -d -o <DEPLOY_USER> -g <DEPLOY_USER> -m 755 /var/www/tasuki-agenda
# 断片の設置と検証・再読込は ../caddy/README.md の手順に従う
```

## base パスに注意

公開パス `/agenda/` は **`apps/landing/src/tools.ts`・`apps/agenda-web/vite.config.ts` の `base`・
`app.env` の `PUBLIC_PATH`・`caddy/60-agenda.conf` の 4 か所**で揃えている。どれか 1 つでも取り残すと、
白画面か 404 になる。
