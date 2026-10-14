/**
 * 「続きを読む」の引き出しの開閉とフォーカスを戻す処理（#371。poker・topic・timer の札の写しを 1 つにした）。
 * jsdom の `<dialog>` は `showModal` / `close` を持たないので差し替える。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReaderDrawer } from '../src/reader/use-reader-drawer.js';

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
let showModal = vi.fn();

beforeEach(() => {
  showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  proto.showModal = showModal;
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
  cleanup();
});

function Card() {
  const drawer = useReaderDrawer();
  return (
    <>
      <button ref={drawer.triggerRef} type="button" onClick={drawer.open}>続きを読む</button>
      <dialog ref={drawer.dialogRef} onClose={drawer.onClose}>
        <button type="button" onClick={drawer.close}>閉じる</button>
      </dialog>
    </>
  );
}

const dialog = () => document.querySelector('dialog') as HTMLDialogElement;
const closeButton = () => [...dialog().querySelectorAll('button')].find((b) => b.textContent === '閉じる')!;

describe('useReaderDrawer', () => {
  it('Given 閉じている / When 開く / Then モーダルで開く', () => {
    render(<Card />);
    fireEvent.click(screen.getByRole('button', { name: '続きを読む' }));
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog().hasAttribute('open')).toBe(true);
  });

  it('Given 開いている / When 閉じるを押す / Then 閉じて、開いたボタンへフォーカスが戻る', () => {
    render(<Card />);
    const more = screen.getByRole('button', { name: '続きを読む' });
    fireEvent.click(more);
    fireEvent.click(closeButton());
    expect(dialog().hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(more);
  });

  it('Given 開いている / When close イベントだけが届く（Esc） / Then 開いたボタンへフォーカスが戻る', () => {
    render(<Card />);
    const more = screen.getByRole('button', { name: '続きを読む' });
    fireEvent.click(more);
    (document.body as HTMLElement).focus();
    dialog().dispatchEvent(new Event('close'));
    expect(document.activeElement).toBe(more);
  });
});
