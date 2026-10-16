import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { useNotifications } from "./use-notifications";
import { ErrorNotice, Modal } from "./ui";
import { formatSeoul } from "./phase2-utils";
export function NotificationBell() {
  const { user } = useAuth();
  const n = useNotifications(user?.id ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function read(id: number, all = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (all) await n.readAll(id);
      else await n.read(id);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="notification-control">
      <button
        aria-label={`알림 ${n.count}개 미읽음`}
        onClick={() => {
          setOpen(true);
          n.refresh();
        }}
      >
        <span aria-hidden="true">🔔 </span>알림 <strong>{n.count}</strong>
      </button>
      {open && (
        <Modal
          titleId="notifications-title"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <div className="notification-title title-row">
            <h2 id="notifications-title">내 알림</h2>
            <button disabled={busy} onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
          <p className="muted">
            최근 알림(최대 20건) · 미읽음 {n.count}건. 화면이 보이는 동안 30초마다
            갱신합니다.
          </p>
          <ErrorNotice error={n.error} />
          {n.message && <p role="status" className="notice success">{n.message}</p>}
          {!!n.error && <button onClick={n.refresh}>다시 시도</button>}
          <button
            disabled={busy || !n.items.length}
            onClick={() => read(Math.max(...n.items.map((i) => i.id)), true)}
          >
            모두 읽음
          </button>
          <p className="muted">
            지금 표시된 알림과 그 이전 알림을 읽음 처리합니다. 이후 도착한 새
            알림은 유지됩니다.
          </p>
          {n.loading && <p role="status">알림을 불러오는 중…</p>}
          {!n.loading && !n.items.length && (
            <p className="empty">도착한 알림이 없습니다.</p>
          )}
          <ul className="notification-list">
            {n.items.map((item) => (
              <li key={item.id}>
                <span className="badge">{item.read ? "읽음" : "미읽음"}</span>
                <p>{item.message}</p>
                <small className="muted"><time dateTime={item.createdAt}>{formatSeoul(item.createdAt).slice(0,16)} (KST)</time></small>
                <div className="actions">
                  <Link
                    to={
                      item.targetType === "LEAVE"
                        ? `/leaves/${item.targetId}`
                        : `/my/attendance?month=${item.targetDate?.slice(0, 7) || ""}`
                    }
                    onClick={() => setOpen(false)}
                  >
                    내용 보기
                  </Link>
                  {!item.read && (
                    <button disabled={busy} onClick={() => read(item.id)}>
                      읽음 처리
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}


