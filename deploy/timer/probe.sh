#!/usr/bin/env bash
# #135 の破壊検証用。マージしない。
# SC2045: ls の出力を反復してはならない（shellcheck の error レベル）
for f in $(ls *.txt); do
  echo "$f"
done
