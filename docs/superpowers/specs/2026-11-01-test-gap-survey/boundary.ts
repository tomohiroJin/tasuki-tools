// WebSocket の境界に壊れた入力を手で投げる（bun で実行。サーバーは本番と同じ入口を子プロセスで起こす）
const ROOT = process.argv[2];
const PORT = 18000 + Math.floor(Math.random() * 1000);
const CANARY = "CANARY7f3aSECRET";
const proc = Bun.spawn(["bun", "src/server.ts"], {
  cwd: `${ROOT}/apps/tasuki-sync`,
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", NODE_ENV: "development", ALLOWED_ORIGINS: "" },
  stdout: "pipe", stderr: "pipe",
});
let logs = "";
const pump = async (s: ReadableStream<Uint8Array>) => { for await (const c of s) logs += new TextDecoder().decode(c); };
pump(proc.stdout); pump(proc.stderr);
let exited: number | null = null; proc.exited.then((c) => (exited = c));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50 && !logs.includes("listen"); i++) await sleep(100);

type Conn = { ws: WebSocket; frames: string[]; closed: { code: number; reason: string } | null };
async function open(tool: string | null): Promise<Conn> {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws${tool ? `?tool=${tool}` : ""}`);
  const c: Conn = { ws, frames: [], closed: null };
  ws.onmessage = (e) => c.frames.push(typeof e.data === "string" ? e.data : "<binary>");
  ws.onclose = (e) => (c.closed = { code: e.code, reason: e.reason });
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("open failed")); });
  return c;
}
async function hubRoom(): Promise<string> {
  const h = await open(null);
  h.ws.send(JSON.stringify({ command: "room.create", roomName: "fuzz", displayName: "host" }));
  for (let i = 0; i < 50; i++) { await sleep(20); const f = h.frames.map((x) => JSON.parse(x)).find((m) => m.type === "room.created"); if (f) return f.code; }
  throw new Error("no room");
}
const deep = (n: number) => "[".repeat(n) + "]".repeat(n);
const raws: Array<[string, string | ArrayBuffer]> = [
  ["empty", ""], ["broken-json", `{"command":"${CANARY}`], ["null", "null"], ["array", "[]"], ["string", `"${CANARY}"`],
  ["number", "1e309"], ["bool", "true"], ["binary", new Uint8Array([0, 255, 1, 2]).buffer],
  ["deep-1e4", deep(10000)], ["deep-1e5", deep(100000)],
  ["proto", `{"__proto__":{"admin":true},"command":"room.join","code":"${CANARY}","displayName":"x"}`],
  ["constructor", `{"constructor":{"prototype":{"x":1}},"type":"join-room","roomId":"${CANARY}"}`],
  ["lone-surrogate", `{"command":"room.join","code":"\\ud800${CANARY}","displayName":"\\u0000\\ud800"}`],
  ["unknown-cmd", JSON.stringify({ command: `x.${CANARY}`, type: `x-${CANARY}` })],
  ["wrong-types", JSON.stringify({ command: 123, type: { a: CANARY } })],
  ["near-limit", JSON.stringify({ command: "room.join", code: "AAAA", displayName: CANARY + "a".repeat(60 * 1024) })],
  ["over-limit", JSON.stringify({ command: "room.join", code: "AAAA", displayName: CANARY + "a".repeat(70 * 1024) })],
  ["huge-number", JSON.stringify({ command: "config.set", durationMs: 1e308, type: "set-points", points: -1e308 })],
];
const COMMANDS: Record<string, string[]> = {
  timer: "break.end break.start config.set driver.assign driver.resume driver.skip handoff.note.set member.add member.move member.remove member.shuffle participant.remove participant.rename phase.set presence.ping room.create room.join room.passphrase.set session.abort session.act session.complete session.reset time.ping".split(" "),
  hub: "room.check room.create room.join".split(" "),
  topic: "ai.unlock topic.clear topic.generate topic.set room.join".split(" "),
  roulette: "roulette.cycle.reset roulette.guest.add roulette.guest.remove roulette.include roulette.mode.set roulette.order.reset roulette.pick.set roulette.spin roulette.stop room.join".split(" "),
  agenda: "agenda.extend agenda.next agenda.pause agenda.reset agenda.resume agenda.scenario.set agenda.skip agenda.start agenda.sync room.join".split(" "),
  checkin: "checkin.again checkin.card.play checkin.method.choose checkin.method.draw checkin.reveal checkin.spectator.set checkin.visibility.set room.join".split(" "),
  poker: "check-room create-room join-room next-item next-round remove-participant reveal revote set-group-item set-item set-points set-recording set-spectator table-close table-deal table-exchange vote".split(" "),
};
const junkVariants = (key: string, name: string) => [
  { [key]: name },
  { [key]: name, code: CANARY, displayName: CANARY, value: { x: CANARY }, roomId: CANARY, name: CANARY, text: CANARY, durationMs: -1, index: 1e308, id: [CANARY] },
  { [key]: name, extra: CANARY, members: Array.from({ length: 5000 }, (_, i) => `${CANARY}${i}`), items: new Array(5000).fill({ title: CANARY }) },
];
const results: Array<{ tool: string; phase: string; probe: string; closed: string | null; errorFrames: string[]; echoed: boolean; alive: boolean }> = [];
async function alive(): Promise<boolean> {
  if (exited !== null) return false;
  try { const c = await open(null); c.ws.send(JSON.stringify({ command: "room.check", code: "ZZZZZZ" })); for (let i = 0; i < 25 && !c.frames.length; i++) await sleep(20); c.ws.close(); return c.frames.length > 0; } catch { return false; }
}
async function probe(tool: string, phase: string, label: string, payload: string | ArrayBuffer, joinCode?: string) {
  const c = await open(tool === "hub" ? null : tool);
  if (joinCode) {
    const join = tool === "poker" ? { type: "create-room", name: "fz" } : { command: "room.join", code: joinCode, displayName: "fz" + Math.random().toString(36).slice(2, 6) };
    c.ws.send(JSON.stringify(join)); await sleep(80);
  }
  const before = c.frames.length;
  try { c.ws.send(payload as string); } catch (e) { /* send 側の失敗 */ }
  await sleep(120);
  const after = c.frames.slice(before);
  const errs = after.map((f) => { try { const m = JSON.parse(f); return m.type === "error" ? (m.code ?? "error") : m.type; } catch { return "<non-json>"; } });
  results.push({ tool, phase, probe: label, closed: c.closed ? `${c.closed.code}` : null, errorFrames: errs, echoed: after.some((f) => f.includes(CANARY)), alive: true });
  try { c.ws.close(); } catch {}
}
const t0 = performance.now();
const code = await hubRoom();
for (const tool of Object.keys(COMMANDS)) {
  for (const [label, raw] of raws) await probe(tool, "pre", label, raw);
  for (const [label, raw] of raws) await probe(tool, "in-room", label, raw, code);
  const key = tool === "poker" ? "type" : "command";
  for (const name of COMMANDS[tool]) junkVariants(key, name).forEach((j, i) => { /* queued below */ });
  for (const name of COMMANDS[tool]) for (const [i, j] of junkVariants(key, name).entries()) await probe(tool, "in-room", `${name}#${i}`, JSON.stringify(j), code);
  // 連打（流量の制限が効くか・落ちないか）
  const c = await open(tool === "hub" ? null : tool);
  for (let i = 0; i < 500; i++) c.ws.send(JSON.stringify({ [key]: COMMANDS[tool][0], i }));
  await sleep(500);
  results.push({ tool, phase: "flood", probe: "500 frames", closed: c.closed ? `${c.closed.code}` : null, errorFrames: [...new Set(c.frames.map((f) => { try { const m = JSON.parse(f); return m.code ?? m.type; } catch { return "?"; } }))], echoed: false, alive: true });
  try { c.ws.close(); } catch {}
  const ok = await alive();
  results.push({ tool, phase: "after", probe: "server alive", closed: null, errorFrames: [], echoed: false, alive: ok });
  if (!ok) break;
}
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
await sleep(200);
proc.kill();
await proc.exited;
const logLines = logs.split("\n").filter(Boolean);
const canaryLogLines = logLines.filter((l) => l.includes(CANARY));
const events = new Map<string, number>();
for (const l of logLines) { try { const j = JSON.parse(l); const k = `${j.level ?? "?"}:${j.event ?? j.msg ?? "?"}`; events.set(k, (events.get(k) ?? 0) + 1); } catch { events.set("<non-json-line>", (events.get("<non-json-line>") ?? 0) + 1); } }
console.log(JSON.stringify({ elapsedSec: elapsed, probes: results.length, exitedDuringRun: exited, canaryLogLines: canaryLogLines.slice(0, 20), canaryLogCount: canaryLogLines.length, logEvents: Object.fromEntries(events), nonJsonLogSample: logLines.filter((l) => { try { JSON.parse(l); return false; } catch { return true; } }).slice(0, 10), results }, null, 1));
