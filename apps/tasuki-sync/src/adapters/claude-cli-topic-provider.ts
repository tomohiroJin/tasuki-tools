/**
 * claude -p 子プロセスでお題を生成する adapter（#91）。
 * - スタンドアロンの claude バイナリを node:child_process で起動（Bun でも動作・vitest でもテスト可能）
 * - プロンプトは stdin 渡し（argv 長・エスケープ問題の回避）
 * - --strict-mcp-config 等でユーザー設定を読み込ませない（メモリ実測 726MB→355MB。spec 参照）
 * - `--setting-sources "" --tools ""` で組み込みツールと利用者設定を閉じる（docs/adr/0012 D10）
 * - OAuth トークンは子プロセスの env にのみ渡す（ログ・snapshot 非混入）
 */
import { spawn } from "node:child_process";
import { buildTopicPrompt, type Difficulty, type Language } from "@tasuki/topic-core";
import { ProviderFailure, type ServerTopicProvider } from "../ports/server-topic-provider.js";

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

export interface ClaudeCliTopicProviderOptions {
  /** CLAUDE_CODE_OAUTH_TOKEN（sk-ant-oat01-...） */
  token: string;
  /** claude -p --model に渡す値 */
  model: string;
  /** テスト用の spawn 差し替え */
  spawnFn?: SpawnFn;
  /** stdout+stderr 累積の上限バイト数（既定 1MB）。
   * 正常な応答は数 KB なので、暴走・巨大出力でのメモリ枯渇を防ぐ安全弁。 */
  maxOutputBytes?: number;
}

/** 出力累積の既定上限（1MB）。正常な JSON は数 KB なので決して発火しない寛大な値。 */
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

/** AI 応答テキストから最初の { 〜 最後の } を JSON として取り出す。 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI 応答に JSON オブジェクトが見つかりません");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export class ClaudeCliTopicProvider implements ServerTopicProvider {
  private readonly token: string;
  private readonly model: string;
  private readonly spawnFn: SpawnFn;
  private readonly maxOutputBytes: number;

  constructor(opts: ClaudeCliTopicProviderOptions) {
    this.token = opts.token;
    this.model = opts.model;
    this.spawnFn = opts.spawnFn ?? (spawn as unknown as SpawnFn);
    this.maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  }

  generate(language: Language, difficulty: Difficulty, signal: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new ProviderFailure("aborted before start", "timeout"));
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
        // 組み込みツールと利用者設定を全部閉じる（docs/adr/0012 D10・spec T8 ①）。
        // 2026-08-13 に「注入 → Read ツールで /opt/tasuki/tasuki-sync.env を読む」経路が
        // 本番で成立した。既定の挙動に頼らず、ここで明示的に閉じる。
        // 本番の CLI（2.1.178）で `--tools ""` だけでは利用者設定のプラグインが足す
        // LSP が残ることを実測した。`--setting-sources ""` を併せると利用者・プロジェクト
        // 設定を読まなくなり、本番の HOME の中身に結果が左右されなくなる
        // （2026-09-24 実測。spec §10）。
        "--setting-sources",
        "",
        "--tools",
        "",
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

      // Buffer のまま貯め、close で 1 回だけ文字列にする。チャンクごとに toString すると、
      // UTF-8 で 3 バイトの日本語が境目で割れたとき `�` に化け、化けたお題が検証を
      // 通って全員へ配られる（PR #310 のレビュー）
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        fn();
      };

      const onAbort = () => {
        child.kill("SIGKILL");
        settle(() => reject(new ProviderFailure("aborted (timeout/cancel)", "timeout")));
      };
      signal.addEventListener("abort", onAbort);

      // stdout+stderr 累積が上限を超えたら子プロセスを kill して中断する
      // （暴走・巨大出力でのメモリ枯渇防止。VPS 1GB RAM の安全弁）
      let receivedBytes = 0;
      const onData = (chunk: Buffer): boolean => {
        receivedBytes += chunk.length;
        if (receivedBytes > this.maxOutputBytes) {
          child.kill("SIGKILL");
          settle(() => reject(new ProviderFailure("claude -p output too large（出力が上限を超過）", "outputTooLarge")));
          return false;
        }
        return true;
      };

      child.stdout?.on("data", (chunk) => {
        if (settled) return;
        if (onData(chunk)) stdoutChunks.push(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        if (settled) return;
        if (onData(chunk)) stderrChunks.push(chunk);
      });
      // spawn 自体の失敗（ENOENT 等）。メッセージは保ったまま分類だけ確定させる。
      child.on("error", (err) => settle(() => reject(new ProviderFailure(err.message, "spawnFailed"))));
      child.on("close", (code) => {
        if (code !== 0) {
          // stderr にトークン様文字列が混入しても外へ出さない（ログ衛生・多層防御）
          const stderr = Buffer.concat(stderrChunks).toString("utf8");
          const redacted = stderr.replace(/sk-ant-[\w-]+/g, "[redacted]");
          settle(() =>
            reject(new ProviderFailure(`claude -p exit ${code}: ${redacted.slice(0, 200)}`, "processError")),
          );
          return;
        }
        // JSON 解析は settle の外で行い、成否を settle で一括 settle する
        // → reject を settle のガード外で呼ばないことで二重 settle を防ぐ
        let parsed: unknown;
        try {
          // --output-format json の外殻 { result: "...", ... } から本文を取り出す
          const outer = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8")) as { result?: unknown };
          if (typeof outer.result !== "string") {
            throw new Error(
              `--output-format json の result フィールドが文字列ではありません: ${JSON.stringify(outer).slice(0, 200)}`,
            );
          }
          parsed = extractJsonObject(outer.result);
        } catch (e) {
          settle(() => reject(new ProviderFailure(`AI 応答の解析に失敗: ${(e as Error).message}`, "invalid")));
          return;
        }
        settle(() => resolve(parsed));
      });

      // プロンプトは stdin 渡し
      child.stdin?.write(buildTopicPrompt(language, difficulty));
      child.stdin?.end();
    });
  }
}
