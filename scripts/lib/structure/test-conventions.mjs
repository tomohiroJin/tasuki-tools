/**
 * テストの規約の指標（SC-028・SC-029・SC-030・SC-031・SC-032・SC-036）と、その共通の土台
 * （テスト名の抽出・テスト本体の分割）。
 *
 * `scripts/audit-structure.mjs` から判定の部分だけを移したもの（#361）。走査の宣言と組み立ては
 * 入口に残る。ここに置くのは、解析対象の文字列や Map を受け取る純粋関数だけである。
 */

/* ============================================================
 * SC-028: テストダブルの重複定義
 * ============================================================ */

/**
 * testFiles（Map<相対パス, 内容>）から Fake・Spy・Stub・Mock 系の定義箇所を集計し、
 * 2 箇所以上で定義されている「種類」の数を返す。
 *
 * 【欠陥1の修正】以前は「同名が2ファイル以上」で数えていたが、これでは同一ファイル内での
 * 重複定義（例: apps/web/test/platform/sound.test.ts 内で FakeAudio が5回、FakeOsc が2回、
 * FakeGain が2回、別々に定義されている）を見落とす。FR-097（テスト用代替実装は単一の箇所で
 * 定義されること）の違反はファイル境界とは無関係に起こるため、ファイル境界を問わず
 * 「定義箇所（出現回数）」で数える。
 */
export function sc028DuplicateTestDoubles(testFiles) {
  const occurrenceCountByName = new Map();
  const re = /\b(?:class|function|const)\s+((?:Fake|Spy|Stub|Mock)[A-Za-z0-9_]*)/g;
  for (const [, content] of testFiles) {
    let m;
    while ((m = re.exec(content))) {
      const name = m[1];
      occurrenceCountByName.set(name, (occurrenceCountByName.get(name) ?? 0) + 1);
    }
  }
  let count = 0;
  for (const occurrences of occurrenceCountByName.values()) {
    if (occurrences >= 2) count++;
  }
  return count;
}

/* ============================================================
 * it/test の第 1 引数（テスト名）抽出。SC-029/030/031/032/036 の共通土台
 * ============================================================ */

/**
 * ソースから `it(...)` / `test(...)`（`.skip` 等の修飾も可）の第 1 引数の文字列を抽出する。
 * describe は対象外（spec の計測の定義に従う）。
 */
export function extractTestNames(content) {
  const names = [];
  const re = /\b(?:it|test)(?:\.\w+)?\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = re.exec(content))) names.push(m[2]);
  return names;
}

export const SPEC_ID_RE = /T\d{3}|FR-\d{3}|SC-\d{3}|R\d-\d|US\d|G\d|#\d+|\bE\d+\b/;

/**
 * SC-029: it/test の第 1 引数に仕様の識別番号を含むものの件数。
 *
 * `exceptions` は {@link SC029_EXCEPTIONS} と同じ形（`{ file, reason }` の配列）を受ける。
 * **除外は分母から行う**（SC-032 の例外表と同じ作法。{@link sc032GwtMarkers} を参照）。
 *
 * @param testFiles `Map<リポジトリ相対パス, ソース>`
 * @param exceptions 例外表（`{ file, reason }` の配列）
 */
export function sc029SpecIdsInNames(testFiles, exceptions = []) {
  const excepted = new Set(exceptions.map((e) => e.file));
  let count = 0;
  for (const [file, content] of testFiles) {
    if (excepted.has(file)) continue;
    for (const name of extractTestNames(content)) {
      if (SPEC_ID_RE.test(name)) count++;
    }
  }
  return count;
}

const CALL_WORDS = ["呼ぶ", "呼び出す", "呼ばれる", "呼び出され", "spy", "モックが"];

/**
 * SC-030: テスト名が内部の関数名の言い回し、または「呼ぶ/呼ばれる/呼び出される/spy/モックが」を
 * 含むものの件数。判定は語の出現による（spec の注記のとおり、主語かどうかは機械判定しない）。
 */
