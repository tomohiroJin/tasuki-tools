/**
 * 札の ID → アプリと配備資材のディレクトリ（#91 spec §5.6・#590）。
 *
 * 名前の形で導出しない（`<id>-web` のような規則にすると、規則から外れた置き場を黙って通す）。
 * 鍵を `ToolId`（`TOOLS` の `id` から導く型）にしてあるので、`TOOLS` に札を足してここを足し忘れると
 * 型検査で落ちる。`tool-public-paths.test.ts`（公開パスの 4 か所）と `dev-hub-redirect-wiring.test.ts`
 * （玄関へのリダイレクトの配線）が共有する。
 */
import type { ToolId } from '../../src/tools.js';

export const LOCATIONS: Readonly<Record<ToolId, { readonly app: string; readonly deploy: string }>> = {
  timer: { app: 'timer-web', deploy: 'timer' },
  poker: { app: 'poker-web', deploy: 'poker' },
  topic: { app: 'topic-web', deploy: 'topic' },
  roulette: { app: 'roulette-web', deploy: 'roulette' },
  agenda: { app: 'agenda-web', deploy: 'agenda' },
  checkin: { app: 'checkin-web', deploy: 'checkin' },
};
