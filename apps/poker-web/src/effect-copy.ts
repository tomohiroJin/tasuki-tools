// 開票の演出の帯の文言（#639）。
//
// 書体の base 層に収まる字だけで書く（`tests/results.test.tsx` の E3 が守る）。
// 「致」は base 層に無いので「全員一致」は使えない。「全員同じ」と言う。
// 外れた人を名指ししない（#639 決めること 6）ので、文言は結果の呼び名だけにする。
export const EFFECT_COPY = {
  unanimous: '全員同じ',
  scattered: '全員バラバラ',
  complete: '全員出そろいました',
} as const;

export type ResultsEffect = keyof typeof EFFECT_COPY;
