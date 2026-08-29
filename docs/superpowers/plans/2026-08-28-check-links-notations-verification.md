# #156 破壊検証の記録（リンク検査が見ていなかった 4 表記）

Issue #156 の完了条件 E5 が要求する記録。**壊す前と壊した後の両方を数え、
固定文字列の `grep -cF` で「壊れたこと自体」を先に確認してから測っている**
（BRE の `grep -c` は実在する行に 0 を返すことがある）。

- 対象コミット: `fix/156-check-links-notations`（main `1a48edf` から分岐）
- **測定時点: `e28c401`**（全行をこのコミットの内容に対して測り直した。
  この測り直しを反映する追随コミットは本記録の文面しか変えていないため、
  検査対象の実体は `e28c401` と同じ）
- 対照実行（壊さない状態）: `node scripts/check-links.mjs` → `exit=0`・
  `リンク検査 OK（走査 <N> ファイル）`。測定時点で **N=221**
  （`git ls-files '*.md' | wc -l`）
- 復旧の確認: 各回とも `git status --porcelain` が空・`exit=0` に戻ることを確認

## この記録の読み方（可変な数値の扱い）

検査の出力には、**測るたびに変わる数値**が混ざる（対象ファイルの行数・走査した
ファイル数・引用元の行番号）。この記録では次の規約で書く。

- 出力の**可変部分は `<N>` `<L>` のように書き**、実測値は「測定時点で N=…」と
  **測り直せるコマンドつきで**併記する
- 数値そのものは消さない。**破壊検証の記録は「そのとき何が出たか」を残すのが目的**で、
  数値を消すと「本当に実行したのか」が確かめられなくなる
- 代わりに、**その数値がいつの・何の測定かを明示する**。読者は併記のコマンドで
  現在値を出し、`<N>` に入れて突き合わせられる

**この規約は後付けではない。**初版のこの記録は、同じ PR の中で 3 つの数値が腐った。

| 腐った数値 | 初版の記述 | 測定時点の実測 | 腐った理由 |
|---|---|---|---|
| 走査ファイル数 | 220 | **221** | **この記録自身**が `e28c401` で追加され、走査対象が 1 件増えた |
| ② の対象行数 | 532 | **547** | 同じ PR の後続コミット `e496ca0`（判定を `main()` から切り出す）で `scripts/check-links.mjs` が伸びた |
| E1 の引用元行 | 憲法 130 行目 | **123 行目** | 転記の誤り（後述） |

前 2 件は **`docs/adr/0009` の追記が「件数の正本は `MISSING_PATH_EXCEPTIONS`
そのものだ」と決めたのと同じ誤り**を、その決定を書いた PR の中で犯していた。
**列挙・数値は腐る。指すなら機構（コマンド）を指す。**

## 1. 現役文書をわざと壊す（E1〜E4）

挿入先はすべて `docs/guides/architecture.md` の 2 行目（`sed -i '1a …'`）。

追試の雛形（`<挿入する行>` を表の「挿入した文字列」に置き換える）:

```bash
grep -cF '<目印>' docs/guides/architecture.md      # 壊す前（0 のはず）
sed -i '1a <挿入する行>' docs/guides/architecture.md
grep -cF '<目印>' docs/guides/architecture.md      # 壊した後（1 のはず）
node scripts/check-links.mjs; echo "exit=$?"
git checkout -- docs/guides/architecture.md && git status --porcelain   # 空
```

| # | 表記 | 挿入した文字列 | 壊す前 `grep -cF` | 壊した後 `grep -cF` | 検査の出力 | exit |
|---|---|---|---|---|---|---|
| ① | 拡張子なしのディレクトリ参照 | `` `apps/poker-sync/src/nosuchdir` `` | 0 | 1 | `docs/guides/architecture.md:2 実在しないパスです → \`apps/poker-sync/src/nosuchdir\`` | 1 |
| ①-2 | ADR 番号の接頭辞 | `` `docs/adr/0099` `` | 0 | 1 | `docs/guides/architecture.md:2 対応する ADR がありません → \`docs/adr/0099\`` | 1 |
| ② | `path:line` の行番号 | `` `scripts/check-links.mjs:99999` `` | 0 | 1 | `docs/guides/architecture.md:2 行番号が実在しません（対象は <N> 行） → \`scripts/check-links.mjs:99999\`` | 1 |
| ③ | ネストした角括弧 | `[![alt](../adr/0002-document-system-three-layers.md)](no-such-outer.md)` | 0 | 1 | `docs/guides/architecture.md:2 参照先がありません → no-such-outer.md` | 1 |
| ④ | タイトル付きリンク | `[a](./no-such-title.md "title")` | 0 | 1 | `docs/guides/architecture.md:2 参照先がありません → ./no-such-title.md` | 1 |

② の `<N>` は `scripts/check-links.mjs` の行数。測定時点で **N=547**
（`wc -l scripts/check-links.mjs`）。

③ は**内側の参照先を実在させて外側だけを壊している**。内側も壊すと、
どちらを検出したのか区別できない。**内側の ADR は省略せずフルネームで書く** —
初版は `0002-….md` と省いており、そのまま打つと内側も実在せずに
「参照先がありません」が 2 件出て、③ の主旨（外側だけを壊す）が崩れる。

### 最初の ① は緑になった（対照として残す）

