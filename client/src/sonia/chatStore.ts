/* Conversations avec Sonia : gardées sur l'appareil (IndexedDB) et, pour une personne connectée, synchronisées
   avec le serveur pour les retrouver sur tous ses appareils. Elles sont privées : jamais partagées avec l'équipe.
   - Chaque message a un identifiant unique (uid), sa date de création (at) et de dernière modification (t).
   - Fusion entre appareils : union par uid, la version la plus récente de chaque message gagne.
   - Effacement : seule la personne le décide ; la date d'effacement (clearedAt) le propage à tous ses appareils.
   - Les images jointes et les fichiers du bilan restent sur l'appareil d'origine (trop lourds) : ailleurs, le bilan se recrée en un clic. */

import { api } from '../cloud/neon';
import { load, save } from '../offline/storage';

export interface ChatMsgBase { uid: string; at: number; t?: number; images?: string[]; downloads?: { format: string; file?: unknown; name?: string; error?: string }[] }
export interface StoredChat<M> { messages: M[]; clearedAt: number; /** Modifications pas encore envoyées au serveur. */ dirty: boolean }

export const GREETING_UID = 'accueil';
export const newUid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const chatKey = (eventId: string) => `sonia-chat:${eventId}`;

/** Lecture sur l'appareil (accepte l'ancien format : simple liste de messages). */
export async function loadLocal<M extends ChatMsgBase>(eventId: string): Promise<StoredChat<M> | undefined> {
  const v = await load<StoredChat<M> | M[]>(chatKey(eventId)).catch(() => undefined);
  if (!v) return undefined;
  if (Array.isArray(v)) return { messages: v, clearedAt: 0, dirty: true };
  return v;
}
export const saveLocal = <M extends ChatMsgBase>(eventId: string, chat: StoredChat<M>) => save(chatKey(eventId), chat).catch(() => undefined);

/** Fusion de deux copies (même règle que le serveur). Les parties propres à l'appareil (images, fichiers) sont gardées. */
export function mergeChat<M extends ChatMsgBase>(local: M[], remote: M[], clearedAt: number): M[] {
  const mine = new Map(local.map((m) => [m.uid, m]));
  const byUid = new Map<string, M>();
  for (const m of [...local, ...remote]) {
    const prev = byUid.get(m.uid);
    if (!prev || (m.t ?? m.at) > (prev.t ?? prev.at)) byUid.set(m.uid, m);
  }
  return [...byUid.values()]
    .filter((m) => m.at === 0 || m.at > clearedAt)
    .sort((x, y) => x.at - y.at || (x.uid < y.uid ? -1 : 1))
    .map((m) => {
      const own = mine.get(m.uid);
      if (!own || own === m) return m;
      return {
        ...m,
        images: m.images ?? own.images,
        downloads: m.downloads?.map((d) => ({ ...d, file: d.file ?? own.downloads?.find((x) => x.format === d.format && x.file)?.file })),
      };
    });
}

/** Copie envoyée au serveur : sans images ni fichiers binaires. */
const forServer = <M extends ChatMsgBase>(m: M) => ({
  ...m,
  images: undefined,
  downloads: m.downloads?.map(({ format, name, error }) => ({ format, name, error })),
});

export async function pullRemote<M extends ChatMsgBase>(eventId: string) {
  return api<{ messages: M[]; clearedAt: number }>(`/v1/sonia/${encodeURIComponent(eventId)}`);
}

/** Envoie la copie de l'appareil ; le serveur renvoie la conversation fusionnée. */
export async function pushRemote<M extends ChatMsgBase>(eventId: string, messages: M[], clearedAt: number) {
  return api<{ messages: M[]; clearedAt: number }>(`/v1/sonia/${encodeURIComponent(eventId)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: messages.map(forServer), clearedAt }),
  });
}
