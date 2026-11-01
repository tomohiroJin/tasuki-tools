// Stryker の JSON 報告から、パッケージごとの生存率と生き残った変異の一覧を出す
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2];
const rows = []; const survivors = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const pkg = f.replace(/\.json$/, "");
  const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const c = {}; const surv = [];
  for (const [file, data] of Object.entries(r.files)) {
    const src = data.source.split("\n");
    for (const m of data.mutants) {
      c[m.status] = (c[m.status] ?? 0) + 1;
      if (m.status === "Survived" || m.status === "NoCoverage") surv.push({ file, line: m.location.start.line, status: m.status, mutator: m.mutatorName, replacement: (m.replacement ?? "").slice(0, 80).replace(/\s+/g, " "), code: (src[m.location.start.line - 1] ?? "").trim().slice(0, 100) });
    }
  }
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const valid = total - (c.CompileError ?? 0) - (c.RuntimeError ?? 0) - (c.Ignored ?? 0);
  const alive = (c.Survived ?? 0) + (c.NoCoverage ?? 0);
  rows.push({ pkg, total, killed: c.Killed ?? 0, timeout: c.Timeout ?? 0, survived: c.Survived ?? 0, noCov: c.NoCoverage ?? 0, compileErr: c.CompileError ?? 0, runtimeErr: c.RuntimeError ?? 0, survivalRate: valid ? (100 * alive / valid).toFixed(1) + "%" : "-" });
  survivors[pkg] = surv;
}
const byMut = {};
for (const [pkg, list] of Object.entries(survivors)) for (const s of list) byMut[s.mutator] = (byMut[s.mutator] ?? 0) + 1;
console.log(JSON.stringify({ rows, byMutator: byMut, survivors }, null, 1));
