/**
 * LP に並べるツール。
 *
 * href は**公開パス**で、変える場所はここ 1 箇所。
 * ただし公開パスは web 側だけでは決まらない。ツールを足す・移すときは
 * `vite.config.ts` の `base`・`deploy/<app>/app.env` の `PUBLIC_PATH`・
 * Caddy 断片を必ず揃える（1 つでも取り残すと白画面か 404 になる）。
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
    href: "/timer/",
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
