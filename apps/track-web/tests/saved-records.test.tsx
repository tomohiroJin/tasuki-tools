/**
 * 端末に残す・CSV・「この端末の記録」の画面（#476 第 2 段 B）。サーバーは立てず、偽の WebSocket と偽の indexedDB を使う。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveResumeIdentity } from '@tasuki/sync-client';
import { outsideBase } from '@tasuki/test-css/font-base';
import { csvFileName, toCsv, toMarkdown, type TrackView } from '@tasuki/track-core';
import { App } from '../src/App';
import {
  COPY_BUTTON,
  COPY_DONE,
  COPY_FAILED,
  CSV_BUTTON,
  SAVED_BACK_HOME,
  SAVED_BACK_ROOM,
  SAVED_CLOSE_BUTTON,
  SAVED_DELETE_ALL_BUTTON,
  SAVED_DELETE_ALL_NO,
  SAVED_DELETE_ALL_YES,
  SAVED_DELETE_BUTTON,
  SAVED_EMPTY,
  SAVED_HEADING,
  SAVED_LINK,
  SAVED_LINK_LABEL,
  SAVE_BUTTON,
  SAVE_DONE,
  SAVE_FAILED,
  SAVE_NOTE,
  TOTALS_HEADING,
  saveFullNote,
} from '../src/copy';
import { localTzOffsetMin } from '../src/platform/timezone';
import { parseRoute, savedPathFor } from '../src/router';
import { MAX_SAVED_RECORDS, recordFromView, viewOfRecord, type SavedRecord } from '../src/storage/saved-record';
import { EMPTY_TRACK, JOINED, MIN, RESUME, ROSTER_FRAME, ScriptedWebSocket, latestSocket, runningTrack, stoppedTrack, trackFrame } from './support/track-states';
import { installFakeIndexedDb, type FakeIndexedDb } from './support/fake-indexeddb';

vi.mock('../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/router')>()),
  redirectTo: vi.fn(),
}));

const tz = localTzOffsetMin();
let fake: FakeIndexedDb;
let nowMs = 0;

beforeEach(() => {
  nowMs = 50_000;
  ScriptedWebSocket.instances = [];
  vi.stubGlobal('WebSocket', ScriptedWebSocket);
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  fake = installFakeIndexedDb();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const button = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name });
const stored = (): Map<string, unknown> => fake.stores.get('saved-records') ?? new Map();

function renderRoom(state: TrackView = EMPTY_TRACK) {
  window.history.replaceState(null, '', '/track/?room=R1');
  saveResumeIdentity(RESUME);
  render(<App />);
  act(() => {
    latestSocket().open();
    latestSocket().deliver(JOINED);
    latestSocket().deliver(ROSTER_FRAME);
    latestSocket().deliver(trackFrame(state));
  });
}

const deliver = (state: TrackView): void => act(() => latestSocket().deliver(trackFrame(state)));

/** ダウンロードのリンクを押したときの (ファイル名, 中身) を集める */
function captureDownloads(): { name: string; text: Promise<string> }[] {
  const downloads: { name: string; text: Promise<string> }[] = [];
  const blobs = new Map<string, Blob>();
  let seq = 0;
  // jsdom には Blob の URL が無い。`URL` ごと差し替えると `new URL` が壊れるので、2 つの関数だけを足す
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test-${seq++}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    // BOM を落とさずに読む（`Blob.text()` は BOM を落とす。端末に渡るのは BOM つきのバイト列）
    const text = blobs
      .get(this.href)!
      .arrayBuffer()
      .then((bytes) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes));
    downloads.push({ name: this.download, text });
  });
  return downloads;
}

const rec = (n: number, label = `w${n}`): SavedRecord => ({
  version: 1,
  id: `r${n}`,
  savedAtMs: Date.UTC(2026, 10, 23, 1, n, 0),
  epochWallMs: Date.UTC(2026, 10, 23, 1, 0, 0),
  segments: [
    { kind: 'work', label, startMs: 0, endMs: 30 * MIN, autoClosed: false },
    { kind: 'break', label: '', startMs: 30 * MIN, endMs: 45 * MIN, autoClosed: false },
  ],
});

