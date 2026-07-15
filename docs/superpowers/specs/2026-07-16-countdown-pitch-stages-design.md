# カウントダウン音の音程3段階変化（Issue #3）設計

## 背景・目的

実機フィードバック「時間が進むと時報の音程が変わる(高くなる)と分かりやすそう、三段階くらい変わると良いかも」に対応する。
Issue #2（[[2026-07-15-countdown-tick-sound-design]]、PR #6 でマージ済み）で実装した交代前カウントダウン音（`useCountdownTick`/`playCountdownTick`）は、現状 880Hz 固定の単一トーンで鳴っている。本設計はこれを、残り秒数に応じて3段階の周波数に変化させる。

GitHub Issue: https://github.com/tomohiroJin/tasuki-tools/issues/3

## 要件（EARS）

- カウントダウン音が鳴るとき、システムは残り秒数（整数秒、`Math.ceil` 済み）と予告秒数（`thresholdSeconds`）から3段階のうち1つを判定し、その段階に対応する周波数でビープ音を再生する。
- 予告秒数を3等分した区間のうち、交代に最も近い区間（残り秒数が最も少ない区間）では最も高い周波数を、最も遠い区間（残り秒数が最も多い区間）では最も低い周波数を再生する。
- 予告秒数の設定を変更した場合、区間の境界は自動的にその新しい予告秒数に対して等分割される。

## 設計判断（ユーザー承認済み）

- **音程変化の有効/無効を切り替える個別設定は作らない**。カウントダウン音自体（Issue #2 の `notify.countdownEnabled`）が ON なら常に音程変化も適用される（YAGNI）。
- **区間の分割方法**: `thresholdSeconds` を均等三分割する（`segment = thresholdSeconds / 3`）。固定秒数での区切りにはしない（予告秒数が短いとき段階が欠ける問題を避けるため）。
- **周波数**: 660Hz（低・段階1）/ 880Hz（中・段階2、Issue #2 の既存周波数と同じ）/ 1108Hz（高・段階3）。3度ずつ上昇する音楽的に自然な間隔。既存の `chime-up`（660→990Hz）と同系列。

## アーキテクチャ・データフロー

### 新規: 区間判定の純粋関数

`apps/web/src/platform/sound.ts` に追加:

```ts
/** カウントダウン音の周波数（3段階・低→高、Issue #3）。 */
export const COUNTDOWN_STAGE_FREQS: readonly [number, number, number] = [660, 880, 1108];

/**
 * 残り秒数(currentSeconds)と予告秒数(thresholdSeconds)から、カウントダウン音の段階(1〜3)を判定する。
 * thresholdSeconds を3等分し、交代に近い（残りが少ない）区間ほど高い段階を返す。
 */
export function computeCountdownStage(currentSeconds: number, thresholdSeconds: number): 1 | 2 | 3 {
  const segment = thresholdSeconds / 3;
  if (currentSeconds <= segment) return 3;
  if (currentSeconds <= segment * 2) return 2;
  return 1;
}
```

例（`thresholdSeconds=15`、`segment=5`）: 残り 1〜5秒→段階3（1108Hz）、6〜10秒→段階2（880Hz）、11〜15秒→段階1（660Hz）。

`thresholdSeconds=5`（最小値、`segment≈1.67`）のような割り切れないケースでは区間が不均等（例: 段階1が2秒分、段階2が2秒分、段階3が1秒分）になり得るが、既存の3段階判定ロジックとして許容する（追加のテストケースでこの境界を明示的に検証する）。

### `playCountdownTick` の変更

```ts
export function playCountdownTick(volume: number, stage: 1 | 2 | 3 = 1): void {
  playTones([COUNTDOWN_STAGE_FREQS[stage - 1]], volume, { gap: 0.12, gain: 0.35 });
}
```

`stage` を省略可能なオプション引数にし、省略時は段階1（660Hz）にフォールバックする。これにより、テスト等で `playCountdownTick(volume)` とだけ呼んでいる既存の呼び出し（もしあれば）を壊さない。

### `useCountdownTick` の変更

`apps/web/src/ui/use-countdown-tick.ts` の発火箇所で、`playCountdownTick(opts.volume)` の呼び出しを次に置き換える:

```ts
const stage = computeCountdownStage(current, opts.thresholdSeconds);
playCountdownTick(opts.volume, stage);
```

`CountdownTickOptions` 型・フックのシグネチャ自体は変更しない（`thresholdSeconds` を段階計算にも再利用するだけ）。

### `Session.tsx` の変更

なし。`useCountdownTick` の呼び出し方は Issue #2 のまま変更不要。

## エラーハンドリング

既存の `sound.ts` の方針を踏襲。`computeCountdownStage` は純粋関数で例外を投げない（`thresholdSeconds=0` のような異常値でも `segment=0` となり `currentSeconds<=0` のときのみ段階3、それ以外は段階1相当に落ち着く。呼び出し元の `useCountdownTick` は既に `current>0` を確認してから呼ぶため実運用上 `thresholdSeconds=0` は到達しない）。

## テスト方針

- `computeCountdownStage` のユニットテスト（`sound.test.ts` に追加）: `thresholdSeconds=15` での3区間の境界値（5,6,10,11,15秒）、`thresholdSeconds=5` での不均等区間、`thresholdSeconds=6`（ちょうど割り切れる最小に近い値）。
- `playCountdownTick(volume, stage)` が `stage` に応じて `COUNTDOWN_STAGE_FREQS[stage-1]` を使うことのテスト（`scheduleTones` の呼び出し引数を検証する既存パターンに準拠。もしくは実行して例外が出ないことの確認＋定数配列自体の値検証）。
- `useCountdownTick` のテスト（`use-countdown-tick.test.ts` を更新）: 各発火で `computeCountdownStage` に対応した `stage` 引数付きで `playCountdownTick` が呼ばれることをモックで検証。
- 実機確認（dev サーバー起動、Issue #2 と同様にオシレーター発火のプロキシ計測で周波数変化を確認。人間の聴感確認はユーザーに委ねる）。

## スコープ外

- 音程変化の個別ON/OFF設定（本設計では不要と判断）
- 音声（TTS）によるカウントダウン読み上げ（Issue #5 で扱う）
