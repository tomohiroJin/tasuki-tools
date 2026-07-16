# 交代チャイムに音声「にせ」「まい」を追加（Issue #4） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AivisSpeech の話者「にせ」「まい」で合成した「ドライバー交代です」音声を、既存の交代チャイム選択肢に追加する（GitHub Issue #4）。

**Architecture:** 既存の `scripts/gen-voices.sh` を拡張して2話者分の mp3 を追加生成し、`platform/sound.ts` の `registerFileChimes` にエントリを2件追加する。UI（`NotifySettingsPanel`）は `CHIMES` 配列を動的に描画するため変更不要。

**Tech Stack:** Bash + AivisSpeech HTTP API（既存 `gen-voices.sh` と同じ）/ TypeScript / Vitest（既存 `sound.test.ts` と同じパターン）。

## Global Constraints

- 話者情報: にせ = speaker id `1937616896`、まい = speaker id `1431611904`（ローカル AivisSpeech エンジンで確認済み）。
- 読み上げテキストは既存の男声/女声と同じ「ドライバー交代です」で統一する。
- UIラベルは「音声（にせ）」「音声（まい）」（既存パターンに合わせる）。
- 生成した mp3 は `apps/web/public/sounds/` にコミットする（既存 `voice-male.mp3`/`voice-female.mp3` と同様）。
- AivisSpeech エンジンは `http://127.0.0.1:10101` で起動している前提（未起動なら `gen-voices.sh` が `exit 1` し既存 mp3 を保持する）。
- 設計の詳細は spec を正本とする: `docs/superpowers/specs/2026-07-16-voice-nise-mai-design.md`

---

### Task 1: 音声生成スクリプトの拡張と実行、CHIMES への登録

**Files:**
- Modify: `scripts/gen-voices.sh`
- Modify: `apps/web/src/platform/sound.ts`
- Modify: `apps/web/test/platform/sound.test.ts`
- Create（生成物、`git add` 対象）: `apps/web/public/sounds/voice-nise.mp3`、`apps/web/public/sounds/voice-mai.mp3`

**Interfaces:**
- Produces: `CHIMES`（`apps/web/src/platform/sound.ts` からエクスポート）に `id: "voice-nise"`・`id: "voice-mai"` の2エントリが追加される。既存のエクスポート（`playChime`/`registerFileChimes`/`CHIMES` 自体の型）は変更しない。

- [ ] **Step 1: 失敗するテストを追加**

`apps/web/test/platform/sound.test.ts` の次のブロック（`it("CHIMES は voice-male/voice-female を含む計8種"...)`）を丸ごと次に置き換える:

```ts
  it("CHIMES は voice-male/voice-female/voice-nise/voice-mai を含む計10種", () => {
    const ids = CHIMES.map((c) => c.id);
    expect(ids).toHaveLength(10);
    expect(ids).toEqual(expect.arrayContaining([
      "department", "melody", "sustained", "voice-male", "voice-female",
      "voice-nise", "voice-mai", "chime-up", "chime-down", "bell",
    ]));
    expect(new Set(ids).size).toBe(10);
    expect(CHIMES.every((c) => c.isReady)).toBe(true);
  });
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/platform/sound.test.ts`
Expected: FAIL（`toHaveLength(10)` に対し実際は8、`voice-nise`/`voice-mai` が `CHIMES` に無い）

- [ ] **Step 3: `gen-voices.sh` を拡張**

`scripts/gen-voices.sh` の内容を丸ごと次に置き換える（`MALE_ID`/`FEMALE_ID` の下に2定数を追加し、`gen` 呼び出しを2行追加するのみ。他は変更しない）:

```bash
#!/usr/bin/env bash
# 「ドライバー交代です」を AivisSpeech で男声/女声/にせ/まい合成し mp3 同梱する（生成物はコミット）。
set -euo pipefail
OUT="$(dirname "$0")/../apps/web/public/sounds"
ENGINE="http://127.0.0.1:10101"
TEXT="ドライバー交代です"
MALE_ID=606865152    # fumifumi（男声・実機確認で確定）
FEMALE_ID=497929760  # morioki（女声・実機確認で確定）
NISE_ID=1937616896   # にせ（Issue #4）
MAI_ID=1431611904    # まい（Issue #4）
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
gen "$NISE_ID" voice-nise
gen "$MAI_ID" voice-mai
```

