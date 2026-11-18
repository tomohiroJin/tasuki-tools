/**
 * 道具の入口から送り返された人を、通ったあとに元の道具へ戻す行き先（#638）。
 *
 * 道具は名乗りと合言葉のために玄関へ送り返す（`docs/adr/0018`）。そのとき `?from=<道具の ID>` を運ぶ
 * （綴りの正本は `@tasuki/room-core` の `RETURN_PARAM`）。**URL をそのまま信じて遷移しない** ——
 * 行き先は玄関の札の一覧（`TOOLS`）から引き、知らない値・不正な値は戻さない。
 */
import { describe, expect, it } from 'vitest';
import { roomHubPath } from '@tasuki/room-core';
import { TOOLS } from '../../src/tools.js';
import { returnPathFor } from '../../src/hub/return-to-tool.js';

const ORIGIN = 'https://example.test';

describe('returnPathFor', () => {
  it.each(TOOLS.map((tool) => [tool.id, tool.href] as const))(
    'Given from=%s / When 行き先を引く / Then 札の公開パスへ同じルームで戻す（%s）',
    (id, href) => {
      expect(returnPathFor(`${ORIGIN}/?room=R1&from=${id}`)).toBe(`${href}?room=R1`);
    },
  );

  it('Given 道具が運んだ URL / When 行き先を引く / Then 道具の送り方（roomHubPath）と対で読める', () => {
    expect(returnPathFor(ORIGIN + roomHubPath('朝会モブ-a1b2', undefined, 'poker'))).toBe(
      `/poker/?room=${encodeURIComponent('朝会モブ-a1b2')}`,
    );
  });

  it.each([
    ['from が無い', `${ORIGIN}/?room=R1`],
    ['知らない道具', `${ORIGIN}/?room=R1&from=unknown`],
    ['外部へ向ける値', `${ORIGIN}/?room=R1&from=https://evil.example/`],
    ['パスを混ぜた値', `${ORIGIN}/?room=R1&from=../admin`],
    ['空の値', `${ORIGIN}/?room=R1&from=`],
    ['ルームコードが無い', `${ORIGIN}/?from=timer`],
    ['空のルームコード', `${ORIGIN}/?room=&from=timer`],
  ])('Given %s / When 行き先を引く / Then 戻さない（null）', (_label, href) => {
    expect(returnPathFor(href)).toBeNull();
  });

  it('Given 退出の告知を持つ URL / When 行き先を引く / Then 戻さない（外された人が入り直して外される往復を作らない）', () => {
    expect(returnPathFor(`${ORIGIN}/?room=R1&left=removed&from=timer`)).toBeNull();
  });
});
