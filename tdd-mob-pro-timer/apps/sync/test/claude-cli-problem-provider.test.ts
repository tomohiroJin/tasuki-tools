import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  ClaudeCliProblemProvider,
  extractJsonObject,
  type SpawnFn,
  type SpawnedProcess,
} from "../src/adapters/claude-cli-problem-provider.js";

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
    kill: vi.fn(),
  });
  return { child: child as unknown as SpawnedProcess, stdout, stderr, written };
}

const PROBLEM_JSON = {
  title: "FizzBuzz",
  description: "desc",
  requirements: ["a", "b", "c"],
  exampleTest: "test()",
  hints: ["h1"],
};

describe("extractJsonObject", () => {
  it("前後に説明文があっても最初の { から最後の } を抽出して parse する", () => {
    const text = `Here is the kata:\n${JSON.stringify(PROBLEM_JSON)}\nEnjoy!`;
    expect(extractJsonObject(text)).toEqual(PROBLEM_JSON);
  });
  it("JSON が無ければ throw する", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("ClaudeCliProblemProvider", () => {
  function makeProvider(fake: ReturnType<typeof makeFakeChild>) {
    const spawnFn: SpawnFn = vi.fn(() => fake.child);
    const provider = new ClaudeCliProblemProvider({
      token: "sk-ant-oat01-test",
      model: "sonnet",
      spawnFn,
    });
    return { provider, spawnFn };
  }

  it("claude -p を正しい引数で起動しプロンプトを stdin で渡す", async () => {
    const fake = makeFakeChild();
    const { provider, spawnFn } = makeProvider(fake);
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    // claude -p の --output-format json は {"result": "..."} を返す
    fake.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ result: JSON.stringify(PROBLEM_JSON) })),
    );
    (fake.child as unknown as EventEmitter).emit("close", 0);
    await expect(p).resolves.toEqual(PROBLEM_JSON);

    const call = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("claude");
    const args = call[1] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("sonnet");
    // OAuth トークンは子プロセスの env にのみ渡る
    const opts = call[2] as { env: Record<string, string> };
    expect(opts.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("sk-ant-oat01-test");
    // プロンプトは stdin 渡し（argv に乗せない）
    expect(fake.written.join("")).toContain("TypeScript");
  });

  it("非ゼロ exit は reject する", async () => {
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stderr.emit("data", Buffer.from("auth error"));
    (fake.child as unknown as EventEmitter).emit("close", 1);
    await expect(p).rejects.toThrow(/exit 1/);
  });

  it("abort で子プロセスを kill して reject する", async () => {
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);
    const ac = new AbortController();
    const p = provider.generate("TypeScript", "easy", ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow(/abort/i);
    expect(fake.child.kill).toHaveBeenCalled();
  });
});