- [ ] **Step 4: スクリプトを実行して mp3 を生成**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && bash scripts/gen-voices.sh`
Expected: 4行の `generated: .../voice-*.mp3` が出力される（`voice-male`/`voice-female` は再生成されるが内容は同一のはず。`voice-nise.mp3`・`voice-mai.mp3` が新規生成される）。AivisSpeech エンジンが未起動の場合は「AivisSpeech が ... で応答しません」で止まるので、その場合は起動を確認してから再実行する。

生成後、ファイルが存在し空でないことを確認する:

Run: `ls -la apps/web/public/sounds/voice-nise.mp3 apps/web/public/sounds/voice-mai.mp3`
Expected: 両ファイルとも数十KB程度のサイズで存在する（0バイトでないこと）。

- [ ] **Step 5: `sound.ts` に2エントリを追加**

`apps/web/src/platform/sound.ts` の `registerFileChimes([...])` 呼び出しを次に置き換える:

```ts
registerFileChimes([
  { id: "voice-male", label: "音声（男声）", isReady: true, play: (v) => playFile(soundUrl("voice-male"), v) },
  { id: "voice-female", label: "音声（女声）", isReady: true, play: (v) => playFile(soundUrl("voice-female"), v) },
  { id: "voice-nise", label: "音声（にせ）", isReady: true, play: (v) => playFile(soundUrl("voice-nise"), v) },
  { id: "voice-mai", label: "音声（まい）", isReady: true, play: (v) => playFile(soundUrl("voice-mai"), v) },
]);
```

- [ ] **Step 6: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/platform/sound.test.ts`
Expected: PASS（全件緑）

- [ ] **Step 7: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/scripts/gen-voices.sh \
  tdd-mob-pro-timer/apps/web/src/platform/sound.ts \
  tdd-mob-pro-timer/apps/web/test/platform/sound.test.ts \
  tdd-mob-pro-timer/apps/web/public/sounds/voice-nise.mp3 \
  tdd-mob-pro-timer/apps/web/public/sounds/voice-mai.mp3
git commit -m "feat(web): 交代チャイムに音声「にせ」「まい」を追加（Issue #4）"
```

---

### Task 2: 全体検証（typecheck / test / build / 実機確認）

**Files:** なし（検証のみ）

- [ ] **Step 1: 全体 typecheck**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm typecheck`
Expected: 4/4 タスク緑

- [ ] **Step 2: 全体テスト**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm test`
Expected: core/sync/web すべて緑（既存件数 + 本 Issue で更新した1件分の差分）

- [ ] **Step 3: 全体ビルド**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm build`
Expected: 3タスク（core/sync/web）すべて緑

- [ ] **Step 4: 実機確認（dev サーバー起動・UI選択肢とファイル参照の確認）**

音声を実際に「聴いた」という主張はしない。UI の選択肢に新規2件が表示されること、選択操作が可能なこと、選択後に試聴ボタンで生成される `<audio>` 要素（または `playFile` が生成する `Audio` インスタンス）の `src` が正しい mp3 ファイルを指すことを、ブラウザ自動操作ツールで確認する。

```bash
for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787 2>/dev/null); do kill -9 $p 2>/dev/null; done
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
bun run apps/sync/src/server.ts &
cd apps/web && ~/.local/bin/pnpm dev
```

dev ログの `Local:` URL をブラウザ自動操作ツールで開き:
1. ルームを作成し、ロビーの「交代通知」内の「通知音」セレクトを開く
2. 選択肢に「音声（にせ）」「音声（まい）」が含まれることをアクセシビリティスナップショットで確認
3. 「音声（にせ）」を選択し、`document.querySelector('select[aria-label="通知音"]').value` が `"voice-nise"` になっていることを `browser_evaluate` で確認
4. 試聴ボタンをクリックした際にネットワークタブ等で `voice-nise.mp3` へのリクエストが発生する（または `new Audio(...)` の src がそれを指す）ことを、可能であれば `browser_evaluate` で `HTMLAudioElement` の生成をフックして確認する（Issue #2/#3 のオシレーターフックと同様の手法）
5. 同様に「音声（まい）」でも確認

確認後、起動した sync/dev サーバーを停止する。

- [ ] **Step 5: Issue #4 のクローズ判断を人間に委ねる**

PR 作成・Issue クローズはユーザー承認後に行う。このタスクでは実施しない。
