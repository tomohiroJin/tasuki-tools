/**
 * やり方ごとの札の顔の表（#406・#482-4）。**数字のやり方の正本はここ**（`kind === 'numeral'`）。
 * `NUMERIC_METHODS`（`reveal-view.ts`）もここから導く。描く側は `CardFace.tsx`。
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
 * （`tests/method-exhaustive.test.ts`）。
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
