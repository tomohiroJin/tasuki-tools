/**
 * 基準側の要約の期待値（`e2e/parity/expected.ts`・#321 最終レビュー B-I4）の自己テスト。
 *
 * 比較は差しか見ないので、両側で同じように空になると緑になる。期待値との突き合わせが「違えば必ず赤」であることを固定する。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_EXPECTATION_FILE, checkExpectation, diffExpectation, expectedKeyProblems, writeExpectedFromOut } from '../parity/expected';

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
  const put = (name: string, body: unknown): void => {
    mkdirSync(path.join(dir, 'out', name), { recursive: true });
    writeFileSync(path.join(dir, 'out', name, BASE_EXPECTATION_FILE), JSON.stringify(body));
  };
  it('Given 状態ごとの要約と --repeat-each の置き場 / When 束ねる / Then -r<n> を読まずに状態ごとに書く', () => {
    put('a', { n: 1 });
    put('b-touch', { n: 2 });
    put('a-r1', { n: 9 });
    mkdirSync(path.join(dir, 'out', 'removal'));
    const file = path.join(dir, 'expected', 'base-summary.json');
    expect(writeExpectedFromOut(path.join(dir, 'out'), file)).toBe(2);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: { n: 1 }, 'b-touch': { n: 2 } });
  });
  it('Given 要約が 1 つも無い / When 束ねる / Then 止まる', () => {
    mkdirSync(path.join(dir, 'out'));
    expect(() => writeExpectedFromOut(path.join(dir, 'out'), path.join(dir, 'x.json'))).toThrow();
  });
});
