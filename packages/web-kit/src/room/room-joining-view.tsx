import type { ReactNode } from 'react';
import { ROOM_GATE_TEXT } from './room-gate-copy.js';

export interface RoomJoiningViewProps {
  /** 戻るリンクの行き先（玄関のそのルーム）。参加の返事が来ないまま待つ期限は無いので、待たされた人が自分で戻れるように置く。 */
  readonly backHref: string;
  /** 戻るリンクの文（`@tasuki/invite-ui` の `ROOM_HEADER_TEXT.back`。web-kit は invite-ui に依存しないので呼ぶ側が渡す）。 */
  readonly backLabel: string;
  /** 混雑で入り直している間の知らせ。 */
  readonly retryNotice: string | null;
  /** 失敗の一言。 */
  readonly error: string | null;
  /** 接続の告知の帯（`ConnectionBanner`）。 */
  readonly banner: ReactNode;
  /**
   * 帯の位置。**アプリごとに違い、今は揃えていない**: `before-main`（`<main>` の直前・roulette・topic）、
   * `after-header`（`<main>` の中の見出しの後・agenda・checkin）。
   */
  readonly bannerPlacement: 'before-main' | 'after-header';
}

/** 最初の入室が成立するまでの画面。再接続の間は本画面を保つので、ここへは戻らない。 */
export function RoomJoiningView({ backHref, backLabel, retryNotice, error, banner, bannerPlacement }: RoomJoiningViewProps) {
  const main = (
    <main className="ui-page ui-page--prose">
      <header className="ui-page-header">
        <h1>{ROOM_GATE_TEXT.joining}</h1>
        <a className="ui-page-header-back ui-button ui-button--quiet" href={backHref}>
          {backLabel}
        </a>
      </header>
      {bannerPlacement === 'after-header' && banner}
      {retryNotice && (
        <p className="ui-note" role="status">
          {retryNotice}
        </p>
      )}
      {error && (
        <p className="ui-note ui-note--error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
  if (bannerPlacement === 'after-header') return main;
  return (
    <>
      {banner}
      {main}
    </>
  );
}
