/**
 * ランダム交代（#660）の画面の文言。
 *
 * 1 か所に寄せるのは、書体の常用の層（base 層）に収まるかを試験で測るため
 * （`test/ui/random-rotation-copy-fits-font-base.test.ts`）。base 層に無い字を出すと、
 * その字のためだけに ext 層を読みに行く（`packages/ui/README.md`）。
 */
export const RANDOM_ROTATION_TEXT = {
  /** ロビーの詳細設定の切り替えの名前 */
  toggleLabel: "交代先をランダムに決める",
  /** 切り替えの説明 */
  toggleHint: "交代のたびに、まだドライバーをしていない人から次のドライバーを選びます。1 周で全員に 1 回ずつ回ります。",
  /** セッション画面の「次: 〈名前〉」に添える、決め方の名前 */
  modeName: "ランダム",
  /** 並び順の帯の自分の行（番は回るが、順番がまだ決まっていない） */
  selfSummary: "あなた: 順番はランダムです",
} as const;
