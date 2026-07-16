# 音声によるカウントダウン読み上げ（Issue #5）設計

## 背景・目的

交代前カウントダウン（Issue #2）は現在トーン音（3段階音程変化、Issue #3）のみで予告する。「にせ」「まい」の音声追加（Issue #4）と合わせて、カウントダウン自体を「10、9、8…」と声で読み上げる方式を選べるようにする。声のカウントダウンの方が、あと何秒かを直感的に把握しやすいというユーザー要望が起点。

GitHub Issue: https://github.com/tomohiroJin/tasuki-tools/issues/5

## 前提（既存実装、Issue #2/#3/#4 で完了済み）

- `useCountdownTick`（`apps/web/src/ui/use-countdown-tick.ts`）: `secondsLeft` の整数秒境界を監視し、`opts.enabled && current <= opts.thresholdSeconds` の間、毎秒1回 `playCountdownTick` を呼ぶ。
- `NotifyPreferences`（`apps/web/src/prefs/local-prefs.ts`）: `countdownEnabled`（既定 false）・`countdownSeconds`（既定15、UI上限は **5〜15**。Issue本文の「最大20」は誤りで、実装済みUIの実際の上限に合わせる）。
- `platform/sound.ts`: `playCountdownTick(volume, stage)` がトーン音を鳴らす。`CHIMES` 配列・`registerFileChimes` は交代の瞬間に鳴らす「交代チャイム」の選択肢管理用で、カウントダウン中の毎秒発火とは別の関心事。

## 設計判断（ユーザー承認済み）

- **対象話者**: 男声・女声のみ（にせ・まいは対象外。既定の落ち着いた声という位置づけで、キャラクター色の強いにせ・まいは今回のスコープに含めない）。
- **緊迫感演出**: 音声読み上げは平坦なまま。数字の読み上げ自体がカウントダウンの直感性を与えるため、トーン音の3段階音程変化（Issue #3）は音声読み上げモードでは適用しない。
- **フォールバック方式**: 再生失敗時のランタイム検知。`Audio` 要素の `error` イベント・`play()` の reject を検知した場合のみ、その場で `playCountdownTick`（トーン音）に切り替えて再生する。
- **アーキテクチャ**: 専用モジュール（新規関数）+ 独立した設定フィールドとする。既存の `CHIMES`/`registerFileChimes`（交代チャイム選択用）には一切変更を加えない。カウントダウン読み上げは「交代の瞬間に鳴らす音」とは意味的に異なる関心事のため混在させない。
- **生成スクリプト**: 新規 `scripts/gen-countdown-voices.sh`。既存 `gen-voices.sh` はフレーズ（「ドライバー交代です」）1話者1ファイルの生成が役割で、数字1〜15×2話者=30ファイルのループ生成とは役割が明確に異なるため分離する。

## 要件（EARS）

- ユーザーが個人設定の「カウントダウン方式」を「音声読み上げ」に設定し、話者（男声/女声）を選択したとき、システムはその設定を永続化する。
- カウントダウン予告音が有効かつ方式が「音声読み上げ」のとき、残り秒数が整数秒に変わるたびに、システムは選択された話者でその数字を読み上げた音声を1回再生する。
- 音声読み上げ選択時、システムは音程3段階変化のトーン演出を適用しない。
- 音声ファイルの再生に失敗したとき、システムはその回のみトーン音（`playCountdownTick`）にフォールバックして再生する。
- ユーザーが「トーン音」を選択したとき、システムは既存の Issue #2/#3 の挙動（3段階音程変化トーン）のまま鳴らす。

## アーキテクチャ・データフロー

### 音声アセット生成（`scripts/gen-countdown-voices.sh`、新規）

- 対象話者: 男声 fumifumi（speaker id `606865152`）・女声 morioki（speaker id `497929760`）— `gen-voices.sh` の `MALE_ID`/`FEMALE_ID` と同一話者・同一 id を再利用。
- 数字範囲: 1〜15（`countdownSeconds` の UI 上限と一致）。
- テキスト: 数字そのもの（例: `"15"`、`"1"`）を `audio_query` に渡す。
- 出力: `apps/web/public/sounds/countdown/count-male-{1..15}.mp3` / `count-female-{1..15}.mp3`（計30ファイル、生成物はコミット）。
- `gen-voices.sh` と同じ curl（`audio_query` → `synthesis`）→ ffmpeg 変換パターンをループで適用する。AivisSpeech エンジンに接続できない場合はスクリプトを `exit 1` し、既存 mp3 は保持する（既存スクリプトの方針を踏襲）。

### データモデル（`apps/web/src/prefs/local-prefs.ts`）

`NotifyPreferences` に2フィールド追加:

```ts
export interface NotifyPreferences {
  // ...既存フィールド...
  /** 交代前カウントダウンの方式。既定 "tone"（Issue #5）。 */
  countdownMode: "tone" | "voice";
  /** 音声読み上げ選択時に使う話者。既定 "voice-male"（Issue #5）。 */
  countdownVoiceId: "voice-male" | "voice-female";
}
```

