/**
 * LP に並べるツール。
 *
 * 名前と href（**公開パス**）の正本は `@tasuki/web-kit/room` の行き先の表（`TOOL_DESTINATIONS`・#677）。
 * 呼びかけの知らせも同じ表で行き先を決めるので、ここへ写しを書かない（変える場所は表の 1 箇所）。
 * ただし公開パスは web 側だけでは決まらない。ツールを足す・移すときは
 * `vite.config.ts` の `base`・`deploy/<app>/app.env` の `PUBLIC_PATH`・
 * Caddy 断片を必ず揃える（1 つでも取り残すと白画面か 404 になる）。
 */
import { TOOL_DESTINATIONS } from "@tasuki/web-kit/room";

/** 札 1 枚の形。`TOOLS` の要素がこれを満たすことを `satisfies` で確かめる。 */
interface ToolSpec {
  /**
   * ツール ID。**綴りの正本は同期サーバー**（`apps/tasuki-sync/src/application/tool-id.ts`）で、
   * 名簿の `tools` に載る値と同じ。在席の表示（`RoomChoice.tsx`）はこれで名前を引く
   * —— 並び順で引くと、札を足したときに名前がずれる（#91 PR 2 で直した）。
   */
  readonly id: string;
  /** 札の左上に出る一語。そのツールが扱うもの。 */
  readonly pip: string;
  /** ツール名（札の下端） */
  readonly name: string;
  /** 何をする道具かを 1 行で */
  readonly summary: string;
  /** 公開パス */
  readonly href: string;
  /** 札の中央に出る意匠 */
  readonly mark: "ring" | "spade" | "flag" | "wheel" | "watch" | "cards" | "bars";
}

export const TOOLS = [
  {
    id: "timer",
    pip: "交代",
    name: TOOL_DESTINATIONS.timer.name,
    summary: "ドライバーの交代を計る",
    href: TOOL_DESTINATIONS.timer.href,
    mark: "ring",
  },
  {
    id: "poker",
    pip: "見積",
    name: TOOL_DESTINATIONS.poker.name,
    summary: "見積もりを揃える",
    href: TOOL_DESTINATIONS.poker.href,
    mark: "spade",
  },
  {
    id: "roulette",
    pip: "進行",
    name: TOOL_DESTINATIONS.roulette.name,
    summary: "その場で進行役を決める",
    href: TOOL_DESTINATIONS.roulette.href,
    mark: "wheel",
  },
  {
    id: "topic",
    pip: "お題",
    name: TOOL_DESTINATIONS.topic.name,
    summary: "お題を用意して全員に見せる",
    href: TOOL_DESTINATIONS.topic.href,
    mark: "flag",
  },
  {
    id: "agenda",
    pip: "予定",
    name: TOOL_DESTINATIONS.agenda.name,
    summary: "ステップを順に計って進める",
    href: TOOL_DESTINATIONS.agenda.href,
    mark: "watch",
  },
  {
    id: "checkin",
    pip: "始終",
    name: TOOL_DESTINATIONS.checkin.name,
    summary: "始めと終わりに札を出し合う",
    href: TOOL_DESTINATIONS.checkin.href,
    mark: "cards",
  },
  {
    id: "track",
    pip: "内訳",
    name: TOOL_DESTINATIONS.track.name,
    summary: "何に何分使ったかを記録する",
    href: TOOL_DESTINATIONS.track.href,
    mark: "bars",
  },
] as const satisfies readonly ToolSpec[];

/** 札（`TOOLS` の要素）。`id`・`href` などはリテラルの型になる。 */
export type Tool = (typeof TOOLS)[number];
/** 玄関に並ぶ道具の識別子。`TOOLS` の `id` から導く（手で共用体を書かない）。 */
export type ToolId = Tool["id"];
