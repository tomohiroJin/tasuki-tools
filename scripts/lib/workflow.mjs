/** CI のブロック形式の workflow を分割する共有処理（#487・#488）。 */
/** `jobs:` の直下（2 字下げ）の名前ごとに行を分ける。 */
export function splitJobs(text) {
  const jobs = [];
  let inJobs = false;
  let current = null;
  text.split("\n").forEach((raw, i) => {
    if (/^jobs:\s*$/.test(raw)) {
      inJobs = true;
      return;
    }
    if (!inJobs) return;
    if (/^\S/.test(raw)) {
      inJobs = false;
      current = null;
      return;
    }
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(raw);
    if (m) {
      current = { name: m[1], lines: [] };
      jobs.push(current);
      return;
    }
    if (current) current.lines.push({ text: raw, line: i + 1 });
  });
  return jobs;
}

/** ジョブの行を、6 字下げの `- ` ごとのステップに分ける。 */
export function splitSteps(lines) {
  const steps = [];
  let current = null;
  for (const { text, line } of lines) {
    if (/^ {6}- /.test(text)) {
      current = { line, lines: [text] };
      steps.push(current);
    } else if (current && (/^ {7,}\S/.test(text) || text.trim() === "")) {
      current.lines.push(text);
    } else {
      current = null;
    }
  }
  return steps.map((s) => ({ line: s.line, text: s.lines.join("\n") }));
}


/** コメント行（行頭の `#`）を外す。`dropBlank` なら空行も外す。`run:` の中の ` #` はシェルに渡るので触らない。 */
export function stripComments(text, { dropBlank = false } = {}) {
  return text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l) && !(dropBlank && l.trim() === ""))
    .join("\n");
}

/** workflow 直下の `env:` の塊（インデントした行）をそのまま返す。無ければ undefined。 */
export function topLevelEnvBlock(workflow) {
  return /^env:\n((?:[ \t].*\n|\n)*)/m.exec(workflow)?.[1];
}
