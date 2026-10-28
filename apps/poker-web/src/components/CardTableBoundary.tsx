// テーブルの読み込み・描画の失敗を受け止める（#403）。**初回の塊に入る。**
//
// テーブルは `React.lazy` の別の塊で、古いタブを開いたまま本番が更新される（塊の名前が変わる）・読み込みの途中で
// 通信が切れる、で取れなくなる。受け止めないと例外がルーム画面ごと消し、ゲームを終える唯一の操作
// （テーブルの中の「見積もりに戻る」）も失う。ここでは伝える一文と、見積もりに戻る・読み込み直すだけを出す。
// 読み込みに失敗した `lazy` は失敗を覚えたままなので、取り直すには画面を読み込み直す。
import { Component, type ReactNode } from 'react';
import { BACK_TO_ESTIMATE, RELOAD, TABLE_LOAD_FAILED } from '../card-table-fallback-copy';

interface Props {
  children: ReactNode;
  disabled: boolean;
  onClose: () => void;
}

export class CardTableBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card-table-fallback">
        <p className="error-note ui-note ui-note--error" role="alert">
          {TABLE_LOAD_FAILED}
        </p>
        <div className="ui-actions">
          <button type="button" className="ui-button ui-button--quiet" onClick={() => location.reload()}>
            {RELOAD}
          </button>
          <button type="button" className="ui-button" onClick={this.props.onClose} disabled={this.props.disabled}>
            {BACK_TO_ESTIMATE}
          </button>
        </div>
      </section>
    );
  }
}
