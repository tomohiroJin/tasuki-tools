/**
 * LP に並べるツール。
 *
 * href は**公開パス**。S4（#19）で timer が `/` から `/timer/` へ移るとき、
 * 変えるのはここ 1 箇所で済む。
 */
export interface Tool {
  /** 札の左上に出る一語。そのツールが扱うもの。 */
  readonly pip: string;
  /** ツール名（札の下端） */
  readonly name: string;
  /** 何をする道具かを 1 行で */
  readonly summary: string;
  /** 公開パス */
  readonly href: string;
  /** 札の中央に出る意匠 */
  readonly mark: "ring" | "spade";
}

export const TOOLS: readonly Tool[] = [
  {
    pip: "交代",
    name: "TDD Mob Pro Timer",
    summary: "ドライバーの交代を計る",
    href: "/",
    mark: "ring",
  },
  {
    pip: "見積",
    name: "Planning Poker",
    summary: "見積もりを揃える",
    href: "/poker/",
    mark: "spade",
  },
];
