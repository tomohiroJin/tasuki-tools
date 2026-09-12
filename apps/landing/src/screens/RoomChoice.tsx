import type { RosterRoom } from '@tasuki/room-core';
import { TOOLS } from '../tools.js';
import { ToolMark } from '../ToolMark.js';
import { buildInviteUrl } from '../hub/invite-url.js';
import { labelFor } from '../hub/participant-label.js';

/**
 * 選択画面（#95 S5a・R1）。ルーム名・参加者一覧・参加用 URL・ツールの札を並べる。
 *
 * **札の意匠は変えない**（設計正本 §5.7）。既存の {@link TOOLS} をそのまま使い、
 * `href` に `?room=CODE` を付けるだけである。新しいツールを足すときに触るのは、
 * 今と同じく `src/tools.ts` の 1 ファイルになる。
 */
export interface RoomChoiceProps {
  readonly code: string;
  readonly roster: RosterRoom | null;
  readonly connection: 'online' | 'reconnecting';
}

export function RoomChoice({ code, roster, connection }: RoomChoiceProps) {
  const participants = roster?.participants ?? [];
  const inviteUrl = buildInviteUrl(window.location.origin, code);

  return (
    <main className="page landing">
      <header className="landing-hero">
        <h1 className="wordmark">Tasuki</h1>
        <p className="tagline">
          <span className="hub-room-code">{code}</span>
        </p>
        {connection === 'reconnecting' && (
          <p className="hub-notice" role="status">
            接続が切れました。再接続しています…
          </p>
        )}
      </header>

      <section className="hub-room">
        <h2 className="hub-heading">参加者</h2>
        <ul className="hub-roster" aria-label="参加者">
          {participants.map((p) => (
            <li key={p.participantId} className="hub-participant" data-presence={p.presence}>
              <span className="hub-participant-name">{labelFor(p, participants)}</span>
              {p.tools.length > 0 && (
                <span className="hub-participant-where">{whereLabel(p.tools)}</span>
              )}
            </li>
          ))}
        </ul>

        <h2 className="hub-heading">参加用 URL</h2>
        <input className="hub-invite" readOnly value={inviteUrl} aria-label="参加用 URL" />
      </section>

      <ul className="hand" aria-label="ツール">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <a
              className="card tool-card"
              href={`${tool.href}?room=${encodeURIComponent(code)}`}
              data-label={tool.pip}
            >
              <ToolMark kind={tool.mark} />
              <span className="tool-name">{tool.name}</span>
              <span className="tool-summary">{tool.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

/**
 * その人がいまどのツールに居るかの表示。
 *
 * **綴りの正本はサーバー**（`apps/tasuki-sync/src/application/tool-id.ts`）で、
 * 見せ方の正本は `src/tools.ts` である（設計正本 §7 の既知の地雷 4）。
 * 知らない綴りはそのまま出す —— 隠すと、増えたツールが黙って消える。
 */
function whereLabel(tools: readonly string[]): string {
  const names = tools.map((id) => TOOL_NAMES[id] ?? id);
  return `${names.join(' / ')} に居ます`;
}

/** ツール ID → 札の名前。`src/tools.ts` の並びと対応する。 */
const TOOL_NAMES: Record<string, string | undefined> = {
  timer: TOOLS[0]?.name,
  poker: TOOLS[1]?.name,
};
