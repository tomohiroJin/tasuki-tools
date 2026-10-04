/**
 * 画素の基準（snapshot）の扱いの断定（`e2e/parity/guard.ts`・#321）の自己テスト。
 *
 * `-u` と `--ignore-snapshots` は、どちらも画素を比べずに緑になる。比較の各テストの先頭で止まることを固定する。
 */
import { describe, expect, it } from 'vitest';
import { snapshotGuardProblem } from '../parity/guard';

describe('snapshotGuardProblem', () => {
  it.each(['missing', 'none'])('Given updateSnapshots=%s・ignoreSnapshots なし / Then 止めない', (updateSnapshots) => {
    expect(snapshotGuardProblem({ updateSnapshots, ignoreSnapshots: false })).toBeNull();
  });

  it.each(['all', 'changed'])('Given updateSnapshots=%s / Then 止める（基準の画像が上書きされる）', (updateSnapshots) => {
    expect(snapshotGuardProblem({ updateSnapshots, ignoreSnapshots: false })).toMatch(/updateSnapshots/);
  });

  it('Given --ignore-snapshots / Then 止める（画素を比べずに緑になる）', () => {
    expect(snapshotGuardProblem({ updateSnapshots: 'missing', ignoreSnapshots: true })).toMatch(/ignore-snapshots/);
  });
});
