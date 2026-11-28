/**
 * 玄関の道具の一覧（`TOOLS`）が正本であることを確かめるテスト（#590）。
 *
 * `ToolId` は `TOOLS` の `id` から導く。手で書いた共用体と配列が食い違う余地を残さない。
 */
import { describe, expect, it } from 'vitest';
import { TOOL_DESTINATIONS, toolDestination } from '@tasuki/web-kit/room';
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

  it('Given 行き先の表（web-kit） / When 札の名前と公開パスを見る / Then 表と同じ（同じ値を 2 か所が持つので、ずれをここで止める・#677）', () => {
    const tableIds = Object.keys(TOOL_DESTINATIONS);
    const cardIds = TOOLS.map((tool) => tool.id);
    // 表に無い札・札に無い表の行が無い（順も同じ）
    expect(cardIds.filter((id) => !tableIds.includes(id))).toEqual([]);
    expect(tableIds.filter((id) => !cardIds.includes(id as ToolId))).toEqual([]);
    expect(cardIds).toEqual(tableIds);
    for (const tool of TOOLS) {
      expect({ name: tool.name, href: tool.href }).toEqual(toolDestination(tool.id));
    }
  });

  it('TOOLS に無い綴りは ToolId に代入できない', () => {
    // @ts-expect-error "Timer" は TOOLS の id ではない
    const wrong: ToolId = 'Timer';
    expect(TOOLS.map((tool) => tool.id)).not.toContain(wrong);
  });
});
