import { describe, it, expect, jest } from "bun:test";
import { EventEmitter } from "node:events";
import { buildTopicPrompt } from "@tasuki/topic-core";
import {
  ClaudeCliTopicProvider,
  extractJsonObject,
  type SpawnFn,
  type SpawnedProcess,
} from "../src/adapters/claude-cli-topic-provider.js";
import { ProviderFailure } from "../src/ports/server-topic-provider.js";

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
      apiKey: "sk-ant-api03-test",
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
    // API キーは子プロセスの env にのみ渡る
    const opts = call[2] as { env: Record<string, string> };
    expect(opts.env["ANTHROPIC_API_KEY"]).toBe("sk-ant-api03-test");
    // プロンプトは stdin 渡し（argv に乗せない）。buildTopicPrompt の出力そのものと一致することを見る
    expect(fake.written.join("")).toBe(buildTopicPrompt("TypeScript", "easy"));
  });

  it("日本語の 1 文字がチャンクの境目で割れても化けずに受け取る", async () => {
    // Given（「倍」は UTF-8 で 3 バイト。その途中でチャンクを割る）
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);
    const bytes = Buffer.from(JSON.stringify({ result: JSON.stringify(TOPIC_JSON) }));
    const cut = bytes.indexOf(Buffer.from("倍")) + 1;

    // When
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stdout.emit("data", bytes.subarray(0, cut));
    fake.stdout.emit("data", bytes.subarray(cut));
    (fake.child as unknown as EventEmitter).emit("close", 0);

    // Then
    await expect(p).resolves.toEqual(TOPIC_JSON);
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

  it("親の環境の認証情報（旧 OAuth トークン・別の API 設定）は子の env へ漏れない（#459）", async () => {
    // Given（親の環境に旧トークンなどがある）
    const saved = { ...process.env };
    process.env["CLAUDE_CODE_OAUTH_TOKEN"] = "sk-ant-oat01-parent";
    process.env["ANTHROPIC_AUTH_TOKEN"] = "parent-auth";
    process.env["ANTHROPIC_BASE_URL"] = "https://example.invalid";
    try {
      const fake = makeFakeChild();
      const { provider, spawnFn } = makeProvider(fake);

      // When
      const p = provider.generate("TypeScript", "easy", new AbortController().signal);
      fake.stdout.emit("data", Buffer.from(JSON.stringify({ result: JSON.stringify(TOPIC_JSON) })));
      (fake.child as unknown as EventEmitter).emit("close", 0);
      await p;

      // Then（許可リスト: PATH・HOME・ANTHROPIC_API_KEY だけ。API キーだけで認証される）
      const opts = (spawnFn as ReturnType<typeof jest.fn>).mock.calls[0]![2] as {
        env: Record<string, string | undefined>;
      };
      expect(Object.keys(opts.env).sort()).toEqual(["ANTHROPIC_API_KEY", "HOME", "PATH"]);
      expect(opts.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    } finally {
      // 3 つとも、保存した元の値へ戻す（無かったものは消す）
      for (const k of ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  it("クレジット切れ（非ゼロ exit・stderr）は processError で失敗し、キーは伏せる（#459）", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);

    // When
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stderr.emit("data", Buffer.from("Credit balance is too low (key sk-ant-api03-secret456)"));
    (fake.child as unknown as EventEmitter).emit("close", 1);

    // Then
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderFailure);
    expect((err as ProviderFailure).reason).toBe("processError");
    expect(String(err)).toContain("Credit balance is too low");
    expect(String(err)).not.toContain("secret456");
  });

  it("クレジット切れが exit 0 の JSON（is_error・result が文章）で返っても invalid で失敗する（#459）", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);

    // When
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ is_error: true, result: "Credit balance is too low" })),
    );
    (fake.child as unknown as EventEmitter).emit("close", 0);

    // Then
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderFailure);
    expect((err as ProviderFailure).reason).toBe("invalid");
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
    expect(args.join(" ")).not.toContain("sk-ant-api03-test");
  });

  it("stderr 中のトークン様文字列はエラーメッセージで伏せられる", async () => {
    // Given
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);

    // When
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stderr.emit("data", Buffer.from("auth failed for sk-ant-api03-secret123"));
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
      apiKey: "sk-ant-api03-test",
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

      // ツールを開き直す編集を塞ぐ: 空の `--tools` が最後の 2 つであり（後ろに値を足すと
      // ツールが開く）、指定がそれぞれ 1 度だけ（後勝ちの 2 度目・`--tools=…` の形が無い）で、
      // 許可リストの指定（`--allowedTools` / `--allowed-tools`）も無い
      expect(args.slice(-2)).toEqual(["--tools", ""]);
      expect(args.filter((a) => a === "--tools" || a.startsWith("--tools="))).toEqual(["--tools"]);
      expect(
        args.filter((a) => a === "--setting-sources" || a.startsWith("--setting-sources=")),
      ).toEqual(["--setting-sources"]);
      expect(args.filter((a) => /^--allowed-?tools(=|$)/i.test(a))).toEqual([]);
    });
  });
});
