/**
 * SC-039: 生きたモジュール内部の到達不能な要素（分岐・データ・公開記号・契約）。
 *
 * `scripts/audit-structure.mjs` から判定の部分だけを移したもの（#361）。走査の宣言（どのパッケージを
 * 照合先・参照元にするか）と組み立ては入口に残る。ここに置くのは、解析対象の文字列や Map を
 * 受け取る純粋関数だけである。
 */

/* ============================================================
 * SC-039: 生きたモジュール内部の到達不能な要素（分岐・データ・公開記号）
 * ============================================================ */

/**
 * SC-039① が測った範囲を指標の値に添える名札（#180）。
 *
 * ①の走査は**広げていない**。{@link sc039aUnreachableBranchInApps} が見るのは
 * `!room.onBreak` という既知のパターン 1 つだけで、対象は
 * {@link METRIC_FILE_PINS} が名指しする 1 ファイルに限られる。それを書かずに
 * 「分岐 0」とだけ出すと、`apps/` 全体に到達不能な分岐が無いと読める。
 * ②③が「timer-core についてのみ 0」を「0」と report していたのが #180 の現象そのもので、
 * ①は同じ形の誤読をまだ残している。**広げないなら、どこを測った 0 なのかを出す。**
 */
export const SC039A_SCOPE = "apps/tasuki-sync の既知パターンのみ";

/**
 * SC-039①: apps/ の到達不能な分岐。
 * 【限界】機械判定が難しいため、既知のパターン（`!room.onBreak`）の検出に留める。
 * 一般の「受理コマンド集合から到達しない条件」の網羅的判定は行わない（spec/plan の指示どおり）。
 *
 * **文字列リテラルとコメントを除去してから照合する。**
 * これを忘れると、**撤去した分岐について説明したコメントに一致して「まだ残っている」と誤判定する。**
 * 実際に T080 で分岐を撤去したあと、撤去の理由を述べたコメント中の記述に一致し、
 * 件数が 1 のまま減らなかった。**コメントは分岐ではない。**
 */
export function sc039aUnreachableBranchInApps(handlersSource) {
  return /!room\.onBreak/.test(stripStringsAndComments(handlersSource)) ? 1 : 0;
}

/**
 * ソースから `export const/function/class/interface/type NAME` の宣言を抽出する。
 *
 * 【欠陥3の修正】以前は const/interface/type のみを対象にしており、
 * `export function` / `export class` を取りこぼしていた
 * （実例: packages/core/src/participants.ts の `countManagers`）。
 */
export function extractPublicDeclarations(source) {
  const decls = [];
  const re = /export\s+(const|function|class|interface|type)\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(source))) decls.push({ kind: m[1], name: m[2] });
  return decls;
}

