import { describe, expect, it } from 'vitest';
import { DEFAULT_ERROR_TEXT } from '../src/copy';
import { planForError } from '../src/join-error-plan';

/**
 * 名乗りと合言葉は玄関に 1 つだけある（`docs/adr/0018`）。お題ツールは失敗を見て、
 * 玄関へ戻すか・待って入り直すか・その場で伝えるかだけを決める。
 *
 * @requirements #91 spec §5.4
 */
describe('参加の失敗から次の一手を決める', () => {
  it('Given ルームが見つからない / When 決める / Then 消えたルームの案内にする', () => {
    expect(planForError('ROOM_NOT_FOUND', 'x')).toEqual({ kind: 'gone' });
  });

  it('Given 自分で抜けた・外された知らせ / When 決める / Then 理由を持って玄関へ戻す', () => {
    // Given: 自分のタブで抜けた・別のタブで抜けた（サーバーはその人の全接続へ知らせる。participant-remove.ts・#290）
    // When: 決める
    // Then: 理由を持って玄関へ戻す
    expect(planForError('LEFT_ROOM', 'x')).toEqual({ kind: 'left', reason: 'self' });
    expect(planForError('REMOVED_FROM_ROOM', 'x')).toEqual({ kind: 'left', reason: 'removed' });
    expect(planForError('REMOVED_BY_HOST', 'x')).toEqual({ kind: 'left', reason: 'removed' });
  });

  it('Given 合言葉を求められた・合わなかった / When 決める / Then 玄関へ戻す', () => {
    expect(planForError('PASSPHRASE_REQUIRED', 'x')).toEqual({ kind: 'to-hub' });
    expect(planForError('PASSPHRASE_MISMATCH', 'x')).toEqual({ kind: 'to-hub' });
  });

  it('Given 混雑で拒まれた / When 決める / Then 待って入り直す', () => {
    expect(planForError('JOIN_RATE_LIMITED', 'x')).toEqual({ kind: 'retry' });
  });

  it('Given それ以外 / When 決める / Then サーバーの文をその場で伝える', () => {
    expect(planForError('GENERATION_COOLDOWN', 'しばらく待って')).toEqual({ kind: 'show', message: 'しばらく待って' });
  });

  it('Given 文が空白だけ / When 決める / Then 既定の文で伝える', () => {
    expect(planForError('INTERNAL_ERROR', '  ')).toEqual({ kind: 'show', message: DEFAULT_ERROR_TEXT });
  });
});