- `DEFAULT_NOTIFY_PREFERENCES` に `countdownMode: "tone"`・`countdownVoiceId: "voice-male"` を追加。既存ユーザーは設定未保存のため既定値が適用され、挙動は変わらない（トーン音のまま）。
- `loadNotifyPreferences` の型ガードに2フィールドを追加し、既存パターン（未保存・破損時は既定値で補完）を踏襲する。

### 再生ロジック（`apps/web/src/platform/sound.ts`）

```ts
const countdownVoiceUrl = (voiceId: "voice-male" | "voice-female", n: number): string => {
  const speaker = voiceId === "voice-male" ? "male" : "female";
  return `${import.meta.env.BASE_URL}sounds/countdown/count-${speaker}-${n}.mp3`;
};

/** カウントダウン中の数字読み上げ。再生失敗時（ファイル欠損等）は playCountdownTick にフォールバック。 */
export function playCountdownVoice(
  n: number,
  voiceId: "voice-male" | "voice-female",
  volume: number,
): void {
  if (typeof Audio === "undefined") {
    playCountdownTick(volume);
    return;
  }
  try {
    const a = new Audio(countdownVoiceUrl(voiceId, n));
    a.volume = Math.min(1, Math.max(0, volume));
    a.addEventListener("error", () => playCountdownTick(volume), { once: true });
    void a.play().catch(() => playCountdownTick(volume));
  } catch {
    playCountdownTick(volume);
  }
}
```

`CHIMES` 配列・`registerFileChimes` には変更を加えない。

### フック統合（`apps/web/src/ui/use-countdown-tick.ts`）

```ts
export interface CountdownTickOptions {
  enabled: boolean;
  thresholdSeconds: number;
  volume: number;
  mode: "tone" | "voice";
  voiceId: "voice-male" | "voice-female";
}
```

発火部分を分岐:

```ts
if (opts.mode === "voice") {
  playCountdownVoice(current, opts.voiceId, opts.volume);
} else {
  const stage = computeCountdownStage(current, opts.thresholdSeconds);
  playCountdownTick(opts.volume, stage);
}
```

呼び出し元（`Lobby.tsx`/`Session.tsx`）で `NotifyPreferences` から `countdownMode`/`countdownVoiceId` を渡すよう配線する。

### UI（`apps/web/src/ui/components/NotifySettingsPanel.tsx`）

既存の「カウントダウン予告秒数」スライダー（`countdownEnabled` 時のみ表示）の直下に、`countdownEnabled` 時のみ表示する新セクションを追加する:

- ラジオボタン「トーン音 / 音声読み上げ」（`countdownMode` を更新）
- `countdownMode === "voice"` のときのみ表示する話者セレクト「男声 / 女声」（`countdownVoiceId` を更新）

`NotifySettings.tsx`（ヘッダーポップオーバー）と `NotifySettingsPanel.tsx`（ロビー設定パネル）は共用コンポーネントのため、両方に自動的に反映される。id 衝突は v2.7 で導入済みの `useId` 一意化により発生しない見込み。

## エラーハンドリング

- 音声ファイルの再生失敗（欠損・ネットワーク不安定等）は `playCountdownVoice` 内でランタイム検知し、その回のみ `playCountdownTick` にフォールバックする。ユーザー体験としては「無音にならない」ことを保証する。
- 音声アセット生成時に AivisSpeech エンジンへ接続できない場合は `gen-countdown-voices.sh` が `exit 1` し、既存 mp3 ファイルを保持する（半端な生成物で上書きしない）。

## テスト方針

- `sound.test.ts`: `playCountdownVoice` が正しい URL（`sounds/countdown/count-{speaker}-{n}.mp3`）で `Audio` を生成することを検証。`Audio` をモックし `error` イベント発火時に `playCountdownTick` 相当（トーン再生）が呼ばれることを検証。
- `use-countdown-tick.test.ts`: 既存の秒境界検知テストに `mode: "voice"` ケースを追加し、`playCountdownVoice` が正しい引数（数字・voiceId・volume）で呼ばれることを検証。`mode: "tone"`（既定）では従来どおり `playCountdownTick` が呼ばれることを回帰確認。
- `local-prefs.test.ts`: `countdownMode`/`countdownVoiceId` の保存・読込・既定値補完のテストを既存パターンに倣って追加。
- 実機聴取確認: AivisSpeech エンジン（127.0.0.1:10101）で `gen-countdown-voices.sh` を実行し30ファイルを生成後、`pnpm dev` でロビー設定パネルから「音声読み上げ」を選択し、カウントダウン中に毎秒その話者の数字が読み上げられることを実際に聴いて確認する。

## スコープ外

- にせ・まい話者でのカウントダウン読み上げ（将来拡張の余地として `countdownVoiceId` の型を拡張しやすい形にはしておくが、今回のファイル生成対象には含めない）
- 音声読み上げモードでの音量・音程等の段階的演出（Issue #3 相当の効果はトーン方式のみ）
- オンザフライ音声合成（レイテンシの都合で事前生成方式のみを採用）
