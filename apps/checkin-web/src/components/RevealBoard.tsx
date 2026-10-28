/**
 * 開いた後の画面（#406 3.5・設計 §5 の B と C）。札の種類ごとの山・山の下の大きな数字と札の名前・
 * 名前つきなら名前の小札・一番多い山は金の縁と淡い光・下に 1 行の要約。
 *
 * **開く動きは山の側だけ**（各山の札が伏せた姿から `revealSchedule` の遅れで裏返り、最後に数字と名前が出る）。
 * 席の伏せ札はここに無く、裏返さない（匿名で席と札が結びついて見えるのを防ぐ）。名前つきも匿名も同じ動き。
 * 動きを減らす設定では、遅れも動きのクラスも付けず、開いた形をすぐ出す（E12）。
 */
import type { MethodId, PileView } from '@tasuki/checkin-core';
import type { CSSProperties } from 'react';
import { PILE_UNIT_SR, REVEAL_LABEL } from '../copy';
import { usePrefersReducedMotion } from '../hooks/use-reduced-motion';
import { METHOD_COPY } from '../method-copy';
import {
  NUMERIC_METHODS,
  orderedPiles,
  REVEAL_DEAL_MS,
  REVEAL_FADE_MS,
  REVEAL_TURN_MS,
  revealSchedule,
  summaryLine,
  topCards,
} from '../reveal-view';
import { CardFace } from './CardFace';

interface Props {
  method: MethodId;
  piles: readonly PileView[];
}

export function RevealBoard({ method, piles }: Props) {
  const reduced = usePrefersReducedMotion();
  // 山は「やり方の札の順」。サーバーの順に頼らず、札の定義の順に並べ直す
  const ordered = orderedPiles(method, piles);
  const total = ordered.reduce((n, p) => n + p.count, 0);
  const schedule = revealSchedule(total, reduced);
  const top = topCards(ordered);
  const maxCount = ordered.reduce((m, p) => Math.max(m, p.count), 0);

  const boardStyle = {
    '--pile-count': ordered.length,
    '--stack-max': Math.max(1, maxCount),
    // 動きの時間は reveal-view.ts の定数が正本。CSS へはここで渡す（reduced では渡さない＝動きを付けない）
    ...(reduced
      ? {}
      : {
          '--reveal-deal': `${REVEAL_DEAL_MS}ms`,
          '--reveal-turn': `${REVEAL_TURN_MS}ms`,
          '--reveal-fade': `${REVEAL_FADE_MS}ms`,
          '--reveal-fade-at': `${schedule.totalMs - REVEAL_FADE_MS}ms`,
        }),
  } as CSSProperties;

  let next = 0; // 山をまたいで通し番号で遅れを振る
  return (
    <section className={`reveal-board${reduced ? '' : ' reveal-board--run'}`} style={boardStyle}>
      <ul className="piles" aria-label={REVEAL_LABEL}>
        {ordered.map((pile) => {
          const cardCopy = METHOD_COPY[method].cards[pile.card];
          const cls = `pile${top.has(pile.card) ? ' pile--top' : ''}${pile.count === 0 ? ' pile--empty' : ''}`;
          return (
            <li key={pile.card} className={cls}>
              <div className="pile-stack" style={{ '--n': pile.count } as CSSProperties}>
                {pile.count === 0 ? (
                  <span className="pile-ghost" aria-hidden="true" />
                ) : (
                  Array.from({ length: pile.count }, (_, i) => {
                    const delay = schedule.delaysMs[next++] ?? 0;
                    return (
                      <span
                        key={i}
                        className="pile-card"
                        style={
                          {
                            '--i': i,
                            ...(reduced ? {} : { '--d': `${delay}ms` }),
                          } as CSSProperties
                        }
                        aria-hidden="true"
                      >
                        <span className="pile-card-in">
                          <span className="pile-card-back" />
                          <span className="pile-card-face">
                            <CardFace method={method} card={pile.card} />
                          </span>
                        </span>
                      </span>
                    );
                  })
                )}
              </div>
              <p className="pile-count">
                {pile.count}
                <span className="ui-visually-hidden">{PILE_UNIT_SR}</span>
              </p>
              {NUMERIC_METHODS.has(method) ? (
                // 数のやり方: 札の顔に数字が出ているので、山の下は意味だけ（札の名前は読み上げ用に隠して残す）。
                // 0 枚の山は枠に数字が無いので、名前と意味を 1 行に並べる。隠した名前と意味の間にも空白を置く（読み上げで連結しない）
                <p className="pile-label">
                  <span className={pile.count === 0 ? 'pile-name' : 'pile-name ui-visually-hidden'}>{cardCopy?.name ?? pile.card}</span>
                  {' '}
                  <span className="pile-meaning">{cardCopy?.meaning}</span>
                </p>
              ) : (
                <p className="pile-name">{cardCopy?.name ?? pile.card}</p>
              )}
              {pile.names !== undefined && pile.names.length > 0 && (
                <ul className="pile-names">
                  {pile.names.map((name, i) => (
                    <li key={`${name}-${i}`} className="pile-chip" title={name}>
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="reveal-summary">{summaryLine(method, ordered)}</p>
    </section>
  );
}
