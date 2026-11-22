import { describe, expect, it } from 'vitest';
import { isEditableTarget, keyActionOf, type KeyInput } from '../src/keys';

const key = (over: Partial<KeyInput>): KeyInput => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  keyCode: 0,
  repeat: false,
  ...over,
});
const FREE = { editable: false, dialogOpen: false };

/**
 * @requirements #476 FR-26
 */
describe('キーの判定', () => {
  it.each([
    ['1', 0],
    ['5', 4],
    ['9', 8],
  ])('Given 数字キー %s / When 判定する / Then %i 番目の候補へ切り替える', (k, index) => {
    expect(keyActionOf(key({ key: k }), FREE)).toEqual({ type: 'candidate', index });
  });

  it('Given S・C（大文字でも） / When 判定する / Then 止める・直前の作業を再開する', () => {
    expect(keyActionOf(key({ key: 's' }), FREE)).toEqual({ type: 'stop' });
    expect(keyActionOf(key({ key: 'S' }), FREE)).toEqual({ type: 'stop' });
    expect(keyActionOf(key({ key: 'c' }), FREE)).toEqual({ type: 'resume' });
    expect(keyActionOf(key({ key: 'C' }), FREE)).toEqual({ type: 'resume' });
  });

  it.each(['0', 'a', 'Enter', ' ', 'F1', '１'])('Given 関係の無いキー %j / When 判定する / Then 何もしない', (k) => {
    expect(keyActionOf(key({ key: k }), FREE)).toBeNull();
  });

  it.each([['ctrlKey'], ['metaKey'], ['altKey']] as const)('Given 修飾キー %s つき / When 判定する / Then 拾わない（ブラウザの操作を奪わない）', (mod) => {
    expect(keyActionOf(key({ key: 's', [mod]: true }), FREE)).toBeNull();
    expect(keyActionOf(key({ key: '1', [mod]: true }), FREE)).toBeNull();
  });

  it('Given IME の変換中（isComposing か keyCode 229） / When 判定する / Then 拾わない', () => {
    expect(keyActionOf(key({ key: 's', isComposing: true }), FREE)).toBeNull();
    expect(keyActionOf(key({ key: '1', keyCode: 229 }), FREE)).toBeNull();
  });

  it('Given 押しっぱなしの繰り返し / When 判定する / Then 拾わない', () => {
    expect(keyActionOf(key({ key: 's', repeat: true }), FREE)).toBeNull();
  });

  it('Given 入力欄にフォーカスがある・確かめが開いている / When 判定する / Then 拾わない', () => {
    expect(keyActionOf(key({ key: 's' }), { editable: true, dialogOpen: false })).toBeNull();
    expect(keyActionOf(key({ key: '1' }), { editable: false, dialogOpen: true })).toBeNull();
  });
});

describe('入力中の要素か', () => {
  const el = (html: string): Element => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild!;
  };

  it.each([
    ['<input />'],
    ['<input type="time" />'],
    ['<select></select>'],
    ['<textarea></textarea>'],
    ['<div contenteditable="true"></div>'],
    ['<div contenteditable></div>'],
  ])('Given %s / When 見る / Then 入力中', (html) => {
    expect(isEditableTarget(el(html))).toBe(true);
  });

  it('Given contenteditable の中の要素 / When 見る / Then 入力中', () => {
    const host = el('<div contenteditable="true"><span id="x">a</span></div>');
    expect(isEditableTarget(host.querySelector('#x'))).toBe(true);
  });

  it.each([['<button></button>'], ['<a href="#"></a>'], ['<div></div>'], ['<div contenteditable="false"></div>']])(
    'Given %s / When 見る / Then 入力中ではない',
    (html) => {
      expect(isEditableTarget(el(html))).toBe(false);
    },
  );

  it('Given フォーカスが無い / When 見る / Then 入力中ではない', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
