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
    // Given
    render(<App />);
    // When
    const items = screen.getByRole('list', { name: 'ツール' });
    // Then
    expect(items.querySelectorAll('li')).toHaveLength(TOOLS.length);
  });

  it.each(TOOLS)('Given LP / When $name のカードを見る / Then 名前・説明・遷移先が揃う', (tool) => {
    // Given
    render(<App />);
    // When
    const link = screen.getByRole('link', { name: new RegExp(tool.name) });
    // Then
    expect(link).toHaveAttribute('href', tool.href);
    expect(link).toHaveTextContent(tool.summary);
  });

  it('Given LP / When 各カードを見る / Then コーナーの一語が data-label で渡っている', () => {
    // 左上のピップは @tasuki/ui の .card::after が attr(data-label) で描く。
    // 属性が無いと視覚的にだけ欠ける（テストで気づけない）ので明示的に検証する。
    // Given
    render(<App />);
    // When / Then（各カードの取得と検証をループ内で 1 組ずつ行うため、操作と検証が同じ繰り返しになる）
    for (const tool of TOOLS) {
      const link = screen.getByRole('link', { name: new RegExp(tool.name) });
      expect(link).toHaveAttribute('data-label', tool.pip);
    }
  });

  it('Given LP / When 遷移先を確かめる / Then timer は /timer/ 、poker は /poker/ を指す', () => {
    // LP 自身がルート（/）を占めるので、各ツールは必ずサブパスになる。
    // 公開パスは Caddy 断片・vite の base・app.env の PUBLIC_PATH と揃っている必要があり、
    // どれか 1 つでも取り残すと白画面か 404 になる。値を直接押さえて変え忘れに気づけるようにする。
    const hrefs = TOOLS.map((t) => t.href);
    expect(hrefs).toEqual(['/timer/', '/poker/']);
  });

  it('Given LP / When 各遷移先を見る / Then どれもルート（/）ではない', () => {
    // LP がルートを占めるため、ツールの href が / だと LP 自身に戻る無限ループになる。
    // Given: TOOLS 自体が前提の指定を兼ねる
    // When / Then（各ツールの href の検証をループ内で行うため、操作と検証が同じ繰り返しになる）
    for (const tool of TOOLS) {
      expect(tool.href).not.toBe('/');
    }
  });
});
