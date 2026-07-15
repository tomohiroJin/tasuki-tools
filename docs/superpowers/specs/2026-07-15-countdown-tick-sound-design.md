# 交代前カウントダウン音（Issue #2）設計

## 背景・目的

実機フィードバック「タイマーは時報みたいに10〜20秒前からカウントするといいですね」に対応する。
現状、交代の瞬間にチャイムが1回鳴るのみで、交代が近づいていることの事前予告がない。
交代直前に短い予告音を鳴らすことで、ドライバーが心の準備をしやすくする。

GitHub Issue: https://github.com/tomohiroJin/tasuki-tools/issues/2

## 要件（EARS）

- タイマーが走行中（`running=true`）かつ一時停止中でも休憩中でもなく、交代までの残り秒数が個人設定の予告秒数（既定 15 秒、5〜15 秒の範囲で調整可）以下になったとき、システムは 1 秒ごとに短いカウントダウン音を鳴らす。
- 交代（ドライバー切り替え）が発生したとき、システムはカウントダウン音の連打を止め、既存の交代チャイム（`playChime`、`useSwitchAlert` 側）を鳴らす。挙動は既存のまま変更しない。
- 一時停止中・休憩中は、システムはカウントダウン音を鳴らさない。
- ユーザーが個人設定でカウントダウン音を無効化した場合（既定は無効）、システムはカウントダウン音を鳴らさない。既存の交代チャイム自体の on/off とは独立して制御できる。

## 設計判断（ユーザー承認済み）

- **設定の主体**: 個人設定（`NotifyPreferences`）。ルーム設定ではない。ユーザーごとにカウントダウン音の好みが分かれるため、既存の音/振動/OS通知と同じ個人ゲートに乗せる。
- **予告秒数**: 個人設定でスライダー調整可能。範囲 5〜15 秒、既定 15 秒。
- **カウント中の音**: 新規の短い単一トーン（既存チャイムの流用ではない）。#3（音程3段階）の土台にもなる。
- **既定値**: OFF（既存 `notify.enabled` の既定と一致）。

## アーキテクチャ・データフロー

### 実装アプローチ

クライアント側で `secondsLeft`（ServerClock から導出済みの残り秒数、Session が約200ms間隔で保持）の整数境界を監視するフックを追加する。サーバー側の変更は不要。

比較検討したサーバー配信方式（`suggest-break` と同様に毎秒シグナルを配信）は、カウントダウン音が個人ローカル再生であり全クライアント間の厳密な同期が要件にないため、追加のワイヤープロトコル・sync 実装コストに見合わないと判断し不採用とした。

### 新規フック `apps/web/src/ui/use-countdown-tick.ts`

```
useCountdownTick(
  secondsLeft: number,
  running: boolean,
  isPaused: boolean,
  onBreak: boolean,
  opts: { enabled: boolean; thresholdSeconds: number; volume: number },
): void
```

- `secondsLeft` を `Math.ceil` した整数値を ref に保持し、前回発火した秒と異なる、かつ `0 < 整数値 <= thresholdSeconds`、かつ `running && !isPaused && !onBreak && opts.enabled` のときだけ 1 回トーンを鳴らす。
- 副作用のみを持つフック（`useSwitchAlert` と同じ形）。戻り値なし。
- 単発トーン再生は `platform/sound.ts` に新規追加する `playCountdownTick(volume)`（`scheduleTones` を短いビープ1音で呼ぶラッパー）を使う。

### 呼び出し側

`Session.tsx` で既存の `useSwitchAlert` 呼び出しの隣に追加する:

```
useCountdownTick(secondsLeft, running, isPaused, onBreak, {
  enabled: notify.countdownEnabled,
  thresholdSeconds: notify.countdownSeconds,
  volume: notify.volume,
});
```

### 個人設定（`prefs/local-prefs.ts`）

`NotifyPreferences` に以下を追加:
- `countdownEnabled: boolean`（既定 `false`）
- `countdownSeconds: number`（既定 `15`、範囲 5〜15）

`NotifySettingsPanel.tsx` にトグル＋スライダー UI を追加する。既存の音量スライダーと同じパターンに従う。

### #3（音程3段階）との接続点

`playCountdownTick` の内部実装は、将来「現在の段階（1〜3）」を受け取れるように区間計算を `sound.ts` 側の純粋関数として切り出しておく。ただし #2 の時点では固定周波数の単一トーンでよい（音程変化は #3 のスコープ）。

## エラーハンドリング

既存の `sound.ts` の方針を踏襲する。AudioContext 生成失敗・自動再生制限・resume 失敗はすべて黙って無視し、UI やタイマー本体の動作に影響しない（`scheduleTones` の既存 try/catch を再利用）。

## テスト方針

- `use-countdown-tick.test.ts`（新規）:
  - 秒境界を跨いだときに 1 回だけ発火する
  - 同じ秒内での再レンダーで多重発火しない
  - 閾値外・停止中・一時停止中・休憩中は発火しない
  - `opts.enabled=false` のとき発火しない
  - `vi.fn()` でモックした `playCountdownTick` の呼び出し回数・引数で検証
- `NotifySettingsPanel` のトグル/スライダーの表示・操作テスト（既存の音量スライダーのテストパターンに準拠）
- 実機確認: dev サーバー起動＋実画面目視・実音聴取（フロントの「完了」はテスト緑だけでは不十分という既存の教訓に従う）

## スコープ外

- 音程が段階的に変化する演出（Issue #3 で扱う）
- 音声（TTS）によるカウントダウン読み上げ（Issue #5 で扱う）
