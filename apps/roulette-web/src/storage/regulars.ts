/**
 * いつものメンツの端末への保存（#458 設計 §5）。localStorage に版つきで持ち、読むときに最新の形へ移す。
 * 読み込みは決して投げない（壊れた JSON は空、合わない項目は読み飛ばす）。
 * 読めない保存は上書きしない。合わない項目は消さずに生のまま書き戻す。
 */
import { MAX_DISPLAY_NAME, conflictsWithExisting, normalizeDisplayName, rendersAsNothing } from '@tasuki/room-core';
import { MAX_GUESTS } from '@tasuki/roulette-core';

export const REGULARS_KEY = 'tasuki.roulette.regulars';
export const CURRENT_VERSION = 1;
/** 保存できる組の数。直すのは数えない */
export const MAX_GROUPS = 10;

export interface RegularGroup {
  readonly id: string;
  readonly name: string;
  /** 最後に使った（入れた・保存した）時刻。並びにだけ使う */
  readonly usedAt: number;
  readonly members: readonly string[];
}

/**
 * 結果。失敗のときは保存の中身に触れていない（invalid / unreadable / full / name-taken）か、書けなかった（write-failed）。
 * - invalid: 組名か名前の列が規則に合わない
 * - unreadable: 既存の保存を読めない。上書きすると消えるので書かない
 * - write-failed: 容量超過・保存禁止などで書けなかった
 * - full: 組が MAX_GROUPS に達している
 * - name-taken: 同じ組名の別の組がある
 */
export type GroupsResult =
  | { readonly ok: true; readonly items: RegularGroup[] }
  | { readonly ok: false; readonly reason: 'invalid' | 'unreadable' | 'write-failed' | 'full' | 'name-taken' };

/** 版 N の生の中身を版 N+1 へ移す。キーは移す元の版。 */
export type Migrations = Record<number, (raw: unknown) => unknown>;

/** 版 N → N+1 の移行。いまは空。形が変わったらここへ足す。 */
export const MIGRATIONS: Migrations = {};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** 組名として使える名前か（空・長すぎ・制御文字なし）。画面が保存の前に同じ規則で見る */
export const isValidGroupName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.trim().length > 0 &&
  name.length <= MAX_DISPLAY_NAME &&
  !CONTROL_CHARS.test(name) &&
  !rendersAsNothing(name);

/**
 * 読み込みで通す名前。保存の関数は正規化してから書くので、正規化済みでない名前は手で書き換えた保存。
 * 参加の重複判定・サーバーの上限（正規化してから比べる）とずれるので、合わない項目として扱う。
 */
const validMember = (m: unknown): m is string => {
  if (typeof m !== 'string' || m.length === 0) return false;
  const n = normalizeDisplayName(m);
  return n === m && n.length > 0 && n.length <= MAX_DISPLAY_NAME && !rendersAsNothing(n);
};

/** 最新の版の項目として合うものだけを返す。巨大な配列は名前の規約を当てる前に落とす */
function parseItem(raw: unknown): RegularGroup | null {
  if (!isRecord(raw)) return null;
  const { id, name, usedAt, members } = raw;
  if (typeof id !== 'string' || id === '') return null;
  if (!isValidGroupName(name)) return null;
  if (typeof usedAt !== 'number' || !Number.isFinite(usedAt)) return null;
  if (!Array.isArray(members) || members.length < 1 || members.length > MAX_GUESTS) return null;
  if (!members.every(validMember)) return null;
  return { id, name, usedAt, members: members as string[] };
}

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
  /** 読めない（壊れた JSON・移行できない版・getItem が投げた）。上書きしてはいけない */
  | { readonly kind: 'unreadable' };

function readDocument(storage: Storage, migrations: Migrations): ReadResult {
  try {
    const text = storage.getItem(REGULARS_KEY);
    if (text === null) return { kind: 'ok', rawItems: [] };
    const doc = migrateToCurrent(JSON.parse(text), migrations);
    if (!isRecord(doc) || !Array.isArray(doc.items)) return { kind: 'unreadable' };
    return { kind: 'ok', rawItems: doc.items as unknown[] };
  } catch {
    return { kind: 'unreadable' };
  }
}

/** 合う項目だけを usedAt の新しい順に（同じなら元の並び） */
const validItems = (rawItems: readonly unknown[]): RegularGroup[] =>
  rawItems
    .flatMap((it) => {
      const item = parseItem(it);
      return item === null ? [] : [item];
    })
    .sort((a, b) => b.usedAt - a.usedAt);

/** `window.localStorage` の取得そのものが投げる環境（保存禁止）では null */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadGroups(storage: Storage | null, migrations: Migrations = MIGRATIONS): RegularGroup[] {
  if (storage === null) return [];
  const r = readDocument(storage, migrations);
  return r.kind === 'ok' ? validItems(r.rawItems) : [];
}

