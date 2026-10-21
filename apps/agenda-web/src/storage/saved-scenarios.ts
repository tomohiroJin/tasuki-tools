/**
 * シナリオの端末への保存（#429 spec §5）。localStorage に版つきで持ち、読むときに最新の形へ移す。
 * 読み込みは決して投げない（壊れた JSON は空、合わない項目は読み飛ばす）。
 */
import { MAX_SCENARIO_TITLE, ScenarioInputSchema, hasControlChars, type ScenarioInput } from '@tasuki/agenda-core';
import * as v from 'valibot';

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

/**
 * 版 N → N+1 の移行。いまは空。回数（`rounds`）は省略できる項目なので、版は 1 のまま上げない
 * （上げると古いコードが保存の全体を読めなくなる）。形が変わったらここへ足す。
 */
export const MIGRATIONS: Migrations = {};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const validName = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_SCENARIO_TITLE && !hasControlChars(name);

const validScenario = (x: unknown): x is ScenarioInput =>
  v.safeParse(ScenarioInputSchema, x).success;

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

type ReadResult =
  | { readonly kind: 'ok'; readonly rawItems: readonly unknown[] }
  /** 読めない（壊れた JSON・移行できない版・移行が投げた・getItem が投げた）。上書きしてはいけない */
  | { readonly kind: 'unreadable' };

/** 保存の中身を最新の版の形で読む。項目の検証はしない（合わない項目も生のまま残すため） */
function readDocument(storage: Storage, migrations: Migrations): ReadResult {
  try {
    const text = storage.getItem(SAVED_SCENARIOS_KEY);
    if (text === null) return { kind: 'ok', rawItems: [] };
    const doc = migrateToCurrent(JSON.parse(text), migrations);
    if (!isRecord(doc) || !Array.isArray(doc.items)) return { kind: 'unreadable' };
    return { kind: 'ok', rawItems: doc.items as unknown[] };
  } catch {
    return { kind: 'unreadable' };
  }
}

const validItems = (rawItems: readonly unknown[]): SavedScenario[] =>
  rawItems.flatMap((it) => {
    const item = parseItem(it);
    return item === null ? [] : [item];
  });

export function loadSaved(storage: Storage, migrations: Migrations = MIGRATIONS): SavedScenario[] {
  const r = readDocument(storage, migrations);
  return r.kind === 'ok' ? validItems(r.rawItems) : [];
}

/**
 * 保存・削除の結果。失敗のときは保存の中身に触れていない（invalid / unreadable）か、書けなかった（write-failed）。
 * - invalid: 名前かシナリオが規則に合わない
 * - unreadable: 既存の保存を読めない。上書きすると消えるので書かない
 * - write-failed: 容量超過・保存禁止などで書けなかった
 */
export type SaveResult =
  | { readonly ok: true; readonly items: SavedScenario[] }
  | { readonly ok: false; readonly reason: 'invalid' | 'unreadable' | 'write-failed' };

function writeBack(storage: Storage, kept: readonly unknown[]): boolean {
  try {
    storage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify({ version: CURRENT_VERSION, items: kept }));
    return true;
  } catch {
    return false;
  }
}

/** 同じ名前の（検証を通る）項目を除く。合わない項目は生のまま残す */
const withoutName = (rawItems: readonly unknown[], name: string): unknown[] =>
  rawItems.filter((it) => parseItem(it)?.name !== name);

/** 同じ名前は上書きする。名前は前後の空白を除いて比べて持つ。 */
export function saveScenario(
  storage: Storage,
  name: string,
  scenario: ScenarioInput,
  now: number = Date.now(),
  migrations: Migrations = MIGRATIONS,
): SaveResult {
  const trimmed = name.trim();
  if (!validName(trimmed) || !validScenario(scenario)) return { ok: false, reason: 'invalid' };
  const r = readDocument(storage, migrations);
  if (r.kind === 'unreadable') return { ok: false, reason: 'unreadable' };
  const kept = [...withoutName(r.rawItems, trimmed), { name: trimmed, savedAt: now, scenario }];
  if (!writeBack(storage, kept)) return { ok: false, reason: 'write-failed' };
  return { ok: true, items: validItems(kept) };
}

export function deleteSaved(storage: Storage, name: string, migrations: Migrations = MIGRATIONS): SaveResult {
  const r = readDocument(storage, migrations);
  if (r.kind === 'unreadable') return { ok: false, reason: 'unreadable' };
  const kept = withoutName(r.rawItems, name.trim());
  if (kept.length !== r.rawItems.length && !writeBack(storage, kept)) return { ok: false, reason: 'write-failed' };
  return { ok: true, items: validItems(kept) };
}
