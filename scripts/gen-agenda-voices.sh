#!/usr/bin/env bash
# 「時間切れです」を AivisSpeech で男声/女声/にせ/まい合成し、agenda の時間切れの音として mp3 同梱する（生成物はコミット。#669）。
# 話者は timer（gen-voices.sh）と同じ 4 人。AivisSpeech のモデルは ACML 1.0（クレジット表記は任意）。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/agenda-web/public/sounds"
ENGINE="http://127.0.0.1:10101"
TEXT="時間切れです"
MALE_ID=606865152    # fumifumi（男声）
FEMALE_ID=497929760  # morioki（女声）
NISE_ID=1937616896   # にせ
MAI_ID=1431611904    # まい
mkdir -p "$OUT"
curl -s -m 5 "$ENGINE/version" >/dev/null || { echo "AivisSpeech が $ENGINE で応答しません。起動後に再実行してください（既存 mp3 は保持）。" >&2; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
gen() {
  local sid="$1" name="$2"
  local q
  q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$TEXT")
  curl -s -m 20 -f -X POST "$ENGINE/audio_query?text=$q&speaker=$sid" -o "$WORK/aq.json"
  curl -s -m 60 -f -X POST "$ENGINE/synthesis?speaker=$sid" -H "Content-Type: application/json" -d @"$WORK/aq.json" -o "$WORK/av.wav"
  ffmpeg -y -i "$WORK/av.wav" -ar 44100 -b:a 96k "$OUT/$name.mp3" 2>/dev/null
  echo "generated: $OUT/$name.mp3"
}
gen "$MALE_ID" timeout-male
gen "$FEMALE_ID" timeout-female
gen "$NISE_ID" timeout-nise
gen "$MAI_ID" timeout-mai