/**
 * ソースから文字列リテラルとコメントを取り除く。**改行は落とさない。**
 *
 * 完全な字句解析ではない簡易スキャンだが、エスケープ（`\"` 等）は考慮する。
 *
 * 【欠陥4の対応】`isReferencedElsewhere` が文字列リテラルの中身にまで `\bNAME\b` で一致してしまい
 * 誤判定する問題（実例: `ja` が他ファイルの言語コード文字列 `"ja"` に一致してしまう）を避けるため、
 * 参照判定の対象を「識別子としての使用」に近づける前処理として使う。
 *
 * ## 剥がしすぎの向き（#184）
 *
 * このヘルパは**正規表現リテラルを知らない**。`const re = /it's/;` の `/…/` をコードとして
 * 読み進めるため、中のアポストロフィを文字列の開始と誤読する。正しく扱う字句解析を書く道は
 * 採らない（このリポジトリでは手書きの字句解析が 3 回続けて新しい検出漏れを作っている）。
 * 代わりに、**誤読したときの被害をその行の中に閉じ込める**:
 *
 * - `'` と `"` の文字列は**改行をまたげない**（言語仕様）。閉じ引用符が見つからないまま
 *   改行に達したらそこで打ち切る。以前は次の `'` を求めてファイル末尾まで走ったため、
 *   `/it's/` の 1 行だけで**それ以降のソース全体が消えていた**。
 * - 行継続（`\` の直後の改行）とテンプレートリテラル（`` ` ``）は改行をまたぐので、
 *   またいだ改行は結果へ残す。
 *
 * ## 行番号を保つ（#184）
 *
 * ブロックコメント・テンプレートリテラルの中の改行を**そのまま結果へ書き出す**ので、
 * 剥がした後の行番号は元ソースの行番号と一致する。以前は改行ごと落としていたため、
 * 剥がした結果の添字を行番号として報告すると元ファイルとずれた
 * （5 行のブロックコメントで 4 行ずれるのを実測）。
 *
 * **「無いこと」を求める検査はこのヘルパに依存しないこと。** 剥がしすぎは
 * その種の検査を緑（＝見逃し）へ倒す。公開面の検査（`audit-public-surface.mjs`）は
 * この理由で #184 に依存を外し、素の行走査＋コメント行の許可リストへ移した。
 * 残る利用箇所のうち、参照判定（{@link findStaleSymbolExceptions} が使う
 * `isReferencedElsewhere` と推移的な生存性の伝播）は剥がしすぎると
 * 「参照されていない」＝赤へ倒れるので安全側だが、
 * {@link sc039aUnreachableBranchInApps} は「分岐が無いこと」を求めるため緑へ倒れる
 * （被害は上の改行打ち切りで 1 行に閉じ込めたが、同じ行の中では依然として起こりうる）。
 */
export function stripStringsAndComments(source) {
  let result = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      // 改行そのものは消費しない（次の周回で結果へ入る）。
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") result += "\n";
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const spansLines = quote === "`";
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          // 行継続。またいだ改行は残す。
          if (source[i + 1] === "\n") result += "\n";
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        if (source[i] === "\n") {
          // `'` / `"` は改行をまたげない。閉じずに改行へ達したらそこで打ち切る
          // （改行は消費せず、次の周回で結果へ入る）。
          if (!spansLines) break;
          result += "\n";
        }
        i++;
      }
      continue;
    }
    result += ch;
    i++;
  }
  return result;
}

/**
 * `export { name } from "./mod.js"` のような**素通しの再エクスポート文**を取り除く。
 * これを取り除かないと、index.ts が再エクスポートしているだけの記号（例: i18n の ja/en）が
 * 「他ファイルから参照されている」と誤判定される（再エクスポートは消費ではなく通過点）。
 */
function stripNamedReexports(source) {
  // `export type { … } from "…"` も対象にする。
  // T055 で index.ts の `export *` を明示列挙に置き換えた際、型の再エクスポートが
  // `export type { … } from "…"` の形になり、`type` を許さない旧実装ではこれを
  // 取り除けなかった。その結果 **index.ts の再エクスポートが「本物の参照」と数えられ**、
  // SC-039③ が 46 → 9 に落ちた（実際には 1 件も減っていないのに減ったように見えた）。
  // 再エクスポートは消費ではなく通過点であり、参照の根拠にしてはならない。
  return source.replace(/export\s+type\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g, "").replace(
    /export\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?/g,
    "",
  );
}

