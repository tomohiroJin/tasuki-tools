// 2.5 節で拾った行の生き残りを、Stryker の JSON から正確な置き換えつきで取り出す
import { readFileSync } from "node:fs";
const dir = process.argv[2];
const ROWS = {
  "roulette-core": { "src/roulette.ts": [52, 87, 123, 125, 153, 154, 158, 200, 203, 390] },
  "agenda-core": { "src/agenda.ts": [73, 117] },
  "timer-core": { "src/decide.ts": [161, 162], "src/evolve.ts": [474, 476], "src/break-policy.ts": [68], "src/aggregate.ts": [269] },
  "poker-core": { "src/card-game.ts": [77, 81, 85] },
  "rate-limit": { "src/token-bucket.ts": [110, 136, 228, 269], "src/server-env.ts": [31, 76, 77, 78, 79, 80], "src/client-key.ts": [87, 107, 109, 110, 111, 115, 118, 157, 159] },
};
const out = [];
for (const [pkg, files] of Object.entries(ROWS)) {
  const r = JSON.parse(readFileSync(`${dir}/${pkg}.json`, "utf8"));
  for (const [file, lines] of Object.entries(files)) {
    for (const m of r.files[file].mutants) {
      if (!["Survived", "NoCoverage"].includes(m.status) || !lines.includes(m.location.start.line)) continue;
      if (m.mutatorName === "StringLiteral" && /token-bucket/.test(file)) continue; // 例外の文言
      out.push({ pkg, file, id: m.id, line: m.location.start.line, mutator: m.mutatorName, replacement: m.replacement, location: m.location });
    }
  }
}
console.log(JSON.stringify(out));
