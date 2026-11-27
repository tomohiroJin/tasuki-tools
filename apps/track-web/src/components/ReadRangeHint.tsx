/**
 * 押す前に出す「読み取った範囲と長さ」の 1 行（#476）。抜けを足す欄と、始まり・終わりを合わせる欄で同じ書き方にする。
 * 読み上げの対象にはしない（`aria-live` を付けない）。
 */
import { insertPreviewEdgeText, insertPreviewText } from '../copy';
import { lengthHm, type InsertPreview } from '../time-input';

export function ReadRangeHint({ preview }: { preview: InsertPreview }) {
  return (
    <p className="track-hint">
      {insertPreviewText(insertPreviewEdgeText(preview.startClock, preview.startYesterday), insertPreviewEdgeText(preview.endClock, preview.endYesterday), lengthHm(preview.lengthMin))}
    </p>
  );
}