export function isReferencedElsewhere(name, ownFile, productSources) {
  const re = new RegExp(`\\b${name}\\b`);
  // 記号を公開しているパッケージのディレクトリ（"packages/timer-core/"）。
  const ownPackageDir = /^(packages\/[^/]+\/)/.exec(ownFile)?.[1] ?? null;
  for (const [file, src] of productSources) {
    if (file === ownFile) continue;
    // 欠陥4の修正: 文字列リテラル・コメントを除去してから照合し、識別子としての使用のみを見る。
    if (!re.test(stripStringsAndComments(stripNamedReexports(src)))) continue;
    // 同じパッケージの中なら、識別子が一致すればその記号の参照である（相対 import で届く）。
    if (ownPackageDir === null || file.startsWith(ownPackageDir)) return true;
    // **別のパッケージからの参照は、公開元を取り込んでいるファイルに限る（#214）。**
    // 名前だけで製品コード全体を探すと、**同名の別記号**を根拠に「使われている」と
    // 誤判定する。#214 では poker-core と timer-core が両方 DEFAULT_ERROR_MESSAGE を
    // 公開した時点で、poker 側の 2 行が timer 側の例外を不要と言わせた。
    //
    // 取り込みの判定は**名前空間の綴りに依存させない**（`@tasuki/` を書き写すと、
    // 名前空間を変えたときにここが黙って何も拾わなくなる）。末尾のディレクトリ名だけを見る。
    if (isImportedBy(src, ownPackageDir)) return true;
  }
  return false;
}

/**
 * `source` が `packageDir`（"packages/timer-core/"）のパッケージを取り込んでいるか。
 *
 * import 指定子の**末尾のディレクトリ名**だけを見る（`@tasuki/timer-core` でも
 * 名前空間が変わっても拾えるように）。
 *
 * **サブパスの取り込みも数える**（`@tasuki/timer-core/aggregate` など）。
 * `apps/timer-web` にはサブパスからしか取り込まないファイルが多数あり、
 * クォートだけを見ていると**それらからの参照を生存の根拠として数え落とす**
 * （#214 の敵対的検証が SC-039③ の件数 15→14 の差として実測した）。
 * 直後がクォートか `/` であることまで見るので、`timer-core-extra` のような
 * 前方一致では当たらない。
 */
function isImportedBy(source, packageDir) {
  const name = packageDir.slice("packages/".length).replace(/\/$/, "");
  return new RegExp(`/${escapeForRegExp(name)}['"/]`).test(source);
}

/** 正規表現に埋め込む文字列を安全にする。 */
function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ソース中の「トップレベルの宣言（`export` の有無を問わない `const/function/class/interface/type`）」
 * の開始位置を、出現順にすべて列挙する。
 *
 * 【宣言スパン境界のバグ修正】以前の実装は「次の `export` 宣言まで」を現在の宣言の本体とみなしていた。
 * しかし実際のソース（例: packages/core/src/schemas.ts）では、export された宣言の間に
 * **export されていないトップレベルの補助宣言**（例: `const SessionActCommand = ...`）が挟まる。
 * 「次の export まで」で区切ると、この補助宣言の中身までもが手前の export 宣言の本体に
 * 誤って取り込まれてしまい、(a) 行数の過大計上、(b) 「自ファイル内で参照されているか」の
 * 判定が、実際には別の宣言による参照であるにもかかわらず「自分自身の本体内」と誤認され
 * 検出できない、という 2 つの不具合を引き起こす。宣言の境界は export の有無に関係なく
 * 「次のトップレベル宣言の開始位置」までとするのが正しい。
 */
function allDeclarationStartIndices(source) {
  const re = /^(?:export\s+)?(?:const|function|class|interface|type)\s+[A-Za-z0-9_]+/gm;
  const indices = [];
  let m;
  while ((m = re.exec(source))) indices.push(m.index);
  return indices;
}

/**
 * exportedStartIndex から始まる宣言の本体スパン [start, end) を返す。
 * end は「その後に続く、次のトップレベル宣言（export の有無を問わない）の開始位置」
 * （無ければソース末尾）。
 */
function declarationSpanFrom(source, exportedStartIndex) {
  const boundaries = allDeclarationStartIndices(source);
  const end = boundaries.find((pos) => pos > exportedStartIndex) ?? source.length;
  return { start: exportedStartIndex, end };
}

