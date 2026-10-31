/**
 * 入室の門の画面（読み込み中・ルームが無い・参加中）（#472・#463-C3）。
 *
 * 4 つのアプリ（agenda・checkin・roulette・topic）が同じ文・同じ見出しの階層・同じリンク先で出す。
 * **オラクルは文字列・役割・クラス・並び順を手で書く**（実装の定数を引かない）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LoadingView, RoomGoneView, RoomJoiningView } from '../src/room/index.js';

afterEach(cleanup);

describe('LoadingView', () => {
  it('Given 読み込み中 / When 描く / Then main の中の status に「読み込んでいます…」を 1 文だけ出す', () => {
    const { container } = render(<LoadingView />);
    const main = container.firstElementChild as HTMLElement;
    expect(main.tagName).toBe('MAIN');
    expect(main.className).toBe('ui-page ui-page--prose');
    expect(main.children).toHaveLength(1);
    const note = screen.getByRole('status');
    expect(note.tagName).toBe('P');
    expect(note.className).toBe('loading-note ui-note');
    expect(note.textContent).toBe('読み込んでいます…');
  });
});

describe('RoomGoneView', () => {
  it('Given ルームが無い / When 描く / Then h1・説明・トップ（/）へのリンクを、この順で出す', () => {
    const { container } = render(<RoomGoneView />);
    const main = container.firstElementChild as HTMLElement;
    expect(main.tagName).toBe('MAIN');
    expect(main.className).toBe('ui-page ui-page--prose');
    expect([...main.children].map((el) => el.tagName)).toEqual(['H1', 'P', 'A']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('ルームが見つかりません');
    expect(main.children[1]?.textContent).toBe('ルームは終了したか、リンクが正しくない可能性があります。');
    const link = screen.getByRole('link', { name: 'トップへ戻る' });
    expect(link.getAttribute('href')).toBe('/');
    expect(link.className).toBe('ui-button ui-button--quiet');
  });
});

describe('RoomJoiningView', () => {
  const base = { backHref: '/?room=ABC', backLabel: '選択画面へ戻る', retryNotice: null, error: null, notice: 'none' } as const;

  it('Given 参加中 / When 描く / Then header の h1 と戻るリンク（玄関のそのルーム）を出し、知らせは出さない', () => {
    const { container } = render(<RoomJoiningView {...base} bannerPlacement="before-main" />);
    const main = container.querySelector('main') as HTMLElement;
    expect(main.className).toBe('ui-page ui-page--prose');
    const header = main.firstElementChild as HTMLElement;
    expect(header.tagName).toBe('HEADER');
    expect(header.className).toBe('ui-page-header');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('ルームに参加しています');
    expect([...header.children].map((el) => el.tagName)).toEqual(['H1', 'A']);
    const back = screen.getByRole('link', { name: '選択画面へ戻る' });
    expect(back.getAttribute('href')).toBe('/?room=ABC');
    expect(back.className).toBe('ui-page-header-back ui-button ui-button--quiet');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Given 混雑の知らせと失敗 / When 描く / Then 知らせは status、失敗は alert（ui-note--error）で見出しの後に並べる', () => {
    const { container } = render(<RoomJoiningView {...base} retryNotice="混み合っています" error="失敗しました" bannerPlacement="before-main" />);
    const main = container.querySelector('main') as HTMLElement;
    const notice = screen.getByRole('status');
    const error = screen.getByRole('alert');
    expect(notice.className).toBe('ui-note');
    expect(notice.textContent).toBe('混み合っています');
    expect(error.className).toBe('ui-note ui-note--error');
    expect(error.textContent).toBe('失敗しました');
    expect([...main.children].map((el) => el.tagName)).toEqual(['HEADER', 'P', 'P']);
    expect(main.children[1]).toBe(notice);
    expect(main.children[2]).toBe(error);
  });

  it('Given 帯を main の前に置く指定 / When 描く / Then 帯は main の直前の兄弟になる', () => {
    const { container } = render(<RoomJoiningView {...base} notice="stale" bannerPlacement="before-main" />);
    expect([...container.children].map((el) => el.tagName)).toEqual(['P', 'MAIN']);
    expect((container.firstElementChild as HTMLElement).className).toBe('ui-banner');
    expect(container.querySelector('main .ui-banner')).toBeNull();
  });

  it('Given 帯を見出しの後に置く指定 / When 描く / Then 帯は main の中の header の直後で、知らせより前になる', () => {
    const { container } = render(
      <RoomJoiningView {...base} retryNotice="混み合っています" notice="stale" bannerPlacement="after-header" />,
    );
    expect([...container.children].map((el) => el.tagName)).toEqual(['MAIN']);
    const main = container.firstElementChild as HTMLElement;
    expect([...main.children].map((el) => el.tagName)).toEqual(['HEADER', 'P', 'P']);
    expect((main.children[1] as HTMLElement).className).toBe('ui-banner');
    expect((main.children[2] as HTMLElement).textContent).toBe('混み合っています');
  });
});
