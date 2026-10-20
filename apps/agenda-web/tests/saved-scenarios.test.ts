/**
 * シナリオの端末への保存（#429 spec §5・§7.6）。
 */
import { ScenarioInputSchema, type ScenarioInput } from '@tasuki/agenda-core';
import { describe, expect, it } from 'vitest';
import { SAMPLE_SCENARIOS } from '../src/sample-scenarios';
import {
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
    saveScenario(s, '朝会', scenario('朝会'), 1000);
    expect(loadSaved(s)).toEqual([{ name: '朝会', savedAt: 1000, scenario: scenario('朝会') }]);
    expect(JSON.parse(s.getItem(SAVED_SCENARIOS_KEY) ?? '').version).toBe(1);
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

  it('削除できる。無い名前の削除は何も起こさない', () => {
    const s = fakeStorage();
    saveScenario(s, 'A', scenario('1'), 1);
    deleteSaved(s, 'ない');
    expect(loadSaved(s)).toHaveLength(1);
    deleteSaved(s, 'A');
    expect(loadSaved(s)).toEqual([]);
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
    expect((ScenarioInputSchema['~standard'].validate(kpt?.scenario) as { issues?: unknown }).issues).toBeUndefined();
    expect(kpt?.scenario.steps.reduce((a, st) => a + st.durationSec, 0)).toBe(3600);
    expect(kpt?.scenario.steps.map((st) => st.name)).toEqual(['K を出す', 'P を出す', '投票', 'Try の議論', '予備']);
    expect(kpt?.scenario.steps.every((st) => st.onTimeout === 'wait')).toBe(true);
  });
});
