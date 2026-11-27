import { useId, useState, type FormEvent } from 'react';
import { TOOL_DESTINATIONS, type ToolDestinationId } from '@tasuki/web-kit/room';

/**
 * 「みんなを呼ぶ」（#677）。選択画面（`RoomChoice`）の参加者の領域に置く。
 *
 * 道具を選んで「呼んで移る」を押すと、ルームのほかの在室者へ「○○さんが △△ に呼んでいます」の知らせが出て、
 * 押した人もその道具へ移る。**移るのはサーバーの受け付け（`room.called`）を受けてから**で、その遷移は同期フックが持つ
 * （送ってすぐ移ると、ページを離れる時にコマンドが届かないことがある）。ここは選ぶ・押す・待つ間と失敗を映すだけ。
 *
 * - 道具の欄は行き先の表（`TOOL_DESTINATIONS`）から引く。**表に無い綴りは欄に出さない**（呼べない道具を並べない）
 * - 受け付けを待つ間と、同期サーバーに繋がっていない間は押せない（繋がっていないと送信が黙って積まれる）
 * - 失敗（連打の歯止め `CALL_TOO_SOON` ほか）はこの操作の近くに出す
 */
export interface RoomCallPanelProps {
  readonly connection: 'online' | 'reconnecting';
  /** 呼びかけを送って受け付けを待っているか。 */
  readonly calling: boolean;
  /** 呼びかけの失敗の文言（無ければ null）。 */
  readonly error: string | null;
  /** 呼ぶ。道具の ID を渡す。 */
  onCall(tool: string): void;
}

const CALLABLE = Object.keys(TOOL_DESTINATIONS) as ToolDestinationId[];

export function RoomCallPanel({ connection, calling, error, onCall }: RoomCallPanelProps) {
  const [tool, setTool] = useState('');
  const headingId = useId();
  const canCall = connection === 'online' && !calling && tool !== '';

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canCall) return;
    onCall(tool);
  };

  return (
    <form className="hub-call" aria-labelledby={headingId} onSubmit={submit}>
      <p className="hub-label" id={headingId}>みんなを呼ぶ</p>
      <label className="hub-field">
        <span className="hub-label">呼ぶ道具</span>
        <select className="ui-select" value={tool} onChange={(e) => setTool(e.target.value)}>
          <option value="">道具を選んでください</option>
          {CALLABLE.map((id) => (
            <option key={id} value={id}>
              {TOOL_DESTINATIONS[id].name}
            </option>
          ))}
        </select>
      </label>
      {error !== null && (
        <p className="hub-error ui-note ui-note--error" role="alert">
          {error}
        </p>
      )}
      <div className="ui-actions">
        <button type="submit" className="ui-button ui-button--secondary" disabled={!canCall}>
          呼んで移る
        </button>
      </div>
    </form>
  );
}