/**
 * ソースを「トップレベル宣言（`export` の有無を問わない）の開始位置から次のそれまで」で
 * 分割し、各宣言（公開・非公開の両方）の名前と本体テキストを返す。
 *
 * 【非公開の中間宣言も経由点として扱う】`export` されたシンボルの間だけで参照グラフを組むと、
 * 非公開のトップレベル宣言を経由する参照の連鎖が切れてしまう（実例: `packages/timer-core/src/schemas.ts`
 * の `ServerMsgSchema`（公開・生きた根から到達）は非公開の `SnapshotMsg` を配列要素に持ち、
 * `SnapshotMsg` の本体が公開の `RoomSchema` を参照する。`SnapshotMsg` を経由点として扱わないと、
 * 本来生きている `RoomSchema` を誤って死んでいると判定してしまう）。
 * そのため参照グラフのノードは公開・非公開を問わずすべてのトップレベル宣言とし、
 * 「生きた根」の判定（他ファイルから参照されているか）だけを公開シンボルに限定する。
 */
function extractAllTopLevelSymbolSpans(source) {
  const re = /^(?:export\s+)?(const|function|class|interface|type)\s+([A-Za-z0-9_]+)/gm;
  const matches = [];
  let m;
  while ((m = re.exec(source))) matches.push({ kind: m[1], name: m[2], index: m.index });
  return matches.map((cur, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    return { kind: cur.kind, name: cur.name, body: source.slice(cur.index, end) };
  });
}

/**
 * ファイル内の公開シンボルのうち「推移的に生きているもの」の名前集合を返す
 * （戻り値には経由点として使った非公開の中間宣言の名前も含まれ得るが、
 * 呼び出し側は公開シンボルの名前だけを問い合わせるため実害はない）。
 *
 * 【欠陥2の再修正: 推移的な生存性】以前の実装は「自ファイル内で参照されていれば生存」としていたが、
 * これだと「死んだ記号からの参照」まで生存の根拠にしてしまう（実例: `packages/timer-core/src/i18n/ja.ts` の
 * `ja` は同一ファイルの `export type JaMessages = typeof ja;` から参照されているが、
 * `JaMessages` 自体はどの製品コードからも使われていない死んだ型であり、
 * 死んだ記号からの参照を生存の根拠にしてはならない）。
 *
 * 正しい定義:
 * 1. 「生きた根」= 自ファイル以外の製品コードから識別子として参照されている**公開**シンボル
 *    （`isReferencedElsewhere` で判定。テストは productSources に含めないことで FR-090 を満たす）。
 * 2. ある宣言（公開・非公開を問わない）は、生きた根から**同一ファイル内の参照関係を推移的に辿って**
 *    到達できるなら生きている（固定点に達するまで繰り返し伝播させる。非公開の中間宣言を経由する
 *    多段の連鎖にも対応する）。
 */
function computeTransitivelyAliveExportedSymbols(content, ownFile, productSources) {
  const exportedNames = new Set(extractPublicDeclarations(content).map((d) => d.name));
  const spans = extractAllTopLevelSymbolSpans(content);
  const alive = new Set(
    spans
      .filter((s) => exportedNames.has(s.name) && isReferencedElsewhere(s.name, ownFile, productSources))
      .map((s) => s.name),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const aliveName of [...alive]) {
      const aliveSpan = spans.find((s) => s.name === aliveName);
      if (!aliveSpan) continue;
      const body = stripStringsAndComments(aliveSpan.body);
      for (const s of spans) {
        if (alive.has(s.name) || s.name === aliveName) continue;
        if (new RegExp(`\\b${s.name}\\b`).test(body)) {
          alive.add(s.name);
          changed = true;
        }
      }
    }
  }
  return alive;
}

function countDeclarationLines(content, name) {
  const startMatch = new RegExp(`export\\s+const\\s+${name}\\b`).exec(content);
  if (!startMatch) return 0;
  const { start, end } = declarationSpanFrom(content, startMatch.index);
  return content.slice(start, end).split("\n").length;
}

/**
 * SC-039②: 各 packages 配下 src の公開データ（`export const`）のうち、製品コード
 * （各 apps 配下 src と、宣言ファイル自身を除く各 packages 配下 src）から一度も参照されないものの行数合計。
 * **テストからの参照は根拠に含めない**（FR-090。productSources にテストを渡さないこと）。
 */
