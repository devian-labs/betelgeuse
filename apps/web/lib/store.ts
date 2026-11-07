/**
 * What this browser keeps of a workspace, so it opens instantly, works through a dropped connection
 * and never loses an edit to a closed tab. It's a cache of the repository plus edits not pushed yet;
 * signing out deletes it.
 */
export type StoreName = "meta" | "blobs" | "work" | "local";
const STORES: StoreName[] = ["meta", "blobs", "work", "local"];

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  all<T>(store: StoreName): Promise<[string, T][]>;
}

export class MemoryKV implements KV {
  private data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  async get<T>(store: StoreName, key: string) {
    return this.data.get(store)!.get(key) as T | undefined;
  }
  async put(store: StoreName, key: string, value: unknown) {
    this.data.get(store)!.set(key, value);
  }
  async del(store: StoreName, key: string) {
    this.data.get(store)!.delete(key);
  }
  async all<T>(store: StoreName) {
    return [...this.data.get(store)!.entries()] as [string, T][];
  }
}

const done = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export const DB_PREFIX = "betelgeuse:";

export class IdbKV implements KV {
  private db: Promise<IDBDatabase>;
  constructor(name: string) {
    this.db = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_PREFIX + name, 1);
      open.onupgradeneeded = () => STORES.forEach((s) => open.result.createObjectStore(s));
      open.onsuccess = () => {
        // Sign-out in another tab deletes this database: let it.
        open.result.onversionchange = () => open.result.close();
        resolve(open.result);
      };
      open.onerror = () => reject(open.error);
    });
  }
  private async os(store: StoreName, mode: IDBTransactionMode) {
    return (await this.db).transaction(store, mode).objectStore(store);
  }
  async get<T>(store: StoreName, key: string) {
    return (await done((await this.os(store, "readonly")).get(key))) as T | undefined;
  }
  async put(store: StoreName, key: string, value: unknown) {
    await done((await this.os(store, "readwrite")).put(value, key));
  }
  async del(store: StoreName, key: string) {
    await done((await this.os(store, "readwrite")).delete(key));
  }
  async all<T>(store: StoreName) {
    const os = await this.os(store, "readonly");
    const [keys, values] = await Promise.all([done(os.getAllKeys()), done(os.getAll())]);
    return keys.map((k, i) => [String(k), values[i] as T] as [string, T]);
  }
}

/** Deletes everything this browser keeps for every workspace. */
export async function deleteAllLocalData() {
  const dbs = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    dbs
      .filter((d) => d.name?.startsWith(DB_PREFIX))
      .map((d) => new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase(d.name!);
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
      })),
  );
}
