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
