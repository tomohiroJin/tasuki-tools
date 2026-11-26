/**
 * `indexedDB` の最小の代役（依存の fake-indexeddb は足さない）。`saved-store.ts` が触る分だけ:
 * open・onupgradeneeded・createObjectStore・取引・put・getAll・delete・clear・取引の完了。
 * データは `stores` に残るので、テストは「端末に残っているもの」を直接見たり、壊れた値を仕込んだりできる。
 */
import { vi } from 'vitest';

type Handler = (() => void) | null;

interface FakeRequest<T> {
  result: T;
  error: null;
  onsuccess: Handler;
  onerror: Handler;
}

export interface FakeIndexedDb {
  /** ストア名 → (キー → 値)。 */
  stores: Map<string, Map<string, unknown>>;
  /** 開いた回数 */
  opened: { name: string; version: number }[];
}

export function installFakeIndexedDb(): FakeIndexedDb {
  const fake: FakeIndexedDb = { stores: new Map(), opened: [] };

  const makeTx = (storeName: string) => {
    let pending = 0;
    const tx = {
      oncomplete: null as Handler,
      onerror: null as Handler,
      onabort: null as Handler,
      error: null,
      objectStore: () => {
        const data = fake.stores.get(storeName)!;
        const request = <T>(run: () => T): FakeRequest<T> => {
          const req: FakeRequest<T> = { result: undefined as T, error: null, onsuccess: null, onerror: null };
          pending += 1;
          req.result = run();
          setTimeout(() => {
            req.onsuccess?.();
            pending -= 1;
            // 取引は、要求の通知がすべて終わった次の周で確定する（通知の中で足された要求を待つ）
            setTimeout(() => {
              if (pending === 0) {
                const done = tx.oncomplete;
                tx.oncomplete = null;
                done?.();
              }
            }, 0);
          }, 0);
          return req;
        };
        return {
          put: (value: { id: string }) => request(() => void data.set(value.id, structuredClone(value))),
          getAll: () => request(() => [...data.values()].map((value) => structuredClone(value))),
          delete: (key: string) => request(() => void data.delete(key)),
          clear: () => request(() => void data.clear()),
        };
      },
    };
    return tx;
  };

  const db = {
    objectStoreNames: { contains: (name: string) => fake.stores.has(name) },
    createObjectStore: (name: string) => {
      fake.stores.set(name, new Map());
    },
    transaction: (name: string) => makeTx(name),
    close: () => {},
  };

  vi.stubGlobal('indexedDB', {
    open: (name: string, version: number) => {
      fake.opened.push({ name, version });
      const request: FakeRequest<typeof db> & { onupgradeneeded: Handler } = {
        result: db,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      setTimeout(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  });
  return fake;
}
