#!/usr/bin/env bash
# 交代チャイムの実音源を ffmpeg で生成する（生成物は public/sounds/ にコミットする）。
set -euo pipefail
OUT="$(dirname "$0")/../apps/web/public/sounds"
mkdir -p "$OUT"

# department: デパート呼び出し風（4音 下降・約1.4秒）
ffmpeg -y \
  -f lavfi -i "sine=frequency=784:duration=0.32" \
  -f lavfi -i "sine=frequency=659:duration=0.32" \
  -f lavfi -i "sine=frequency=523:duration=0.32" \
  -f lavfi -i "sine=frequency=392:duration=0.45" \
  -filter_complex "[0][1][2][3]concat=n=4:v=0:a=1,afade=t=out:st=1.2:d=0.25,volume=0.85" \
  -ar 44100 -b:a 96k "$OUT/department.mp3"

# melody: 6音の短い旋律（約1.3秒）
ffmpeg -y \
  -f lavfi -i "sine=frequency=523:duration=0.22" \
  -f lavfi -i "sine=frequency=659:duration=0.22" \
  -f lavfi -i "sine=frequency=784:duration=0.22" \
  -f lavfi -i "sine=frequency=1047:duration=0.22" \
  -f lavfi -i "sine=frequency=784:duration=0.22" \
  -f lavfi -i "sine=frequency=659:duration=0.3" \
  -filter_complex "[0][1][2][3][4][5]concat=n=6:v=0:a=1,afade=t=out:st=1.1:d=0.25,volume=0.8" \
  -ar 44100 -b:a 96k "$OUT/melody.mp3"

# sustained: 持続トーン（トレモロで脈動・約1.8秒）
ffmpeg -y -f lavfi -i "sine=frequency=660:duration=1.8" \
  -af "tremolo=f=6:d=0.6,afade=t=in:st=0:d=0.05,afade=t=out:st=1.5:d=0.3,volume=0.7" \
  -ar 44100 -b:a 96k "$OUT/sustained.mp3"

# bell: 減衰の長いベル（既存維持）
ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.7" \
  -af "afade=t=out:st=0.08:d=0.6,volume=0.7" \
  -ar 44100 -b:a 96k "$OUT/bell.mp3"

echo "generated: $OUT/{department,melody,sustained,bell}.mp3"

echo $(echo hi)
