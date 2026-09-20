/**
 * お題バリデーション・プロンプト生成
 * T023: FR-021, FR-022, FR-023, FR-024
 */

import { ok, err, type Result } from "neverthrow";
import * as v from "valibot";
import { ProblemSchema } from "./schemas.js";
import type { Problem, ProblemSource } from "./aggregate.js";
import { FALLBACK_PROBLEMS } from "./problem-bank.js";
export { FALLBACK_PROBLEMS };

/** ソース付きお題 */
export interface ProblemWithSource {
  problem: Problem;
  source: ProblemSource;
}

/** 定型お題エントリ */
export interface FallbackProblemEntry {
  problem: Problem;
  languages: string[];
  difficulty: string;
}

// ─── 検証 ────────────────────────────────────────────────────────────────────

/**
 * お題オブジェクトを Valibot で検証する
 * AI 由来のテキストを信頼しないデータとして扱う（FR-023）
 */
/**
 * {@link validateProblem} が返す失敗の型。
 *
 * **名前を与えているのは、公開契約から `ProblemSchema`（値）を落としたためである**（#220）。
 * 素の `v.ValiError<typeof ProblemSchema>` は値 `ProblemSchema` が公開されていないと
 * 外から書けない。エラー分岐へ注釈を書きたい利用者に名前を渡すのはこの型の役目で、
 * ADR-0016 追記の「型は署名から到達できるなら列挙してよい」に乗る。
 */
export type ProblemValidationError = v.ValiError<typeof ProblemSchema>;

export function validateProblem(raw: unknown): Result<Problem, ProblemValidationError> {
  const result = v.safeParse(ProblemSchema, raw);
  if (result.success) {
    return ok(result.output);
  }
  return err(result.issues as never);
}

// ─── フォールバック ──────────────────────────────────────────────────────────

/**
 * 言語・難易度に合った定型お題を返す
 * AI 生成失敗時のフォールバック（FR-024）
 *
 * @param previous いま載っているお題（無ければ `null`）。**候補から外すために使う** ——
 *   同じお題が返ると「別のお題にする」を押したことが画面に出ない（下の注記）。
 *   **既定値は置かない** —— `now` と同じ理由で、既定があると呼び出し側が無変更で通り、
 *   配線されていることが検査されないまま緑になる。
 *
 * @param now 選択の元になる値。**実体は擬似乱数の種であり、時刻としての意味は持たない。**
 *   引数名を `now` にしているのは `docs/timer/adr/0002`（時刻は引数 `now` として注入し、
 *   現在時刻をドメイン内で直接読まない）と timer-core の他所（`records.ts` `evolve.ts`
 *   `aggregate.ts`）の語彙に揃えるため。**既定値は置かない** — 既定値があると呼び出し側が
 *   無変更で通り、「配線されている」ことが検査されないまま緑になる（#166 / #72 E3）。
 *
 *   **ADR を逐語引用していないのは意図的である。** `scripts/audit-domain-side-effects.mjs` は
 *   コメント行も読む（「無いこと」を求める検査は読み飛ばすと緑に倒れる）。
 *   このファイルは検査の走査対象なので、規範の文言を引用するときも字面を避ける。
 */
