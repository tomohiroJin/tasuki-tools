/**
 * サーバサイド AI お題生成の port。
 * 戻り値は「未検証の AI 出力」(unknown)。呼び出し側（ProblemDelegator）が
 * validateProblem で検証し、失敗は定型バンクへ縮退する（FR-023/024）。
 */
export interface ServerProblemProvider {
  generate(language: string, difficulty: string, signal: AbortSignal): Promise<unknown>;
}

/**
 * `generate` が失敗したときの分類（ADR 0012 D5・D12）。
 *
 * 呼び出し側（ProblemDelegator）はこの分類だけをログへ出し、例外メッセージは出さない。
 * 例外メッセージから正規表現で分類を**推測**すると、メッセージの文言が変わるたびに
 * 静かに誤分類する（2026-08-13 のレビューで実測: 6 パターン中 3 パターンが
 * 意図せず "other" に落ちていた）。そのため adapter 自身が分類を確定させ、
 * 型で運ぶ。文字列一致に頼るのは adapter を書いていない側（呼び出し側）が
 * 後から真似で当てるときだけであるべきで、ここではそれをやめる。
 */
export type ProviderFailureReason =
  | "timeout"
  | "invalid"
  | "spawnFailed"
  | "outputTooLarge"
  | "processError";

/**
 * 分類つきの失敗。adapter はこれを reject し、呼び出し側は `instanceof` で判定する。
 * 分類できない・分類しない adapter は素の `Error` を reject してよい
 * （呼び出し側は "other" として扱う）。
 */
export class ProviderFailure extends Error {
  constructor(
    message: string,
    public readonly reason: ProviderFailureReason,
  ) {
    super(message);
    this.name = "ProviderFailure";
  }
}
