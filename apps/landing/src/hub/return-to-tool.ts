/**
 * 道具の入口から送り返された人を、通ったあとに戻す行き先（#638）。
 *
 * 名乗りと合言葉は玄関に 1 つだけある（`docs/adr/0018`）。道具（timer・poker・topic・roulette・agenda・
 * checkin）は、復帰の組を持たない人や合言葉を求められた人を玄関の参加画面へ送り返す。そのとき道具は
 * `?from=<道具の ID>` を運ぶ（綴りの正本は `@tasuki/room-core` の `RETURN_PARAM`）。玄関は入れたあと、
 * その道具の同じルームへ戻す。
 *
 * **URL をそのまま信じて遷移しない。** 行き先は玄関の札の一覧（`TOOLS`）から引く。知らない値・
 * 外部の URL・パスを混ぜた値は戻さない（オープンリダイレクトにしない）。
 * **退出の告知（`?left=`）を持つ人は戻さない** —— 外された人が入り直してまた外される往復を作らない。
 *
 * 副作用の無い純粋な判断である（`docs/adr/0015` MUST 1）。遷移は `departure.ts` の `redirectTo`。
 */
import { DEPARTURE_PARAM, RETURN_PARAM } from '@tasuki/room-core';
import { TOOLS } from '../tools.js';
import { readRoomParam } from './room-param.js';

/** 戻す行き先（道具の公開パス＋`?room=`）。戻さないなら null。 */
export function returnPathFor(href: string): string | null {
  const url = new URL(href);
  const code = readRoomParam(href);
  if (code === null) return null;
  if (url.searchParams.has(DEPARTURE_PARAM)) return null;
  const from = url.searchParams.get(RETURN_PARAM);
  const tool = TOOLS.find((candidate) => candidate.id === from);
  if (tool === undefined) return null;
  return `${tool.href}?room=${encodeURIComponent(code)}`;
}