export function pickFallback(
  language: string,
  difficulty: string,
  now: number,
  previous: Problem | null,
): ProblemWithSource {
  // 言語・難易度でフィルタ
  let candidates = FALLBACK_PROBLEMS.filter(
    (e) => e.languages.includes(language) && e.difficulty === difficulty,
  );

  // 言語フィルタのみ
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS.filter((e) =>
      e.languages.includes(language),
    );
  }

  // 全フォールバック
  if (candidates.length === 0) {
    candidates = FALLBACK_PROBLEMS;
  }

  // 直前のお題を候補から外す（#283 のレビュー）。
  //
  // **「別のお題にする」が同じお題を返すと、押したことが画面に出ない。**
  // 生成中の表示はサーバーが依頼の冒頭に 1 本配信しているが、AI を使わない既定の
  // ルームでは依頼と確定が同じ tick で終わるため、**送信元の端末では 2 本が
  // 1 回の描画に畳まれて生成中が一度も現れない**（jsdom で再現・実ブラウザでも
  // 押した本人は 10 回中 0 回だった）。結果が必ず変わるようにするのが、押下が
  // 画面に出ることの唯一の保証である。
  //
  // **同一性は `title` で見る。** 3 つとも理由がある ——
  //
  // - **参照比較は使えない。** 確定時に `{ ...entry.problem, source }` の写しを作るので、
  //   ルームに載っているお題はバンクの実体ではない
  // - **深い等値も使えない。** 利用者が中身を編集すると一致しなくなり、
  //   **編集された直後だけ除外が効かない**という一番分かりにくい形で抜ける
  // - **`title` は利用者が「同じお題だ」と感じる単位そのもの**である。説明だけを
  //   編集してタイトルが残っているなら、その項目は外す（タイトルが変わらないと
  //   「何も起きていない」ように見えるため）。タイトルごと書き換えられたお題は
  //   バンクのどの項目とも一致しないので何も外れない —— 画面に出ているのは
  //   利用者が作った別物なので、どれが返っても「変わった」ことは分かる
  const remaining = previous === null
    ? candidates
    : candidates.filter((e) => e.problem.title !== previous.title);
  // ⚠ **除いて空になったら元へ戻す。** ここを削ると `candidates[index]` が
  // `undefined` になり、お題が 1 件も返らない。現在の定型バンクは全 33 件が
  // 全言語を載せているので、最も狭い組（`hard`）でも候補は 7 件あり**この枝は
  // 今のところ通らない**。それでも置くのは、バンクが痩せた瞬間に「別のお題にする」が
  // 例外で落ちるより、同じお題が返るほうがましだからである（下の
  // `?? FALLBACK_PROBLEMS[0]!` を置かない判断とは向きが違う —— あれは
  // **渡し忘れという誤りを隠す**が、これは**契約「必ず 1 件返す」を守る**）。
  const pool = remaining.length > 0 ? remaining : candidates;

  // 疑似ランダムに選択（呼び出し側が渡した値ベース）
  const index = Math.abs(now) % pool.length;
  // `?? FALLBACK_PROBLEMS[0]!` は置かない。有効な now では pool[index] が必ず
  // 定義済みなので死んだ枝であり、置くと now の渡し忘れ（NaN）を黙って飲み込んで
  // 先頭のお題を返してしまう。テストは型検査の射程外なので、これが唯一の防波堤になる。
  const entry = pool[index]!;

  return { problem: entry.problem, source: "fallback" };
}

// ─── AI プロンプト生成 ───────────────────────────────────────────────────────

/**
 * AI お題生成用のプロンプトを生成する
 * FR-021, FR-022
 */
export function buildProblemPrompt(language: string, difficulty: string): string {
  return `You are a TDD coding kata generator. Generate a programming kata in ${language} at ${difficulty} difficulty.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "title": "短いお題名（日本語・3〜10語相当）",
  "description": "実装内容の明確な説明（日本語・1〜2文）",
  "requirements": ["要件1（日本語）", "要件2（日本語）", "要件3（日本語）", "要件4（日本語）"],
  "exampleTest": "example test code in ${language} syntax (code only)",
  "hints": ["ヒント1（日本語）", "ヒント2（日本語）"]
}

Rules:
- Write title, description, requirements, and hints in NATURAL, CLEAR JAPANESE (日本語).
- The exampleTest MUST be valid ${language} code with ENGLISH identifiers (function and variable names in English). Code comments may be in Japanese. Do NOT translate code identifiers.
- The kata must be suitable for TDD practice (test-first approach)
- Include 4-6 clear, testable requirements. Each requirement must be verifiable by a test (avoid vague or ambiguous phrasing).
- The exampleTest MUST be valid ${language} syntax and show at least one concrete input/output assertion.
- Difficulty: ${difficulty} (easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+)
- Make it practical and educational; avoid trivial one-liners`;
}
