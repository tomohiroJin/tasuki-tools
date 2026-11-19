/**
 * ハブへ送るコマンドの組み立て（#595）。
 *
 * 送る場所が 3 つ（復帰・自動の再試行・利用者の名乗り）に散っていた組み立てを、
 * `hub-commands.ts` の 1 か所に寄せた。形を固定するのがこのテストである。
 */
import { describe, it, expect } from 'vitest';
import { checkCommand, createCommand, joinCommand, lastJoinOf, passphraseCommand, resumeCommand, retryCommand } from '../../src/hub/hub-commands.js';

describe('ハブへ送るコマンド', () => {
  it('Given 保存済みの組 / When 復帰のコマンドを作る / Then 復帰の印を持つ', () => {
    expect(resumeCommand('A-1', { displayName: '太郎', resumeToken: 'tok' })).toEqual({
      command: 'room.join',
      code: 'A-1',
      displayName: '太郎',
      resumeToken: 'tok',
    });
  });

  it('Given コード / When 照会のコマンドを作る / Then 名前を持たない', () => {
    expect(checkCommand('A-1')).toEqual({ command: 'room.check', code: 'A-1' });
  });

  it('Given 合言葉つきの名乗り / When 入室のコマンドを作る / Then 合言葉を載せる', () => {
    expect(joinCommand('A-1', { displayName: '太郎', passphrase: 'pw' })).toEqual({
      command: 'room.join',
      code: 'A-1',
      displayName: '太郎',
      passphrase: 'pw',
    });
  });

  it('Given 合言葉の無い名乗り / When 入室のコマンドを作る / Then passphrase の鍵を持たない', () => {
    expect('passphrase' in joinCommand('A-1', { displayName: '太郎' })).toBe(false);
  });

  it('Given まだ名乗っていない / When 再試行のコマンドを作る / Then 照会を送り直す', () => {
    expect(retryCommand('A-1', null)).toEqual({ command: 'room.check', code: 'A-1' });
  });

  it('Given 名乗り済み / When 再試行のコマンドを作る / Then 入室を送り直す', () => {
    expect(retryCommand('A-1', { displayName: '太郎' })).toEqual({
      command: 'room.join',
      code: 'A-1',
      displayName: '太郎',
    });
  });

  it('Given ルーム名と名前 / When 作成のコマンドを作る / Then room.create になる', () => {
    expect(createCommand('朝会', '太郎')).toEqual({ command: 'room.create', roomName: '朝会', displayName: '太郎' });
  });

  it('Given 合言葉が無い名乗り / When 直近の名乗りを作る / Then passphrase の鍵を持たない', () => {
    expect('passphrase' in lastJoinOf('太郎')).toBe(false);
    expect(lastJoinOf('太郎', 'pw')).toEqual({ displayName: '太郎', passphrase: 'pw' });
  });

  // #638: もと timer のコマンド。宛先は接続が決めるのでコードを載せない。
  it('Given 合言葉 / When 設定のコマンドを作る / Then コードを持たない room.passphrase.set になる', () => {
    expect(passphraseCommand('ひみつ')).toEqual({ command: 'room.passphrase.set', passphrase: 'ひみつ' });
  });

  it('Given 空文字 / When 設定のコマンドを作る / Then 解除として同じ形で送る', () => {
    expect(passphraseCommand('')).toEqual({ command: 'room.passphrase.set', passphrase: '' });
  });
});
