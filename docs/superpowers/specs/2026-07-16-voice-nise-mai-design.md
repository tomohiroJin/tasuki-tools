# 交代チャイムに音声「にせ」「まい」を追加（Issue #4）設計

## 背景・目的

ユーザーフィードバック「追加したい音声は にせ と まい です」に対応する。既存の交代チャイムは AivisSpeech で合成した「音声（男声）」「音声（女声）」の2話者があり、これに新規2話者を追加する。

GitHub Issue: https://github.com/tomohiroJin/tasuki-tools/issues/4

## 話者情報（ローカル AivisSpeech エンジンで確認済み）

- にせ: speaker_uuid `bf56410a-d8e6-430d-a477-f789e16206d3` / style「ノーマル」 id `1937616896`
- まい: speaker_uuid `41b7785f-35cc-4089-a360-dd8a63da5e75` / style「ノーマル」 id `1431611904`

## 要件（EARS）

- ユーザーが個人設定の「通知音」選択肢を開いたとき、システムは「音声（にせ）」「音声（まい）」を既存の選択肢に加えて表示する。
- ユーザーが「音声（にせ）」または「音声（まい）」を選択して交代（または試聴）が発生したとき、システムは対応する話者で合成した「ドライバー交代です」の音声を再生する。

## 設計判断（ユーザー承認済み）

- **UIラベル**: 「音声（にせ）」「音声（まい）」。既存の「音声（男声）」「音声（女声）」と同じ命名パターン。
- **読み上げテキスト**: 既存の男声/女声と同じ「ドライバー交代です」で統一（YAGNI、話者ごとの台詞バリエーションはスコープ外）。
- **音声生成**: 既存の `scripts/gen-voices.sh` を拡張する（新規スクリプトは作らない）。

## アーキテクチャ・データフロー

### `scripts/gen-voices.sh` の拡張

既存の `MALE_ID`/`FEMALE_ID` 定数・`gen()` 呼び出しと同じパターンで、`NISE_ID=1937616896`・`MAI_ID=1431611904` を追加し、`gen "$NISE_ID" voice-nise`・`gen "$MAI_ID" voice-mai` を呼ぶ。生成物 `voice-nise.mp3`・`voice-mai.mp3` は `apps/web/public/sounds/` にコミットする（既存の `voice-male.mp3`/`voice-female.mp3` と同様）。

### `platform/sound.ts` の変更

既存の `registerFileChimes([...])` 呼び出し（`voice-male`/`voice-female` を登録している箇所）に2エントリを追加する:

```ts
registerFileChimes([
  { id: "voice-male", label: "音声（男声）", isReady: true, play: (v) => playFile(soundUrl("voice-male"), v) },
  { id: "voice-female", label: "音声（女声）", isReady: true, play: (v) => playFile(soundUrl("voice-female"), v) },
  { id: "voice-nise", label: "音声（にせ）", isReady: true, play: (v) => playFile(soundUrl("voice-nise"), v) },
  { id: "voice-mai", label: "音声（まい）", isReady: true, play: (v) => playFile(soundUrl("voice-mai"), v) },
]);
```

`CHIMES` 配列は `voice-male`/`voice-female` の2件を含め8種→10種になる。`registerFileChimes` は既に「同一 id が無ければ追加」という冪等ロジックを持つため、この変更のみで完結する。

### UI への配線

`NotifySettingsPanel.tsx` は `CHIMES.map(...)` で選択肢を動的に描画しているため、コード変更は不要。`CHIMES` にエントリが増えれば自動的に選択肢に反映される。

## エラーハンドリング

既存の `gen-voices.sh` の方針を踏襲: AivisSpeech エンジンに接続できない場合はスクリプトが `exit 1` し、既存の mp3 ファイルは保持される（半端な生成物で上書きしない）。`playFile` 側のエラーハンドリング（再生失敗を黙って無視）は変更しない。

## テスト方針

- `sound.test.ts` の「CHIMES は voice-male/voice-female を含む計8種」テストを、`voice-nise`/`voice-mai` を含む計10種に更新する。
- 実機確認: AivisSpeech エンジン（127.0.0.1:10101、起動中）で実際に mp3 を生成し、dev サーバーの通知設定パネルで「音声（にせ）」「音声（まい）」が選択肢に表示され、選択・試聴操作が可能であることを確認する。音声を実際に「聴いた」という主張はしない（音声再生の代理検証として `<audio>` 要素の `src` が正しいファイルを指すことを確認する）。

## スコープ外

- 話者ごとの台詞バリエーション
- 音声によるカウントダウン読み上げ（Issue #5 で扱う）
