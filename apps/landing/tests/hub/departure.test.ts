/**
 * 退出の告知を URL から読み取る（#95 S5c・I-1）。
 *
 * **印を落とすところまでが仕事である。** 残すと再読込のたびに同じ告知が出て、
 * 「いま外された」と誤って伝わる。
 */
import { describe, it, expect } from 'vitest';
import { readDepartureNotice } from '../../src/hub/departure.js';

describe('readDepartureNotice', () => {
  it('Given 外された印つきの URL / When 読む / Then 再参加の手立てまで伝える文が返る', () => {
    // Given
    const href = 'https://tasuki.example/?room=ABC123&left=removed';

    // When
    const read = readDepartureNotice(href);

    // Then
    expect(read.notice).toBe('ルームから退出しました。再参加するには名前を入力してください。');
  });

  it('Given 自分で抜けた印つきの URL / When 読む / Then 抜けたことを伝える文が返る', () => {
    // Given
    const href = 'https://tasuki.example/?left=self';

    // When
    const read = readDepartureNotice(href);

    // Then
    expect(read.notice).toBe('ルームから抜けました。');
  });

  it('Given 印つきの URL / When 読む / Then 印だけが落ちた URL が返る（ルームコードは残す）', () => {
    // Given
    const href = 'https://tasuki.example/?room=ABC123&left=removed';

    // When
    const read = readDepartureNotice(href);

    // Then: `?room=` はどのルームへ再参加するかを決める値なので落とさない
    expect(new URL(read.cleanedHref).searchParams.get('room')).toBe('ABC123');
    expect(new URL(read.cleanedHref).searchParams.get('left')).toBeNull();
  });

  it('Given 印の無い URL / When 読む / Then 告知は無く、URL も変わらない', () => {
    // Given
    const href = 'https://tasuki.example/?room=ABC123';

    // When
    const read = readDepartureNotice(href);

    // Then
    expect(read.notice).toBeNull();
    expect(new URL(read.cleanedHref).searchParams.get('room')).toBe('ABC123');
  });

  it('Given 知らない値の印 / When 読む / Then 告知を出さない（綴りが割れたら黙って出さない）', () => {
    // Given: 送る側と読む側で綴りが割れた状態
    // When
    const read = readDepartureNotice('https://tasuki.example/?left=kicked');

    // Then
    expect(read.notice).toBeNull();
  });
});