最初は `apps/poker-sync/src/application` を挿入したが `exit=0` のままだった。
**#165 のポート/アダプタ再編でこのディレクトリが実在するようになっていた**ためで、
検査の欠陥ではない。Issue #156 が「本物の腐り 1 件」として挙げていたものは、
本作業の時点では既に解消していた。**このすり抜けは、壊し方そのものを疑わないと
「検査が効かない」と誤読するところだった。**

## 2. 例外表をわざと壊す

| # | 壊し方 | 壊れたことの確認 | 検査の出力 | exit |
|---|---|---|---|---|
| E1 | `MISSING_PATH_EXCEPTIONS` の `packages/core` を別名へ | `grep -cF packages/core-REMOVED` → 0 → 1 | `docs/constitution.md:<L> 実在しないパスです`＋ 使われていない例外が残っています | 1 |
| E2 | `STALE_LINE_REF_EXCEPTIONS` の `raw` を当たらない値へ | `grep -cF server.ts:244` → 1 → 0 | `行番号が実在しません（対象は <N> 行）`＋ 使われていない例外が残っています | 1 |

- E1 の `<L>` は `docs/constitution.md` で `packages/core` を引用している行。
  測定時点で **L=123**（`grep -nF 'packages/core' docs/constitution.md`）
- E2 の `<N>` は `apps/poker-sync/src/server.ts` の行数。測定時点で **N=19**
  （`wc -l apps/poker-sync/src/server.ts`）。赤が出る側の引用は
  `docs/adr/0016-core-domain-representation.md:70`

**どちらも「検出漏れ」と「腐った例外」の 2 件が同時に出る。**
例外を消せば赤が消える、という逃げ道が無いことの確認でもある。

### E1 の「130 行目」は転記の誤りだった

初版は「憲法 130 行目」と書いていたが、実測は **123 行目**。
`docs/constitution.md` は main `1a48edf` から測定時点まで**一度も変わっていない**
（`git log 1a48edf..HEAD -- docs/constitution.md` が空）ので、
**ずれは腐りではなく転記の誤り**である。

原因も特定できた。**130 行目は隣の例外エントリ `apps/web` の引用元**で、
そちらを壊すと `docs/constitution.md:130 実在しないパスです → \`apps/web\`` が出る。
`MISSING_PATH_EXCEPTIONS` に並ぶ 2 つの Sync Impact Report 例外
（`packages/core` と `apps/web`）の**行番号を取り違えて写した**。
**隣接する似た 2 件は、片方を測って片方を写すと入れ替わる。**

## 3. 変異検査（既存テストが恒真化していないか）

`node --test scripts/check-links.test.mjs` は壊す前 74 件すべて緑
（`# tests 74` / `# pass 74` / `# fail 0`）。

**変異は「意図」ではなく「置き換えた式そのもの」で書く。** 言い換えで書くと、
読者の解釈次第で検出件数が変わる（M2 で実際に起きた。後述）。

| # | 変異（置換前 → 置換後） | 壊した後 |
|---|---|---|
| M1 | `isRepoPathLike` 末尾の `return true;` → `return /\.[A-Za-z0-9]+(:\d+(-\d+)?)?$/.test(text);`（拡張子の要求を戻す） | fail 2 |
| M2 | `line.matchAll(/\]\(([^)]*)\)/g)` → `line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)`（#156 以前の式へ戻す） | fail 2 |
| M3 | `const target = m[1].trim().split(/\s+/)[0];` → `const target = m[1].trim();`（題名を落とさない） | fail 1 |
| M4 | `if (total === null \|\| lineRef <= total) return {};` → `if (total === null \|\| true) return {};` | fail 2 |
| M5 | `const adrRef = isAdrNumberRef(target);` → `const adrRef = false;` | fail 2 |
| M6 | `findMissingPathException` の `(e.doc === undefined \|\| e.doc === doc)` → `true` | fail 1 |
| M7 | `checkCodePathRef` の `if (exception) return { exception };` 2 箇所 → `if (exception) return {};` | fail 1 |

**7/7 検出。** ただし M4・M5 は**最初は 0 件検出だった** — 判定が `main()` の中に
しか無く、単体テストから触れなかったためである。`checkCodePathRef` として
切り出してから再測して赤にした。**「検査を足したのにテストが壊せない」は、
テストの不足ではなく置き場所の誤りだった。**

### M2 は「戻す」の解釈で件数が変わる

初版は M2 を「相対リンクをラベルつき正規表現へ戻す」とだけ書いていた。
その言葉どおりラベル要求 `\[[^\]]*\]` だけを足して中身を `[^)]*` のまま残すと、
落ちるのは③のテスト 1 件だけで **fail 1** になる。**fail 2 になるのは、
文字クラスも `[^)\s]+` へ戻したとき**（③と④の両方が落ちる）。
表に置換後の式そのものを書いたのはこのため。

追試の雛形:

```bash
cp scripts/check-links.mjs /tmp/check-links.orig.mjs
# 置換（表の「置換前 → 置換後」を適用）。適用できたことを固定文字列で確認する
grep -cF '<置換後の式>' scripts/check-links.mjs   # 0 → 1 を確認
node --test scripts/check-links.test.mjs | grep -E '^# (tests|pass|fail)'
git checkout -- scripts/check-links.mjs && git status --porcelain   # 空
```
