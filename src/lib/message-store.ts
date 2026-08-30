"use client";

import { openDB, type IDBPDatabase } from "idb";
import { useCallback, useSyncExternalStore } from "react";
import { api } from "./client-api";
import type { ChatMessage } from "./types";

/**
 * 本地消息缓存层（现代聊天应用模型）：
 * - 内存 Map 是同步渲染源（useSyncExternalStore 快照必须同步）
 * - IndexedDB 是持久层：启动时异步水合（不覆盖内存中的新鲜数据）、写入防抖批量落盘
 * - 隐私模式 / IDB 不可用时自动降级为仅内存
 * - 按 id 去重合并：重连补拉、乐观替换、翻页合并都不会重复或产生缺口
 * - LRU：超过 200 个会话时裁剪最久未访问的
 */

type Entry = { messages: ChatMessage[]; hasMore: boolean; lastAccess: number };

const DB_NAME = "coachat";
const STORE_NAME = "messages";
const DB_VERSION = 1;
const MAX_SESSIONS = 200;
const PERSIST_DEBOUNCE_MS = 600;

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const dirty = new Set<string>();
const inflight = new Set<string>();

let dbPromise: Promise<IDBPDatabase> | null = null;
let hydrated = false;
let hydrating: Promise<void> | null = null;
let persistTimer: number | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    },
  });
  return dbPromise;
}

function notify(key: string): void {
  listeners.get(key)?.forEach((cb) => cb());
}

function hydrate(): Promise<void> {
  if (hydrated) return Promise.resolve();
  hydrating ??= (async () => {
    try {
      const db = await getDb();
      const [keys, values] = await Promise.all([
        db.getAllKeys(STORE_NAME),
        db.getAll(STORE_NAME),
      ]);
      keys.forEach((k, i) => {
        const v = values[i] as Entry | undefined;
        // 内存里已有（更新鲜）的条目不被持久层旧数据覆盖
        if (v && Array.isArray(v.messages) && !store.has(String(k))) {
          store.set(String(k), v);
        }
      });
      hydrated = true;
      for (const key of [...listeners.keys()]) notify(key);
    } catch {
      /* IDB 不可用：降级仅内存 */
    }
  })();
  return hydrating;
}

function setEntry(key: string, entry: Entry): void {
  entry.lastAccess = Date.now();
  store.set(key, entry);
  notify(key);
  dirty.add(key);
  schedulePersist();
}

async function persist(): Promise<void> {
  const keys = [...dirty];
  dirty.clear();
  if (keys.length === 0) return;
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    for (const key of keys) {
      const entry = store.get(key);
      if (entry) await tx.store.put(entry, key);
      else await tx.store.delete(key);
    }
    await tx.done;
  } catch {
    /* 落盘失败：保留内存副本 */
  }

  // LRU 裁剪：会话数超限时淘汰最久未访问的
  if (store.size > MAX_SESSIONS) {
    const overflow = [...store.entries()]
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
      .slice(0, store.size - MAX_SESSIONS);
    try {
      const db = await getDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      for (const [key] of overflow) {
        store.delete(key);
        listeners.delete(key);
        await tx.store.delete(key);
      }
      await tx.done;
    } catch {
      /* 内存已删，IDB 裁剪失败无碍 */
    }
  }
}

function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persist();
  }, PERSIST_DEBOUNCE_MS);
}

function mergeById(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const m of current) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** 合并写入（按 id 去重排序）；hasMore 传入时更新 */
export function putMessages(key: string, incoming: ChatMessage[], hasMore?: boolean): void {
  void hydrate();
  const cur = store.get(key) ?? { messages: [], hasMore: true, lastAccess: 0 };
  const messages = incoming.length ? mergeById(cur.messages, incoming) : cur.messages;
  setEntry(key, { messages, hasMore: hasMore ?? cur.hasMore, lastAccess: Date.now() });
}

/** 移除单条（乐观发送回滚） */
export function removeMessage(key: string, id: string): void {
  void hydrate();
  const cur = store.get(key);
  if (!cur) return;
  setEntry(key, {
    messages: cur.messages.filter((m) => m.id !== id),
    hasMore: cur.hasMore,
    lastAccess: Date.now(),
  });
}

/**
 * 移除指定作者的乐观占位（推送确认通常先于 HTTP 响应到达时清理，避免双显）。
 */
export function removePendingMatch(key: string, authorId: string, content: string): void {
  hydrate();
  const cur = store.get(key);
  if (!cur) return;
  const idx = cur.messages.findIndex(
    (m) => m.pending && m.author.id === authorId && m.content === content,
  );
  if (idx === -1) return;
  setEntry(key, {
    messages: cur.messages.filter((_, i) => i !== idx),
    hasMore: cur.hasMore,
    lastAccess: Date.now(),
  });
}

function getSnapshot(key: string): Entry | undefined {
  return store.get(key);
}

function subscribe(key: string, cb: () => void): () => void {
  void hydrate();
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

/** 订阅某会话的本地消息缓存（未水合/未缓存时返回 undefined） */
export function useMessageEntry(key: string | null): Entry | undefined {
  const getSnapshotCb = useCallback(() => (key ? getSnapshot(key) : undefined), [key]);
  const subscribeCb = useCallback(
    (cb: () => void) => (key ? subscribe(key, cb) : () => {}),
    [key],
  );
  return useSyncExternalStore(subscribeCb, getSnapshotCb, () => undefined);
}

/** 悬停预取：无缓存时提前拉取最新一页写入缓存（并发去重） */
export async function prefetchMessages(fetchUrl: string): Promise<void> {
  if (inflight.has(fetchUrl)) return;
  const existing = store.get(fetchUrl);
  if (existing && existing.messages.length > 0) return;
  inflight.add(fetchUrl);
  try {
    const data = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(fetchUrl);
    putMessages(fetchUrl, data.messages, data.hasMore);
  } catch {
    /* 预取失败静默，进入页面再拉 */
  } finally {
    inflight.delete(fetchUrl);
  }
}