export function sc030CallNamesInNames(testFiles) {
  let count = 0;
  for (const [, content] of testFiles) {
    for (const name of extractTestNames(content)) {
      const lower = name.toLowerCase();
      if (CALL_WORDS.some((w) => lower.includes(w.toLowerCase()) || name.includes(w))) count++;
    }
  }
  return count;
}

/* ============================================================
 * テスト本体の行範囲分割。SC-031/032 の共通土台
 * ============================================================ */

/**
 * ファイル内容を、テスト 1 件ずつの行配列に分割する。
 *
 * **終端は「その `it(` と同じ字下げで閉じる行」とする。**
 * spec の操作的定義は「次の `it`/`test`/末尾まで」と書いているが、これをそのまま実装すると
 * **テストの外側にある行まで本体に数えてしまう**。実例（`decide.test.ts`）:
 *
 * ```
 *   it("… 変わらない", () => {
 *     const result = decide(…);          ← 本体はここまでの 2 行
 *     expect(result…).toBe("SessionCompleted");
 *   });                                  ← 以降はテストの外
 * });                                    ← describe の閉じ
 *
 * // ─── START ───
 *
 * describe("decide: START", () => {      ← 次の describe の開始
 * ```
 *
 * 「次の `it(` まで」で切ると、この閉じ括弧 2 つまで本体に数え、
 * **実質 2 行のテストが「4 行」と判定される**。その結果 SC-032 の分母が水増しされ、
 * spec が明示的に対象外とした「本体 2 行以下のテスト」にまで区切りを要求してしまう。
 *
 * 字下げでの終端判定は、整形済みのコードであることに依存する（本リポジトリは prettier 整形済み）。
 * 見つからない場合は従来どおり次の `it`/末尾までにフォールバックする。
 */
export function splitIntoTestBodies(content) {
  const lines = content.split("\n");
  const testStartRe = /^(\s*)(?:it|test)(?:\.\w+)?\s*\(/;
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    const m = testStartRe.exec(lines[i]);
    if (!m) continue;
    const indent = m[1];
    const closeRe = new RegExp(`^${indent}\\}\\)`);
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (closeRe.test(lines[j])) {
        end = j + 1;
        break;
      }
      // 終端が見つからないまま次のテストに達したら、そこで切る（従来の挙動へのフォールバック）
      if (testStartRe.test(lines[j])) {
        end = j;
        break;
      }
    }
    bodies.push(lines.slice(i, end));
  }
  return bodies;
}

/**
 * SC-031: 前提の構築段階に置かれた検証記述（`expect(...isOk()).toBe(true)`）の件数。
 * 「そのテスト内により後ろの expect が存在するもの」だけを数える。
 * 同形の記述でも、そのテストの最後の expect であるものは検証（Then）そのものとみなし除外する
 * （spec: 当初 95 件としていたが、うち 11 件がこれに該当したため 84 件に訂正した箇所）。
 */
export function sc031GuardExpects(testFiles) {
  const isOkRe = /expect\([^)]*isOk\(\)[^)]*\)\.toBe\(true\)/g;
  const expectRe = /expect\(/g;
  let total = 0;
  for (const [, content] of testFiles) {
    for (const bodyLines of splitIntoTestBodies(content)) {
      const body = bodyLines.join("\n");
      const isOkMatches = [...body.matchAll(isOkRe)];
      if (isOkMatches.length === 0) continue;
      const allExpectPositions = [...body.matchAll(expectRe)].map((m) => m.index);
      for (const match of isOkMatches) {
        const hasLaterExpect = allExpectPositions.some((pos) => pos > match.index);
        if (hasLaterExpect) total++;
      }
    }
  }
  return total;
}

const GIVEN_RE = /\/\/\s*(Given|準備)/;
const WHEN_RE = /\/\/\s*(When|操作)/;

function isMeaningfulLine(line) {
  const t = line.trim();
  return t !== "" && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
}

/**
 * テスト本体のうち、実質的な記述行数を数える。
 * `it(...) => {` の開始行と `});` の閉じ行はテスト本体の定型部分であり、
 * 前提・操作・検証の実質的な記述ではないため、本体の先頭行・末尾行を除いてから数える
 * （これを除かないと、1 アサーションのみの最小構成テストでも「開始行+検証行+閉じ行」で
 * 3 行に達してしまい、「1 行で完結するテストに区切りを付けても意味がない」という
 * spec の意図（SC-032 の除外規定）と食い違う）。
 */
