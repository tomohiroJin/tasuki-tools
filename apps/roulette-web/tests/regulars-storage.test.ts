/**
 * いつものメンツの端末への保存（#458 設計 §5）。
 * 期待値はリテラルで書く（実装の関数で組まない）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_VERSION,
  MAX_GROUPS,
  REGULARS_KEY,
  deleteGroup,
  loadGroups,
  parseMemberLines,
  safeLocalStorage,
  saveGroup,
  touchGroup,
} from '../src/storage/regulars';

const fakeStorage = (): Storage & { setCalls: number } => {
  const m = new Map<string, string>();
  const s = {
    setCalls: 0,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, val: string) => {
      s.setCalls++;
      m.set(k, String(val));
    },
  };
  return s;
};

const put = (s: Storage, doc: unknown): void => s.setItem(REGULARS_KEY, typeof doc === 'string' ? doc : JSON.stringify(doc));
const raw = (s: Storage): unknown => JSON.parse(s.getItem(REGULARS_KEY) ?? 'null');
const g = (id: string, name: string, usedAt: number, members: string[] = ['a']) => ({ id, name, usedAt, members });
const names = (n: number): string[] => Array.from({ length: n }, (_, i) => `ゲスト${i + 1}`);

/**
 * @requirements #458 設計 §5（いつものメンツは版つきで端末に保存する）
 */
