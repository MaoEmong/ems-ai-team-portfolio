import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, request } from "./api";
export function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    request<T>(path)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return {
    data,
    error: error as Error | undefined,
    loading,
    reload: () => setRevision((n) => n + 1),
  };
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? (error.status === 403 ? "권한이 없습니다. " : "") + error.message
      : error instanceof Error
        ? error.message
        : "요청을 처리하지 못했습니다.";
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}
export function Field({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {children}
      {error && (
        <small id={`${name}-error`} role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError
    ? Object.fromEntries(
        (error.body.fieldErrors || []).map((e) => [e.field, e.reason]),
      )
    : {};
}
export const statusLabels = {
  ACTIVE: "재직",
  ON_LEAVE: "휴직",
  RETIRED: "퇴사",
};
export function Modal({
  titleId,
  onClose,
  busy,
  children,
}: {
  titleId: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    const focusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      );
    (focusable()[0] || node).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        close.current();
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (!first) {
          event.preventDefault();
          node.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    node.addEventListener("keydown", keydown);
    return () => {
      node.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [busy]);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
