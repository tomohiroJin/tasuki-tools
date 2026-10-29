/**
 * 札の顔（#406・設計 §5）。**絵だけ**。札の名前・説明は顔に出さず、読み上げは札のボタンの `aria-label` が担う。
 *
 * 数のやり方（元気メーター・期待の大きさ・いま頭の何割・ROTI・わかった度）は数字（Fraunces のイタリック）が絵の代わり。
 * 残りは細い墨の線に金を一点差す線画。終わりの天気は今日の天気の絵を使い回す（#465）。色は属性に書かず、クラス（`index.css` の `.ca-*`）でトークンを当てる。
 */
import type { CardId, MethodId } from '@tasuki/checkin-core';
import { BestPartArt } from '../card-art/best-part';
import { MoodArt } from '../card-art/mood';
import { MoodStartArt } from '../card-art/mood-start';
import { NextMeetingArt } from '../card-art/next-meeting';
import { RoleArt } from '../card-art/role';
import { TakeawayDoneArt } from '../card-art/takeaway-done';
import { TakeawayGoalArt } from '../card-art/takeaway-goal';
import { WeatherArt } from '../card-art/weather';

/** 数のやり方が顔に出す数字。focus だけ札の ID（20…100）と違い、割の数（2・5・8・10）を出す */
function numeralOf(method: MethodId, card: CardId): string | null {
  switch (method) {
    case 'energy':
    case 'expectation':
    case 'roti':
    case 'understanding':
      return card;
    case 'focus':
      return String(Number(card) / 10);
    default:
      return null;
  }
}

function Art({ method, card }: { method: MethodId; card: CardId }) {
  switch (method) {
    case 'weather':
    case 'weather-end':
      return <WeatherArt card={card} />;
    case 'takeaway-goal':
      return <TakeawayGoalArt card={card} />;
    case 'role':
      return <RoleArt card={card} />;
    case 'mood-start':
      return <MoodStartArt card={card} />;
    case 'takeaway-done':
      return <TakeawayDoneArt card={card} />;
    case 'best-part':
      return <BestPartArt card={card} />;
    case 'mood':
      return <MoodArt card={card} />;
    case 'next-meeting':
      return <NextMeetingArt card={card} />;
    default:
      return null;
  }
}

export function CardFace({ method, card }: { method: MethodId; card: CardId }) {
  const numeral = numeralOf(method, card);
  if (numeral !== null) {
    return (
      <span className="card-numeral" aria-hidden="true">
        {numeral}
      </span>
    );
  }
  return (
    <svg className="card-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <Art method={method} card={card} />
    </svg>
  );
}
