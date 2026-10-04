/**
 * 比較の実行の種類（#321）。種類は設定ファイルの `metadata` と project の名前（list の行頭に `[対照実行]` などと出る）の
 * 両方に現れ、{@link runModeOf} が突き合わせる。**環境変数は読まない**（取り残すと通常の比較が別の種類に化ける・`context.ts`）。
 *
 * 対照実行は `parity.control.config.ts`、囲いを外した一時ビルドは `parity.unlayered.config.ts`、
 * 規則の使用状況は `parity.usage.config.ts`。`timer.parity.ts` は読んだ種類を `summary.json` に書き、通常の比較の出力と見分ける。
 */

export const RUN_KINDS = {
  control: { metadata: 'parityControl', project: '対照実行' },
  unlayered: { metadata: 'parityUnlayered', project: '囲いを外した一時ビルド' },
  usage: { metadata: 'parityUsage', project: '規則の使用状況' },
} as const;

/** 実行の種類（どれも偽なら通常の比較）。 */
export type RunMode = Record<keyof typeof RUN_KINDS, boolean>;

/**
 * 設定の `metadata` と project の名前から実行の種類を読む。どれかの種類で、`metadata` の真偽と project の名前の一致が
 * 食い違ったら止める（片方だけ書き換えた設定で、明記と中身がずれないように）。
 */
export function runModeOf(metadata: Readonly<Record<string, unknown>>, projectName: string): RunMode {
  const read = (kind: keyof typeof RUN_KINDS): boolean => {
    const { metadata: key, project } = RUN_KINDS[kind];
    const on = metadata[key] === true;
    if (on !== (projectName === project)) {
      throw new Error(`metadata.${key}（${String(on)}）と project の名前（${projectName}）が食い違う`);
    }
    return on;
  };
  return { control: read('control'), unlayered: read('unlayered'), usage: read('usage') };
}

/** 規則の使用状況（E8）の実行で合否に数える、差の欄（基準側の期待値の突き合わせ・`timer.parity.ts` の `report`）。 */
const USAGE_GATED_KEY = 'expected';

/**
 * 差の欄のうち、合否（件数が 0 であること）に数えるもの。通常の比較・対照実行・囲いを外した一時ビルドは全欄を数える。
 *
 * **規則の使用状況（E8）は基準側の期待値の突き合わせだけを数える。** 最小化と最適化をしないビルドは、計算済みスタイルが
 * 基準と必ず違う（`session-memo` で styles@各幅 72 件・keyframes 2 件。2026-10-03 実測）。E8 は網羅の確認であって
 * 効いているかの確認ではない（正本 §5.5）ので、見た目の合否は通常の比較に任せる。差は `diff.json` に書いたままにする。
 */
export function gatedDiff<T>(mode: RunMode, report: Readonly<Record<string, T>>): Record<string, T> {
  if (!mode.usage) return { ...report };
  const expected = report[USAGE_GATED_KEY];
  if (expected === undefined) throw new Error(`差の欄に ${USAGE_GATED_KEY} が無い（規則の使用状況で数える欄が空になる）`);
  return { [USAGE_GATED_KEY]: expected };
}

/** 画素の照合を合否に数えるか（規則の使用状況では数えない・{@link gatedDiff} と同じ理由）。 */
export function gatesPixels(mode: RunMode): boolean {
  return !mode.usage;
}
