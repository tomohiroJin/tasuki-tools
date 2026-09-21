/**
 * 表示名の同一性（正規化と、見え方による曖昧判定）。
 *
 * 表示名は「人を見分けるための唯一の手掛かり」なので、**画面で同じに見えるものは
 * 同じ扱いになる**必要がある。そうでないと、同名判定（`participant-label`）が発火せず
 * 識別子も添えられないまま、見分けの付かない行が並ぶ。
 *
 * 敵対的検証では、この性質を崩す入力が段階的に見つかった。対策は二段構えにしてある。
 *
 * **第1層 `normalizeDisplayName`（入力を正規形に潰す）**
 *   境界で一度だけ適用し、以後は正規形しか流れないようにする。
 *   `"  Bob  "`（HTML が空白を畳んで `Bob` に見える）、`"Bob\nAdmin"`、`"   "`、
 *   ゼロ幅文字、全角の `（ＩＤ: …）`、入れ子の `（（ID: x）ID: y）` などを潰す。
 *
 * **第2層 `nameSkeleton`（見え方が同じものを括る）**
 *   潰しきれないものを拾う。キリル文字の `В` は Latin の `B` と見た目が同じだが、
 *   れっきとした別の文字なので**変換してはいけない**（ロシア語話者の名前が壊れる）。
 *   そこで「入力を同じにする」のではなく「**見た目が紛らわしければ曖昧とみなす**」に
 *   切り替え、識別子を添えて区別できるようにする。
 *
 * **検出は寛容に、拒否は厳格に。** 第2層は表示（曖昧判定）にだけ使い、サーバーの
 * 重複拒否（`DuplicateName`）には使わない。拒否に使うと `Вова` のような正当な名前が
 * `Bob` の存在だけで弾かれる。識別子を余分に出すのは最悪でも読みにくいだけで害がない。
 */

/**
 * 表示名の最大長（文字数）。**正規化した後の長さ**に課す（#95 S4b で timer-core から移設）。
 *
 * これは「保存・配信・描画される値」の上限であり、巨大文字列による DoS を防ぐためのもの。
 * したがって**正規化後に効いていなければ意味がない**。
 *
 * **この値がサービス全体の唯一の上限である**（#95 S5b）。poker が持っていた別の上限
 * （24）は規約ごとここへ寄せた —— ハブで名乗った名前が poker へ届く段になり、
 * 食い違いが実害へ変わったためである。適用は
 * `apps/tasuki-sync/src/application/display-name-rule.ts` が 3 つの入口すべてで行う。
 */
export const MAX_DISPLAY_NAME = 40;

/**
 * NFKC が 1 文字を最大いくつへ展開しうるか（U+FDFA `ﷺ` は 18 文字へ展開される）。
 *
 * 正規化前の緩い上限を `MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION` に置き、正規化後に
 * `MAX_DISPLAY_NAME` を厳密に課す。前段だけだと展開で上限を突破される。
 * 適用するのは境界（`apps/tasuki-sync/src/application/normalize-command-names.ts`）である。
 */
export const MAX_NFKC_EXPANSION = 18;

/**
 * 識別子つきの呼び名（`participant-label.ts` が生成する `（ID: xxxx）`）の書式。
 *
 * 利用者がこの書式を名乗れると、「名前が衝突したときの最後の拠り所」である識別子を
 * 偽造できてしまう。実機では実在の参加者と**完全に同一のラベル**（退出ボタン・確認
 * ダイアログ・通知のすべて）を作れた。生成物と利用者入力が同じ文字列に同居する以上、
 * 入力側からこの書式を取り除くのが確実である。
 *
 * 閉じ括弧は**任意**にしてある。`"Bob（ID: rqdK"` のように閉じないだけで剥がしを
 * 逃れられてしまい、画面には識別子つきに見える文字列が残るため。
 * 全角は事前の NFKC で半角へ寄るが、正規化前の値に使われても効くよう両方を許容する。
 *
 * **巻き添え（既知のトレードオフ）:** 括弧内に `ID:` を含む正当な名前も切り落とす。
 * 例: `"会社 (ID: 部署)"` → `"会社"`、`"Bob (id: developer)"` → `"Bob"`。
 * なりすまし（実在参加者の識別子を騙る）を確実に防ぐ方を優先した。表示名は短い呼び名で
 * あり、この書式を必要とする正当な用途は考えにくいと判断している。
 */
const LABEL_MARKER = /[（(]\s*ID\s*[:：][^）)]*[）)]?/gi;