export function sc039bUnusedPublicData(packageSrcFiles, productSources) {
  let unusedLines = 0;
  for (const [file, content] of packageSrcFiles) {
    const alive = computeTransitivelyAliveExportedSymbols(content, file, productSources);
    for (const decl of extractPublicDeclarations(content)) {
      if (decl.kind !== "const") continue;
      if (alive.has(decl.name)) continue;
      unusedLines += countDeclarationLines(content, decl.name);
    }
  }
  return unusedLines;
}

/**
 * SC-039③: 各 packages 配下 src の公開**値**（`const` / `function` / `class`）のうち、
 * 製品コードから一度も参照されない（＝自ファイル内でのみ使われる。export が不要）ものの件数。
 * **テストからの参照は根拠に含めない**（FR-090）。
 *
 * ## 型は数えない（#223・2026-09-02）
 *
 * `interface` と `type` は対象外である。**SC-039④ と同じ理由**で、
 * 「公開している値の署名から到達できるか」を機械で判定するには型解決が要り、
 * この検査の素朴さと引き換えになる（ADR-0016 追記）。
 *
 * 型を数えていた頃、③が挙げた 16 件のうち **11 件が型で、その 11 件すべてが
 * `index.ts` に載っている公開契約の型だった**（`ProtocolError` は `parseServerMessage` の
 * Result のエラー型、`ParticipantIds` は `createRoom` の引数型…）。ADR-0016 が
 * 「型は署名から到達できるなら残す」と定めた当のものを、③が判定できないまま
 * 未達として数え続けていたことになる。**指標が読み手へ渡していたのは信号ではなく雑音だった。**
 *
 * **見なくなるもの**: `index.ts` にも載っていない、どこからも使われない公開型。
 * これは以後どの検査も見ない（ADR-0016 が④で受け入れたのと同じ受容。型の妥当性は
 * レビューが見る）。
 *
 * ⚠ **「index に載らないから外へは出ない」とは言えない。** `packages/timer-core` は
 * `exports` マップを持たず、app 側の `tsconfig` が `@tasuki/timer-core/*` を
 * ワイルドカードで通すため、**index に載っていないモジュールの `export type` も
 * サブパスで名前ごと取り込める**（#220 で配線を確かめた）。受容の根拠は
 * 「外へ出ないこと」ではなく、**型の妥当性はレビューが見る**という④と同じ割り切りである。
 *
 * `exceptions`（{@link SC039C_EXCEPTIONS} と同じ形）に載る `file::name` の組は数えない。
 * 例外表が腐っていないかは {@link findStaleSymbolExceptions} が別に見る。
 * **ここは腐りを見ない** — 実在しない記号を例外に書けば、ここは黙って数えないだけである。
 */
export function sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources, exceptions = []) {
  // 【②との違い】ここでは間接利用（同一ファイル内の他の公開関数経由での参照）を
  // 「生きている」根拠にしない。③ が数えるのは「export が不要かどうか」であり、
  // 他ファイルが export された名前そのものを直接使っているかだけが判定材料になる。
  // 同一ファイル内でしか使われていない（＝直接 import されていない）なら、
  // その関数経由で内部的に使われていても export は不要である
  // （実例: かつての timer-core の定型のお題のバンク定数は、同じファイルの選択関数から
  // 内部参照されるが、他ファイルは直接 import していないため export 不要＝③対象だった。
  // そのファイルは #91 PR 3 でお題ごと消えた。形は `audit-structure.test.mjs` の造作が持つ）。
  const excepted = new Set(exceptions.map((e) => `${e.file}::${e.name}`));
  let count = 0;
  for (const [file, content] of packageSrcFiles) {
    for (const decl of extractPublicDeclarations(content)) {
      // 型は数えない（上の docstring）。判定に型解決が要るものは最初から見ない。
      if (decl.kind === "interface" || decl.kind === "type") continue;
      if (excepted.has(`${file}::${decl.name}`)) continue;
      if (!isReferencedElsewhere(decl.name, file, productSources)) count++;
    }
  }
  return count;
}

