import { ROOM_GATE_TEXT } from './room-gate-copy.js';

/**
 * 送り返している間・読み込み中の画面（白いままにしない。poker-web の `RedirectingView` と同じ役割）。
 * 見た目の `.loading-note` は部品層（`packages/ui` の `note.css`）が持つ。
 */
export function LoadingView() {
  return (
    <main className="ui-page ui-page--prose">
      <p className="loading-note ui-note" role="status">
        {ROOM_GATE_TEXT.loading}
      </p>
    </main>
  );
}
