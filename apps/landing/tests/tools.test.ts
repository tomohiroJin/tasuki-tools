/**
 * 玄関の道具の一覧（`TOOLS`）が正本であることを確かめるテスト（#590）。
 *
 * `ToolId` は `TOOLS` の `id` から導く。手で書いた共用体と配列が食い違う余地を残さない。
 */
import { describe, expect, it } from 'vitest';
import { TOOLS, type ToolId } from '../src/tools';

describe('TOOLS', () => {
  it('id に重複が無い', () => {
    const ids = TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id は小文字の英字だけ（`?tool=` は大文字小文字を区別する）', () => {
    for (const tool of TOOLS) {
      expect(tool.id).toMatch(/^[a-z]+$/);
    }
  });

  it('TOOLS に無い綴りは ToolId に代入できない', () => {
    // @ts-expect-error "Timer" は TOOLS の id ではない
    const wrong: ToolId = 'Timer';
    expect(TOOLS.map((tool) => tool.id)).not.toContain(wrong);
  });
});
