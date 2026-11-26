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
  /** 動いている要求がすべて片付くまで待つ（時間の長さでなく、未了の通知の数で待つ） */
  idle: () => Promise<void>;
}

export function installFakeIndexedDb(): FakeIndexedDb {
  let inflight = 0;
  /** 未了の数を数えながら、次の周に処理を回す */
  const later = (run: () => void): void => {
    inflight += 1;
    setTimeout(() => {
      try {
        run();
      } finally {
        inflight -= 1;
      }
    }, 0);
  };
  const fake: FakeIndexedDb = {
    stores: new Map(),
    opened: [],
    idle: async () => {
      // 1 周ごとに、続きの要求が足されていないかを見る（未了が 0 になった周で終える）
      do {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      } while (inflight > 0);
    },
  };

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
          later(() => {
            req.onsuccess?.();
            pending -= 1;
            // 取引は、要求の通知がすべて終わった次の周で確定する（通知の中で足された要求を待つ）
            later(() => {
              if (pending === 0) {
                const done = tx.oncomplete;
                tx.oncomplete = null;
                done?.();
              }
            });
          });
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
      later(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  });
  return fake;
}
