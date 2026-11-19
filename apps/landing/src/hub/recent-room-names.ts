/**
 * 前に作ったルーム名の規則（#633）。**React にも端末にも触らない**（`docs/guides/architecture.md` の
 * 「web の純粋判断」）。端末の読み書きは `recent-room-names-store.ts`、状態は `use-recent-room-names.ts`。
 *
 * ## なぜ覚えるのか
 *
 * ルームは揮発で、デプロイやアイドルで消える。同じ会（朝会・定例のモブ）のたびに
 * 作り直すので、ルーム名を毎回打ち直させない。**覚えるのは端末だけ**で、サーバーへは
 * 今までどおり作成のときに送るだけである（原則 III。端末の保存は分類の扱いの対象外。
 * `docs/adr/0011` の 2026-11-18 の追記）。
 *
 * ## 保存値を信じない
 *
 * 保管庫は誰でも書き換えられる（原則 IV・`docs/adr/0005`）。読んだ値は {@link parseRecentRoomNames} が
 * スキーマで形を検め、使えない名前（空・字面の無い・長すぎる・制御文字）は候補から外す。
 */
import * as v from 'valibot';
import { rendersAsNothing } from '@tasuki/room-core';

/** 覚える数。新しい順にこれだけ残し、越えたら古いものから落とす（#633 決めること 1）。 */
const MAX_RECENT_ROOM_NAMES = 5;

/**
 * 覚えるルーム名の長さの上限。**ルーム名そのものの上限ではない**（作成の欄も境界も長さを縛らない）。
 *
 * 保管庫に置かれた巨大な値を候補の札へそのまま描かないための歯止めである。サーバーが
 * ルームコードに使うのは名前の先頭 24 文字ほど（`apps/tasuki-sync/src/adapters/nanoid-code-gen.ts` の
 * `slugify`）なので、これより長い名前を覚えなくても困る場面は少ない。
 */
const MAX_REMEMBERED_ROOM_NAME = 100;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * 端末の保存の形。**配列**（新しい順）。要素は 1 つずつ検める（下の {@link parseRecentRoomNames}）ので、
 * ここで `v.string()` を課さない —— 課すと、文字列でない要素が 1 つ混ざっただけで配列ごと落ち、
 * 次の作成でまともな名前まで上書きで失われる（#633 のレビュー指摘 1）。
 */
const StoredRecentRoomNamesSchema = v.array(v.unknown());
const isString = (x: unknown): x is string => typeof x === 'string';

/** 覚えてよい形に整えた名前。覚えられないなら null。 */
function usableRoomName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_REMEMBERED_ROOM_NAME) return null;
  if (CONTROL_CHARS.test(trimmed)) return null;
  // 字面の無い名前（ZWJ だけ等）は、札が空に見えて何を選ぶのか分からない
  if (rendersAsNothing(trimmed)) return null;
  return trimmed;
}

/** 使える名前だけを、最初に出た順で 1 つずつ、上限までに整える。 */
function tidy(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const usable = usableRoomName(name);
    if (usable === null || out.includes(usable)) continue;
    out.push(usable);
    if (out.length === MAX_RECENT_ROOM_NAMES) break;
  }
  return out;
}

/**
 * 端末から読んだ値を候補にする。**形が違えば空**（作成を妨げない。EARS 6）。
 *
 * 配列としては読めても、使えない要素（文字列でない・空・字面の無い・長すぎる・制御文字）は 1 つずつ外す
 * （手で書き換えた 1 件のために残りを失わせない）。
 */
export function parseRecentRoomNames(raw: unknown): string[] {
  const parsed = v.safeParse(StoredRecentRoomNamesSchema, raw);
  if (!parsed.success) return [];
  return tidy(parsed.output.filter(isString));
}

/** 作ったルームの名前を先頭に足す。同じ名前は 1 つにまとめ、覚えられない名前なら候補を変えない。 */
export function rememberRoomName(names: readonly string[], name: string): string[] {
  const usable = usableRoomName(name);
  if (usable === null) return [...names];
  return tidy([usable, ...names]);
}

/** 候補から 1 つを外す。並びは保つ。 */
export function forgetRoomName(names: readonly string[], name: string): string[] {
  return names.filter((n) => n !== name);
}
