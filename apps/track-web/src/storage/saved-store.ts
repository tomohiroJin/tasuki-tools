/**
 * 端末（IndexedDB）に残した記録の出し入れ（#476 第 2 段・設計 §3 B7）。
 *
 * 作りは `apps/timer-web/src/records/indexeddb.ts` を写している（3 つ目の使い手が出るまでは共有化しない・原則 X）。
 * DB 名 `tasuki-track`・ストア 1 つ。ブラウザの API はこのファイルに閉じる（原則 VI）。
 * 読んだ値は {@link recordsFromStore} で検証し、読めない値は一覧から外す。**`DB_VERSION` は変えない**（形の移行は読むときに行う）。
 */
import { evictedIds, newestFirst, recordsFromStore, type SavedRecord } from './saved-record';

const DB_NAME = 'tasuki-track';
const DB_VERSION = 1;
const STORE_NAME = 'saved-records';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 書き込みの取引を 1 つ開き、取引が確定したら解決する。 */
async function write(run: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    run(tx.objectStore(STORE_NAME));
  });
}

/** 残した記録を新しい順に読む。読めない値は外す。 */
export async function loadSaved(): Promise<SavedRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(newestFirst(recordsFromStore(request.result as unknown[])));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 1 件を残す。上限（`MAX_SAVED_RECORDS`）を超えたら、同じ取引の中で、いちばん古い記録から消す。
 * 数えるのは読める記録だけ（読めない値は一覧に出ないので、数にも入れない）。
 */
export function saveRecord(record: SavedRecord): Promise<void> {
  return write((store) => {
    store.put(record);
    const all = store.getAll();
    all.onsuccess = () => {
      for (const id of evictedIds(recordsFromStore(all.result as unknown[]))) store.delete(id);
    };
  });
}

/** 1 件を消す。 */
export function deleteSaved(id: string): Promise<void> {
  return write((store) => {
    store.delete(id);
  });
}

/**
 * 読める記録をすべて消す。**読めない記録（新しい版・壊れた値）は消さない**（一覧に出ない記録を、
 * 利用者が見ないまま消さない。後の版が読めるかもしれない・B7）。
 */
export function clearSaved(): Promise<void> {
  return write((store) => {
    const all = store.getAll();
    all.onsuccess = () => {
      for (const record of recordsFromStore(all.result as unknown[])) store.delete(record.id);
    };
  });
}
