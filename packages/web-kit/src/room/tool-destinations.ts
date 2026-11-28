/**
 * 道具の行き先の表（#677）。呼びかけの知らせ（{@link RoomCallNotice}）が「どこへ移るか」を引く、道具の**名前**と**公開パス**。
 *
 * **玄関の札（`apps/landing/src/tools.ts` の `TOOLS`）も同じ値を持つ**（正本は 2 か所）。`tools.ts` は純粋な層で、
 * web-kit を読めない（`scripts/lib/layer-direction.mjs`）。ずれは `apps/landing/tests/tools.test.ts` の一致の検査が止める。
 *
 * - 鍵は道具の ID。**綴りの正本は同期サーバー**（`apps/tasuki-sync/src/application/tool-id.ts`）で、ここは見せ方だけを持つ。
 * - 公開パスは web 側だけでは決まらない。足す・移すときは `vite.config.ts` の `base`・`deploy/<app>/app.env` の
 *   `PUBLIC_PATH`・Caddy 断片を必ず揃える（1 つでも取り残すと白画面か 404 になる）。
 */

/** 道具 1 つの見せ方。 */
export interface ToolDestination {
  /** 道具の名前（札の下端・知らせの文に出る） */
  readonly name: string;
  /** 公開パス（末尾の `/` を含む） */
  readonly href: string;
}

/** 表。値はリテラルの型のまま持つ（玄関の札が型を導く）。 */
export const TOOL_DESTINATIONS = {
  timer: { name: 'TDD Mob Pro Timer', href: '/timer/' },
  poker: { name: 'Planning Poker', href: '/poker/' },
  roulette: { name: 'Facilitator Roulette', href: '/roulette/' },
  topic: { name: 'Topic Board', href: '/topic/' },
  agenda: { name: 'Agenda Timer', href: '/agenda/' },
  checkin: { name: 'Check-in Cards', href: '/checkin/' },
  track: { name: 'Uchiwake', href: '/track/' },
} as const satisfies Readonly<Record<string, ToolDestination>>;

/** 表にある道具の ID。 */
export type ToolDestinationId = keyof typeof TOOL_DESTINATIONS;

/** ID から行き先を引く。表に無い綴り（古い画面が知らない新しい道具など）は `undefined`。 */
export function toolDestination(id: string): ToolDestination | undefined {
  // `Object.hasOwn` は使わない（ES2022。lib が ES2020 の timer-web が型検査で読めない）。`wire.ts` の `isHubCommand` と同じ書き方。
  return Object.prototype.hasOwnProperty.call(TOOL_DESTINATIONS, id) ? TOOL_DESTINATIONS[id as ToolDestinationId] : undefined;
}
