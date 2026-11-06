#!/usr/bin/env bash
# 8.3（#562）: tasuki-sync の一部のファイルへ Stryker を command runner（bun test）で流す。
# 使い方: bash stryker-sync.sh <Stryker の置き場> <使い捨ての作業ツリー> <結果の置き場> <名前> <ファイル,ファイル,…>
#   ファイルは apps/tasuki-sync からの相対パス。作業ツリーは inPlace で書き換えて戻すので、使い捨ての写しを渡す。
#   Stryker の置き場は `npm install --prefix <置き場> @stryker-mutator/core@9.6.1` で作る（依存には足さない）。
set -euo pipefail
stryker_dir="$(cd "$1" && pwd)"; tree="$(cd "$2" && pwd)"; mkdir -p "$3"; out="$(cd "$3" && pwd)"; name="$4"
IFS=, read -ra files <<< "$5"
mutate="$(printf '"%s",' "${files[@]}")"; mutate="[${mutate%,}]"
conf="$tree/apps/tasuki-sync/stryker.$name.json"
cat > "$conf" <<JSON
{
  "testRunner": "command",
  "commandRunner": { "command": "bun test --timeout 15000 --bail" },
  "coverageAnalysis": "off",
  "mutate": $mutate,
  "inPlace": true,
  "concurrency": 1,
  "timeoutMS": 90000,
  "reporters": ["json", "html", "clear-text"],
  "jsonReporter": { "fileName": "$out/$name.json" },
  "htmlReporter": { "fileName": "$out/$name.html" },
  "tempDirName": ".stryker-tmp"
}
JSON
cd "$tree/apps/tasuki-sync"
trap 'rm -f "$conf"' EXIT
( time node "$stryker_dir/node_modules/@stryker-mutator/core/bin/stryker.js" run "stryker.$name.json" ) > "$out/$name.log" 2>&1
