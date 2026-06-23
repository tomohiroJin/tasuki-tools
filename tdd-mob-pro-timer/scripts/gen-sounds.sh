#!/usr/bin/env bash
# 交代チャイムの実音源を ffmpeg で生成する（生成物は public/sounds/ にコミットする）。
set -euo pipefail
OUT="$(dirname "$0")/../apps/web/public/sounds"
mkdir -p "$OUT"

# ping: 2 音の「ピンポン」
ffmpeg -y -f lavfi -i "sine=frequency=988:duration=0.12" -f lavfi -i "sine=frequency=1319:duration=0.2" \
  -filter_complex "[0][1]concat=n=2:v=0:a=1,afade=t=out:st=0.26:d=0.05,volume=0.8" \
  -ar 44100 -b:a 96k "$OUT/ping.mp3"

# bell: 減衰の長いベル
ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.7" \
  -af "afade=t=out:st=0.08:d=0.6,volume=0.7" \
  -ar 44100 -b:a 96k "$OUT/bell.mp3"

# knock: 低めの 2 連ノック
ffmpeg -y -f lavfi -i "sine=frequency=200:duration=0.06" -f lavfi -i "anullsrc=r=44100:cl=mono:d=0.06" -f lavfi -i "sine=frequency=200:duration=0.06" \
  -filter_complex "[0][1][2]concat=n=3:v=0:a=1,afade=t=in:st=0:d=0.005,afade=t=out:st=0.16:d=0.02,volume=0.9" \
  -ar 44100 -b:a 96k "$OUT/knock.mp3"

echo "generated: $OUT/{ping,bell,knock}.mp3"
