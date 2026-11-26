/**
 * 「この端末の記録」（#476 第 2 段 B4・B5）。端末に残した記録を、一覧 → 開いて読む、の順で見せる。
 *
 * ルームの接続を持たない（ルームのコードが無くても開ける）。**読むだけ**で、手直しはさせない。
 * 開くと、表と時系列（読むだけ）・Markdown でコピー・CSV で保存・この記録を消す。全部消すは、押す前にその場で確かめる。
 * 一覧は残した時刻の新しい順。壊れた記録は読み戻しの境界で捨てているので、ここには出ない。
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useCopyText } from '@tasuki/invite-ui';
import { csvFileName, formatClock, formatDate, formatDuration, toCsv, toMarkdown, totalsOf } from '@tasuki/track-core';
import { TotalsPanel } from '../components/TotalsPanel';
import {
  AUTO_CLOSED_MARK,
  COPY_BUTTON,
  COPY_DONE,
  COPY_FAILED,
  COPY_MANUAL_FIELD,
  CSV_BUTTON,
  SAVED_BACK_HOME,
  SAVED_BACK_ROOM,
  SAVED_CLOSE_BUTTON,
  SAVED_DELETE_ALL_BUTTON,
  SAVED_DELETE_ALL_CONFIRM,
  SAVED_DELETE_ALL_NO,
  SAVED_DELETE_ALL_YES,
  SAVED_DELETE_BUTTON,
  SAVED_DELETE_FAILED,
  SAVED_EMPTY,
  SAVED_HEADING,
  SAVED_LOADING,
  SAVED_LOAD_FAILED,
  SAVED_OPEN_BUTTON,
  TIMELINE_HEADING,
  savedCountNote,
  savedItemText,
  savedOpenLabel,
} from '../copy';
import { downloadTextFile } from '../platform/download';
import { localTzOffsetMin } from '../platform/timezone';
import { hubPathFor } from '../router';
import { MAX_SAVED_RECORDS, viewOfRecord, type SavedRecord } from '../storage/saved-record';
import { clearSaved, deleteSaved, loadSaved } from '../storage/saved-store';
import { isUnnamed, nameOf, rangeTextOf } from '../track-view';

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; records: SavedRecord[] };

export function SavedRecords({ roomCode }: { roomCode: string | null }) {
  const tzOffsetMin = localTzOffsetMin();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [openId, setOpenId] = useState<string | null>(null);
  // 消せなかったときの知らせ。一覧は残す（読めた記録を隠さない）
  const [deleteFailed, setDeleteFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let alive = true;
    loadSaved().then(
      (records) => alive && setLoaded({ kind: 'ready', records }),
      () => alive && setLoaded({ kind: 'failed' }),
    );
    return () => {
      alive = false;
    };
  }, []);

  const records = loaded.kind === 'ready' ? loaded.records : [];
  const remove = async (id: string): Promise<void> => {
    try {
      await deleteSaved(id);
    } catch {
      setDeleteFailed(true);
      return;
    }
    setDeleteFailed(false);
    setLoaded({ kind: 'ready', records: records.filter((r) => r.id !== id) });
    setOpenId(null);
    // 消した記録の欄は外れるので、見出しへフォーカスを移す
    headingRef.current?.focus();
  };
  const removeAll = async (): Promise<void> => {
    try {
      await clearSaved();
    } catch {
      setDeleteFailed(true);
      return;
    }
    setDeleteFailed(false);
    setLoaded({ kind: 'ready', records: [] });
    setOpenId(null);
    headingRef.current?.focus();
  };

  return (
    <main className="ui-page">
      <header className="ui-page-header">
        <h1 ref={headingRef} tabIndex={-1}>
          {SAVED_HEADING}
        </h1>
        <a className="ui-page-header-back ui-button ui-button--quiet" href={roomCode === null ? '/' : hubPathFor(roomCode)}>
          {roomCode === null ? SAVED_BACK_HOME : SAVED_BACK_ROOM}
        </a>
      </header>
      <div className="track-room">
        {loaded.kind === 'loading' && <p className="ui-note">{SAVED_LOADING}</p>}
        {loaded.kind === 'failed' && (
          <p className="ui-note ui-note--error" role="alert">
            {SAVED_LOAD_FAILED}
          </p>
        )}
        {deleteFailed && (
          <p className="ui-note ui-note--error" role="alert">
            {SAVED_DELETE_FAILED}
          </p>
        )}
        {loaded.kind === 'ready' && records.length === 0 && <p className="ui-note">{SAVED_EMPTY}</p>}
        {records.length > 0 && (
          <>
            <p className="ui-note">{savedCountNote(records.length, MAX_SAVED_RECORDS)}</p>
            <ul className="track-saved-list">
              {records.map((record) => {
                const view = viewOfRecord(record);
                const when = `${formatDate(record.savedAtMs, tzOffsetMin)} ${formatClock(record.savedAtMs, tzOffsetMin)}`;
                const total = formatDuration(totalsOf(view, view.nowMs).totalMs);
                const names = new Set(record.segments.filter((g) => g.kind === 'work').map((g) => g.label)).size;
                const open = openId === record.id;
                return (
                  <li key={record.id} className="track-saved-item" data-saved={record.id}>
                    <div className="track-saved-line">
                      <span className="track-digits">{savedItemText(when, total, names)}</span>
                      <button
                        type="button"
                        className="ui-button ui-button--quiet ui-button--sm"
                        aria-expanded={open}
                        aria-label={open ? undefined : savedOpenLabel(when)}
                        onClick={() => setOpenId(open ? null : record.id)}
                      >
                        {open ? SAVED_CLOSE_BUTTON : SAVED_OPEN_BUTTON}
                      </button>
                    </div>
                    {open && <SavedDetail record={record} tzOffsetMin={tzOffsetMin} onDelete={() => void remove(record.id)} />}
                  </li>
                );
              })}
            </ul>
            <DeleteAll onConfirmed={() => void removeAll()} />
          </>
        )}
      </div>
    </main>
  );
}

function SavedDetail({ record, tzOffsetMin, onDelete }: { record: SavedRecord; tzOffsetMin: number; onDelete: () => void }) {
  const view = viewOfRecord(record);
  const markdown = toMarkdown(view, view.nowMs, tzOffsetMin);
  const { copy, state } = useCopyText(markdown, { keepFailure: true });
  const timelineId = useId();
  return (
    <div className="track-saved-detail ui-stack">
      <TotalsPanel totals={totalsOf(view, view.nowMs)} />
      <section className="track-timeline ui-stack" aria-labelledby={timelineId}>
        <h2 id={timelineId}>{TIMELINE_HEADING}</h2>
        <ol className="track-segments">
          {view.segments.map((segment) => (
            <li key={segment.id} className={segment.autoClosed ? 'track-segment track-segment--flagged' : 'track-segment'}>
              <div className="track-segment-line">
                <span className="track-segment-range track-digits">{rangeTextOf(view, segment, tzOffsetMin)}</span>
                <span className={isUnnamed(segment) ? 'track-segment-name track-name--unnamed' : 'track-segment-name'}>{nameOf(segment)}</span>
                {segment.autoClosed && <span className="track-mark track-mark--auto">{AUTO_CLOSED_MARK}</span>}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div className="track-takehome-actions">
        <button type="button" className="ui-button ui-button--secondary" onClick={() => void copy()}>
          {COPY_BUTTON}
        </button>
        <button
          type="button"
          className="ui-button ui-button--secondary"
          onClick={() => downloadTextFile(csvFileName(record.savedAtMs, tzOffsetMin), toCsv(view, view.nowMs, tzOffsetMin))}
        >
          {CSV_BUTTON}
        </button>
        <button type="button" className="ui-button ui-button--danger ui-button--sm" onClick={onDelete}>
          {SAVED_DELETE_BUTTON}
        </button>
      </div>
      <p role="status" className="track-copy-status">
        {state === 'done' ? COPY_DONE : state === 'failed' ? COPY_FAILED : ''}
      </p>
      {state === 'failed' && (
        <textarea
          aria-label={COPY_MANUAL_FIELD}
          className="ui-input track-copy-manual"
          readOnly
          rows={8}
          value={markdown}
          onFocus={(event) => {
            event.currentTarget.select();
            event.currentTarget.setSelectionRange(0, event.currentTarget.value.length);
          }}
        />
      )}
    </div>
  );
}

/** 全部消す。押す前にその場で確かめる（開いたら安全な側＝やめるへフォーカス、閉じたら元のボタンへ返す）。 */
function DeleteAll({ onConfirmed }: { onConfirmed: () => void }) {
  const [asking, setAsking] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const [returnFocus, setReturnFocus] = useState(false);
  const textId = useId();

  useEffect(() => {
    if (asking) noRef.current?.focus();
  }, [asking]);
  useEffect(() => {
    if (!asking && returnFocus) {
      openRef.current?.focus();
      setReturnFocus(false);
    }
  }, [asking, returnFocus]);

  if (!asking) {
    return (
      <div className="track-takehome-actions">
        <button ref={openRef} type="button" className="ui-button ui-button--danger ui-button--sm" onClick={() => setAsking(true)}>
          {SAVED_DELETE_ALL_BUTTON}
        </button>
      </div>
    );
  }
  return (
    <div className="track-confirm" role="group" aria-labelledby={textId}>
      <p id={textId} className="track-confirm-text">
        {SAVED_DELETE_ALL_CONFIRM}
      </p>
      <div className="track-confirm-actions">
        <button
          ref={noRef}
          type="button"
          className="ui-button ui-button--secondary ui-button--sm"
          onClick={() => {
            setAsking(false);
            setReturnFocus(true);
          }}
        >
          {SAVED_DELETE_ALL_NO}
        </button>
        <button type="button" className="ui-button ui-button--danger ui-button--sm" onClick={() => onConfirmed()}>
          {SAVED_DELETE_ALL_YES}
        </button>
      </div>
    </div>
  );
}
