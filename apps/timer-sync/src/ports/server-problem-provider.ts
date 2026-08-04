/**
 * サーバサイド AI お題生成の port。
 * 戻り値は「未検証の AI 出力」(unknown)。呼び出し側（ProblemDelegator）が
 * validateProblem で検証し、失敗は定型バンクへ縮退する（FR-023/024）。
 */
export interface ServerProblemProvider {
  generate(language: string, difficulty: string, signal: AbortSignal): Promise<unknown>;
}
