/**
 * 除去検査の結果を束ねる `loadRemovalProbe` と、既知の答えの照合 `checkKnownAnswers` の自己テスト（#321・設計正本 D2）。
 *
 * PR 2・3 は `loadRemovalProbe` の `dead` だけを見て「写さないクラス」を決める。束ね方が緩むと、生きているクラスを
 * 写さずに消してしまう（見た目が変わる）。止まるべき所で止まり、dead にしてはいけないものを dead にしないことを固定する。
 *
 * 末尾の 1 件は、実際の除去検査の出力（`e2e/parity/out/removal/`）に既知の答えを当てる照合。
 * `TASUKI_PARITY_REMOVAL_CHECK=1` のときだけ走る（出力は無視していて CI には無い・README の「除去検査」）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkKnownAnswers,
  KNOWN_ANSWERS,
  loadRemovalProbe,
  type ProbeHit,
  type StateRemoval,
} from '../parity/removal-summary';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'removal-summary-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function hit(state: string, className: string, token: string, p = 'html>body>p:nth-of-type(1)'): ProbeHit {
  return { state, path: p, className, token };
}

function write(state: string, parts: Partial<Omit<StateRemoval, 'state'>> & { state?: string } = {}): void {
  const body: StateRemoval = { state: parts.state ?? state, dead: parts.dead ?? [], alive: parts.alive ?? [], undecided: parts.undecided ?? [] };
  writeFileSync(path.join(dir, `${state}.json`), JSON.stringify(body));
}

describe('loadRemovalProbe: 止まるべき所で止まる', () => {
  it('Given 期待する状態の結果が 1 つ欠けている / When 束ねる / Then 欠けた状態の名前つきで止まる', () => {
    write('a');
    expect(() => loadRemovalProbe(dir, ['a', 'b'])).toThrow(/欠けている状態: b/);
  });
  it('Given 期待する状態に無い結果のファイルがある / When 束ねる / Then 止まる（古い残り）', () => {
    write('a');
    write('old');
    expect(() => loadRemovalProbe(dir, ['a'])).toThrow(/目録に無い状態の結果がある: old\.json/);
  });
  it('Given ファイル名と中身の state が食い違う / When 束ねる / Then 止まる', () => {
    write('a', { state: 'b' });
    expect(() => loadRemovalProbe(dir, ['a'])).toThrow(/state が b/);
  });
  it('対照: 期待する状態がすべて揃っていれば止まらない', () => {
    write('a');
    write('b');
    expect(loadRemovalProbe(dir, ['a', 'b']).states.map((s) => s.state)).toEqual(['a', 'b']);
  });
});

describe('loadRemovalProbe: dead にしてよいのは、どの状態でも alive にも undecided にも出ない組だけ', () => {
  it('Given ある状態で dead・別の状態で alive / When 束ねる / Then dead にしない', () => {
    write('a', { dead: [hit('a', 'p-6 text-sm', 'text-sm')] });
    write('b', { alive: [hit('b', 'p-6 text-sm', 'text-sm')] });
    expect(loadRemovalProbe(dir, ['a', 'b']).dead).toEqual([]);
  });
  it('Given ある状態で dead・別の状態で undecided / When 束ねる / Then dead にしない', () => {
    write('a', { dead: [hit('a', 'h-52 w-52', 'h-52')] });
    write('b', { undecided: [{ ...hit('b', 'h-52 w-52', 'h-52'), reason: '組で外すと変わる' }] });
    expect(loadRemovalProbe(dir, ['a', 'b']).dead).toEqual([]);
  });
  it('Given 同じ状態の別の要素で alive / When 束ねる / Then dead にしない（要素をまたいでも className と組で見る）', () => {
    write('a', {
      dead: [hit('a', 'px-6 px-3', 'px-3', 'html>body>button:nth-of-type(1)')],
      alive: [hit('a', 'px-6 px-3', 'px-3', 'html>body>button:nth-of-type(2)')],
    });
    expect(loadRemovalProbe(dir, ['a']).dead).toEqual([]);
  });
  it('対照: className が違えば同じクラスでも別の組（片方の alive は他方を写す側へ倒さない）', () => {
    write('a', { dead: [hit('a', 'px-6 px-3', 'px-3')], alive: [hit('a', 'px-4 px-3', 'px-3')] });
    expect(loadRemovalProbe(dir, ['a']).dead).toEqual([{ className: 'px-6 px-3', token: 'px-3', states: ['a'] }]);
  });
  it('Given 同じ組が複数の状態で dead / When 束ねる / Then 1 件に束ね、状態を並べる', () => {
    write('a', { dead: [hit('a', 'px-6 px-3', 'px-3', 'x'), hit('a', 'px-6 px-3', 'px-3', 'y')] });
    write('b', { dead: [hit('b', 'px-6 px-3', 'px-3')] });
    expect(loadRemovalProbe(dir, ['a', 'b']).dead).toEqual([{ className: 'px-6 px-3', token: 'px-3', states: ['a', 'b'] }]);
  });
});

/** 既知の答え 5 件がすべて満たされる束ね前の結果（1 状態）。 */
function knownGood(): void {
  write('a', {
    dead: [
      hit('a', 'instrument-label text-[var(--signal)]', 'text-[var(--signal)]'),
      hit('a', 'px-6 py-3 px-3 py-1.5', 'px-3'),
      hit('a', 'px-6 py-3 px-3 py-1.5', 'py-1.5'),
    ],
    alive: [hit('a', 'p-6 sm:p-4', 'sm:p-4'), hit('a', 'instrument-label text-[var(--signal)]', 'instrument-label')],
  });
}

