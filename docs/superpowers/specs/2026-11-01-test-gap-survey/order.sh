#!/usr/bin/env bash
# 各パッケージのテストを、ランダムな順（種 11・22・33）と同じ順で 3 回ずつ流す（#496 の 3 節）。
# 使い方: bash order.sh <リポジトリのルート> <結果を置くディレクトリ>
#   先に `node scripts/check-toolchain.mjs test` を通しておく（bun は宣言の版が PATH にあること）。
set -u
ROOT=$1
OUT=$2
mkdir -p "$OUT"
cd "$ROOT" || exit 1
echo "pkg,mode,seed,rc,sec" > "$OUT/summary.csv"
for d in packages/* apps/* e2e; do
  [ -f "$d/package.json" ] || continue
  t=$(node -e "console.log(require('./$d/package.json').scripts?.test||'')")
  case "$t" in
    vitest*) runner=vitest ;;
    "bun test"*) runner=bun ;;
    *) echo "$d,skip,-,-,-" >> "$OUT/summary.csv"; continue ;;
  esac
  name=$(echo "$d" | tr / _)
  for seed in 11 22 33 0 0b 0c; do
    if [[ $seed == 0* ]]; then mode=fixed; else mode=shuffle; fi
    start=$(date +%s)
    log="$OUT/$name.$mode.$seed.log"
    if [ "$runner" = vitest ]; then
      if [ "$mode" = shuffle ]; then
        (cd "$d" && timeout 900 pnpm exec vitest run --sequence.shuffle "--sequence.seed=$seed" > "$log" 2>&1); rc=$?
      else
        (cd "$d" && timeout 900 pnpm exec vitest run > "$log" 2>&1); rc=$?
      fi
    else
      if [ "$mode" = shuffle ]; then
        (cd "$d" && timeout 900 bun test --timeout 15000 --randomize "--seed=$seed" > "$log" 2>&1); rc=$?
      else
        (cd "$d" && timeout 900 bun test --timeout 15000 > "$log" 2>&1); rc=$?
      fi
    fi
    echo "$d,$mode,$seed,$rc,$(( $(date +%s) - start ))" >> "$OUT/summary.csv"
  done
done
echo DONE >> "$OUT/summary.csv"
