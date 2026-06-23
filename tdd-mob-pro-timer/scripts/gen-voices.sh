#!/usr/bin/env bash
# 「ドライバー交代です」を AivisSpeech で男声/女声合成し mp3 同梱する（生成物はコミット）。
set -euo pipefail
OUT="$(dirname "$0")/../apps/web/public/sounds"
ENGINE="http://127.0.0.1:10101"
TEXT="ドライバー交代です"
MALE_ID=497929760    # morioki（実機で性別確認・不適なら変更）
FEMALE_ID=606865152  # fumifumi（実機で性別確認・不適なら変更）
mkdir -p "$OUT"
curl -s -m 5 "$ENGINE/version" >/dev/null || { echo "AivisSpeech が $ENGINE で応答しません。起動後に再実行してください（既存 mp3 は保持）。" >&2; exit 1; }
gen() {
  local sid="$1" name="$2"
  local q; q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$TEXT")
  curl -s -m 20 -f -X POST "$ENGINE/audio_query?text=$q&speaker=$sid" -o /tmp/_aq.json
  curl -s -m 60 -f -X POST "$ENGINE/synthesis?speaker=$sid" -H "Content-Type: application/json" -d @/tmp/_aq.json -o /tmp/_av.wav
  ffmpeg -y -i /tmp/_av.wav -ar 44100 -b:a 96k "$OUT/$name.mp3" 2>/dev/null
  echo "generated: $OUT/$name.mp3"
}
gen "$MALE_ID" voice-male
gen "$FEMALE_ID" voice-female