function writeBack(storage: Storage, kept: readonly unknown[]): boolean {
  try {
    storage.setItem(REGULARS_KEY, JSON.stringify({ version: CURRENT_VERSION, items: kept }));
    return true;
  } catch {
    return false;
  }
}

/** 同じ名前か（参加の重複判定と同じ `conflictsWithExisting`: 大小・前後の空白を無視）。画面の比べ方もこれに揃える */
export const sameMemberName = (a: string, b: string): boolean => conflictsWithExisting([{ participantId: a, displayName: a }], b);

/** 名前の列にする。`normalizeDisplayName` を当て、空・見えない名前を捨て、同じ名前は先に出た方を残す */
function foldMembers(candidates: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    const n = normalizeDisplayName(c);
    if (n === '' || n.length > MAX_DISPLAY_NAME || rendersAsNothing(n)) continue;
    if (out.some((d) => sameMemberName(d, n))) continue;
    out.push(n);
  }
  return out;
}

/** 複数行欄の文字列を名前の列にする（改行は CRLF も） */
export function parseMemberLines(text: string): string[] {
  return foldMembers(text.split(/\r?\n/));
}

const idOf = (raw: unknown): string | null => (isRecord(raw) && typeof raw.id === 'string' ? raw.id : null);

/** 書き換えの共通の流れ。読めなければ書かず、書けなければ write-failed */
function mutate(
  storage: Storage | null,
  migrations: Migrations,
  change: (rawItems: readonly unknown[]) => { kept: readonly unknown[] } | { reason: 'invalid' | 'full' | 'name-taken' } | null,
): GroupsResult {
  if (storage === null) return { ok: false, reason: 'write-failed' };
  const r = readDocument(storage, migrations);
  if (r.kind === 'unreadable') return { ok: false, reason: 'unreadable' };
  const c = change(r.rawItems);
  if (c === null) return { ok: true, items: validItems(r.rawItems) };
  if ('reason' in c) return { ok: false, reason: c.reason };
  if (!writeBack(storage, c.kept)) return { ok: false, reason: 'write-failed' };
  return { ok: true, items: validItems(c.kept) };
}

/**
 * 組の ID の既定。`crypto.randomUUID` は安全でない文脈（http の LAN など）で未定義なので、
 * 無ければ時刻と乱数から作る（保存の関数は投げない）。
 */
export function defaultNewId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `id` が無ければ作り、あれば直す。直すときも usedAt は now になる */
export function saveGroup(
  storage: Storage | null,
  input: { id?: string; name: string; members: readonly string[] },
  now: number = Date.now(),
  newId: () => string = defaultNewId,
  migrations: Migrations = MIGRATIONS,
): GroupsResult {
  const name = input.name.trim();
  const members = foldMembers(input.members);
  if (!isValidGroupName(name) || members.length < 1 || members.length > MAX_GUESTS) return { ok: false, reason: 'invalid' };
  return mutate(storage, migrations, (rawItems) => {
    const groups = rawItems.flatMap((it) => {
      const p = parseItem(it);
      return p === null ? [] : [p];
    });
    const selfIndex = input.id === undefined ? -1 : rawItems.findIndex((it) => idOf(it) === input.id && parseItem(it) !== null);
    const selfId = selfIndex >= 0 ? input.id : undefined;
    if (groups.some((x) => x.id !== selfId && x.name === name)) return { reason: 'name-taken' };
    if (selfIndex < 0 && groups.length >= MAX_GROUPS) return { reason: 'full' };
    const item: RegularGroup = { id: selfId ?? input.id ?? newId(), name, usedAt: now, members };
    const kept = [...rawItems];
    if (selfIndex >= 0) kept[selfIndex] = item;
    else kept.push(item);
    return { kept };
  });
}

export function deleteGroup(storage: Storage | null, id: string, migrations: Migrations = MIGRATIONS): GroupsResult {
  return mutate(storage, migrations, (rawItems) => {
    const kept = rawItems.filter((it) => !(idOf(it) === id && parseItem(it) !== null));
    return kept.length === rawItems.length ? null : { kept };
  });
}

/** 「入れた」ときに usedAt だけを now にする */
export function touchGroup(
  storage: Storage | null,
  id: string,
  now: number = Date.now(),
  migrations: Migrations = MIGRATIONS,
): GroupsResult {
  return mutate(storage, migrations, (rawItems) => {
    const index = rawItems.findIndex((it) => idOf(it) === id && parseItem(it) !== null);
    const found = index >= 0 ? parseItem(rawItems[index]) : null;
    if (found === null) return null;
    const kept = [...rawItems];
    kept[index] = { ...found, usedAt: now };
    return { kept };
  });
}
