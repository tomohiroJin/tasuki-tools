/**
 * シナリオの端末への保存（#429 spec §5）。localStorage に版つきで持ち、読むときに最新の形へ移す。
 * 読み込みは決して投げない（壊れた JSON は空、合わない項目は読み飛ばす）。
 */
import { MAX_SCENARIO_TITLE, ScenarioInputSchema, type ScenarioInput } from '@tasuki/agenda-core';

export const SAVED_SCENARIOS_KEY = 'tasuki.agenda.scenarios';
export const CURRENT_VERSION = 1;

export interface SavedScenario {
  readonly name: string;
  /** 表示の並びにだけ使う */
  readonly savedAt: number;
  readonly scenario: ScenarioInput;
}

/** 版 N の生の中身を版 N+1 へ移す。キーは移す元の版。 */
export type Migrations = Record<number, (raw: unknown) => unknown>;

/** 現在は移行する旧版が無い。形が変わったらここへ足す。 */
export const MIGRATIONS: Migrations = {};

// eslint-disable-next-line no-control-regex -- 制御文字を拒むのが目的
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const validName = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_SCENARIO_TITLE && !CONTROL_CHARS.test(name);

const validScenario = (x: unknown): x is ScenarioInput =>
  (ScenarioInputSchema['~standard'].validate(x) as { issues?: unknown }).issues === undefined;

/** 最新の版の項目として合うものだけを返す */
function parseItem(raw: unknown): SavedScenario | null {
  if (!isRecord(raw)) return null;
  const { name, savedAt, scenario } = raw;
  if (!validName(name) || typeof savedAt !== 'number' || !Number.isFinite(savedAt) || !validScenario(scenario)) return null;
  return { name, savedAt, scenario };
}

/** 版が現在に届くまで migrations を順に当てる。届かない・途中で欠けたら null */
function migrateToCurrent(raw: unknown, migrations: Migrations): unknown {
  let cur: unknown = raw;
  for (let guard = 0; guard < 100; guard++) {
    if (!isRecord(cur) || typeof cur.version !== 'number') return null;
    if (cur.version === CURRENT_VERSION) return cur;
    const step = migrations[cur.version];
    if (step === undefined) return null;
    cur = step(cur);
  }
  return null;
}

export function loadSaved(storage: Storage, migrations: Migrations = MIGRATIONS): SavedScenario[] {
  try {
    const text = storage.getItem(SAVED_SCENARIOS_KEY);
    if (text === null) return [];
    const doc = migrateToCurrent(JSON.parse(text), migrations);
    if (!isRecord(doc) || !Array.isArray(doc.items)) return [];
    return doc.items.flatMap((it: unknown) => {
      const item = parseItem(it);
      return item === null ? [] : [item];
    });
  } catch {
    return [];
  }
}

function write(storage: Storage, items: readonly SavedScenario[]): void {
  try {
    storage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify({ version: CURRENT_VERSION, items }));
  } catch {
    // 容量超過・保存禁止でも画面を落とさない
  }
}

/** 同じ名前は上書きする。書いたあとの一覧を返す。 */
export function saveScenario(storage: Storage, name: string, scenario: ScenarioInput, now: number = Date.now()): SavedScenario[] {
  const rest = loadSaved(storage).filter((x) => x.name !== name);
  const items = [...rest, { name, savedAt: now, scenario }];
  write(storage, items);
  return items;
}

export function deleteSaved(storage: Storage, name: string): SavedScenario[] {
  const items = loadSaved(storage).filter((x) => x.name !== name);
  write(storage, items);
  return items;
}
