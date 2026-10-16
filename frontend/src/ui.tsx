import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
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
  const workErrors: Record<string, string> = {
    LEAVE_START_PASSED: "시작일이 지나 승인하거나 이미 시작한 승인 휴가를 취소할 수 없습니다. 최신 상태를 다시 확인하세요.",
    LEAVE_ALREADY_PROCESSED: "이미 처리된 신청입니다. 최신 상태를 다시 확인하세요.",
    INSUFFICIENT_LEAVE_BALANCE: "사용 가능한 연차가 부족합니다. 잔액을 다시 확인하세요.",
    LEAVE_OVERLAP: "같은 시간에 대기 중이거나 승인된 휴가가 있습니다.",
    LEAVE_PERIOD_BOUNDARY: "현재 연차 산정 기간 안에서 나누어 신청하세요.",
    LEAVE_RECORDS_EXIST: "휴가 신청 이력이 있어 입사일을 변경할 수 없습니다.",
    EMPLOYEE_NOT_ACTIVE: "휴직 상태이거나 입사일 전인 사원은 출퇴근·휴가 신청을 사용할 수 없습니다.",
    NOT_A_WORKDAY: "주말에는 출퇴근 기록이나 근태 정정을 할 수 없습니다.",
    ON_LEAVE_DAY: "승인된 종일 휴가일에는 출근할 수 없습니다.",
    ALREADY_CHECKED_IN: "이미 출근 기록이 있습니다.",
    NOT_CHECKED_IN: "출근 기록이 없어 퇴근을 기록할 수 없습니다.",
    ALREADY_CHECKED_OUT: "이미 퇴근 기록이 있습니다.",
  };
  const message =
    error instanceof ApiError
      ? (error.status === 403 ? "권한이 없습니다. " : "") + error.message
      : error instanceof Error
        ? error.message
        : "요청을 처리하지 못했습니다.";
  return (
    <div className="error" role="alert">
      {message}
      {error instanceof ApiError && workErrors[error.body.code] && <p>{workErrors[error.body.code]}</p>}
      {error instanceof ApiError &&
        ["DEPARTMENT_IN_USE", "POSITION_IN_USE"].includes(error.body.code) && (
          <p>
            현재 소속 사원(퇴사자 포함) 또는 과거 발령 이력에서 참조하고 있어
            삭제할 수 없습니다.
          </p>
        )}
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
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            "aria-invalid": !!error,
            "aria-describedby": error ? `${name}-error` : undefined,
          })
        : children}
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
export function FormErrors({ errors }: { errors: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const keys = Object.keys(errors);
  const signature = JSON.stringify(errors);
  useEffect(() => {
    if (signature !== "{}") ref.current?.focus();
  }, [signature]);
  if (!keys.length) return null;
  return (
    <div className="error" ref={ref} tabIndex={-1}>
      <strong>입력값 {keys.length}곳을 확인하세요.</strong>
      <ul>
        {keys.map((key) => (
          <li key={key}>
            <a
              href={`#${key}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(key)?.focus();
              }}
            >
              {errors[key]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
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