/**
 * `index.ts` の**再エクスポート節**から、公開している名前を「値」と「型」に分けて返す（純粋）。
 *
 * ## 判定は index.ts の書き方だけで行う — **宣言側を読みに行かない**
 *
 * 「その名前が本当に値か型か」は宣言ファイルを読めば分かるが、読みに行くと
 * 判定が字句解析の深さに依存し、穴が増えるたびに**静かに緑へ倒れる**
 * （#184 / #193 で `audit-public-surface.mjs` が実際にたどった道）。
 * ここでは `export type { … }` とインラインの `type` 修飾子という、
 * **書き手が明示した印だけ**を見る。印を書き忘れた型は値として数えられ、
 * 過剰報告（赤）に倒れる。偽陽性はレビューで消せるが、偽陰性は誰にも見えない。
 *
 * ## 何を見ていないか
 *
 * - **`export *`** は扱わない。ADR-0016 決定 2 項目 2 が禁じており、
 *   `scripts/audit-public-surface.mjs` が別に落とす。
 * - **index.ts 自身に書かれた宣言**（`export const X = 1;`）は数えない。
 *   再エクスポート節（`… from '…'`）だけを見る。index を単なる公開面に保つ規約の裏返しであり、
 *   直接宣言を置けばこの指標からは消える（**緑へ倒れる経路**。走査対象は自分たちが書く
 *   エントリであり、この書き方を選ぶ動機が無いことを受容の根拠とする）。
 * - **コメントや文字列の中にある `export { … } from '…'` の字面**も節として拾う。
 *   拾えば実在しない名前が「未使用の値」として数えられるので、倒れる向きは赤である。
 *   ただし**節の中身からはコメントを落とす**（{@link stripCommentsOnly}）。落とさないと、
 *   カンマを含むブロックコメントが分割を壊し、記号名そのものがコメントの断片に化ける
 *   （実測: 節の中でブロックコメントがカンマをまたぐと、記号名が 2 つの断片に割れた。
 *   この docstring 自身がブロックコメントなので、再現例はテストに置いた）。
 */
export function extractContractNames(indexSource) {
  const values = [];
  const types = [];
  for (const m of indexSource.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
    const isTypeClause = Boolean(m[1]);
    for (const raw of stripCommentsOnly(m[2]).split(",")) {
      const entry = raw.trim();
      if (entry === "") continue;
      const isInlineType = /^type\s/.test(entry);
      // **公開名は `as` の右側。** 利用者が書くのはこちらである。
      const name = entry.replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
      if (name === "") continue;
      (isTypeClause || isInlineType ? types : values).push(name);
    }
  }
  return { values, types };
}

/**
/**
 * コメントだけを取り除く（純粋）。**文字列リテラルは残す。**
 *
 * {@link stripStringsAndComments} は使えない。あれは文字列リテラルごと落とすので、
 * `from '@tasuki/poker-core'` の**指定子まで消える**。指定子が消えると
 * {@link extractNamedImportsFromPackage} はどの取り込みも見つけられなくなり、
 * 全記号が「取り込まれていない」に化ける（実測で確認した）。
 *
 * **剥がしすぎる向きは赤（＝過剰報告）に固定される。** 本物の import 文を巻き込んで
 * 消せば、その記号は「取り込まれていない」と数えられるだけである。
 * 逆に剥がし足りないと記号が黙って「生きている」側へ倒れる（緑＝見逃し）ので、
 * 迷ったら消す側へ倒す。
 */
function stripCommentsOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * `source` が `packageName` のパッケージ**本体**から名前つきで取り込んでいる記号名（純粋）。
 *
 * **サブパスからの取り込みは数えない。** `@tasuki/timer-core/aggregate` は `index.ts` を
 * 通らないため、index の列挙が使われた根拠にならない（{@link isImportedBy} が
 * SC-039③ のためにサブパスまで数えるのと、ここは意図的に向きが違う）。
 *
 * 名前空間の綴りには依存させない（`@tasuki/` を書き写すと、名前空間を変えたときに
 * ここが黙って何も拾わなくなる）。末尾のパッケージ名までで終わっていることだけを見る。
 *
 * **末尾一致だけでは足りない。** 相対 import は同名の隣接モジュールに当たる —
 * `packages/poker-core/src/index.ts` の `export { … } from './protocol'` は
 * `/protocol$` に一致し、`@tasuki/protocol` からの取り込みに化ける（#182 の実測）。
 * 化けると記号が黙って「生きている」側へ倒れるので、**素の（相対でも絶対でもない）
 * 指定子だけを見る**。
 *
 * **取り込み側の `as` は左側が公開名。** `import { a as localName }` が使っているのは `a` である
 * （{@link extractContractNames} が右側を採るのと逆向きになる）。
 *
 * ## コメントは先に落とす — **ここを怠ると緑（＝見逃し）に倒れる**
 *
 * 素のソースへ正規表現を当てると、**コメントアウトされた import 文**や docstring 中の
 * 例示（行頭が `*` の行）を「取り込みあり」と数え、死んだ公開値が黙って生きている側へ倒れる。
 * 実測で 3 形すべてが拾われた（#182 の敵対的検証）。
 *
 * 歯止めは 2 つ重ねる。**どちらも無状態である。**
 *
 * 1. {@link stripCommentsOnly} でコメントを落とす（文字列リテラルは残す。理由はそちらの docstring）
 * 2. `import` / `export` が**行頭（字下げは許す）から始まる**ことを求める。
 *    docstring の `* import { … }` も `const s = "import { … }"` もこれで外れる
 *
 * ## 何を見ていないか
 *
 * ### 緑（＝見逃し）に倒れる — 行頭から import 文が始まる文字列リテラル
 *
 * 複数行の文字列（テンプレートリテラルなど）の中に、**行頭から始まる完全な import 文**を
 * 書くと拾われる。塞ぐには文字列リテラルを落とすしかないが、それをすると
 * 指定子ごと消えて検査が丸ごと空振りする（{@link stripCommentsOnly} 参照）。
 * 走査対象は自分たちが書く製品コードであり、この書き方を選ぶ動機が無いことを受容の根拠とする。
 *
 * ### 赤（＝過剰報告）に倒れる — 放置してよい
 *
 * **名前空間ごとの取り込み**（`import * as core from '@tasuki/poker-core'` から
 * `core.computeStats` を使う形）は拾わない。中括弧を持たないためである。
 * この形の利用者がいる記号は「取り込まれていない」と数えられる。
 * 2026-09-01 の実測ではリポジトリ全体で 0 件だった。
 *
 * ブロックコメントの除去が**行をまたいで剥がしすぎた**場合も、本物の import 文が
 * 消えるだけなので同じく赤へ倒れる。
 */
