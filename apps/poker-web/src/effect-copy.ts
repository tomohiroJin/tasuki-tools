// 開票の演出（帯とカットイン）の文言（#639・#670）。
//
// 書体の base 層に収まる字だけで書く（`tests/results.test.tsx` の E3 が守る）。
// 「致」は base 層に無いので「全員一致」は使えない。「全員同じ」と言う。
// 外れた人を名指ししない（#639 決めること 6）ので、文言は結果の呼び名だけにする。
// 題は 9 字以下（カットインの大きな字が 320px の幅で 1 行に収まる）。
export const EFFECT_COPY = {
  break: '全員休憩',
  unanimous: '全員同じ',
  split: '大きく割れた',
  near: 'ほぼ同じ',
  scattered: '全員バラバラ',
  complete: '全員出そろいました',
} as const;

export type ResultsEffect = keyof typeof EFFECT_COPY;

/** 場面ごとに決まった添え書き（無い場面は載せない）。連続（「N 回続けて」）は `streakSub` で別に作る */
export const EFFECT_SUB: Partial<Record<ResultsEffect, string>> = {
  break: 'ひと休みしよう',
  split: '上と下の見方を話そう',
};

/** 全員同じが続いたときの添え書き（N は 2 以上） */
export function streakSub(streak: number): string {
  return `${streak} 回続けて`;
}

/** カットインの色（設計 §3 の表）。静かな帯の色（`index.css` の `data-effect`）も同じ対応にそろえる */
export const EFFECT_TONE = {
  break: 'ivory',
  unanimous: 'gold',
  split: 'rose',
  near: 'gold',
  scattered: 'rose',
  complete: 'jade',
} as const satisfies Record<ResultsEffect, 'gold' | 'rose' | 'jade' | 'ivory'>;

/** カットインの上の小さな英字の見出し */
export const CUTIN_KICKER = 'PLANNING POKER';

/** 読み上げの文言。添え書きがあれば題と続けて読む */
export function announcementOf(effect: ResultsEffect, sub: string | null): string {
  return sub === null ? EFFECT_COPY[effect] : `${EFFECT_COPY[effect]}。${sub}`;
}