/** 端末に記録を仕込む（ストアは最初の open で作られる） */
async function seed(records: unknown[]): Promise<void> {
  const { loadSaved } = await import('../src/storage/saved-store');
  await loadSaved();
  for (const r of records) stored().set((r as { id: string }).id, r);
}

/**
 * @requirements #476 第 2 段 FR-13・FR-14（B1・B2・B3・B6・B8・B9）
 */
describe('ルームの持ち帰り: 端末に残す・CSV', () => {
  it('Given 記録がある / When 「この端末に残す」を押す / Then 区切りと時刻だけを端末に入れ、残したと伝える', async () => {
    const view = stoppedTrack(60 * MIN, { pinned: ['定番ZZ'] });
    renderRoom(view);
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE));
    const [record] = [...stored().values()] as SavedRecord[];
    expect(Object.keys(record!).sort()).toEqual(['epochWallMs', 'id', 'savedAtMs', 'segments', 'version']);
    // 残した時刻は時刻軸から求める（端末の時計は読まない）
    expect(record!.savedAtMs).toBe(view.epochWallMs + 60 * MIN);
    expect(record!.epochWallMs).toBe(view.epochWallMs);
    expect(record!.segments.map((g) => g.label)).toEqual(['Review', 'Build']);
    // ルームのコード・定番は残さない
    expect(JSON.stringify(record)).not.toContain('R1');
    expect(JSON.stringify(record)).not.toContain('定番ZZ');
  });

  it('Given 押す前 / When 画面を描く / Then 自動では残さず、保存先と消える条件の 1 行を出す', () => {
    renderRoom(stoppedTrack());
    expect(stored().size).toBe(0);
    expect(screen.getByText(SAVE_NOTE)).toBeInTheDocument();
  });

  it('Given 計測中 / When 残す / Then 計測中の区切りは残す時点で切って残す', async () => {
    renderRoom(runningTrack(60 * MIN));
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(stored().size).toBe(1));
    const [record] = [...stored().values()] as SavedRecord[];
    expect(record!.segments.at(-1)).toMatchObject({ label: 'Build', startMs: 45 * MIN, endMs: 60 * MIN });
  });

  it('Given 空の記録 / When 画面を描く / Then 残す・CSV は押せない', () => {
    renderRoom(EMPTY_TRACK);
    expect(button(SAVE_BUTTON)).toBeDisabled();
    expect(button(CSV_BUTTON)).toBeDisabled();
  });

  it('Given 端末に残せない / When 残す / Then 残せなかったと伝える', async () => {
    vi.stubGlobal('indexedDB', undefined);
    renderRoom(stoppedTrack());
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_FAILED));
  });

  it('Given 49 件 / When 画面を描く / Then 上限の知らせは出さない', async () => {
    await seed(Array.from({ length: MAX_SAVED_RECORDS - 1 }, (_, i) => rec(i + 1)));
    renderRoom(stoppedTrack());
    await act(async () => {});
    expect(screen.queryByText(saveFullNote(MAX_SAVED_RECORDS))).toBeNull();
  });

  it('Given 50 件 / When 画面を描く / Then 押す前に、最初に残した 1 件が消えることを示す。残すと 50 件のまま', async () => {
    await seed(Array.from({ length: MAX_SAVED_RECORDS }, (_, i) => rec(i + 1)));
    renderRoom(stoppedTrack());
    expect(await screen.findByText(saveFullNote(MAX_SAVED_RECORDS))).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE));
    expect(stored().size).toBe(MAX_SAVED_RECORDS);
    expect(stored().has('r1')).toBe(false);
  });

  it('Given 記録がある / When CSV で保存を押す / Then track-YYYYMMDD-HHMM.csv で、CSV の中身を保存する', async () => {
    const downloads = captureDownloads();
    const view = stoppedTrack();
    renderRoom(view);
    fireEvent.click(button(CSV_BUTTON));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toMatch(/^track-\d{8}-\d{4}\.csv$/);
    expect(await downloads[0]!.text).toBe(toCsv(view, 60 * MIN, tz));
  });

  it('Given ルーム / When 「この端末の記録」へのリンクを見る / Then ルームのコードを運ぶ道で、新しいタブで開く（接続を切らない）', () => {
    renderRoom(stoppedTrack());
    // 新しいタブで開くことが、読み上げの名前で分かる（見える文言は SAVED_LINK のまま）
    const link = screen.getByRole('link', { name: SAVED_LINK_LABEL });
    expect(SAVED_LINK_LABEL).toContain(SAVED_LINK);
    expect(SAVED_LINK_LABEL).toContain('新しいタブ');
    expect(link).toHaveTextContent(SAVED_LINK);
    expect(link).toHaveAttribute('href', savedPathFor('R1'));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('Given コピーに失敗した後 / When 残す / Then 知らせの欄は、最後に動いた保存の結果を出す', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderRoom(stoppedTrack());
    await act(async () => {
      fireEvent.click(button(COPY_BUTTON));
    });
    expect(screen.getByRole('status')).toHaveTextContent(COPY_FAILED);
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE));
  });

  it('Given 同じ記録 / When 残すを 2 回押す / Then 端末に残るのは 1 件で、残しましたをもう一度出す', async () => {
    renderRoom(stoppedTrack());
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE));
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
      // 2 回目の保存が（あれば）端末へ書き終えるまで、未了の要求の数で待つ
      await fake.idle();
    });
    expect(stored().size).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE);
  });

  it('Given 計測中に残した / When 時計が進んでもう一度残す / Then その時点の写しを新しく残す（rev は変わらなくても同じ記録とみなさない）', async () => {
    renderRoom(runningTrack(60 * MIN));
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE));
    nowMs += 30 * MIN;
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
      await fake.idle();
    });
    expect(stored().size).toBe(2);
    const ends = ([...stored().values()] as SavedRecord[]).map((r) => r.segments.at(-1)!.endMs).sort((a, b) => a - b);
    expect(ends).toEqual([60 * MIN, 90 * MIN]);
  });

  it('Given ルームを作り直した / When rev が同じ別の記録を残す / Then 同じ記録とみなさず新しく残す（rev は部屋ごとに 0 から数える）', async () => {
    renderRoom(stoppedTrack());
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE));
    deliver(stoppedTrack(60 * MIN, { epochWallMs: Date.UTC(2026, 10, 24, 1, 0, 0) }));
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
      await fake.idle();
    });
    expect(stored().size).toBe(2);
  });

  it('Given 残した後 / When 記録が変わる / Then 残しましたの表示は消え、新しい記録は新しく残せる', async () => {
    renderRoom(stoppedTrack());
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SAVE_DONE));
    deliver(stoppedTrack(60 * MIN, { rev: 9 }));
    expect(screen.getByRole('status')).not.toHaveTextContent(SAVE_DONE);
    await act(async () => {
      fireEvent.click(button(SAVE_BUTTON));
    });
    await waitFor(() => expect(stored().size).toBe(2));
  });

  it('Given 記録がある / When CSV で保存を押す / Then ファイル名の時刻は端末の時計でなく時刻軸から求める', async () => {
    const downloads = captureDownloads();
    const view = stoppedTrack();
    renderRoom(view);
    fireEvent.click(button(CSV_BUTTON));
    expect(downloads[0]!.name).toBe(csvFileName(view.epochWallMs + 60 * MIN, tz));
  });
});

