"use client";

import { useEffect } from "react";
import { SWRConfig, type Cache } from "swr";

/**
 * SWR 缓存持久化：
 * - 服务器/私聊等小体量列表写入 localStorage，F5 刷新后秒出（stale-while-revalidate）
 * - 大体量数据（消息）走独立的 IndexedDB 消息库，不经过 SWR
 * - 水合必须同步（SWR provider 约束），localStorage 恰好满足；体积守护防配额爆炸
 */

const STORAGE_KEY = "coachat:swr:v1";
const MAX_TOTAL_BYTES = 400_000;
const MAX_ENTRY_BYTES = 100_000;

const memory = new Map<string, unknown>();
let hydrated = false;
let persistTimer: number | null = null;

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Array<[string, unknown]>;
    for (const [key, value] of entries) memory.set(key, value);
  } catch {
    /* 缓存损坏则忽略 */
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    let total = 0;
    const out: Array<[string, unknown]> = [];
    for (const [key, value] of memory) {
      const size = JSON.stringify(value).length;
      if (size > MAX_ENTRY_BYTES) continue;
      total += size;
      if (total > MAX_TOTAL_BYTES) break;
      out.push([key, value]);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* 配额超限则放弃 */
  }
}

function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    persist();
  }, 1000);
}

export function SwrPersistProvider({ children }: { children: React.ReactNode }) {
  // 页面隐藏/关闭时兜底落盘
  useEffect(() => {
    const onHide = () => {
      hydrate();
      persist();
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return (
    <SWRConfig
      value={{
        keepPreviousData: true,
        provider: (): Cache => {
          hydrate();
          // SWR 内部 State 结构对本层透明（只做存取转发 + 持久化钩子）
          const cache = {
            keys: () => memory.keys(),
            get: (key: string) => memory.get(key),
            set: (key: string, value: unknown) => {
              memory.set(key, value);
              schedulePersist();
            },
            delete: (key: string) => {
              memory.delete(key);
              schedulePersist();
            },
          };
          return cache as unknown as Cache;
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
