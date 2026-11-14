/**
 * 札の顔（#406・設計 §5）。**絵だけ**。札の名前・意味は顔に出さず、手札では札の下に添える（`Hand`・#480）。
 * 読み上げは札のボタンが名前の添え書きへ結んで担う。
 *
 * 数のやり方（元気メーター・期待の大きさ・いま頭の何割・ROTI・わかった度）は数字（Fraunces のイタリック）が絵の代わり。
 * 残りは細い墨の線に金を一点差す線画。終わりの天気は今日の天気の絵を使い回す（#465）。色は属性に書かず、クラス（`index.css` の `.ca-*`）でトークンを当てる。
 */
import type { ComponentType } from 'react';
import type { CardId, MethodId } from '@tasuki/checkin-core';
import { BestPartArt } from '../card-art/best-part';
import { MoodArt } from '../card-art/mood';
import { MoodStartArt } from '../card-art/mood-start';
import { NextMeetingArt } from '../card-art/next-meeting';
import { RoleArt } from '../card-art/role';
import { TakeawayDoneArt } from '../card-art/takeaway-done';
import { TakeawayGoalArt } from '../card-art/takeaway-goal';
import { WeatherArt } from '../card-art/weather';

/** 札の顔の出し方。数字（数のやり方）か、絵（線画） */
export type Face =
  | { readonly kind: 'numeral'; readonly numeral: (card: CardId) => string }
  | { readonly kind: 'art'; readonly Art: ComponentType<{ card: CardId }> };

const cardIdNumeral: Face = { kind: 'numeral', numeral: (card) => card };
const art = (Art: ComponentType<{ card: CardId }>): Face => ({ kind: 'art', Art });

/**
 * やり方ごとの顔。**全部のやり方を鍵に持つ**ので、やり方を足して顔を足し忘れるとコンパイルで落ちる
 * （`tests/method-exhaustive.test.ts`）。数字のやり方は `METHODS[m].numeric` と一致させる（同じテストが守る）。
 * focus だけ札の ID（20…100）と違い、割の数（2・5・8・10）を出す。
 */
export const CARD_FACES: Readonly<Record<MethodId, Face>> = {
  weather: art(WeatherArt),
  energy: cardIdNumeral,
  focus: { kind: 'numeral', numeral: (card) => String(Number(card) / 10) },
  'takeaway-goal': art(TakeawayGoalArt),
  role: art(RoleArt),
  expectation: cardIdNumeral,
  'mood-start': art(MoodStartArt),
  roti: cardIdNumeral,
  'takeaway-done': art(TakeawayDoneArt),
  'best-part': art(BestPartArt),
  mood: art(MoodArt),
  'next-meeting': art(NextMeetingArt),
  'weather-end': art(WeatherArt),
  understanding: cardIdNumeral,
};

export function CardFace({ method, card }: { method: MethodId; card: CardId }) {
  const face = CARD_FACES[method];
  if (face.kind === 'numeral') {
    return (
      <span className="card-numeral" aria-hidden="true">
        {face.numeral(card)}
      </span>
    );
  }
  return (
    <svg className="card-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <face.Art card={card} />
    </svg>
  );
}