/**
 * 制御文字（C0/C1）。画面や読み上げを壊すため落とす。
 *
 * タブ・改行・復帰は**除かない**。これらは「空白として畳む」対象であり、
 * 先に消すと `"Bob\nAdmin"` が `"BobAdmin"` になって語が繋がってしまう。
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

/**
 * 幅を持たない書式文字。`\s` には含まれないため、空白の畳み込みでは落ちない。
 * `"Bob" + U+200B` は画面では `Bob` と完全に同一に見えるのに別の文字列になる。
 *
 * **第1層で残すのは ZWJ（U+200D）だけ。** 絵文字の連結（家族絵文字など）という
 * 正当な用途があり、落とすと家族絵文字が3つに分解されてしまう。ZWJ を使った
 * 見た目の偽装は第2層（`nameSkeleton`）が拾うので、残しても区別は保たれる。
 *
 * 双方向制御（U+202A-202E, U+2066-2069）は**落とす**。以降の文字列を逆順に描画させ、
 * 表示上まったく別の名前に見せられる（実行ファイル名偽装の古典的手口と同型）。
 * ZWJ と違って正当な用途が無く、第2層は「既存の名前と衝突したとき」しか拾わないため、
 * 単独で見た目を偽装する場合を取り逃がす。**保存する値から落とすのが正しい。**
 */
const INVISIBLE_FORMAT = /[\u200b\u200c\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u180e]/g;

/**
 * 第2層でだけ落とす不可視文字（ZWJ を含む）。見た目が同じものを同じ骨格へ寄せる。
 *
 * **列挙をやめて性質で指す**（#284 の 2 巡目）。個別に挙げていたときは
 * U+00AD・U+034F・U+FE00–U+FE0F（字形選択）・U+115F / U+1160 / U+3164（ハングル填字）・
 * U+E0000–U+E01EF（タグ）などが漏れており、**画面では `Bob` と 1 ピクセルも違わない
 * `Bob + U+00AD` が別の骨格になっていた** —— 曖昧判定が発火せず、識別子も添えられない
 * まま見分けの付かない行が並ぶ。総当たりで **541 件**あり、全部がこの性質を持っていた
 * （`tests/display-name.test.ts` の反証探索が毎回数え直す）。
 *
 * **落とすのは比較のときだけである。** 第1層（{@link INVISIBLE_FORMAT}）へ足しては
 * いけない —— U+FE0F は絵文字の見せ方を決める字形選択子で、保存する値から落とすと
 * `❤️` が `❤` になる。
 */
const INVISIBLE_ALL = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * 見た目がラテン文字と紛らわしい文字の対応表（キリル・ギリシャ）。
 *
 * Unicode の confusables 全体を持つのは過剰なので、実際に紛らわしい大文字小文字だけを
 * 挙げる。ここに無い組み合わせは素通りするが、**素通りしても安全側に倒れる**
 * （曖昧と判定されず識別子が付かないだけで、誤った同一視は起きない）。
 */
const CONFUSABLES: ReadonlyMap<string, string> = new Map([
  // キリル文字（大文字）
  ["А", "A"], ["В", "B"], ["Е", "E"], ["К", "K"], ["М", "M"],
  ["Н", "H"], ["О", "O"], ["Р", "P"], ["С", "C"], ["Т", "T"],
  ["Х", "X"], ["У", "Y"], ["Ѕ", "S"], ["І", "I"], ["Ј", "J"],
  // キリル文字（小文字）
  ["а", "a"], ["е", "e"], ["о", "o"], ["р", "p"], ["с", "c"],
  ["у", "y"], ["х", "x"], ["ѕ", "s"], ["і", "i"], ["ј", "j"],
  // ギリシャ文字（大文字）
  ["Α", "A"], ["Β", "B"], ["Ε", "E"], ["Ζ", "Z"], ["Η", "H"],
  ["Ι", "I"], ["Κ", "K"], ["Μ", "M"], ["Ν", "N"], ["Ο", "O"],
  ["Ρ", "P"], ["Τ", "T"], ["Υ", "Y"], ["Χ", "X"],
  // ギリシャ文字（小文字）
  ["ο", "o"], ["ρ", "p"], ["ν", "v"],
]);

/** ラベル書式が消えるまで繰り返し剥がす回数の上限（暴走防止）。 */
const MAX_STRIP_PASSES = 20;

/**
 * **描画時に無視される文字**（#284 の 2 巡目）。照合のためだけに伏せる。
 *
 * **列挙しない。** Unicode の `Default_Ignorable_Code_Point` をそのまま使う ——
 * 「画面に何も出ない文字」の定義そのものであり、版が上がれば追随する
 * （`docs/` の「列挙は腐る。機構で指す」）。総当たり（BMP 全域 ＋ タグ・字形選択の面）で
 * 見出しを割れたコードポイントは **544 件あり、その全部がこの性質を持っていた**
 * （`tests/display-name.test.ts` の反証探索が毎回数え直す）。
 *
 * 個別に挙げていた頃に取り逃がしていた例: ZWJ (U+200D)・U+00AD・U+034F・
 * U+FE0E / U+FE0F・U+115F / U+1160 / U+3164（ハングル填字）・U+E0000–U+E01EF。
 */