describe('router: この端末の記録', () => {
  it('Given ?view=saved / When 解析する / Then ルームのコードが無くても開く', () => {
    expect(parseRoute('/track/', '?view=saved')).toEqual({ name: 'saved', roomCode: null });
    expect(parseRoute('/track', '?view=saved&room=R1')).toEqual({ name: 'saved', roomCode: 'R1' });
  });

  it('Given 知らない view・知らない下位パス / When 解析する / Then 今までどおり', () => {
    expect(parseRoute('/track/', '?view=other')).toEqual({ name: 'redirect', to: '/' });
    expect(parseRoute('/track/x', '?view=saved')).toEqual({ name: 'redirect', to: '/' });
    expect(parseRoute('/track/', '?room=R1')).toEqual({ name: 'room', roomCode: 'R1' });
  });
});

/**
 * @requirements #476 第 2 段 FR-13（B4・B5）
 */
describe('この端末の記録の画面', () => {
  const openSaved = (search = '?view=saved') => {
    window.history.replaceState(null, '', `/track/${search}`);
    render(<App />);
  };

  it('Given 名乗りの無い端末・ルームのコード無し / When 開く / Then 玄関へ送らず、画面を出す', async () => {
    const { redirectTo } = await import('../src/router');
    openSaved();
    expect(screen.getByRole('heading', { level: 1, name: SAVED_HEADING })).toBeInTheDocument();
    expect(await screen.findByText(SAVED_EMPTY)).toBeInTheDocument();
    expect(redirectTo).not.toHaveBeenCalled();
    expect(ScriptedWebSocket.instances).toHaveLength(0);
    expect(screen.getByRole('link', { name: SAVED_BACK_HOME })).toHaveAttribute('href', '/');
  });

  it('Given ルームから来た / When 開く / Then 戻る道はルームのコードを保つ', async () => {
    openSaved('?view=saved&room=R1');
    await screen.findByText(SAVED_EMPTY);
    expect(screen.getByRole('link', { name: SAVED_BACK_ROOM })).toHaveAttribute('href', '/?room=R1');
    // 見ているだけの人がルームの名簿に現れない（`room.join` を送らない・接続しない）
    expect(ScriptedWebSocket.instances).toHaveLength(0);
  });

  it('Given 3 件と壊れた値 / When 開く / Then 新しい順に並べ、壊れた値は出さない', async () => {
    await seed([rec(1, 'old'), rec(3, 'newest'), { id: 'broken' }, rec(2, 'mid')]);
    openSaved();
    await screen.findByText(/3 件（残せるのは/);
    const items = document.querySelectorAll('[data-saved]');
    expect([...items].map((el) => el.getAttribute('data-saved'))).toEqual(['r3', 'r2', 'r1']);
  });

  it('Given 1 件 / When 開く / Then 表と時系列（読むだけ）を出し、手直しの操作は出さない', async () => {
    await seed([rec(1, 'Review')]);
    openSaved();
    fireEvent.click(await screen.findByRole('button', { name: /の記録を開く/ }));
    const item = document.querySelector('[data-saved="r1"]') as HTMLElement;
    expect(within(item).getByRole('heading', { name: TOTALS_HEADING })).toBeInTheDocument();
    expect(within(item).getAllByText('Review').length).toBeGreaterThan(0);
    expect(within(item).queryByRole('button', { name: '直す' })).toBeNull();
    fireEvent.click(within(item).getByRole('button', { name: SAVED_CLOSE_BUTTON }));
    expect(within(item).queryByRole('heading', { name: TOTALS_HEADING })).toBeNull();
  });

  it('Given 開いた記録 / When Markdown でコピー / Then その記録の Markdown を書く', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const record = rec(1, 'Review');
    await seed([record]);
    openSaved();
    fireEvent.click(await screen.findByRole('button', { name: /の記録を開く/ }));
    await act(async () => {
      fireEvent.click(button(COPY_BUTTON));
    });
    const view = viewOfRecord(record);
    expect(writeText).toHaveBeenCalledWith(toMarkdown(view, view.nowMs, tz));
    expect(screen.getByRole('status')).toHaveTextContent(COPY_DONE);
  });

  it('Given 開いた記録 / When CSV で保存 / Then その記録の CSV を、残した時刻の名前で保存する', async () => {
    const downloads = captureDownloads();
    const record = rec(1, 'Review');
    await seed([record]);
    openSaved();
    fireEvent.click(await screen.findByRole('button', { name: /の記録を開く/ }));
    fireEvent.click(button(CSV_BUTTON));
    const view = viewOfRecord(record);
    expect(downloads[0]!.name).toBe(csvFileName(record.savedAtMs, tz));
    expect(await downloads[0]!.text).toBe(toCsv(view, view.nowMs, tz));
  });

  it('Given 開いた記録 / When 画面の文字を見る / Then 書体の常用の層に無い字は無い（空の画面・全部消すの確かめも）', async () => {
    await seed([rec(1, 'Review')]);
    openSaved();
    fireEvent.click(await screen.findByRole('button', { name: /の記録を開く/ }));
    fireEvent.click(button(SAVED_DELETE_ALL_BUTTON));
    expect(outsideBase([document.body.textContent ?? ''])).toEqual([]);
  });

  it('Given 2 件 / When 1 件を消す / Then その 1 件だけが端末から消える', async () => {
    await seed([rec(1), rec(2)]);
    openSaved();
    const first = (await screen.findAllByRole('button', { name: /の記録を開く/ }))[0]!;
    fireEvent.click(first);
    await act(async () => {
      fireEvent.click(button(SAVED_DELETE_BUTTON));
    });
    await waitFor(() => expect(document.querySelectorAll('[data-saved]')).toHaveLength(1));
    expect(stored().has('r2')).toBe(false);
    expect(stored().has('r1')).toBe(true);
  });

  it('Given 名前のある作業と名前なし・休憩 / When 一覧を見る / Then 作業名の数は、名前のあるものだけを数える', async () => {
    const r = rec(1, 'Review');
    await seed([{ ...r, segments: [...r.segments, { kind: 'work', label: '', startMs: 45 * MIN, endMs: 50 * MIN, autoClosed: false }] }]);
    openSaved();
    expect(await screen.findByText(/作業名 1 件/)).toBeInTheDocument();
  });

  it('Given 一覧を開いた後に別のタブで残した記録 / When 全部消す / Then 見えていた記録だけが消え、後から残した記録は残る', async () => {
    await seed([rec(1), rec(2)]);
    openSaved();
    await screen.findByText(/2 件（残せるのは/);
    stored().set('r9', rec(9));
    fireEvent.click(button(SAVED_DELETE_ALL_BUTTON));
    await act(async () => {
      fireEvent.click(button(SAVED_DELETE_ALL_YES));
    });
    await screen.findByText(SAVED_EMPTY);
    expect([...stored().keys()]).toEqual(['r9']);
  });

  it('Given 2 件 / When 全部消すを押す / Then 確かめるまで消さず、やめれば残り、確かめれば全部消える', async () => {
    await seed([rec(1), rec(2)]);
    openSaved();
    await screen.findByText(/2 件（残せるのは/);
    fireEvent.click(button(SAVED_DELETE_ALL_BUTTON));
    expect(button(SAVED_DELETE_ALL_NO)).toHaveFocus();
    expect(stored().size).toBe(2);
    fireEvent.click(button(SAVED_DELETE_ALL_NO));
    expect(button(SAVED_DELETE_ALL_BUTTON)).toHaveFocus();
    expect(stored().size).toBe(2);
    fireEvent.click(button(SAVED_DELETE_ALL_BUTTON));
    await act(async () => {
      fireEvent.click(button(SAVED_DELETE_ALL_YES));
    });
    await screen.findByText(SAVED_EMPTY);
    expect(stored().size).toBe(0);
  });
});

describe('残した記録を写しへ', () => {
  it('Given 残した記録 / When 写しに戻す / Then ルームで見ていた CSV と同じ', () => {
    const view = stoppedTrack();
    const record = recordFromView(view, 60 * MIN, 'x');
    const restored = viewOfRecord(record);
    expect(toCsv(restored, restored.nowMs, tz)).toBe(toCsv(view, 60 * MIN, tz));
  });
});
