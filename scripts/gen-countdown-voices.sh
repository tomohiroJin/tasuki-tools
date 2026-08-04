#!/usr/bin/env bash
# カウントダウン読み上げ用の数字音声(1〜15)を男声/女声で AivisSpeech 合成し mp3 同梱する（生成物はコミット、Issue #5）。
set -euo pipefail
OUT="$(dirname "$0")/../apps/web/public/sounds/countdown"
ENGINE="http://127.0.0.1:10101"
MALE_ID=606865152    # fumifumi（男声・gen-voices.sh と同一話者）
FEMALE_ID=497929760  # morioki（女声・gen-voices.sh と同一話者）
mkdir -p "$OUT"
curl -s -m 5 "$ENGINE/version" >/dev/null || { echo "AivisSpeech が $ENGINE で応答しません。起動後に再実行してください（既存 mp3 は保持）。" >&2; exit 1; }
gen() {
  local sid="$1" name="$2" text="$3"
  local q; q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$text")
  curl -s -m 20 -f -X POST "$ENGINE/audio_query?text=$q&speaker=$sid" -o /tmp/_aq.json
  curl -s -m 60 -f -X POST "$ENGINE/synthesis?speaker=$sid" -H "Content-Type: application/json" -d @/tmp/_aq.json -o /tmp/_av.wav
  ffmpeg -y -i /tmp/_av.wav -ar 44100 -b:a 96k "$OUT/$name.mp3" 2>/dev/null
  echo "generated: $OUT/$name.mp3"
}
for n in $(seq 1 15); do
  gen "$MALE_ID" "count-male-$n" "$n"
  gen "$FEMALE_ID" "count-female-$n" "$n"
done