describe('checkKnownAnswers: 既知の答え 5 件（設計正本 §2 の 4・5）', () => {
  it('対照: 5 件とも満たす結果なら 5 件とも ok', () => {
    knownGood();
    const results = checkKnownAnswers(loadRemovalProbe(dir, ['a']));
    expect(results).toHaveLength(KNOWN_ANSWERS.length);
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
  it('Given dead のはずの組が別の状態で alive / When 照合する / Then その 1 件だけ ng', () => {
    knownGood();
    write('b', { alive: [hit('b', 'px-6 py-3 px-3 py-1.5', 'px-3')] });
    const ng = checkKnownAnswers(loadRemovalProbe(dir, ['a', 'b'])).filter((r) => !r.ok);
    expect(ng.map((r) => r.answer.token)).toEqual(['px-3']);
  });
  it('Given alive のはずの組が dead にしか出ない / When 照合する / Then ng', () => {
    write('a', {
      dead: [
        hit('a', 'instrument-label text-[var(--signal)]', 'text-[var(--signal)]'),
        hit('a', 'px-6 px-3 py-1.5', 'px-3'),
        hit('a', 'px-6 px-3 py-1.5', 'py-1.5'),
        hit('a', 'p-6 sm:p-4', 'sm:p-4'),
      ],
      alive: [hit('a', 'instrument-label', 'instrument-label')],
    });
    const ng = checkKnownAnswers(loadRemovalProbe(dir, ['a'])).filter((r) => !r.ok);
    expect(ng.map((r) => r.answer.token)).toEqual(['sm:p-4']);
  });
  it('Given 該当する要素が 1 つも無い / When 照合する / Then 5 件とも ng（空振りを ok にしない）', () => {
    write('a');
    expect(checkKnownAnswers(loadRemovalProbe(dir, ['a'])).filter((r) => r.ok)).toEqual([]);
  });
  it('Given className の語の一部だけが一致する（md:p-6 は p-6 ではない） / When 照合する / Then 該当にしない', () => {
    write('a', { alive: [hit('a', 'md:p-6 sm:p-4', 'sm:p-4')] });
    const r = checkKnownAnswers(loadRemovalProbe(dir, ['a'])).find((x) => x.answer.token === 'sm:p-4');
    expect(r?.ok).toBe(false);
  });
});

describe.runIf(process.env['TASUKI_PARITY_REMOVAL_CHECK'] === '1')('実際の除去検査の出力（out/removal/）', () => {
  it('既知の答え 5 件をすべて満たす', () => {
    const results = checkKnownAnswers(loadRemovalProbe());
    for (const r of results) console.log(`${r.ok ? 'OK' : 'NG'} ${r.answer.expect} ${r.answer.token}（${r.answer.why}）: ${r.detail}`);
    expect(results.filter((r) => !r.ok).map((r) => r.answer.token)).toEqual([]);
  });
});
