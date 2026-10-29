// 絵札（J・Q・K）の絵（#403・設計 §5.3）。古典的なトランプと同じく、上半分の人物を 180° 回して下半分に置く（上下対称）。
//
// 色はクラスで当て、値は `CardTable.css` がトークンから引く（生の色を書かない）。
// 衣の色はスートで入れ替える: 赤のスートは赤の衣に青の縁、黒のスートは青の衣に赤の縁。
import type { Suit } from '@tasuki/poker-core';
import { CARD_HEIGHT, CARD_WIDTH } from './pip-layout';
import { SuitMark } from './suit-paths';

export type Court = 'jack' | 'queen' | 'king';

const CX = CARD_WIDTH / 2;
const CY = CARD_HEIGHT / 2;
/** 絵の枠（角の文字と重ならない内側） */
export const FRAME = { x: 50, y: 54, width: CARD_WIDTH - 100, height: CARD_HEIGHT - 108 } as const;

/** 冠・ティアラ・帽子 */
function Headwear({ court }: { court: Court }) {
  switch (court) {
    case 'king':
      return (
        <g className="pc-crown">
          <path className="pc-gold" d={`M${CX - 22} 98 L${CX - 19} 72 L${CX - 9} 86 L${CX} 66 L${CX + 9} 86 L${CX + 19} 72 L${CX + 22} 98 Z`} />
          <rect className="pc-gold-deep" x={CX - 22} y="92" width="44" height="7" rx="2" />
          <circle className="pc-jewel" cx={CX} cy="95.5" r="2.6" />
          <circle className="pc-jewel-alt" cx={CX - 12} cy="95.5" r="2" />
          <circle className="pc-jewel-alt" cx={CX + 12} cy="95.5" r="2" />
          <circle className="pc-gold" cx={CX} cy="64" r="3" />
        </g>
      );
    case 'queen':
      return (
        <g className="pc-tiara">
          <path className="pc-gold" d={`M${CX - 21} 100 Q${CX} 82 ${CX + 21} 100 L${CX + 21} 104 Q${CX} 90 ${CX - 21} 104 Z`} />
          {[-12, 0, 12].map((dx) => (
            <path key={dx} className="pc-gold" d={`M${CX + dx - 3} ${dx === 0 ? 88 : 93} L${CX + dx} ${dx === 0 ? 76 : 84} L${CX + dx + 3} ${dx === 0 ? 88 : 93} Z`} />
          ))}
          <circle className="pc-jewel" cx={CX} cy="80" r="2.6" />
        </g>
      );
    case 'jack':
      return (
        <g className="pc-cap">
          <path className="pc-robe" d={`M${CX - 21} 101 Q${CX - 20} 78 ${CX} 77 Q${CX + 22} 78 ${CX + 23} 97 Z`} />
          <path className="pc-trim" d={`M${CX - 22} 101 L${CX + 23} 97 L${CX + 23} 102 L${CX - 22} 106 Z`} />
          <path className="pc-feather" d={`M${CX + 18} 90 Q${CX + 44} 70 ${CX + 38} 54 Q${CX + 34} 72 ${CX + 14} 86 Z`} />
          <path className="pc-feather-vein" d={`M${CX + 16} 88 Q${CX + 32} 74 ${CX + 37} 57`} />
        </g>
      );
  }
}

/** 髪と髭（王は顎髭、女王は長い髪、ジャックは短い髪） */
function Hair({ court }: { court: Court }) {
  switch (court) {
    case 'king':
      return (
        <>
          <path className="pc-hair" d={`M${CX - 17} 104 Q${CX - 20} 116 ${CX - 15} 124 L${CX - 12} 108 Z M${CX + 17} 104 Q${CX + 20} 116 ${CX + 15} 124 L${CX + 12} 108 Z`} />
          <path className="pc-hair" d={`M${CX - 14} 118 Q${CX} 146 ${CX + 14} 118 Q${CX + 8} 128 ${CX} 129 Q${CX - 8} 128 ${CX - 14} 118 Z`} />
          <path className="pc-hair" d={`M${CX - 7} 121 Q${CX} 117 ${CX + 7} 121 Q${CX} 123 ${CX - 7} 121 Z`} />
        </>
      );
    case 'queen':
      return (
        <path className="pc-hair" d={`M${CX - 19} 100 Q${CX - 26} 124 ${CX - 20} 140 L${CX - 12} 132 Q${CX - 16} 116 ${CX - 13} 106 Z M${CX + 19} 100 Q${CX + 26} 124 ${CX + 20} 140 L${CX + 12} 132 Q${CX + 16} 116 ${CX + 13} 106 Z`} />
      );
    case 'jack':
      return (
        <path className="pc-hair" d={`M${CX - 17} 103 Q${CX - 21} 114 ${CX - 17} 122 L${CX - 13} 108 Z M${CX + 17} 103 Q${CX + 21} 114 ${CX + 17} 122 L${CX + 13} 108 Z`} />
      );
  }
}

