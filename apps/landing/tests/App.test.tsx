import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App.js';
import { TOOLS } from '../src/tools.js';

describe('玄関（ツール選択 LP）', () => {
  it('Given LP を開いた / When 見出しを探す / Then Tasuki の名前が出ている', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tasuki');
  });

  it('Given LP を開いた / When ツール一覧を見る / Then 収録ツールが漏れなく並ぶ', () => {
    render(<App />);
    const items = screen.getByRole('list', { name: 'ツール' });
    expect(items.querySelectorAll('li')).toHaveLength(TOOLS.length);
  });

  it.each(TOOLS)('Given LP / When $name のカードを見る / Then 名前・説明・遷移先が揃う', (tool) => {
    render(<App />);
    const link = screen.getByRole('link', { name: new RegExp(tool.name) });
    expect(link).toHaveAttribute('href', tool.href);
    expect(link).toHaveTextContent(tool.summary);
  });

  it('Given LP / When 各カードを見る / Then コーナーの一語が data-label で渡っている', () => {
    // 左上のピップは @tasuki/ui の .card::after が attr(data-label) で描く。
    // 属性が無いと視覚的にだけ欠ける（テストで気づけない）ので明示的に検証する。
    render(<App />);
    for (const tool of TOOLS) {
      const link = screen.getByRole('link', { name: new RegExp(tool.name) });
      expect(link).toHaveAttribute('data-label', tool.pip);
    }
  });

  it('Given LP / When 遷移先を確かめる / Then timer は / 、poker は /poker/ を指す', () => {
    // S4（#19）で timer が /timer/ へ移るまでは既存 URL のまま。
    // ここが変わるときは #19 の作業だと分かるように、値を直接押さえておく。
    const hrefs = TOOLS.map((t) => t.href);
    expect(hrefs).toEqual(['/', '/poker/']);
  });
});
