#!/usr/bin/env bash
# core パッケージに Stryker（vitest-runner）を一度だけかける（#496 の 2 節）。
# 使い方: bash stryker-run.sh <Stryker を入れたディレクトリ> <使い捨ての作業ツリー> <結果を置くディレクトリ> <パッケージ名>...
#   Stryker は依存に足さない（原則 II）。別のディレクトリへ
#   `npm i @stryker-mutator/core@9 @stryker-mutator/vitest-runner@9 typescript@6.0.3` で入れる。
#   作業ツリーは `git worktree add --detach <dir> HEAD` → `pnpm install --frozen-lockfile` で作る。
#   inPlace（作業ツリーを書き換えて戻す）で流すので、手元の作業ツリーでは使わない。
set -u
STRYKER=$1
WT=$2
OUT=$3
shift 3
mkdir -p "$OUT"
for p in "$@"; do
  d="$WT/packages/$p"
  cat > "$d/stryker.survey.json" <<JSON
{
  "testRunner": "vitest",
  "plugins": ["$STRYKER/node_modules/@stryker-mutator/vitest-runner/dist/src/index.js"],
  "mutate": ["src/**/*.ts", "!src/**/*.d.ts", "!src/index.ts"],
  "coverageAnalysis": "perTest",
  "reporters": ["json", "clear-text"],
  "jsonReporter": { "fileName": "$OUT/$p.json" },
  "tempDirName": ".stryker-tmp",
  "inPlace": true,
  "concurrency": 4,
  "timeoutMS": 10000
}
JSON
  start=$(date +%s)
  (cd "$d" && timeout 3600 node "$STRYKER/node_modules/@stryker-mutator/core/bin/stryker.js" run stryker.survey.json > "$OUT/$p.log" 2>&1); rc=$?
  echo "$p,rc=$rc,sec=$(( $(date +%s) - start ))" >> "$OUT/summary.txt"
  rm -rf "$d/.stryker-tmp" "$d/stryker.survey.json"
done
