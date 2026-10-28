/**
 * 席の列（#406・設計 §5）。席ごとの伏せ札と名前・まだの席は点線の枠。
 * **開く前なので札の中身は載せない**（サーバーも送らない・設計 §6）。出したかどうかの印だけを描く。
 */
import type { SeatView } from '@tasuki/checkin-core';
import { SEATS_LABEL, SEAT_PLAYED_SR, SEAT_WAITING_SR, YOU_MARK, playedCountText, spectatorCountText } from '../copy';

interface Props {
  seats: readonly SeatView[];
  selfId: string;
  playedCount: number;
  playerCount: number;
  spectatorCount: number;
}

export function SeatRow({ seats, selfId, playedCount, playerCount, spectatorCount }: Props) {
  return (
    <div className="seat-row">
      <ul className="seat-list" aria-label={SEATS_LABEL}>
        {seats.map((seat) => (
          <li key={seat.id} className={`seat${seat.id === selfId ? ' seat--me' : ''}`}>
            <span className={`seat-slot${seat.played ? ' seat-slot--down' : ''}`} aria-hidden="true" />
            <span className="seat-name" title={seat.name}>
              {seat.name}
              {seat.id === selfId && YOU_MARK}
            </span>
            <span className="ui-visually-hidden">{seat.played ? SEAT_PLAYED_SR : SEAT_WAITING_SR}</span>
          </li>
        ))}
      </ul>
      <p className="seat-count">
        <span>{playedCountText(playedCount, playerCount)}</span>
        {spectatorCount > 0 && <span className="seat-spectators">{spectatorCountText(spectatorCount)}</span>}
      </p>
    </div>
  );
}
