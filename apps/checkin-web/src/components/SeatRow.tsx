/**
 * 席の列（#406・設計 §5）。席ごとの伏せ札と名前・まだの席は点線の枠。
 * **開く前なので札の中身は載せない**（サーバーも送らない・設計 §6）。出したかどうかの印だけを描く。
 * 「n / m 人が出しました」は開く前だけ（`progress`）。開いた後の席は名簿どおりに変わり、凍った山の合計と食い違うので出さない。
 */
import type { SeatView } from '@tasuki/checkin-core';
import { SEATS_LABEL, SEAT_PLAYED_SR, SEAT_WAITING_SR, YOU_MARK, playedCountText, spectatorCountText } from '../copy';

interface Props {
  seats: readonly SeatView[];
  selfId: string;
  /** 開く前の出した人数と札を出す人数。開いた後は渡さない */
  progress?: { readonly played: number; readonly total: number } | undefined;
  spectatorCount: number;
}

export function SeatRow({ seats, selfId, progress, spectatorCount }: Props) {
  return (
    <div className="seat-row">
      <ul className="seat-list" aria-label={SEATS_LABEL}>
        {seats.map((seat) => (
          <li key={seat.id} className={`seat${seat.id === selfId ? ' seat--me' : ''}`}>
            <span className={`seat-slot${seat.played ? ' seat-slot--down' : ''}`} aria-hidden="true" />
            <span className="seat-name" title={seat.name}>
              {seat.name}
            </span>
            {/* 印は名前の外に置く（名前が 2 行で省略されても「（あなた）」が切れない） */}
            {seat.id === selfId && <span className="seat-you">{YOU_MARK}</span>}
            <span className="ui-visually-hidden">{seat.played ? SEAT_PLAYED_SR : SEAT_WAITING_SR}</span>
          </li>
        ))}
      </ul>
      {(progress !== undefined || spectatorCount > 0) && (
        <p className="seat-count">
          {progress !== undefined && <span>{playedCountText(progress.played, progress.total)}</span>}
          {spectatorCount > 0 && <span className="seat-spectators">{spectatorCountText(spectatorCount)}</span>}
        </p>
      )}
    </div>
  );
}
