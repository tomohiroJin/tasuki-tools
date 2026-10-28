// 隠しモードのテーブル（#403・設計 §5.2）。ゲームの間、操作の面の手札・結果・帯をこれに置き換える。
// **`room-state.table` が届いたときにだけ `React.lazy` で読み込む**（設計 §5.5）。札の SVG・文言・見た目もこの塊に入る。
//
// 卓（フェルト）の上に、他の人の席（開くまでは裏向きの 5 枚と「チェンジ済み」）と、手前に自分の手を並べる。
// 配った札は山から滑って届き、開くと他の人の札が席順にめくれる（動きを減らす設定では止める）。
import { useState, type CSSProperties } from 'react';
import { HAND_SIZE, type ParticipantView, type PlayingCard, type TableView } from '@tasuki/poker-core';
import {
  AGAIN,
  BACK_TO_ESTIMATE,
  CATEGORY_LABELS,
  EXCHANGED,
  EXCHANGING,
  KEEP,
  PROMPT_CHOOSE,
  PROMPT_SHOWN,
  PROMPT_WAIT,
  TABLE_HEADING,
  WATCHING,
  YOU,
  YOUR_HAND,
  cardSpeech,
  exchangeLabel,
  handOf,
} from '../card-table-copy';
import { PlayingCardSvg } from './playing-card/PlayingCardSvg';
import './CardTable.css';

interface Props {
  table: TableView;
  participants: readonly ParticipantView[];
  you: string;
  disabled: boolean;
  onExchange: (discard: number[]) => void;
  onDealAgain: () => void;
  onClose: () => void;
}

const cardKey = (c: PlayingCard) => `${c.rank}${c.suit}`;
/**
 * 札の順番（配る・めくる動きの遅れ）と、扇の真ん中からの離れ（傾きと沈み）。
 * 離れは CSS の `abs()` で求めず値で渡す（`abs()` に対応しないブラウザで `transform` ごと無効になるため）
 */
const order = (i: number) => ({ '--i': i, '--d': Math.abs(i - (HAND_SIZE - 1) / 2) }) as CSSProperties;

/** 他の人の札。開いたら表へめくる（裏 → 表の 1 回だけ。表になったあとは描き直しても動かない） */
function SeatCard({ card, index }: { card: PlayingCard | null; index: number }) {
  if (card === null) {
    return (
      <li className="ct-card ct-card--dealt" style={order(index)}>
        <PlayingCardSvg card={null} />
      </li>
    );
  }
  return (
    <li className="ct-card ct-card--flip" style={order(index)}>
      <span className="ct-rotor">
        <PlayingCardSvg className="ct-rotor-face" card={card} />
        <PlayingCardSvg className="ct-rotor-back" card={null} decorative />
      </span>
    </li>
  );
}