/** 手に持つもの（王は剣、女王は花、ジャックは槍） */
function Emblem({ court }: { court: Court }) {
  switch (court) {
    case 'king':
      return (
        <g className="pc-sword">
          <path className="pc-metal" d={`M${CX + 44} ${CY} L${CX + 50} 100 L${CX + 53} 96 L${CX + 52} 100 L${CX + 47} ${CY} Z`} />
          <rect className="pc-gold-deep" x={CX + 38} y="150" width="18" height="4" rx="1.5" transform={`rotate(4 ${CX + 47} 152)`} />
        </g>
      );
    case 'queen':
      return (
        <g className="pc-flower">
          <path className="pc-stem" d={`M${CX - 42} ${CY} Q${CX - 46} 150 ${CX - 38} 126`} />
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse key={deg} className="pc-petal" cx={CX - 38} cy="119" rx="4" ry="7.5" transform={`rotate(${deg} ${CX - 38} 126)`} />
          ))}
          <circle className="pc-gold" cx={CX - 38} cy="126" r="3.4" />
        </g>
      );
    case 'jack':
      return (
        <g className="pc-halberd">
          <path className="pc-stem" d={`M${CX - 46} ${CY} L${CX - 42} 104`} />
          <path className="pc-metal" d={`M${CX - 42} 92 L${CX - 36} 108 L${CX - 42} 104 L${CX - 48} 108 Z`} />
        </g>
      );
  }
}

/** 上半分の人物（下半分はこれを 180° 回す） */
function Half({ court, suit }: { court: Court; suit: Suit }) {
  return (
    <>
      {/* 衣: 肩から枠の真ん中まで */}
      <path className="pc-robe" d={`M${FRAME.x + 18} ${CY} L${FRAME.x + 18} 152 Q${FRAME.x + 26} 134 ${CX - 20} 130 L${CX + 20} 130 Q${FRAME.x + FRAME.width - 26} 134 ${FRAME.x + FRAME.width - 18} 152 L${FRAME.x + FRAME.width - 18} ${CY} Z`} />
      <path className="pc-trim" d={`M${CX - 7} 140 L${CX + 7} 140 L${CX + 7} ${CY} L${CX - 7} ${CY} Z`} />
      {[148, 160, 172].map((y) => (
        <circle key={y} className="pc-gold" cx={CX} cy={y - 2} r="2.2" />
      ))}
      <path className="pc-trim" d={`M${FRAME.x + 18} 156 Q${CX - 30} 150 ${CX - 20} 146 L${CX - 20} 152 Q${CX - 30} 156 ${FRAME.x + 18} 162 Z M${FRAME.x + FRAME.width - 18} 156 Q${CX + 30} 150 ${CX + 20} 146 L${CX + 20} 152 Q${CX + 30} 156 ${FRAME.x + FRAME.width - 18} 162 Z`} />
      {/* 襟 */}
      <path className="pc-gold" d={`M${CX - 20} 130 Q${CX} 146 ${CX + 20} 130 L${CX + 16} 138 Q${CX} 152 ${CX - 16} 138 Z`} />
      <Emblem court={court} />
      {/* 首と顔 */}
      <rect className="pc-skin" x={CX - 5} y="118" width="10" height="13" />
      <ellipse className="pc-skin" cx={CX} cy="110" rx="14" ry="16" />
      <Hair court={court} />
      <path className="pc-feature" d={`M${CX - 7} 107 Q${CX - 4.5} 105 ${CX - 2} 107 M${CX + 2} 107 Q${CX + 4.5} 105 ${CX + 7} 107`} />
      <path className="pc-feature" d={`M${CX} 109 L${CX - 1.5} 115 L${CX + 1} 115`} />
      {court !== 'king' && <path className="pc-lips" d={`M${CX - 3.5} 119 Q${CX} 121.5 ${CX + 3.5} 119`} />}
      <Headwear court={court} />
      {/* 絵の中のスート（上の角） */}
      <SuitMark className="pc-court-suit" suit={suit} x={FRAME.x + 17} y={FRAME.y + 18} size={20} />
    </>
  );
}

export function CourtFigure({ court, suit }: { court: Court; suit: Suit }) {
  return (
    <g className="pc-court" data-court={court}>
      <rect className="pc-court-frame" x={FRAME.x} y={FRAME.y} width={FRAME.width} height={FRAME.height} rx="4" />
      <g className="pc-court-half">
        <Half court={court} suit={suit} />
      </g>
      <g className="pc-court-half" transform={`rotate(180 ${CX} ${CY})`}>
        <Half court={court} suit={suit} />
      </g>
      <line className="pc-court-divider" x1={FRAME.x + 6} y1={CY} x2={FRAME.x + FRAME.width - 6} y2={CY} />
    </g>
  );
}
