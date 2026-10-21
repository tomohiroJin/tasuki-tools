/**
 * シナリオの端末への保存（#429 spec §5・§7.6）。
 */
import { ScenarioInputSchema, roundsOf, type ScenarioInput } from '@tasuki/agenda-core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { SAMPLE_SCENARIOS } from '../src/sample-scenarios';
import {
  MIGRATIONS,
  SAVED_SCENARIOS_KEY,
  deleteSaved,
  loadSaved,
  saveScenario,
  type SavedScenario,
} from '../src/storage/saved-scenarios';

const fakeStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, val) => void m.set(k, String(val)),
  };
};

const scenario = (title: string): ScenarioInput => ({
  title,
  steps: [{ name: '議論', durationSec: 600, onTimeout: 'wait' }],
});

/**
 * @requirements #429 spec §5（端末への保存は版つき・移行する）
 */
describe('シナリオの端末への保存', () => {
  it('保存して読み直すと同じ', () => {
    const s = fakeStorage();
    const r = saveScenario(s, '朝会', scenario('朝会'), 1000);
    expect(r.ok).toBe(true);
    expect(loadSaved(s)).toEqual([{ name: '朝会', savedAt: 1000, scenario: scenario('朝会') }]);
    expect(JSON.parse(s.getItem(SAVED_SCENARIOS_KEY) ?? '').version).toBe(2);
  });

  it('版 1 の保存を読むと回数 1 のシナリオとして読める', () => {
    const s = fakeStorage();
    s.setItem(SAVED_SCENARIOS_KEY, JSON.stringify({ version: 1, items: [{ name: '旧', savedAt: 3, scenario: scenario('旧') }] }));
    const got = loadSaved(s);
    expect(got).toHaveLength(1);
    expect(got[0] && roundsOf(got[0].scenario)).toBe(1);
    expect(got[0]?.scenario).toEqual(scenario('旧'));
  });

  it('回数 6 を保存して読み直すと回数 6 が残り、版 2 で書かれる', () => {
    const s = fakeStorage();
    const six: ScenarioInput = { ...scenario('朝会'), rounds: 6 };
    expect(saveScenario(s, '朝会', six, 1).ok).toBe(true);
    expect(JSON.parse(s.getItem(SAVED_SCENARIOS_KEY) ?? '').version).toBe(2);
    const got = loadSaved(s);
    expect(got[0] && roundsOf(got[0].scenario)).toBe(6);
  });

  it('同じ名前は上書きし、別の名前は足す', () => {
    const s = fakeStorage();
    saveScenario(s, 'A', scenario('1'), 1);
    saveScenario(s, 'B', scenario('2'), 2);
    saveScenario(s, 'A', scenario('3'), 3);
    const got = loadSaved(s);
    expect(got.map((x) => x.name).sort()).toEqual(['A', 'B']);
    expect(got.find((x) => x.name === 'A')?.scenario.title).toBe('3');
  });

  it('削除できる。無い名前の削除は何も起こさず、戻り値は残りの一覧', () => {
    const s = fakeStorage();
    saveScenario(s, 'A', scenario('1'), 1);
    const none = deleteSaved(s, 'ない');
    expect(none.ok && none.items).toHaveLength(1);
    const gone = deleteSaved(s, 'A');
    expect(gone).toEqual({ ok: true, items: [] });
    expect(loadSaved(s)).toEqual([]);
  });

  it('名前は前後の空白を除いて比べる（A と "A " は同じ）', () => {
    const s = fakeStorage();
    saveScenario(s, 'A', scenario('1'), 1);
    saveScenario(s, 'A ', scenario('2'), 2);
    const got = loadSaved(s);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ name: 'A', scenario: { title: '2' } });
  });

  it('規則に合わない名前・シナリオは書かずに invalid を返す', () => {
    const s = fakeStorage();
    for (const bad of ['x'.repeat(61), 'a\nb', '   ', '']) {
      expect(saveScenario(s, bad, scenario('1'), 1)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(saveScenario(s, 'ok', { title: '', steps: [] }, 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(s.getItem(SAVED_SCENARIOS_KEY)).toBeNull();
    expect(saveScenario(s, 'x'.repeat(60), scenario('1'), 1).ok).toBe(true);
  });

  it('将来の版（version 3）の保存は、保存・削除を試みても手つかずで残る', () => {
    const s = fakeStorage();
    const future = JSON.stringify({ version: 3, items: [{ name: '未来', shape: 'new' }] });
    s.setItem(SAVED_SCENARIOS_KEY, future);
    expect(saveScenario(s, 'A', scenario('1'), 1)).toEqual({ ok: false, reason: 'unreadable' });
    expect(deleteSaved(s, 'A')).toEqual({ ok: false, reason: 'unreadable' });
    expect(s.getItem(SAVED_SCENARIOS_KEY)).toBe(future);
  });

  it('壊れた JSON・移行が投げる保存・getItem の一時失敗でも上書きしない', () => {
    const s = fakeStorage();
    s.setItem(SAVED_SCENARIOS_KEY, '{oops');
    expect(saveScenario(s, 'A', scenario('1'), 1)).toEqual({ ok: false, reason: 'unreadable' });
    expect(s.getItem(SAVED_SCENARIOS_KEY)).toBe('{oops');

    const old = JSON.stringify({ version: 0, items: [] });
    s.setItem(SAVED_SCENARIOS_KEY, old);
    const boom = {
      0: () => {
        throw new Error('x');
      },
    };
    expect(saveScenario(s, 'A', scenario('1'), 1, boom)).toEqual({ ok: false, reason: 'unreadable' });
    expect(s.getItem(SAVED_SCENARIOS_KEY)).toBe(old);

    const good = fakeStorage();
    saveScenario(good, 'A', scenario('1'), 1);
    const before = good.getItem(SAVED_SCENARIOS_KEY);
    const real = good.getItem.bind(good);
    good.getItem = () => {
      throw new Error('blocked');
    };
    expect(saveScenario(good, 'B', scenario('2'), 2)).toEqual({ ok: false, reason: 'unreadable' });
    expect(deleteSaved(good, 'A')).toEqual({ ok: false, reason: 'unreadable' });
    good.getItem = real;
    expect(good.getItem(SAVED_SCENARIOS_KEY)).toBe(before);
  });

  it('読めない項目は保存・削除のあとも生のまま残る（読み込みでは飛ばす）', () => {
    const s = fakeStorage();
    const odd = { name: '変', savedAt: 1, scenario: { title: 'x', steps: [], future: true } };
    s.setItem(SAVED_SCENARIOS_KEY, JSON.stringify({ version: 1, items: [odd] }));
    const r = saveScenario(s, 'A', scenario('1'), 2);
    expect(r.ok && r.items.map((x) => x.name)).toEqual(['A']);
    deleteSaved(s, 'A');
    expect(JSON.parse(s.getItem(SAVED_SCENARIOS_KEY) ?? '').items).toEqual([odd]);
    expect(loadSaved(s)).toEqual([]);
  });

  it('書き込みが失敗したら write-failed を返す（保存できたように見せない）', () => {
    const s = fakeStorage();
    s.setItem = () => {
      throw new Error('quota');
    };
    expect(saveScenario(s, 'A', scenario('1'), 1)).toEqual({ ok: false, reason: 'write-failed' });
  });

  it('何も無い・JSON が壊れている・形が違うときは空で、投げない', () => {
    const s = fakeStorage();
    expect(loadSaved(s)).toEqual([]);
    s.setItem(SAVED_SCENARIOS_KEY, '{oops');
    expect(loadSaved(s)).toEqual([]);
    s.setItem(SAVED_SCENARIOS_KEY, '[1,2]');
    expect(loadSaved(s)).toEqual([]);
    s.setItem(SAVED_SCENARIOS_KEY, JSON.stringify({ version: 99, items: [] }));
    expect(loadSaved(s)).toEqual([]);
  });

  it('壊れた項目だけ読み飛ばし、他は読める', () => {
    const s = fakeStorage();
    const good = { name: 'ok', savedAt: 5, scenario: scenario('ok') };
    s.setItem(
      SAVED_SCENARIOS_KEY,
      JSON.stringify({
        version: 1,
        items: [
          good,
          { name: 'bad', savedAt: 5, scenario: { title: 'x', steps: [] } },
          { name: '', savedAt: 5, scenario: scenario('x') },
          null,
        ],
      }),
    );
    expect(loadSaved(s)).toEqual([good]);
  });

  it('保存先が投げても読み込みは空を返す', () => {
    const s = fakeStorage();
    s.getItem = () => {
      throw new Error('blocked');
    };
    expect(loadSaved(s)).toEqual([]);
  });

  it('旧い版（version 0）は新しい形へ移って返る。消えない（m445）', () => {
    const s = fakeStorage();
    s.setItem(
      SAVED_SCENARIOS_KEY,
      JSON.stringify({
        version: 0,
        items: [
          {
            name: '旧',
            savedAt: 7,
            scenario: { title: '旧', steps: [{ name: 'a', durationMin: 5, onTimeout: 'wait' }] },
          },
        ],
      }),
    );
    const migrations: Record<number, (raw: unknown) => unknown> = {
      ...MIGRATIONS,
      0: (raw) => {
        const r = raw as { items: { name: string; savedAt: number; scenario: { title: string; steps: { name: string; durationMin: number; onTimeout: string }[] } }[] };
        return {
          version: 1,
          items: r.items.map((it) => ({
            ...it,
            scenario: {
              title: it.scenario.title,
              steps: it.scenario.steps.map((st) => ({ name: st.name, durationSec: st.durationMin * 60, onTimeout: st.onTimeout })),
            },
          })),
        };
      },
    };
    const got: SavedScenario[] = loadSaved(s, migrations);
    expect(got).toEqual([
      { name: '旧', savedAt: 7, scenario: { title: '旧', steps: [{ name: 'a', durationSec: 300, onTimeout: 'wait' }] } },
    ]);
  });

  it('移行の途中で投げても空を返す', () => {
    const s = fakeStorage();
    s.setItem(SAVED_SCENARIOS_KEY, JSON.stringify({ version: 0, items: [] }));
    expect(
      loadSaved(s, {
        0: () => {
          throw new Error('x');
        },
      }),
    ).toEqual([]);
  });
});

describe('同梱のサンプル', () => {
  it('KPT のふりかえりが検証を通り、合計が 3600 秒', () => {
    const kpt = SAMPLE_SCENARIOS.find((x) => x.label === 'KPT のふりかえり');
    expect(kpt).toBeDefined();
    expect(v.safeParse(ScenarioInputSchema, kpt?.scenario).success).toBe(true);
    expect(kpt?.scenario.steps.reduce((a, st) => a + st.durationSec, 0)).toBe(3600);
    expect(kpt?.scenario.steps.map((st) => st.name)).toEqual(['K を出す', 'P を出す', '投票', 'Try の議論', '予備']);
    expect(kpt?.scenario.steps.every((st) => st.onTimeout === 'wait')).toBe(true);
  });

  it('朝会と LT 会が KPT のあとに並び、回数つきで検証を通る', () => {
    expect(SAMPLE_SCENARIOS.map((x) => x.label)).toEqual(['KPT のふりかえり', '朝会', 'LT 会']);
    for (const x of SAMPLE_SCENARIOS) expect(v.safeParse(ScenarioInputSchema, x.scenario).success).toBe(true);
    expect(SAMPLE_SCENARIOS[1]?.scenario).toEqual({
      title: '朝会',
      steps: [{ name: '話す', durationSec: 120, onTimeout: 'advance' }],
      rounds: 6,
    });
    expect(SAMPLE_SCENARIOS[2]?.scenario).toEqual({
      title: 'LT 会',
      steps: [
        { name: '発表', durationSec: 300, onTimeout: 'advance' },
        { name: '入れ替え', durationSec: 60, onTimeout: 'advance' },
      ],
      rounds: 5,
    });
  });
});