function countMeaningfulBodyLines(bodyLines) {
  const inner = bodyLines.slice(1, -1);
  return inner.filter(isMeaningfulLine).length;
}

/**
 * テスト本体が前提・操作の区切りを持つか。
 *
 * SC-032 の分子と、例外表の腐り判定（{@link findStaleTestExceptions} の「もう要らない」）が
 * **同じ 1 つの述語**を使う。片方だけ書き換えると、区切りが付いたのに例外が残る状態を
 * 検知できなくなる。
 */
export function hasGwtMarkers(body) {
  return GIVEN_RE.test(body) && WHEN_RE.test(body);
}

/**
 * テスト本体の**先頭行**から、そのテストの名前（`it(...)` の第 1 引数の文字列）を取る。
 * 取れなければ null。
 *
 * ## 何を見ていないか — **「足りる」とは言わない**
 *
 * - **先頭行しか見ていない。** `it.each([…])("… %s", …)` のように名前が先頭行に
 *   現れない書き方では null になる。その場合そのテストは例外表で名指しできず、
 *   **従来どおり分母に入る**（例外に載せられないだけで、指標は静かに緩まない）。
 * - **同名のテストを区別していない。** 同じファイルに同じ名前が 2 件あれば、
 *   例外はその両方に掛かる。
 */
export function testNameOfBody(bodyLines) {
  const names = extractTestNames(bodyLines[0] ?? "");
  return names.length > 0 ? names[0] : null;
}

/**
 * SC-032: 本体が 3 行以上（空行・コメント行を除く）のテストにおいて、
 * `// Given` と `// When`（または準備/操作）の両方を含むものの割合を求める。
 *
 * 【計測単位についての注記】spec.md の操作的定義表は文言上「分母=テスト」「分子=ファイル」と
 * 単位が食い違って読める（424行目）。単位の異なる分子分母で割合を出すことはできないため、
 * 本実装は分母・分子とも「テスト本体単位」で統一する（FR-091 の対象が個々のテストであることとも整合する）。
 * この解釈の経緯は baseline.md に記録する。
 *
 * 戻り値は { denominator, numerator, ratio }。他の SC 関数と異なり件数が 1 つに定まらない
 * （分子・分母の 2 値が要る）ため、他関数と違う形の戻り値になっている。
 *
 * `exceptions`（{@link SC032_EXCEPTIONS} と同じ形）に載る `file::testName` の組は
 * **分母に数える前に**外す。分子に足して「満たしたことにする」のではない
 * （ADR-0006 決定 2 の「本体が 2 行以下の自明なテストは対象外」と同じ扱い）。
 * 例外表が腐っていないかは {@link findStaleTestExceptions} が別に見る。
 * **ここは腐りを見ない** — 実在しないテストを例外に書けば、ここは黙って何も外さないだけである。
 */
export function sc032GwtMarkers(testFiles, exceptions = []) {
  const excepted = new Set(exceptions.map((e) => `${e.file}::${e.testName}`));
  let denominator = 0;
  let numerator = 0;
  for (const [file, content] of testFiles) {
    for (const bodyLines of splitIntoTestBodies(content)) {
      const name = testNameOfBody(bodyLines);
      if (name !== null && excepted.has(`${file}::${name}`)) continue;
      const meaningfulCount = countMeaningfulBodyLines(bodyLines);
      if (meaningfulCount < 3) continue;
      denominator++;
      if (hasGwtMarkers(bodyLines.join("\n"))) numerator++;
    }
  }
  const ratio = denominator === 0 ? 1 : numerator / denominator;
  return { denominator, numerator, ratio };
}

/**
 * SC-036: it/test の総数（描画に依らずファイル横断でカウント）。
 */
export function sc036TestCount(testFiles) {
  let count = 0;
  for (const [, content] of testFiles) count += extractTestNames(content).length;
  return count;
}
