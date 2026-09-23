import { describe, it, expect, jest } from "bun:test";
import { EventEmitter } from "node:events";
import { buildTopicPrompt } from "@tasuki/topic-core";
import {
  ClaudeCliTopicProvider,
  extractJsonObject,
  type SpawnFn,
  type SpawnedProcess,
} from "../src/adapters/claude-cli-topic-provider.js";

/** spawn の戻り値を模す最小フェイク */
function makeFakeChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & SpawnedProcess;
  const written: string[] = [];
  Object.assign(child, {
    stdout,
    stderr,
    stdin: {
      write: (s: string) => {
        written.push(s);
        return true;
      },
      end: () => {},
    },
    kill: jest.fn(),
  });
  return { child: child as unknown as SpawnedProcess, stdout, stderr, written };
}

const TOPIC_JSON = {
  title: "FizzBuzz",
  body: "3 の倍数で…",
};

describe("extractJsonObject", () => {
  it("前後に説明文があっても最初の { から最後の } を抽出して parse する", () => {
    const text = `Here is the kata:\n${JSON.stringify(TOPIC_JSON)}\nEnjoy!`;
    expect(extractJsonObject(text)).toEqual(TOPIC_JSON);
  });
  it("JSON が無ければ throw する", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("ClaudeCliTopicProvider", () => {
  function makeProvider(fake: ReturnType<typeof makeFakeChild>) {
    const spawnFn: SpawnFn = jest.fn(() => fake.child);
    const provider = new ClaudeCliTopicProvider({
      token: "sk-ant-oat01-test",
      model: "sonnet",
      spawnFn,
    });
    return { provider, spawnFn };
  }

  it("claude -p を正しい引数で起動しプロンプトを stdin で渡す", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider, spawnFn } = makeProvider(fake);

    // When（claude -p の --output-format json は {"result": "..."} を返す）
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ result: JSON.stringify(TOPIC_JSON) })),
    );
    (fake.child as unknown as EventEmitter).emit("close", 0);

    // Then
    await expect(p).resolves.toEqual(TOPIC_JSON);
    const call = (spawnFn as ReturnType<typeof jest.fn>).mock.calls[0]!;
    expect(call[0]).toBe("claude");
    const args = call[1] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("sonnet");
    // OAuth トークンは子プロセスの env にのみ渡る
    const opts = call[2] as { env: Record<string, string> };
    expect(opts.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("sk-ant-oat01-test");
    // プロンプトは stdin 渡し（argv に乗せない）。buildTopicPrompt の出力そのものと一致することを見る
    expect(fake.written.join("")).toBe(buildTopicPrompt("TypeScript", "easy"));
  });

  it("非ゼロ exit は reject する", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);

    // When
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stderr.emit("data", Buffer.from("auth error"));
    (fake.child as unknown as EventEmitter).emit("close", 1);

    // Then
    await expect(p).rejects.toThrow(/exit 1/);
  });

  it("abort で子プロセスを kill して reject する", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);
    const ac = new AbortController();

    // When
    const p = provider.generate("TypeScript", "easy", ac.signal);
    ac.abort();

    // Then
    await expect(p).rejects.toThrow(/abort/i);
    expect(fake.child.kill).toHaveBeenCalled();
  });

  it("トークンが argv に混入しない", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider, spawnFn } = makeProvider(fake);

    // When
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stdout.emit("data", Buffer.from(JSON.stringify({ result: JSON.stringify(TOPIC_JSON) })));
    (fake.child as unknown as EventEmitter).emit("close", 0);
    await p;

    // Then
    const args = (spawnFn as ReturnType<typeof jest.fn>).mock.calls[0]![1] as string[];
    expect(args.join(" ")).not.toContain("sk-ant-oat01-test");
  });

  it("stderr 中のトークン様文字列はエラーメッセージで伏せられる", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);

    // When
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stderr.emit("data", Buffer.from("auth failed for sk-ant-oat01-secret123"));
    (fake.child as unknown as EventEmitter).emit("close", 1);

    // Then
    await expect(p).rejects.toThrow(/\[redacted\]/);
    await p.catch((e: unknown) => {
      expect(String(e)).not.toContain("secret123");
    });
  });

  it("generate 前に abort 済みの signal は即 reject する（spawn 不要）", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider, spawnFn } = makeProvider(fake);
    const ac = new AbortController();
    ac.abort();

    // When / Then
    await expect(provider.generate("TypeScript", "easy", ac.signal)).rejects.toThrow(
      "aborted before start",
    );
    // 既に abort 済みなので spawn は呼ばれない
    expect((spawnFn as ReturnType<typeof jest.fn>).mock.calls).toHaveLength(0);
  });

  it("出力が上限を超えたら子プロセスを kill して reject する（メモリ枯渇防止）", async () => {
    // Given
    const fake = makeFakeChild();
    const spawnFn: SpawnFn = jest.fn(() => fake.child);
    const provider = new ClaudeCliTopicProvider({
      token: "sk-ant-oat01-test",
      model: "sonnet",
      spawnFn,
      maxOutputBytes: 50,
    });

    // When（上限(50B)を超える出力を送りつける）
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stdout.emit("data", Buffer.from("x".repeat(100)));

    // Then
    await expect(p).rejects.toThrow(/too large|出力.*上限/i);
    expect(fake.child.kill).toHaveBeenCalled();
  });

  it("AI 応答が JSON を含まない場合は reject する", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);

    // When（result フィールドに JSON のない文字列を返す）
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ result: "no json here" })),
    );
    (fake.child as unknown as EventEmitter).emit("close", 0);

    // Then
    await expect(p).rejects.toThrow(/AI 応答の解析に失敗/);
  });

  /**
   * @requirements #91 E12
   */
  describe("起動引数でツールを閉じる", () => {
    it("組み込みツールと利用者設定を起動引数で閉じる", async () => {
      // Given
      const fake = makeFakeChild();
      const { provider, spawnFn } = makeProvider(fake);

      // When
      const p = provider.generate("TypeScript", "easy", new AbortController().signal);
      fake.stdout.emit("data", Buffer.from(JSON.stringify({ result: JSON.stringify(TOPIC_JSON) })));
      (fake.child as unknown as EventEmitter).emit("close", 0);
      await p;

      // Then（`--setting-sources` / `--tools` それぞれの直後の値が空文字であることを
      // 並びで見る —— `toContain("")` はどの配列にも真になる恒真の検査である）
      const args = (spawnFn as ReturnType<typeof jest.fn>).mock.calls[0]![1] as string[];
      const settingSourcesIndex = args.indexOf("--setting-sources");
      expect(settingSourcesIndex).toBeGreaterThanOrEqual(0);
      expect(args[settingSourcesIndex + 1]).toBe("");
      const toolsIndex = args.indexOf("--tools");
      expect(toolsIndex).toBeGreaterThanOrEqual(0);
      expect(args[toolsIndex + 1]).toBe("");
    });
  });
});
