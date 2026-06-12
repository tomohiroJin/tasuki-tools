/**
 * claude -p 子プロセスでお題を生成する adapter。
 * - スタンドアロンの claude バイナリを node:child_process で起動（Bun でも動作・vitest でもテスト可能）
 * - プロンプトは stdin 渡し（argv 長・エスケープ問題の回避）
 * - --strict-mcp-config 等でユーザー設定を読み込ませない（メモリ実測 726MB→355MB。spec 参照）
 * - OAuth トークンは子プロセスの env にのみ渡す（ログ・snapshot 非混入）
 */
import { spawn } from "node:child_process";
import { buildProblemPrompt } from "@tdd-mob/core";
import type { ServerProblemProvider } from "../ports/server-problem-provider.js";

/** spawn 互換の最小インターフェース（テストで差し替える） */
export interface SpawnedProcess {
  stdout: { on(event: "data", cb: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: "data", cb: (chunk: Buffer) => void): unknown } | null;
  stdin: { write(data: string): boolean; end(): void } | null;
  on(event: "close", cb: (code: number | null) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { env: Record<string, string | undefined>; stdio: ["pipe", "pipe", "pipe"] },
) => SpawnedProcess;

export interface ClaudeCliProblemProviderOptions {
  /** CLAUDE_CODE_OAUTH_TOKEN（sk-ant-oat01-...） */
  token: string;
  /** claude -p --model に渡す値 */
  model: string;
  /** テスト用の spawn 差し替え */
  spawnFn?: SpawnFn;
}

/** AI 応答テキストから最初の { 〜 最後の } を JSON として取り出す。 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI 応答に JSON オブジェクトが見つかりません");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export class ClaudeCliProblemProvider implements ServerProblemProvider {
  private readonly token: string;
  private readonly model: string;
  private readonly spawnFn: SpawnFn;

  constructor(opts: ClaudeCliProblemProviderOptions) {
    this.token = opts.token;
    this.model = opts.model;
    this.spawnFn = opts.spawnFn ?? (spawn as unknown as SpawnFn);
  }

  generate(language: string, difficulty: string, signal: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("aborted before start"));
        return;
      }

      const args = [
        "-p",
        "--output-format",
        "json",
        "--model",
        this.model,
        // ユーザー設定・MCP を読み込ませない（メモリ削減＋挙動の固定）
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--settings",
        "{}",
      ];

      const child = this.spawnFn("claude", args, {
        env: {
          // PATH/HOME は必要（バイナリ解決・内部キャッシュ）。トークンはここだけに渡す。
          PATH: process.env["PATH"],
          HOME: process.env["HOME"],
          CLAUDE_CODE_OAUTH_TOKEN: this.token,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        fn();
      };

      const onAbort = () => {
        child.kill("SIGKILL");
        settle(() => reject(new Error("aborted (timeout/cancel)")));
      };
      signal.addEventListener("abort", onAbort);

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => settle(() => reject(err)));
      child.on("close", (code) => {
        if (code !== 0) {
          settle(() =>
            reject(new Error(`claude -p exit ${code}: ${stderr.slice(0, 200)}`)),
          );
          return;
        }
        // JSON 解析は settle の外で行い、成否を settle で一括 settle する
        // → reject を settle のガード外で呼ばないことで二重 settle を防ぐ
        let parsed: unknown;
        try {
          // --output-format json の外殻 { result: "...", ... } から本文を取り出す
          const outer = JSON.parse(stdout) as { result?: unknown };
          if (typeof outer.result !== "string") {
            throw new Error(
              `--output-format json の result フィールドが文字列ではありません: ${JSON.stringify(outer).slice(0, 200)}`,
            );
          }
          parsed = extractJsonObject(outer.result);
        } catch (e) {
          settle(() => reject(new Error(`AI 応答の解析に失敗: ${(e as Error).message}`)));
          return;
        }
        settle(() => resolve(parsed));
      });

      // プロンプトは stdin 渡し
      child.stdin?.write(buildProblemPrompt(language, difficulty));
      child.stdin?.end();
    });
  }
}