export function extractNamedImportsFromPackage(source, packageName) {
  const names = new Set();
  const isOwnPackage = new RegExp(`/${escapeForRegExp(packageName)}$`);
  for (const m of stripCommentsOnly(source).matchAll(
    /^[ \t]*(?:import|export)\s+(?:type\s+)?(?:[A-Za-z0-9_$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm,
  )) {
    const specifier = m[2];
    if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
    if (!isOwnPackage.test(specifier)) continue;
    for (const raw of m[1].split(",")) {
      const entry = raw.trim().replace(/^type\s+/, "");
      if (entry === "") continue;
      const name = entry.split(/\s+as\s+/)[0].trim();
      if (name !== "") names.add(name);
    }
  }
  return names;
}

/**
 * SC-039④: 各パッケージの `index.ts` が列挙する**値**のうち、
 * そのパッケージの外の製品コードから一度も取り込まれないものの件数（#182）。
 *
 * ## ②③ との違い — 測っているのは「`export` の要否」ではなく「公開契約の要否」
 *
 * ③ は宣言ファイルの `export` が要るかを見る。④ は**パッケージの公開面（`index.ts`）に
 * 載せる理由があるか**を見る。両者は独立している。実測（#182・2026-09-01）では、
 * `computeStats` は `snapshot.ts` が相対 import で使うので③では生きているが、
 * index 経由の利用者は 1 人もいないので④では死んでいた。逆に③が数える記号でも、
 * index が再エクスポートし公開署名から到達できる型は公開契約として生きている。
 *
 * ## 型を数えない理由
 *
 * 型は**取り込まれなくても契約の一部**である。`parseClientMessage(raw: string):
 * Result<ClientMessage, ProtocolError>` は型推論が効くので誰も `ProtocolError` を import しないが、
 * 注釈を書きたい利用者は名前を要求する。「公開している値の署名から到達できるか」を
 * 機械で判定するには型解決が要り、この検査の素朴さと引き換えになるため、
 * **型は最初から数えない**（ADR-0016 追記 2026-09-01）。
 *
 * **テストからの参照は根拠に含めない**（FR-090。productSources にテストを渡さないこと）。
 * 自パッケージの中からの取り込みも根拠にしない（index に載せる理由は外から使われることである）。
 */
export function sc039dContractOnlyValues(contractFiles, productSources) {
  let count = 0;
  for (const [file, source] of contractFiles) {
    const packageName = /^packages\/([^/]+)\//.exec(file)?.[1];
    if (packageName === undefined) {
      // 黙って 0 件にしない。走査対象の組み立てが壊れたときは赤で気づけること。
      throw new Error(`SC-039④ の走査対象が packages/ 層のパスではありません: ${file}`);
    }
    const ownPrefix = `packages/${packageName}/`;
    // サブパスの入口（`src/<sub>/index.ts`。`package.json` の `exports` の `./<sub>`）は、そのサブパスからの
    // 取り込みだけを根拠にする（#371。`@tasuki/web-kit/reader`）。本体の入口は従来どおり本体からの取り込みだけ。
    // ⚠ 前提: サブパスの入口は `src/<sub>/index.ts` に置き、`exports` の `./<sub>` と同じ名前にする。本体の入口を
    // 下位のディレクトリに置くパッケージ（`exports["."]` が `src/x/index.ts`）は無く、置くとこの数え方は外れる
    // （報告だけの指標で、外れたときは公開契約の未使用が増えて見える）。
    const subpath = /^packages\/[^/]+\/src\/(.+)\/index\.tsx?$/.exec(file)?.[1];
    const specifierTail = subpath === undefined ? packageName : `${packageName}/${subpath}`;
    const importedFromOutside = new Set();
    for (const [f, src] of productSources) {
      if (f.startsWith(ownPrefix)) continue;
      for (const name of extractNamedImportsFromPackage(src, specifierTail)) {
        importedFromOutside.add(name);
      }
    }
    for (const name of extractContractNames(source).values) {
      if (!importedFromOutside.has(name)) count++;
    }
  }
  return count;
}

/**
 * SC-039 まとめ。4 種の内訳をまとめて返す（他の SC 関数と異なり複合値）。
 */
export function sc039UnreachableElements({
  handlersSource,
  packageSrcFiles,
  productSources,
  contractFiles,
  exceptions = [],
}) {
  return {
    unreachableBranches: sc039aUnreachableBranchInApps(handlersSource),
    unusedPublicDataLines: sc039bUnusedPublicData(packageSrcFiles, productSources),
    selfOnlyPublicSymbols: sc039cSelfOnlyPublicSymbols(
      packageSrcFiles,
      productSources,
      exceptions,
    ),
    contractOnlyValues: sc039dContractOnlyValues(contractFiles, productSources),
  };
}
