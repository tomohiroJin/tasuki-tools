/**
 * 画面の CSS の契約（#553・ADR 0035）。部品の CSS の契約は `packages/ui/tests/spacing-owner.test.mjs`、配置の結果は E2E（`e2e/specs/spacing.spec.ts`）が見る。
 * 部品のテストがアプリを読むと依存の向きが逆（turbo のキャッシュの鍵にも入らない）なので、アプリ自身のテストが自分の CSS を読む。
 */
import { describe, expect, it } from 'vitest';

import { foundBody, readFromCwd as read, rulesMatching, rulesOf } from '@tasuki/test-css/css-rules';

describe('余白の持ち主の約束（画面の CSS）', () => {
  it('Given timer の見出しの行の操作の塊 / When 規則を読む / Then 右へ寄せない（折り返したとき見出しの下に左端そろいで置く）', () => {
    const bodies = rulesOf(read('src/styles/roster-panel.css'), '.roster-panel-head-actions');
    foundBody(bodies, '.roster-panel-head-actions');
    for (const body of bodies) {
      expect(body).not.toMatch(/justify-content:\s*(flex-end|end|right)/);
      expect(body).not.toMatch(/flex:\s*1/);
    }
  });


  it('Given timer の「ランダム」のスタイル / When CSS を読む / Then 中の並びの写し（shuffle-button-*）を持たず、セッションの操作ボタンの session-action-label・session-action-icon を使う（間は 8px の 1 か所）', () => {
    for (const file of ['src/index.css', 'src/styles/roster-panel.css', 'src/styles/session.css']) expect(read(file)).not.toMatch(/shuffle-button/);
    expect(foundBody(rulesOf(read('src/styles/session.css'), '.session-action-label'), '.session-action-label')).toMatch(/gap:\s*var\(--space-2\);/);
  });


  it('Given 共有メモの見出しの行 / When .shared-memo-lead を読む / Then 縮められ（flex: 1 1 8rem・折り返し可）、「編集」が見出しの行の右に残る（一覧 #18）', () => {
    const body = foundBody(rulesOf(read('src/styles/shared-memo.css'), '.shared-memo-lead'), '.shared-memo-lead');
    expect(body).toMatch(/flex:\s*1 1 8rem;/);
    expect(body).toMatch(/flex-wrap:\s*wrap;/);
    expect(body).toMatch(/min-width:\s*0;/);
    // 印が題の下へ折り返したとき、行の間が 0 だと題の字と詰まる（#557 の重なりと間の検査が見つけた）
    expect(body).toMatch(/gap:\s*var\(--space-1\) var\(--space-2\);/);
  });

  it('Given 画面の CSS / When 並びの写しを探す / Then 部品の修飾 --beside を画面が上書きする規則を持たない', () => {
    expect(read('src/styles/primitives.css')).not.toMatch(/section-header--beside/);
  });

  it('Given timer の見出しの行 / When .section-header の規則を読む / Then 横の間（gap・column-gap）を画面が持たない（部品 .ui-section-head の --space-3 に任せる。3px に詰まった・一覧 #33）', () => {
    const css = read('src/styles/primitives.css');
    foundBody(rulesOf(css, '.section-header'), '.section-header');
    for (const body of rulesMatching(css, /(^|[\s>+~])\.section-header$/)) expect(body).not.toMatch(/gap\s*:/);
  });

  it('Given timer のロビーの参加者の行（折り返し可） / When .lobby-participant を読む / Then 折り返した段の間を --space-2 で持つ。名前の段と操作の段が 6px に詰まらない（#557 のレビューで block-gaps が見つけた）', () => {
    const body = foundBody(rulesOf(read('src/styles/lobby.css'), '.lobby-participant'), '.lobby-participant');
    expect(body).toMatch(/row-gap:\s*var\(--space-2\);/);
  });
});