const IGNORABLE_WHEN_RENDERED = /\p{Default_Ignorable_Code_Point}/u;

/**
 * ラベル書式を、**変化がなくなるまで**剥がす。
 *
 * 1回だけだと、剥がした結果が再びラベルの形になる入力を取り逃がす。
 * 実機で `"Bob（（ID: x）ID: rqdK）"` が `"Bob（ID: rqdK）"` になり、実在参加者の
 * 識別子を完全に偽造できた。HTML サニタイザの `<scr<script>ipt>` と同じ形の欠陥である。
 *
 * 1回の走査で必ず3文字以上減るので、表示名の最大長を考えれば数回で収束する。
 */
function stripLabelMarkers(input: string): string {
  let current = input;
  for (let i = 0; i < MAX_STRIP_PASSES; i++) {
    const next = stripLabelMarkersOnce(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * ラベル書式を 1 巡ぶん剥がす。**照合は「目に映る姿」に対して行う。**
 *
 * 見出し（`(ID:`）の内側に**描画時に無視される文字**を 1 つ挟むだけで書式の照合が
 * 外れる。そのまま通すと、画面では実在の参加者のラベルと**1 ピクセルも違わない**
 * 文字列を名乗れてしまう（`participant-label.ts` が生成する `（ID: xxxx）`）。
 * しかも第 2 層（`nameSkeleton`）は攻撃者を `"bob(id: rqdk)"`、被害者を `"bob"` と
 * 算出するので**曖昧判定も発火しない** —— 実測で確かめてある。
 *
 * **落とすのは照合のときだけで、出力には残す。** 単純に消すと ZWJ が巻き添えになり、
 * 家族絵文字が 3 つに分解される（{@link INVISIBLE_FORMAT} が ZWJ を残す理由）。
 * そこで「無視される文字を伏せた写し」で位置を見つけ、**元の文字列の対応する範囲**を
 * 削る。範囲の中に居る無視される文字だけが一緒に消え、ラベルの外の ZWJ は残る。
 */
function stripLabelMarkersOnce(input: string): string {
  /** 照合用の写し。 */
  let view = "";
  /** 写しの各 UTF-16 単位が、元の文字列のどこから来たか（開始と終端）。 */
  const from: number[] = [];
  const to: number[] = [];

  let at = 0;
  for (const ch of input) {
    if (!IGNORABLE_WHEN_RENDERED.test(ch)) {
      for (let k = 0; k < ch.length; k++) {
        view += ch[k];
        from.push(at);
        to.push(at + ch.length);
      }
    }
    at += ch.length;
  }

  LABEL_MARKER.lastIndex = 0;
  let out = "";
  /** 元の文字列のうち、ここまでを出力済み。 */
  let copied = 0;
  let match: RegExpExecArray | null;
  while ((match = LABEL_MARKER.exec(view)) !== null) {
    // 空マッチは起こらない書式だが、起きれば無限ループになるので進めておく。
    if (match[0].length === 0) {
      LABEL_MARKER.lastIndex += 1;
      continue;
    }
    const start = from[match.index]!;
    const end = to[match.index + match[0].length - 1]!;
    out += input.slice(copied, start);
    copied = end;
  }
  return out + input.slice(copied);
}

/**
 * 表示名を正規形へ直す（第1層）。
 *
 * 1. NFKC で互換文字を寄せる（全角 `ＩＤ`→`ID`、`：`→`:`、`（）`→`()` など）。
 *    これを先に置くことで、以降の書式判定が半角だけを見れば済む
 * 2. 幅を持たない書式文字を落とす（ZWJ は絵文字のため残す）
 * 3. 制御文字を落とす（タブ・改行は後段で空白に畳むので残す）
 * 4. 識別子ラベルの書式を、変化がなくなるまで剥がす（なりすまし防止）
 * 5. 連続する空白（改行・タブ・全角空白を含む）を1つの半角空白に畳む
 * 6. 前後の空白を落とす
 *
 * **制御文字は書式を照合する前に落とす**（#284 で 3 と 4 を入れ替えた）。剥がしが
 * 先だと、`（I` と `D:` の間に制御文字を 1 つ挟むだけで書式の照合が外れ、そのあと
 * 制御文字だけが落ちて **`(ID: rqdK)` が完成する**。`<scr<script>ipt>` 型のすり抜けで、
 * **剥がしの繰り返し（20 パス）では防げない**（1 パス目で「変化なし」と判定して抜ける）。
 *
 * **落とさずに残す文字（ZWJ など）でも同じ割り方ができる。** そちらは消すと絵文字の
 * 連結が壊れるので、{@link stripLabelMarkersOnce} が**照合のときだけ伏せる**。
 * 総当たりで見つかった抜け道は 544 件あり、全部がこの 2 つのどちらかで塞がる。
 *
 * **最後にもう一度 NFKC を掛けるのは冪等性のためである**（#284 の 2 巡目）。
 * 1 の NFKC の後に 2・3 で文字を抜くと、**そこで初めて隣り合った組み合わせの合成が
 * 解禁される** —— `"A" + U+200B + U+030A` は 1 度目が `"A" + U+030A`（分解形）、
 * 2 度目が `"\u00c5"`（合成形）だった。この 1 行が無いと「1 度掛ければ正規形」という
 * 前提が崩れ、掛けた回数で答えが変わる。**手で選んだ入力では気づけない** ので、
 * `tests/display-name.test.ts` の反証探索が生成した入力で 2 度掛けを突き合わせる。
 *
 * 結果が空文字になることがある（`"   "` など）。**空の可否は呼び出し側で判定する**
 * （境界スキーマは正規化後に最小長を課して弾く）。
 */
export function normalizeDisplayName(raw: string): string {
  return stripLabelMarkers(
    raw.normalize("NFKC").replace(INVISIBLE_FORMAT, "").replace(CONTROL_CHARS, ""),
  )
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFKC");
}

/**
 * 骨格の計算結果を表示名で覚えておく上限。
 *
 * `isAmbiguousName` は行ごとに呼ばれ、その中で全参加者ぶんの骨格を計算する。
 * 画面は毎秒（タイマー）再描画されるので、素朴に計算すると参加者数の2乗に比例した
 * NFKC 呼び出しが毎秒走る。名前は入れ替わりが緩やかなので、文字列で覚えれば
 * ほぼ全て命中する。参加者上限（`MAX_MEMBERS`）と見学者を見込んで十分な余裕を取る。
 */
const SKELETON_CACHE_MAX = 512;

/** 表示名 → 骨格のメモ。純関数なので古い値が誤りになることはない。 */
const skeletonCache = new Map<string, string>();

/**
 * 「見た目が同じなら同じ」とみなすための骨格を返す（第2層）。
 *
 * 正規化では潰せない見た目の衝突を拾う。キリル文字の `В` を Latin の `B` へ
 * **保存時に**変換するのは誤り（正当な名前が壊れる）なので、比較のときだけ寄せる。
 *
 * 大文字小文字も畳む。サーバーの重複拒否が大文字小文字を無視するので、判定を揃える。
 *
 * この値は**比較にだけ使い、画面には出さない**。表示は常に本人が名乗った表示名である。
 */
export function nameSkeleton(name: string): string {
  const cached = skeletonCache.get(name);
  if (cached !== undefined) return cached;

  const compat = name.normalize("NFKC").replace(INVISIBLE_ALL, "");
  let out = "";
  for (const ch of compat) {
    out += CONFUSABLES.get(ch) ?? ch;
  }
  const skeleton = out.replace(/\s+/g, " ").trim().toLowerCase();

  // 上限を超えたら丸ごと捨てる。LRU にしないのは、実際の呼び出しが「今画面に居る
  // 参加者の名前」に集中し、入れ替わりが緩やかだから。単純さを優先する。
  if (skeletonCache.size >= SKELETON_CACHE_MAX) skeletonCache.clear();
  skeletonCache.set(name, skeleton);
  return skeleton;
}

/**
 * 表示名の重複検査（T061/T062・FR-104）。
 *
 * `apps/tasuki-sync/src/application/handlers.ts` の `participant.addProxy` /
 * `participant.rename` にそれぞれ独立実装されていた重複検査を一元化したもの。
 * Issue #22 で「規則を1箇所に作ったのに呼び出し側が2系統あって行き渡らなかった」
 * ことを繰り返さないため、判定ロジック自体をここへ集約する。
 *
 * **判定内容は元の実装と完全に同一にしてある**（`trim().toLowerCase()` の単純比較）。
 * `nameSkeleton`（見た目の曖昧判定）は使わない。第2層は表示にのみ使うためであり、
 * ここで使うと拒否の挙動が変わってしまう（振る舞いの変更は本関数の目的ではない）。
 *
 * @param participants 比較対象の参加者一覧（表示名と ID だけを見る）
 * @param desiredName 検査したい表示名（比較前に trim/lowercase する）
 * @param excludeId 比較から除外する参加者 ID（rename で自分自身を除外する用途。
 *   省略時は全員と比較する＝ addProxy の重複検査と同一）
 */
export function conflictsWithExisting(
  participants: readonly { participantId: string; displayName: string }[],
  desiredName: string,
  excludeId?: string,
): boolean {
  const desired = desiredName.trim().toLowerCase();
  return participants.some(
    (p) => p.participantId !== excludeId && p.displayName.trim().toLowerCase() === desired,
  );
}
