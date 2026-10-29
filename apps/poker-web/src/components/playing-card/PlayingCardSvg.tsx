// トランプの札（#403・設計 §5.3）。ジョーカーなしの 52 枚と裏面を SVG で描く。
//
// 本物のトランプ（ポーカーサイズ 63 × 88 mm）に寄せる: 角の文字（左上と、180° 回した右下）・
// 実物と同じマークの並び・上下対称の絵札・スペードの A の飾り・格子の裏面。色はクラスで当て、値はトークンから引く。
import { useId } from 'react';
import type { PlayingCard } from '@tasuki/poker-core';
import { CARD_BACK, cardSpeech, rankText } from '../../card-table-copy';
import { CourtFigure, type Court } from './CourtFigure';
import { ACE_SIZE, CARD_HEIGHT, CARD_WIDTH, PIP_SIZE, pipLayout } from './pip-layout';
import { SuitMark, SuitShape } from './suit-paths';

const CX = CARD_WIDTH / 2;
const CY = CARD_HEIGHT / 2;
const VIEW_BOX = `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`;
const COURTS: Partial<Record<number, Court>> = { 11: 'jack', 12: 'queen', 13: 'king' };

interface Props {
  /** null なら裏面 */
  card: PlayingCard | null;
  className?: string;
  /** ボタンの中など、読み上げ名を外側が持つときは true（SVG を読み上げから外す） */
  decorative?: boolean;
}

/** 札の地（象牙・角丸・縁） */
function Paper() {
  return <rect className="pc-paper" x="1.5" y="1.5" width={CARD_WIDTH - 3} height={CARD_HEIGHT - 3} rx="16" />;
}

/** 角の文字（数字とスート） */
function Index({ card }: { card: PlayingCard }) {
  const label = rankText(card.rank);
  return (
    <g className="pc-index">
      <text className="pc-index-rank" x="27" y="48" textAnchor="middle" textLength={label.length > 1 ? 38 : undefined}>
        {label}
      </text>
      <SuitMark className="pc-index-suit" suit={card.suit} x={27} y={70} size={24} />
    </g>
  );
}

/** スペードの A の飾り（実物は製造元の印として大きく飾る） */
function AceOrnament() {
  return (
    <g className="pc-ace-ornament">
      <ellipse cx={CX} cy={CY} rx="74" ry="92" />
      <ellipse cx={CX} cy={CY} rx="66" ry="84" />
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} d={`M${CX} ${CY - 100} L${CX + 6} ${CY - 92} L${CX} ${CY - 84} L${CX - 6} ${CY - 92} Z`} transform={`rotate(${deg} ${CX} ${CY})`} />
      ))}
    </g>
  );
}

function Face({ card }: { card: PlayingCard }) {
  const court = COURTS[card.rank];
  const ace = card.rank === 14;
  return (
    <>
      <Paper />
      {court !== undefined && <CourtFigure court={court} suit={card.suit} />}
      {ace && card.suit === 'S' && <AceOrnament />}
      {pipLayout(card.rank).map((pip) => (
        <SuitMark
          key={`${pip.x}-${pip.y}`}
          className="pc-pip"
          suit={card.suit}
          x={pip.x}
          y={pip.y}
          size={ace ? (card.suit === 'S' ? ACE_SIZE * 1.15 : ACE_SIZE) : PIP_SIZE}
          flipped={pip.flipped}
        />
      ))}
      <Index card={card} />
      <g transform={`rotate(180 ${CX} ${CY})`}>
        <Index card={card} />
      </g>
    </>
  );
}

/** 裏面（えんじの地に真鍮の格子、中央にスートの紋）。模様の id は札ごとに分ける */
function Back() {
  const id = `pc-back-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <>
      <defs>
        <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect className="pc-back-ground" width="14" height="14" />
          <path className="pc-back-lattice" d="M0 7 H14 M7 0 V14" />
          <circle className="pc-back-dot" cx="7" cy="7" r="1.6" />
        </pattern>
      </defs>
      <Paper />
      <rect className="pc-back" x="14" y="14" width={CARD_WIDTH - 28} height={CARD_HEIGHT - 28} rx="9" fill={`url(#${id})`} />
      <rect className="pc-back-frame" x="22" y="22" width={CARD_WIDTH - 44} height={CARD_HEIGHT - 44} rx="6" />
      <ellipse className="pc-back-medallion" cx={CX} cy={CY} rx="46" ry="60" />
      {(['S', 'H', 'D', 'C'] as const).map((suit, i) => (
        <SuitMark
          key={suit}
          className="pc-back-suit"
          suit={suit}
          x={CX + (i % 2 === 0 ? 0 : i === 1 ? 20 : -20)}
          y={CY + (i % 2 === 0 ? (i === 0 ? -24 : 24) : 0)}
          size={24}
        />
      ))}
    </>
  );
}

export function PlayingCardSvg({ card, className, decorative = false }: Props) {
  const color = card === null ? undefined : card.suit === 'H' || card.suit === 'D' ? 'red' : 'black';
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': card === null ? CARD_BACK : cardSpeech(card) };
  return (
    <svg
      className={`pc ${card === null ? 'pc--back' : 'pc--face'}${className ? ` ${className}` : ''}`}
      viewBox={VIEW_BOX}
      data-color={color}
      data-suit={card?.suit}
      {...a11y}
    >
      {card === null ? <Back /> : <Face card={card} />}
    </svg>
  );
}

export { SuitShape };
