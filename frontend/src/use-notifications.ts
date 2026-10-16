import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./api";
import type { Page } from "./types";
import type { AppNotification } from "./types-phase3a";
interface Snapshot {
  owner: number | null;
  items: AppNotification[];
  count: number;
  loading: boolean;
  error?: unknown;
  message?: string;
}
const empty = (owner: number | null): Snapshot => ({
  owner,
  items: [],
  count: 0,
  loading: false,
});
/** Each effect owns its requests; cleanup invalidates even transports that ignore abort. */
export function useNotifications(owner: number | null) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(owner));
  const refreshRef = useRef<() => void>(() => {});
  const actions = useRef<{
    owner: number | null;
    read: (id: number) => Promise<void>;
    readAll: (id: number) => Promise<void>;
  } | null>(null);
  useEffect(() => {
    let live = true,
      version = 0;
    const controller = new AbortController();
    setSnapshot(empty(owner));
    if (owner === null) {
      refreshRef.current = () => {};
      actions.current = null;
      return () => {
        live = false;
        controller.abort();
      };
    }
    async function refresh() {
      if (!live || document.visibilityState === "hidden") return;
      const current = ++version;
      setSnapshot((s) => ({ ...s, loading: true }));
      try {
        const [list, unread] = await Promise.all([
          request<Page<AppNotification>>("/notifications/me?page=0&size=20", {
            signal: controller.signal,
          }),
          request<{ count: number }>("/notifications/me/unread-count", {
            signal: controller.signal,
          }),
        ]);
        if (live && current === version)
          setSnapshot({
            owner,
            items: list.content,
            count: unread.count,
            loading: false,
          });
      } catch (error) {
        if (live && current === version)
          setSnapshot((s) => ({ ...s, error, loading: false }));
      }
    }
    async function mutate(path: string, body?: unknown) {
      try {
        const result = await request<{ updatedCount: number } | undefined>(path, {
          method: "POST",
          signal: controller.signal,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (live) {
          await refresh();
          if (live) setSnapshot(s => ({ ...s, message: result ? `알림 ${result.updatedCount}건을 읽음 처리했습니다.` : "알림을 읽음 처리했습니다." }));
        }
      } catch (error) {
        if (live) setSnapshot((s) => ({ ...s, error }));
      }
    }
    refreshRef.current = refresh;
    actions.current = {
      owner,
      read: (id) => mutate(`/notifications/${id}/read`),
      readAll: (id) => mutate("/notifications/me/read-all", { upToId: id }),
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("ems:work-updated", refresh);
    return () => {
      live = false;
      ++version;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("ems:work-updated", refresh);
      actions.current = null;
      refreshRef.current = () => {};
    };
  }, [owner]);
  const read = useCallback(
    (id: number) =>
      actions.current?.owner === owner
        ? actions.current.read(id)
        : Promise.resolve(),
    [owner],
  );
  const readAll = useCallback(
    (upToId: number) =>
      actions.current?.owner === owner
        ? actions.current.readAll(upToId)
        : Promise.resolve(),
    [owner],
  );
  return {
    ...(snapshot.owner === owner ? snapshot : empty(owner)),
    read,
    readAll,
    refresh: () => refreshRef.current(),
  };
}
