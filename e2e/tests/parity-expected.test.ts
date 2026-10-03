/**
 * 基準側の要約の期待値（`e2e/parity/expected.ts`・#321 最終レビュー B-I4）の自己テスト。
 *
 * 比較は差しか見ないので、両側で同じように空になると緑になる。期待値との突き合わせが「違えば必ず赤」であることを固定する。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BASE_EXPECTATION_FILE,
  BASE_EXPECTATION_META_FILE,
  checkExpectation,
  diffExpectation,
  expectationFloorProblems,
  expectedKeyProblems,
  loadExpected,
  writeExpectedFromOut,
} from '../parity/expected';

const SAMPLE = {
  elements: { 360: 227, 1280: 227 },
  motionEntries: 221,
  keyframes: ['fade-up'],
  interactions: { counts: { hover: 29, active: 26 }, entries: 265, notEntered: [], skipped: ['active: 音量'] },
};

describe('diffExpectation: 期待値との食い違い', () => {
  it('対照: 同じなら空', () => {
    expect(diffExpectation(SAMPLE, structuredClone(SAMPLE))).toEqual([]);
  });
  it('Given 幅ごとの要素数が 1 つ違う / When 突き合わせる / Then 場所つきで出る', () => {
    const actual = { ...SAMPLE, elements: { 360: 226, 1280: 227 } };
    expect(diffExpectation(SAMPLE, actual)).toEqual(['$.elements.360: 期待 227・実際 226']);
  });
  it('Given 操作の書き出しが両側とも 0 件（差では見えない） / When 突き合わせる / Then 出る', () => {
    const actual = { ...SAMPLE, interactions: { ...SAMPLE.interactions, counts: {}, entries: 0 } };
    expect(diffExpectation(SAMPLE, actual).length).toBeGreaterThan(0);
  });
  it('Given skipped が 1 つ増えた / When 突き合わせる / Then 件数と中身が出る', () => {
    const actual = { ...SAMPLE, interactions: { ...SAMPLE.interactions, skipped: ['active: 音量', 'hover: 交代間隔'] } };
    expect(diffExpectation(SAMPLE, actual)).toContain('$.interactions.skipped: 件数 期待 1・実際 2');
  });
  it('Given キーフレームを 1 つも拾えない / When 突き合わせる / Then 出る', () => {
    expect(diffExpectation(SAMPLE, { ...SAMPLE, keyframes: [] }).length).toBeGreaterThan(0);
  });
});

describe('checkExpectation / expectedKeyProblems: 期待値の欠け', () => {
  it('Given 期待値の JSON が無い / When 突き合わせる / Then 1 件の食い違いにする（無ければ緑、にしない）', () => {
    expect(checkExpectation(null, 'lobby-two', SAMPLE)).toHaveLength(1);
  });
  it('Given そのキーが無い / When 突き合わせる / Then 1 件の食い違い', () => {
    expect(checkExpectation({}, 'lobby-two', SAMPLE)).toEqual(['期待値に lobby-two が無い']);
  });
  it('Given 目録とキーが食い違う / When 比べる / Then 両方向の食い違いを出す', () => {
    expect(expectedKeyProblems({ a: 1, old: 1 }, ['a', 'b'])).toEqual(['期待値に b が無い', '期待値に目録に無い old がある']);
  });
});

describe('writeExpectedFromOut: out/ の基準側の要約を束ねる', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'parity-expected-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  // 下限を満たす要約と、同じ世代の控え（下限と世代の断定は次の describe が見る）
  const put = (name: string, body: unknown): void => {
    mkdirSync(path.join(dir, 'out', name), { recursive: true });
    writeFileSync(path.join(dir, 'out', name, BASE_EXPECTATION_FILE), JSON.stringify(body));
    writeFileSync(path.join(dir, 'out', name, BASE_EXPECTATION_META_FILE), JSON.stringify({ generation: 'g1', minElements: 10 }));
  };
  it('Given 状態ごとの要約と --repeat-each の置き場 / When 束ねる / Then -r<n> を読まずに状態ごとに書く', () => {
    put('a', SAMPLE);
    put('b-touch', { ...SAMPLE, elements: 30 });
    put('a-r1', { ...SAMPLE, motionEntries: 9 });
    mkdirSync(path.join(dir, 'out', 'removal'));
    const file = path.join(dir, 'expected', 'base-summary.json');
    expect(writeExpectedFromOut(path.join(dir, 'out'), file, 'g1')).toBe(2);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: SAMPLE, 'b-touch': { ...SAMPLE, elements: 30 } });
  });
  it('Given 要約が 1 つも無い / When 束ねる / Then 止まる', () => {
    mkdirSync(path.join(dir, 'out'));
    expect(() => writeExpectedFromOut(path.join(dir, 'out'), path.join(dir, 'x.json'), 'g1')).toThrow(/1 つも無い/);
  });
});

describe('writeExpectedFromOut の下限と世代', () => {
  const good = {
    elements: { 360: 80, 640: 80, 768: 80, 1024: 80, 1280: 80 },
    motionEntries: 12,
    keyframes: ['fade-up'],
    interactions: { counts: {}, entries: 3, notEntered: [], skipped: [] },
  };
  const meta = (generation: string, minElements = 60) => ({ generation, minElements });

  let root = '';
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'parity-out-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function outWith(entries: Record<string, { exp: unknown; meta: unknown }>): string {
    for (const [key, { exp, meta: m }] of Object.entries(entries)) {
      mkdirSync(path.join(root, key), { recursive: true });
      writeFileSync(path.join(root, key, BASE_EXPECTATION_FILE), JSON.stringify(exp));
      writeFileSync(path.join(root, key, BASE_EXPECTATION_META_FILE), JSON.stringify(m));
    }
    return root;
  }

  it('Given 全件が下限を満たし同じ世代 / Then 書ける', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc') }, b: { exp: good, meta: meta('abc') } });
    expect(writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toBe(2);
  });

  it('Given ある幅の要素数が minElements 未満 / Then 書かずに止める', () => {
    const thin = { ...good, elements: { ...good.elements, 768: 0 } };
    const dir = outWith({ a: { exp: thin, meta: meta('abc') } });
    const file = path.join(dir, 'expected.json');
    expect(() => writeExpectedFromOut(dir, file, 'abc')).toThrow(/a.*768/);
    expect(existsSync(file)).toBe(false);
  });

  it('Given タッチの要約（elements が数）が minElements 未満 / Then 止める', () => {
    const dir = outWith({ 'a-touch': { exp: { ...good, elements: 3 }, meta: meta('abc') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/a-touch/);
  });

  it('Given 動きの件数が 0 / Then 止める', () => {
    const dir = outWith({ a: { exp: { ...good, motionEntries: 0 }, meta: meta('abc') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/動き/);
  });

  it('Given 前の世代の要約が混ざっている / Then 止める（out/ を消さずに流した）', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc') }, b: { exp: good, meta: meta('old') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/世代/);
  });

  it('Given 世代の控えが無い要約 / Then 止める', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc') } });
    rmSync(path.join(dir, 'a', BASE_EXPECTATION_META_FILE));
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc')).toThrow(/世代/);
  });

  it('Given 作業ツリーが汚れている世代 / Then 止める（コミットしていない変更で期待値を作らない）', () => {
    const dir = outWith({ a: { exp: good, meta: meta('abc-dirty') } });
    expect(() => writeExpectedFromOut(dir, path.join(dir, 'expected.json'), 'abc-dirty')).toThrow(/dirty/);
  });

  it('現行の期待値の JSON は下限を満たす（下限が厳しすぎて作り直せない、を防ぐ）', () => {
    const table = loadExpected();
    expect(table).not.toBeNull();
    for (const [key, exp] of Object.entries(table ?? {})) expect(expectationFloorProblems(key, exp, 10), key).toEqual([]);
  });
});
