/**
 * 端末に置く同一性（#95 D12）。**#95 S5b で `apps/landing` からここへ移した**
 * （ハブ・timer・poker の 3 つが同じ鍵を読み書きするため）。
 *
 * - **復帰の組**はルームコード別（S4b で timer が採った形と同じ鍵）
 * - **既定の表示名**はルーム非依存（D12 の後半）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDefaultDisplayName,
  loadResumeIdentity,
  saveDefaultDisplayName,
  saveResumeIdentity,
  clearResumeIdentity,
} from '../src/resume-identity.js';

beforeEach(() => {
  localStorage.clear();
});

describe('復帰の組', () => {
  it('Given 保存した組 / When 同じルームで読む / Then そのまま返る', () => {
    // Given（準備）
    const identity = { code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' };
    saveResumeIdentity(identity);

    // When / Then（操作）
    expect(loadResumeIdentity('R1')).toEqual(identity);
  });

  it('Given 別のルームの組 / When 読む / Then null（前のルームへ引き戻さない）', () => {
    saveResumeIdentity({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' });
    expect(loadResumeIdentity('R2')).toBeNull();
  });

  it('Given 壊れた保存値 / When 読む / Then null を返し、その鍵を捨てる', () => {
    // Given（準備）: 誰でも書き換えられる場所なので型注釈を信じない（原則 IV）
    localStorage.setItem('tasuki:resume:R1', '{壊れた');

    // When / Then（操作）: 残すと毎回同じ値で参加に失敗し続ける
    expect(loadResumeIdentity('R1')).toBeNull();
    expect(localStorage.getItem('tasuki:resume:R1')).toBeNull();
  });

  it('Given 項目の欠けた保存値 / When 読む / Then null', () => {
    localStorage.setItem('tasuki:resume:R1', JSON.stringify({ code: 'R1', participantId: 'p1' }));
    expect(loadResumeIdentity('R1')).toBeNull();
  });

  it('Given 保存した組 / When 破棄する / Then 読めなくなる', () => {
    // Given（準備）: 明示的な退出・セッション喪失で捨てる
    saveResumeIdentity({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' });

    // When（操作）
    clearResumeIdentity('R1');

    // Then
    expect(loadResumeIdentity('R1')).toBeNull();
  });

  it('Given timer が使う鍵 / When 保存する / Then 同じ綴りで書く（同じ端末で共有する）', () => {
    // Given（準備）: timer は `tasuki:resume:<ルームコード>` に置く（S4b）
    saveResumeIdentity({ code: 'R1', participantId: 'p1', resumeToken: 't1', displayName: 'あや' });

    // When / Then（操作）: 鍵が食い違うと、ハブで名乗った人が timer で別人になる
    expect(localStorage.getItem('tasuki:resume:R1')).not.toBeNull();
  });
});

describe('既定の表示名', () => {
  it('Given 名乗った名前 / When 別のルームの初期値を読む / Then 前の名前が出る', () => {
    // Given（準備）: ルーム非依存で置く（D12 の後半）
    saveDefaultDisplayName('あや');

    // When / Then（操作）
    expect(loadDefaultDisplayName()).toBe('あや');
  });

  it('Given 未保存 / When 読む / Then 空文字（フォームの初期値として使える）', () => {
    expect(loadDefaultDisplayName()).toBe('');
  });

  it('Given 空白だけの名前 / When 保存する / Then 残さない', () => {
    // Given（準備）: 次のフォームに空白が入るのを避ける
    saveDefaultDisplayName('   ');

    // When / Then（操作）
    expect(loadDefaultDisplayName()).toBe('');
  });
});

describe('復帰の組（ルームをまたぐ扱い・#95 S5b で timer から移設）', () => {
  const alice = {
    code: 'ABC123',
    participantId: 'p-1',
    resumeToken: 'resume-token-xyz',
    displayName: 'Alice',
  };

  it('Given 2 つのルームに入った端末 / When それぞれの鍵で読む / Then 2 つのルームの復帰の組を同時に保てる', () => {
    // Given: 2 つのルームに入ったことがある
    saveResumeIdentity(alice);
    saveResumeIdentity({ ...alice, code: 'SECOND', participantId: 'p-2' });

    // When / Then: どちらもそれぞれの鍵で引ける
    expect(loadResumeIdentity('ABC123')?.participantId).toBe('p-1');
    expect(loadResumeIdentity('SECOND')?.participantId).toBe('p-2');
  });

  it('Given 鍵と中身のルームコードが食い違う値 / When 読む / Then 捨てる', () => {
    // Given: 鍵は ABC123 なのに中身は別のルーム（書き換え・実装の取り違え）
    localStorage.setItem('tasuki:resume:ABC123', JSON.stringify({ ...alice, code: 'OTHER1' }));

    // When / Then
    expect(loadResumeIdentity('ABC123')).toBeNull();
  });

  it('Given 2 つのルームの組 / When 片方を破棄する / Then もう片方は残る', () => {
    // Given: 2 つのルームの復帰の組がある
    saveResumeIdentity(alice);
    saveResumeIdentity({ ...alice, code: 'SECOND', participantId: 'p-2' });

    // When
    clearResumeIdentity('ABC123');

    // Then: 消えるのは指定したルームだけである
    expect(loadResumeIdentity('ABC123')).toBeNull();
    expect(loadResumeIdentity('SECOND')?.participantId).toBe('p-2');
  });

  // **FR-006 の撤廃**（#95 D12）。旧実装は sessionStorage に 1 組だけ持っていた。
  it('Given 何も保存されていない端末 / When 保存する / Then localStorage にだけ書く', () => {
    // Given: 何も保存されていない状態（beforeEach で両方 clear 済み）
    // When
    saveResumeIdentity(alice);

    // Then
    expect(localStorage.getItem('tasuki:resume:ABC123')).not.toBeNull();
    expect(sessionStorage.getItem('tasuki:resume:ABC123')).toBeNull();
    // 旧実装の鍵も残さない（移行はしない。トークンは短命で移す価値が無い）
    expect(sessionStorage.getItem('tdd-mob:resume-identity')).toBeNull();
  });
});