describe('いつものメンツの端末への保存', () => {
  it('定数は設計のとおり', () => {
    expect(REGULARS_KEY).toBe('tasuki.roulette.regulars');
    expect(CURRENT_VERSION).toBe(1);
    expect(MAX_GROUPS).toBe(10);
  });

  describe('読む', () => {
    it('空の保存は 0 組', () => {
      expect(loadGroups(fakeStorage())).toEqual([]);
    });
    it('storage が null でも 0 組', () => {
      expect(loadGroups(null)).toEqual([]);
    });
    it('壊れた JSON は 0 組', () => {
      const s = fakeStorage();
      put(s, '{not json');
      expect(loadGroups(s)).toEqual([]);
    });
    it('知らない版は 0 組', () => {
      const s = fakeStorage();
      put(s, { version: 2, items: [g('1', 'A', 1)] });
      expect(loadGroups(s)).toEqual([]);
    });
    it('getItem が投げても 0 組', () => {
      const s = fakeStorage();
      s.getItem = () => {
        throw new Error('denied');
      };
      expect(loadGroups(s)).toEqual([]);
    });
    it('合わない項目だけが一覧から外れる', () => {
      const s = fakeStorage();
      put(s, {
        version: 1,
        items: [
          g('ok', '良い', 5),
          g('e1', '', 1),
          g('e2', '空メンバー', 1, []),
          g('e3', '25人', 1, names(25)),
          g('e4', 'あ'.repeat(41), 1),
          { name: 'idなし', usedAt: 1, members: ['a'] },
          g('e5', '名前が長い人', 1, ['あ'.repeat(41)]),
          g('e6', '見えない人', 1, ['‍']),
          null,
          'x',
        ],
      });
      expect(loadGroups(s)).toEqual([g('ok', '良い', 5)]);
    });
    it('usedAt の新しい順に返す', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [g('a', 'A', 1), g('b', 'B', 3), g('c', 'C', 2)] });
      expect(loadGroups(s).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('保存する', () => {
    it('crypto.randomUUID が無い環境（http の LAN）でも投げず、空でない ID で保存できる', () => {
      vi.stubGlobal('crypto', {});
      try {
        const s = fakeStorage();
        const r = saveGroup(s, { name: '朝会', members: ['さとう'] }, 1000);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.items[0]?.id).not.toBe('');
        expect(typeof r.items[0]?.id).toBe('string');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('新しい組は newId の ID と now の usedAt で入り、版 1 で書かれる', () => {
      const s = fakeStorage();
      const r = saveGroup(s, { name: '  朝会  ', members: ['alice', 'ＡＬＩＣＥ', ' 佐藤 ', ''] }, 1000, () => 'id-1');
      expect(r).toEqual({ ok: true, items: [g('id-1', '朝会', 1000, ['alice', '佐藤'])] });
      expect(raw(s)).toEqual({ version: 1, items: [g('id-1', '朝会', 1000, ['alice', '佐藤'])] });
    });
    it('同じ名前の別の組があれば name-taken で書かない', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [g('x', '朝会', 1)] });
      s.setCalls = 0;
      expect(saveGroup(s, { name: '朝会', members: ['a'] }, 2, () => 'n')).toEqual({ ok: false, reason: 'name-taken' });
      expect(saveGroup(s, { id: 'y', name: '朝会', members: ['a'] }, 2)).toEqual({ ok: false, reason: 'name-taken' });
      expect(s.setCalls).toBe(0);
    });
    it('自分の id なら名前そのままで上書きでき、usedAt は now になる', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [g('x', '朝会', 1, ['a']), g('z', '夕会', 9)] });
      const r = saveGroup(s, { id: 'x', name: '朝会', members: ['b', 'c'] }, 50);
      expect(r).toEqual({ ok: true, items: [g('x', '朝会', 50, ['b', 'c']), g('z', '夕会', 9)] });
      expect(raw(s)).toEqual({ version: 1, items: [g('x', '朝会', 50, ['b', 'c']), g('z', '夕会', 9)] });
    });
    it('名前を変えても同じ組のまま（別の組を作らない）', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [g('x', '朝会', 1)] });
      saveGroup(s, { id: 'x', name: '新朝会', members: ['a'] }, 2);
      expect((raw(s) as { items: unknown[] }).items).toEqual([g('x', '新朝会', 2)]);
    });
    it('11 組目は full、10 組目は入る、直すのは数えない', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: Array.from({ length: 9 }, (_, i) => g(`i${i}`, `組${i}`, i)) });
      expect(saveGroup(s, { name: '10組目', members: ['a'] }, 100, () => 'ten').ok).toBe(true);
      s.setCalls = 0;
      expect(saveGroup(s, { name: '11組目', members: ['a'] }, 101, () => 'eleven')).toEqual({ ok: false, reason: 'full' });
      expect(s.setCalls).toBe(0);
      expect(saveGroup(s, { id: 'i0', name: '組0', members: ['z'] }, 102).ok).toBe(true);
    });
    it('名前が空・メンバー 0 人・25 人・使えない名前・長すぎる名前は invalid で書かない', () => {
      const s = fakeStorage();
      const bad = [
        { name: '   ', members: ['a'] },
        { name: 'A', members: [] },
        { name: 'A', members: ['', '  '] },
        { name: 'A', members: names(25) },
        { name: 'A\u0007B', members: ['a'] },
        { name: 'あ'.repeat(41), members: ['a'] },
        { name: 'A', members: ['‍'] },
      ];
      for (const input of bad) {
        expect(saveGroup(s, input, 1, () => 'n')).toEqual({ ok: false, reason: 'invalid' });
      }
      expect(s.setCalls).toBe(0);
    });
    it('24 人は入る・40 字の名前は入る', () => {
      const s = fakeStorage();
      expect(saveGroup(s, { name: 'あ'.repeat(40), members: names(24) }, 1, () => 'n').ok).toBe(true);
    });
    it('読めない保存（壊れた JSON）は unreadable で setItem を呼ばず、中身も変わらない', () => {
      const s = fakeStorage();
      put(s, '{broken');
      s.setCalls = 0;
      expect(saveGroup(s, { name: 'A', members: ['a'] }, 1, () => 'n')).toEqual({ ok: false, reason: 'unreadable' });
      expect(deleteGroup(s, 'n')).toEqual({ ok: false, reason: 'unreadable' });
      expect(touchGroup(s, 'n', 1)).toEqual({ ok: false, reason: 'unreadable' });
      expect(s.setCalls).toBe(0);
      expect(s.getItem(REGULARS_KEY)).toBe('{broken');
    });
    it('知らない版・items が配列でない保存も unreadable', () => {
      for (const doc of [{ version: 9, items: [] }, { version: 1, items: 'x' }, [1]]) {
        const s = fakeStorage();
        put(s, doc);
        s.setCalls = 0;
        expect(saveGroup(s, { name: 'A', members: ['a'] }, 1, () => 'n')).toEqual({ ok: false, reason: 'unreadable' });
        expect(s.setCalls).toBe(0);
      }
    });
    it('setItem が投げたら write-failed', () => {
      const s = fakeStorage();
      s.setItem = vi.fn(() => {
        throw new Error('quota');
      });
      expect(saveGroup(s, { name: 'A', members: ['a'] }, 1, () => 'n')).toEqual({ ok: false, reason: 'write-failed' });
    });
    it('storage が null なら write-failed', () => {
      expect(saveGroup(null, { name: 'A', members: ['a'] }, 1, () => 'n')).toEqual({ ok: false, reason: 'write-failed' });
      expect(deleteGroup(null, 'x')).toEqual({ ok: false, reason: 'write-failed' });
      expect(touchGroup(null, 'x', 1)).toEqual({ ok: false, reason: 'write-failed' });
    });
    it('合わない項目は消さず、生のまま書き戻す', () => {
      const s = fakeStorage();
      const weird = { id: 'w', name: '', usedAt: 'x', members: 5, extra: { deep: [1, 2] } };
      put(s, { version: 1, items: [weird, 'text', null, g('x', 'A', 1)] });
      saveGroup(s, { name: 'B', members: ['b'] }, 2, () => 'n');
      expect(raw(s)).toEqual({ version: 1, items: [weird, 'text', null, g('x', 'A', 1), g('n', 'B', 2, ['b'])] });
      deleteGroup(s, 'x');
      expect(raw(s)).toEqual({ version: 1, items: [weird, 'text', null, g('n', 'B', 2, ['b'])] });
      touchGroup(s, 'n', 7);
      expect(raw(s)).toEqual({ version: 1, items: [weird, 'text', null, g('n', 'B', 7, ['b'])] });
    });
    it('合わない項目の名前とは name-taken にならない（読めない項目は組ではない）', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [{ id: 'w', name: 'A', usedAt: 1, members: [] }] });
      expect(saveGroup(s, { name: 'A', members: ['a'] }, 2, () => 'n').ok).toBe(true);
    });
  });

  describe('消す・使った印', () => {
    it('id で消す', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [g('a', 'A', 1), g('b', 'B', 2)] });
      expect(deleteGroup(s, 'a')).toEqual({ ok: true, items: [g('b', 'B', 2)] });
      expect(raw(s)).toEqual({ version: 1, items: [g('b', 'B', 2)] });
    });
    it('知らない id の削除は ok で書かない', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [g('a', 'A', 1)] });
      s.setCalls = 0;
      expect(deleteGroup(s, 'zz')).toEqual({ ok: true, items: [g('a', 'A', 1)] });
      expect(touchGroup(s, 'zz', 5)).toEqual({ ok: true, items: [g('a', 'A', 1)] });
      expect(s.setCalls).toBe(0);
    });
    it('touchGroup は usedAt だけを変え、先頭へ来る', () => {
      const s = fakeStorage();
      put(s, { version: 1, items: [g('a', 'A', 1, ['p', 'q']), g('b', 'B', 9)] });
      const r = touchGroup(s, 'a', 20);
      expect(r).toEqual({ ok: true, items: [g('a', 'A', 20, ['p', 'q']), g('b', 'B', 9)] });
    });
  });

  describe('parseMemberLines', () => {
    it('改行（CRLF も）で分け、空行を捨て、前後の空白を落とす', () => {
      expect(parseMemberLines('alice\r\n\r\n  佐藤  \nbob\n')).toEqual(['alice', '佐藤', 'bob']);
    });
    it('NFKC に寄せ、重複は先に出た方を残す（大小・全角半角違いも同じ）', () => {
      expect(parseMemberLines('ＡＬＩＣＥ\nalice\nBob\nbob')).toEqual(['ALICE', 'Bob']);
    });
    it('見えない名前を捨てる', () => {
      expect(parseMemberLines('a\n‍\nb')).toEqual(['a', 'b']);
    });
    it('空文字は空', () => {
      expect(parseMemberLines('')).toEqual([]);
    });
  });

  describe('safeLocalStorage', () => {
    it('window.localStorage の取得が投げたら null', () => {
      const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(safeLocalStorage()).toBeNull();
      spy.mockRestore();
    });
    it('普通は Storage を返す', () => {
      expect(safeLocalStorage()).not.toBeNull();
    });
  });
});
