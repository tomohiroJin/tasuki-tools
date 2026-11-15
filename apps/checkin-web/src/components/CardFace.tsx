/**
 * 札の顔（#406・設計 §5）。**絵だけ**。札の名前・意味は顔に出さず、手札では札の下に添える（`Hand`・#480）。
 * 読み上げは札のボタンが名前の添え書きへ結んで担う。
 *
 * 顔の表は `card-faces.ts`。数のやり方（元気メーター・期待の大きさ・いま頭の何割・ROTI・わかった度）は数字（Fraunces のイタリック）が絵の代わり。
 * 残りは細い墨の線に金を一点差す線画。終わりの天気は今日の天気の絵を使い回す（#465）。色は属性に書かず、クラス（`index.css` の `.ca-*`）でトークンを当てる。
 */
import type { CardId, MethodId } from '@tasuki/checkin-core';
import { CARD_FACES, type Face } from './card-faces';

export function CardFace({ method, card }: { method: MethodId; card: CardId }) {
  const face = CARD_FACES[method] as Face | undefined;
  // 表に無いやり方（入口の picklist が弾くので通常は来ない）は、前と同じく絵の無い顔にする
  if (face?.kind === 'numeral') {
    return (
      <span className="card-numeral" aria-hidden="true">
        {face.numeral(card)}
      </span>
    );
  }
  return (
    <svg className="card-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {face ? <face.Art card={card} /> : null}
    </svg>
  );
}
