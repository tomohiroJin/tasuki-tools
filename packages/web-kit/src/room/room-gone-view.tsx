import { ROOM_GATE_TEXT } from './room-gate-copy.js';

/**
 * ルームが無い（消えた）ときの画面。
 * 消えたルームの選択画面へは送らない（そこで名乗っても必ず失敗する）。戻り先はトップ（`/`）。
 */
export function RoomGoneView() {
  return (
    <main className="ui-page ui-page--prose">
      <h1>{ROOM_GATE_TEXT.goneHeading}</h1>
      <p>{ROOM_GATE_TEXT.goneText}</p>
      <a className="ui-button ui-button--quiet" href="/">
        {ROOM_GATE_TEXT.goneLink}
      </a>
    </main>
  );
}