export function CardTable({ table, participants, you, disabled, onExchange, onDealAgain, onClose }: Props) {
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? '?';
  const shown = table.status === 'shown';
  // 手はプレイヤーにしか届かない（サーバーが守る）ので、`yourHand` があることがプレイヤーであることを表す
  const myHand = table.yourHand;
  const me = table.players.find((p) => p.participantId === you);
  const canExchange = !shown && myHand !== null && me?.exchanged === false;

  // 選んだ位置。手が替わったら（配り直し・チェンジ）選びを捨てる
  const handKey = myHand?.map(cardKey).join(',') ?? '';
  const [selection, setSelection] = useState<{ handKey: string; picks: number[] }>({ handKey, picks: [] });
  const picks = selection.handKey === handKey ? selection.picks : [];
  // 並べ替えない（サーバーは捨てる位置を順不同で受ける）
  const toggle = (i: number) =>
    setSelection({ handKey, picks: picks.includes(i) ? picks.filter((p) => p !== i) : [...picks, i] });

  // 送った操作の返事（新しい状態）が届くまで、操作を押せなくする（二重送信で「1 回だけです」のエラーを見せない）。
  // 押せなくした（disabled の）ボタンにはクリックが届かないので、これだけで 2 回目は送られない。
  // 状態の鍵が変われば自然に解ける。「見積もりに戻る」が通ればテーブルごと消える
  const stateKey = `${table.status}|${handKey}|${table.players.map((p) => Number(p.exchanged)).join('')}`;
  const [sentFor, setSentFor] = useState<string | null>(null);
  const locked = disabled || sentFor === stateKey;
  const once = (send: () => void) => () => {
    setSentFor(stateKey);
    send();
  };

  const prompt = shown ? PROMPT_SHOWN : myHand === null ? WATCHING : canExchange ? PROMPT_CHOOSE : PROMPT_WAIT;
  const handsById = new Map(table.hands.map((h) => [h.participantId, h]));
  const others = table.players.filter((p) => p.participantId !== you);

  return (
    <section className="card-table" aria-labelledby="card-table-heading" data-status={table.status}>
      <header className="ct-head">
        <h2 id="card-table-heading">{TABLE_HEADING}</h2>
        <p className="ct-prompt" role="status">
          {prompt}
        </p>
      </header>

      <div className="ct-felt">
        {/* 山（飾り）。配った札はここから滑って席へ届く */}
        <div className="ct-deck" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <PlayingCardSvg key={i} card={null} decorative />
          ))}
        </div>

        <ul className="ct-seats">
          {others.map((p) => {
            const opened = handsById.get(p.participantId);
            return (
              <li key={p.participantId} className="ct-seat" aria-label={handOf(nameOf(p.participantId))}>
                <div className="ct-seat-head">
                  <span className="ct-seat-name">{nameOf(p.participantId)}</span>
                  {opened ? (
                    <span className="ct-category">{CATEGORY_LABELS[opened.category]}</span>
                  ) : (
                    <span className={`badge ct-badge${p.exchanged ? ' ct-badge--done' : ''}`}>
                      {p.exchanged ? EXCHANGED : EXCHANGING}
                    </span>
                  )}
                </div>
                <ul className="ct-mini-hand">
                  {opened
                    ? opened.cards.map((c, i) => <SeatCard key={cardKey(c)} card={c} index={i} />)
                    : Array.from({ length: HAND_SIZE }, (_, i) => <SeatCard key={i} card={null} index={i} />)}
                </ul>
              </li>
            );
          })}
        </ul>

        {myHand !== null && (
          <div className="ct-mine">
            {shown ? (
              <ul className="ct-seats ct-seats--mine">
                <li className="ct-seat ct-seat--mine" aria-label={handOf(nameOf(you))}>
                  <div className="ct-seat-head">
                    <span className="ct-seat-name">{YOU}</span>
                    {handsById.get(you) && (
                      <span className="ct-category ct-category--mine">{CATEGORY_LABELS[handsById.get(you)!.category]}</span>
                    )}
                  </div>
                  <ul className="ct-hand">
                    {myHand.map((c, i) => (
                      <li key={cardKey(c)} className="ct-card" style={order(i)}>
                        <PlayingCardSvg card={c} />
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            ) : canExchange ? (
              <div className="ct-hand" role="group" aria-label={YOUR_HAND}>
                {myHand.map((c, i) => (
                  <button
                    key={cardKey(c)}
                    type="button"
                    className="ct-card ct-card--dealt ct-pick"
                    style={order(i)}
                    aria-label={cardSpeech(c)}
                    aria-pressed={picks.includes(i)}
                    disabled={locked}
                    onClick={() => toggle(i)}
                  >
                    <PlayingCardSvg card={c} decorative />
                  </button>
                ))}
              </div>
            ) : (
              <ul className="ct-hand" aria-label={YOUR_HAND}>
                {myHand.map((c, i) => (
                  <li key={cardKey(c)} className="ct-card ct-card--dealt" style={order(i)}>
                    <PlayingCardSvg card={c} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="ui-actions ct-actions">
        <button type="button" className="ui-button ui-button--quiet" onClick={once(onClose)} disabled={locked}>
          {BACK_TO_ESTIMATE}
        </button>
        {canExchange && (
          <button type="button" className="ui-button ui-button--lg" onClick={once(() => onExchange(picks))} disabled={locked}>
            {picks.length === 0 ? KEEP : exchangeLabel(picks.length)}
          </button>
        )}
        {shown && (
          <button type="button" className="ui-button ui-button--lg" onClick={once(onDealAgain)} disabled={locked}>
            {AGAIN}
          </button>
        )}
      </div>
    </section>
  );
}

export default CardTable;
