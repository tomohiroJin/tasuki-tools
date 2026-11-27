/**
 * 時系列の帯の CSS の契約（#476 第 2 段・D4）。
 * 部分の幅は割合だけで決める。`min-width` と `gap` は部分の数だけ幅を足すので、区切りが多いと帯が親の幅を超えて右端が切れる。
 */
import { describe, expect, it } from 'vitest';
import { foundBody, readFromCwd as read, rulesOf } from '@tasuki/test-css/css-rules';

const css = read('src/index.css');

/**
 * @requirements #476 設計 §5 D4（区切りが多くても帯が溢れない）
 */
describe('時系列の帯の幅', () => {
  it('Given 帯の部分 / When 規則を読む / Then 割合の幅（flex）だけで、min-width を持たない', () => {
    const body = foundBody(rulesOf(css, '.track-band-part'), '帯の部分');
    expect(body).toMatch(/flex:\s*var\(--share\)/);
    expect(body).not.toMatch(/min-width/);
  });

  it('Given 帯の行 / When 規則を読む / Then 部分どうしの間（gap）を持たない', () => {
    const body = foundBody(rulesOf(css, '.track-band-line'), '帯の行');
    expect(body).not.toMatch(/\bgap:/);
  });

  it('Given 帯の部分 / When 区切りの線を探す / Then 幅を取らない描き方（内側の影）で引く', () => {
    expect(foundBody(rulesOf(css, '.track-band-part'), '帯の部分')).toMatch(/box-shadow:\s*inset/);
  });
});
