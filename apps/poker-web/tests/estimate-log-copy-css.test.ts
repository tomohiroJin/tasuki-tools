/**
 * 見積もりの記録のコピーが失敗したときの画面の CSS の契約（#653 のレビュー）。
 * 重なりの結果は E2E（`e2e/specs/poker-estimate-log.spec.ts`）が測る。ここは、その結果を生む規則が残っていることを守る。
 *
 * @requirements #653
 */
import { describe, expect, it } from 'vitest';

import { foundBody, readFromCwd as read, rulesOf } from '@tasuki/test-css/css-rules';

describe('コピー失敗の知らせと手動コピーの欄（画面の CSS）', () => {
  it('Given 失敗の知らせ / When 規則を読む / Then 浮かせず流れの中に置く（欄の頭に重ならない）', () => {
    const css = read('src/index.css');
    const body = foundBody(rulesOf(css, '.estimate-log-copy-status--failed'), '.estimate-log-copy-status--failed');
    expect(body).toMatch(/position:\s*static;/);
  });

  it('Given 手動コピーの欄 / When 規則を読む / Then 縦に縮めず（rows の高さを保つ）、字は 16px を下回らない', () => {
    const css = read('src/index.css');
    const body = foundBody(rulesOf(css, '.estimate-log-manual'), '.estimate-log-manual');
    expect(body).toMatch(/flex-shrink:\s*0;/);
    expect(body).toMatch(/font-size:\s*1rem;/);
  });
});
