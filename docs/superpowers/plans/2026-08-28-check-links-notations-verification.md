# #156 破壊検証の記録（リンク検査が見ていなかった 4 表記）

Issue #156 の完了条件 E5 が要求する記録。**壊す前と壊した後の両方を数え、
固定文字列の `grep -cF` で「壊れたこと自体」を先に確認してから測っている**
（BRE の `grep -c` は実在する行に 0 を返すことがある）。

- 対象コミット: `fix/156-check-links-notations`（main `1a48edf` から分岐）
- 対照実行（壊さない状態）: `node scripts/check-links.mjs` → `exit=0`・
  `リンク検査 OK（走査 220 ファイル）`
- 復旧の確認: 各回とも `git status --porcelain` が空・`exit=0` に戻ることを確認

## 1. 現役文書をわざと壊す（E1〜E4）

挿入先はすべて `docs/guides/architecture.md` の 2 行目（`sed -i '1a …'`）。

| # | 表記 | 挿入した文字列 | 壊す前 `grep -cF` | 壊した後 `grep -cF` | 検査の出力 | exit |
|---|---|---|---|---|---|---|
| ① | 拡張子なしのディレクトリ参照 | `` `apps/poker-sync/src/nosuchdir` `` | 0 | 1 | `docs/guides/architecture.md:2 実在しないパスです → \`apps/poker-sync/src/nosuchdir\`` | 1 |
| ①-2 | ADR 番号の接頭辞 | `` `docs/adr/0099` `` | 0 | 1 | `docs/guides/architecture.md:2 対応する ADR がありません → \`docs/adr/0099\`` | 1 |
| ② | `path:line` の行番号 | `` `scripts/check-links.mjs:99999` `` | 0 | 1 | `docs/guides/architecture.md:2 行番号が実在しません（対象は 532 行） → \`scripts/check-links.mjs:99999\`` | 1 |
| ③ | ネストした角括弧 | `[![alt](../adr/0002-….md)](no-such-outer.md)` | 0 | 1 | `docs/guides/architecture.md:2 参照先がありません → no-such-outer.md` | 1 |
| ④ | タイトル付きリンク | `[a](./no-such-title.md "title")` | 0 | 1 | `docs/guides/architecture.md:2 参照先がありません → ./no-such-title.md` | 1 |

③ は**内側の参照先を実在させて外側だけを壊している**。内側も壊すと、
どちらを検出したのか区別できない。

### 最初の ① は緑になった（対照として残す）

最初は `apps/poker-sync/src/application` を挿入したが `exit=0` のままだった。
**#165 のポート/アダプタ再編でこのディレクトリが実在するようになっていた**ためで、
検査の欠陥ではない。Issue #156 が「本物の腐り 1 件」として挙げていたものは、
本作業の時点では既に解消していた。**このすり抜けは、壊し方そのものを疑わないと
「検査が効かない」と誤読するところだった。**

## 2. 例外表をわざと壊す

| # | 壊し方 | 壊れたことの確認 | 検査の出力 | exit |
|---|---|---|---|---|
| E1 | `MISSING_PATH_EXCEPTIONS` の `packages/core` を別名へ | `grep -cF packages/core-REMOVED` → 1 | 実在しないパスです（憲法 130 行目）＋ 使われていない例外が残っています | 1 |
| E2 | `STALE_LINE_REF_EXCEPTIONS` の `raw` を当たらない値へ | `grep -cF server.ts:244` → 1 → 0 | 行番号が実在しません（対象は 19 行）＋ 使われていない例外が残っています | 1 |

**どちらも「検出漏れ」と「腐った例外」の 2 件が同時に出る。**
例外を消せば赤が消える、という逃げ道が無いことの確認でもある。

## 3. 変異検査（既存テストが恒真化していないか）

`node --test scripts/check-links.test.mjs` は壊す前 74 件すべて緑。

| # | 変異 | 壊した後 |
|---|---|---|
| M1 | `isRepoPathLike` に拡張子の要求を戻す | fail 2 |
| M2 | 相対リンクをラベルつき正規表現へ戻す | fail 2 |
| M3 | 括弧の中身から題名を落とさない | fail 1 |
| M4 | 行数の比較を恒真にする | fail 2 |
| M5 | ADR 番号の判定を常に false にする | fail 2 |
| M6 | 例外表の `doc` スコープを無視する | fail 1 |
| M7 | 例外に当たっても使用記録を返さない | fail 1 |

**7/7 検出。** ただし M4・M5 は**最初は 0 件検出だった** — 判定が `main()` の中に
しか無く、単体テストから触れなかったためである。`checkCodePathRef` として
切り出してから再測して赤にした。**「検査を足したのにテストが壊せない」は、
テストの不足ではなく置き場所の誤りだった。**
