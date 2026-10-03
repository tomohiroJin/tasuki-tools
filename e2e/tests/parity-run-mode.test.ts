/**
 * 比較の実行の種類（対照実行・囲いを外した一時ビルド・規則の使用状況）の読み取りの自己テスト（#321）。
 *
 * 種類は設定ファイルの `metadata` と project の名前の両方に現れる。片方だけ書き換えた設定で明記と中身がずれると、
 * 一時ビルドの出力を通常の比較と取り違える。食い違いで止まり、`summary.json` に書く種類が正しいことを固定する。
 */
import { describe, expect, it } from 'vitest';
import { runModeOf } from '../parity/run-mode';

describe('runModeOf', () => {
  it('Given 通常の比較（metadata なし・project 名なし） / Then どれも偽', () => {
    expect(runModeOf({}, '')).toEqual({ control: false, unlayered: false, usage: false });
  });
  it.each([
    ['parityControl', '対照実行', 'control'],
    ['parityUnlayered', '囲いを外した一時ビルド', 'unlayered'],
    ['parityUsage', '規則の使用状況', 'usage'],
  ] as const)('Given metadata.%s と project 名「%s」 / Then %s だけが真', (metadata, project, kind) => {
    expect(runModeOf({ [metadata]: true }, project)).toEqual({ control: false, unlayered: false, usage: false, [kind]: true });
  });
  it('Given metadata.parityUnlayered だけ立ち project 名が違う / Then 止める', () => {
    expect(() => runModeOf({ parityUnlayered: true }, '')).toThrow(/parityUnlayered.*食い違う/);
  });
  it('Given project 名が「囲いを外した一時ビルド」で metadata が無い / Then 止める', () => {
    expect(() => runModeOf({}, '囲いを外した一時ビルド')).toThrow(/parityUnlayered.*食い違う/);
  });
  it('Given project 名が「規則の使用状況」で metadata が無い / Then 止める', () => {
    expect(() => runModeOf({}, '規則の使用状況')).toThrow(/parityUsage.*食い違う/);
  });
});
