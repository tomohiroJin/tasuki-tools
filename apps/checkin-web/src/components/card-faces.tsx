/**
 * やり方ごとの札の顔の表（#406・#482-4）。描く側は `CardFace.tsx`。
 * **数字のやり方かどうか（`kind`）の正本は純粋判断の `../face-kinds.ts`**（`NUMERIC_METHODS` もそこから導く）。
 * 絵（`.tsx`）を読む側がこの表に居ると、純粋判断が画面を読む逆向きになるため分けた（#592）。
 * ここは `kind` に合う顔を置くだけで、`kind` と食い違えば型が落ちる。
 */
import type { ComponentType } from 'react';
import type { CardId, MethodId } from '@tasuki/checkin-core';
import { FACE_KINDS } from '../face-kinds';
import { BatteryArt } from '../card-art/battery';
import { BestPartArt } from '../card-art/best-part';
import { BusynessArt } from '../card-art/busyness';
import { ClarityArt } from '../card-art/clarity';
import { FatigueArt } from '../card-art/fatigue';
import { MessageArt } from '../card-art/message';
import { MoodArt } from '../card-art/mood';
import { MoodStartArt } from '../card-art/mood-start';
import { NextMeetingArt } from '../card-art/next-meeting';
import { NextStepArt } from '../card-art/next-step';
import { PaceArt } from '../card-art/pace';
import { ReadinessArt } from '../card-art/readiness';
import { RoleArt } from '../card-art/role';
import { TakeawayDoneArt } from '../card-art/takeaway-done';
import { TakeawayGoalArt } from '../card-art/takeaway-goal';
import { VoiceArt } from '../card-art/voice';
import { WeatherArt } from '../card-art/weather';
import { WorryArt } from '../card-art/worry';

/** 札の顔の出し方。数字（数のやり方）か、絵（線画） */
type NumeralFace = { readonly kind: 'numeral'; readonly numeral: (card: CardId) => string };
type ArtFace = { readonly kind: 'art'; readonly Art: ComponentType<{ card: CardId }> };
export type Face = NumeralFace | ArtFace;
/** やり方の `kind`（`FACE_KINDS`）に合う顔の型。`kind` と顔が食い違うと型が落ちる */
type FaceFor<Kind extends Face['kind']> = Kind extends 'numeral' ? NumeralFace : ArtFace;

const cardIdNumeral: NumeralFace = { kind: 'numeral', numeral: (card) => card };
const art = (Art: ComponentType<{ card: CardId }>): ArtFace => ({ kind: 'art', Art });

/**
 * やり方ごとの顔。**全部のやり方を鍵に持つ**ので、やり方を足して顔を足し忘れるとコンパイルで落ちる
 * （`tests/method-exhaustive.test.ts`）。
 * focus だけ札の ID（20…100）と違い、割の数（2・5・8・10）を出す。
 */
export const CARD_FACES: { readonly [M in MethodId]: FaceFor<(typeof FACE_KINDS)[M]> } = {
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
  readiness: art(ReadinessArt),
  busyness: art(BusynessArt),
  'talk-wish': cardIdNumeral,
  battery: art(BatteryArt),
  clarity: art(ClarityArt),
  worry: art(WorryArt),
  agreement: cardIdNumeral,
  'next-step': art(NextStepArt),
  voice: art(VoiceArt),
  pace: art(PaceArt),
  fatigue: art(FatigueArt),
  message: art(MessageArt),
};
