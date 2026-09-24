import { LOADING_TEXT } from '../copy';

/** 送り返している間・読み込み中の画面（白いままにしない。poker-web の `RedirectingView` と同じ役割）。 */
export function LoadingView() {
  return (
    <main className="page">
      <p className="loading-note" role="status">
        {LOADING_TEXT}
      </p>
    </main>
  );
}
