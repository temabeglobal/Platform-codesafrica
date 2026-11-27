/* Enregistrement des données sur l'appareil (IndexedDB), pour que la plateforme fonctionne sans internet
   et que rien ne se perde au rechargement de la page.
   Chaque environnement (local, test, production) a sa propre adresse, donc son propre stockage : ils ne se mélangent pas.
   Plus tard, la base MongoDB sera synchronisée avec ces données quand la connexion revient. */

const DB = 'codes-africa-planning';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let db: Promise<IDBDatabase> | null = null;
const getDb = () => (db ??= open().catch((e) => { db = null; throw e; }));

export async function load<T>(key: string): Promise<T | undefined> {
  const d = await getDb();
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function save<T>(key: string, value: T): Promise<void> {
  const d = await getDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function remove(key: string): Promise<void> {
  const d = await getDb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Demande au navigateur de ne pas effacer ces données quand l'espace manque. */
export const askPersistence = () => navigator.storage?.persist?.().catch(() => false);
