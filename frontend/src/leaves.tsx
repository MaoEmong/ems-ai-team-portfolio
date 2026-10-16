import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, send } from "./api";
import { ErrorNotice, Field, Modal, fieldErrors, useResource } from "./ui";
import type { Page } from "./types";
import type {
  LeaveAction,
  LeaveBalance,
  LeaveItem,
  AttendanceDay,
} from "./types-phase3a";
import {
  leaveStatusLabels,
  leaveTypeLabels,
  refreshWork,
} from "./types-phase3a";
import { useAuth } from "./auth";
import { formatSeoul } from "./phase2-utils";
import { EmployeeIdentity } from "./attendance";
const policy =
  "연차는 포트폴리오용으로 단순화한 데모 규칙으로 계산합니다. 법정 기준 충족 여부는 검증하지 않았습니다.";
export function BalanceCard({ balance }: { balance: LeaveBalance }) {
  return (
    <section className="panel">
      <h2>잔여 연차</h2>
      <p className="muted">
        산정 기간 {balance.periodStart} ~ {balance.periodEnd} (종료일 포함)
      </p>
      <dl className="kpi-grid">
        {(
          [
            ["사용 가능", balance.available],
            ["부여", balance.granted],
            ["사용", balance.used],
            ["예약", balance.reserved],
          ] as const
        ).map(([label, value]) => (
          <div className={`kpi ${label === "사용 가능" ? "balance-available" : ""}`} key={label}>
            <dt>{label}</dt>
            <dd>
              {value}
              <small>일</small>
            </dd>
            <small className="muted">{label === "사용 가능" ? "부여 − 사용 − 예약" : label === "사용" ? "승인된 미래 휴가 포함" : label === "예약" ? "결재 대기 중" : "현재 기간 발생분"}</small>
          </div>
        ))}
      </dl>
      <p className="muted">
        승인된 미래 휴가도 사용에 포함됩니다. 병가는 연차를 차감하지 않습니다.
      </p>
      {!balance.approverAvailable && (
        <p className="notice info">
          승인 가능한 다른 관리자가 없습니다. 신청은 가능하며 승인 대기로
          남습니다.
        </p>
      )}
      <p className="muted">{policy}</p>
    </section>
  );
}
export function validateLeave(form: {
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  const e: Record<string, string> = {};
  if (!form.startDate) e.startDate = "시작일을 입력하세요.";
  if (!form.endDate || form.endDate < form.startDate)
    e.endDate = "종료일은 시작일 이상이어야 합니다.";
  if (form.type.startsWith("HALF_") && form.startDate !== form.endDate)
    e.endDate = "반차는 같은 날짜로 신청하세요.";
  if (!form.reason.trim() || form.reason.length > 200)
    e.reason = "사유를 1~200자로 입력하세요.";
  return e;
}
function LeaveForm({
  onSaved,
  onConflict,
}: {
  onSaved: (id: number) => void;
  onConflict: () => void;
}) {
  const today = useResource<AttendanceDay>("/attendance/me/today");
  const [form, setForm] = useState({
    type: "ANNUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found = validateLeave(form);
    setErrors(found);
    setError(undefined);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const item = await send<LeaveItem>("/leaves", "POST", {
        ...form,
        reason: form.reason.trim(),
      });
      refreshWork();
      onSaved(item.id);
    } catch (e) {
      setError(e);
      setErrors(fieldErrors(e));
      if (e instanceof ApiError && e.status === 409) onConflict();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-gap">
      <h2>휴가 신청</h2>
      <p className="muted">
        현재 산정 기간 안에서 신청하세요. 가능 날짜와 차감 일수는 서버가
        확인합니다.
      </p>
      <form noValidate onSubmit={submit}>
        <ErrorNotice error={error} />
        <Field name="leaveType" label="휴가 종류">
          <select
            id="leaveType"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          >
            {Object.entries(leaveTypeLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted">{form.type === "SICK" ? "병가는 연차를 차감하지 않습니다." : form.type === "HALF_AM" ? "오전 반차는 출근 기준 14:00, 0.5일입니다." : form.type === "HALF_PM" ? "오후 반차는 퇴근 기준 14:00, 0.5일입니다." : "연차는 주말을 제외한 근무일을 차감합니다."}</p>
        <div className="form-grid">
          {(["startDate", "endDate"] as const).map((k) => (
            <Field
              key={k}
              name={k}
              label={k === "startDate" ? "시작일 *" : "종료일 *"}
              error={errors[k]}
            >
              <input
                id={k}
                type="date"
                min={k === "startDate" ? today.data?.date : form.startDate || today.data?.date}
                value={form[k]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [k]: e.target.value }))
                }
              />
            </Field>
          ))}
        </div>
        <Field name="leaveReason" label="신청 사유 *" error={errors.reason}>
          <textarea
            id="leaveReason"
            maxLength={200}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </Field>
        <p className="muted">
          {form.reason.length} / 200자 · 사유는 알림 미리보기에 포함되지
          않습니다.
        </p>
        <button className="primary" disabled={busy}>
          {busy ? "신청 중…" : "휴가 신청하기"}
        </button>
      </form>
    </section>
  );
}
export function Leaves({ admin = false }: { admin?: boolean }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(admin ? "PENDING" : "");
  const [employeeId, setEmployeeId] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const balance = useResource<LeaveBalance>("/leaves/me/balance");
  const q = new URLSearchParams({ page: String(page), size: "20" });
  if (status) q.set("status", status);
  if (admin && employeeId) q.set("employeeId", employeeId);
  const list = useResource<Page<LeaveItem>>(
    `${admin ? "/leaves" : "/leaves/me"}?${q}`,
  );
  function refresh() {
    balance.reload();
    list.reload();
    setRevision((r) => r + 1);
    refreshWork();
  }
  return (
    <>
      <div className="title-row">
        <div>
          <h1>{admin ? "휴가 결재" : "내 휴가"}</h1>
          <p className="muted">
            {admin
              ? "상세에서 신청 내용을 확인하고 처리하세요. 본인 신청은 승인·반려할 수 없습니다."
              : "신청 상태와 잔여 연차를 확인하세요."}
          </p>
        </div>
        <button onClick={refresh}>새로고침</button>
      </div>
      {!admin && (
        <>
          <ErrorNotice error={balance.error} />
          {balance.error && (
            <button onClick={balance.reload}>잔액 다시 조회</button>
          )}
          {balance.loading && <p role="status">잔액을 불러오는 중…</p>}
          {balance.data && <BalanceCard balance={balance.data} />}
          <LeaveForm
            onConflict={refresh}
            onSaved={(id) => {
              refresh();
              navigate(`/leaves/${id}`);
            }}
          />
        </>
      )}
      <section className="panel section-gap" data-revision={revision}>
        <h2>{admin ? "결재 목록" : "내 신청 목록"}</h2>
        <div className="form-grid">
          <Field name="leaveStatus" label="신청 상태">
            <select
              id="leaveStatus"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="">전체 상태</option>
              {Object.entries(leaveStatusLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {admin && (
            <Field name="leaveEmployeeId" label="사원 ID 필터">
              <input
                id="leaveEmployeeId"
                type="number"
                min="1"
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
          )}
        </div>
        <ErrorNotice error={list.error} />
        {admin && employeeId && <EmployeeIdentity id={employeeId}/>}
        {list.error && <button onClick={list.reload}>다시 시도</button>}
        {list.loading ? (
          <p role="status">신청 목록을 불러오는 중…</p>
        ) : (
          list.data && (
            <>
              {!list.data.content.length ? (
                <p className="empty">{!status && page === 0 ? "아직 휴가 신청이 없습니다." : "조건에 맞는 휴가 신청이 없습니다."}</p>
              ) : (
                <div className="table-wrap">
                  <table className="responsive-table">
                    <caption>
                      {admin ? "관리자 결재" : "내 휴가 신청"} · 최신순
                    </caption>
                    <thead>
                      <tr>
                        {["신청자", "종류", "기간", "일수", "상태", "상세"].map(
                          (t) => (
                            <th key={t}>{t}</th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {list.data.content.map((item) => (
                        <tr key={item.id}>
                          <td data-label="신청자">{item.employee.name} ({item.employee.employeeNo})</td>
                          <td data-label="종류">
                            {leaveTypeLabels[item.type]}
                          </td>
                          <td data-label="기간">
                            <span>
                              {item.startDate} ~ {item.endDate}
                            </span>
                          </td>
                          <td data-label="일수">{item.days}일</td>
                          <td data-label="상태">
                            <LeaveStatus status={item.status}/>
                          </td>
                          <td data-label="상세">
                            <Link
                              to={`/leaves/${item.id}`}
                              aria-label={`신청 ${item.id} 상세`}
                            >
                              상세 보기
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="pagination">
                <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                  이전
                </button>
                <span>
                  {page + 1} / {Math.max(1, list.data.totalPages)}
                </span>
                <button
                  disabled={page + 1 >= list.data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  다음
                </button>
              </div>
            </>
          )
        )}
      </section>
    </>
  );
}
const actionLabels: Record<LeaveAction, string> = {
  APPROVE: "승인",
  REJECT: "반려",
  CANCEL: "신청 취소",
};
function LeaveStatus({status}: {status: LeaveItem["status"]}) { return <span className={`badge ${status === "PENDING" ? "badge--warning" : status === "APPROVED" ? "badge--success" : status === "REJECTED" ? "badge--danger" : ""}`}>{status === "PENDING" ? "결재 대기" : leaveStatusLabels[status]}</span>; }
export function LeaveDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const detail = useResource<LeaveItem>(`/leaves/${id}`);
  const [refreshKey, setRefreshKey] = useState(0);
  const [action, setAction] = useState<LeaveAction>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>();
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function process() {
    if (!action || busy) return;
    if (action === "REJECT" && (!reason.trim() || reason.length > 200)) {
      setReasonError("반려 사유를 1~200자로 입력하세요.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await send(
        `/leaves/${id}/${action.toLowerCase()}`,
        "POST",
        action === "REJECT" ? { reason: reason.trim() } : undefined,
      );
      setAction(undefined);
      setMessage(`${actionLabels[action]} 처리했습니다.`);
      detail.reload();
      setRefreshKey((k) => k + 1);
      refreshWork();
    } catch (e) {
      setError(e);
      setReasonError(fieldErrors(e).reason || "");
      if (e instanceof ApiError && [403, 409].includes(e.status)) {
        if (e.body.code !== "LEAVE_START_PASSED") setAction(undefined);
        detail.reload();
        setRefreshKey((k) => k + 1);
        refreshWork();
        setMessage("신청과 잔액을 다시 조회했습니다. 최신 상태를 확인하세요.");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="title-row">
        <h1>휴가 신청 상세</h1>
        <Link
          className="button"
          to={user?.role === "ADMIN" ? "/admin/leaves" : "/my/leaves"}
        >
          목록으로
        </Link>
      </div>
      <ErrorNotice error={detail.error || error} />
      {detail.error instanceof ApiError &&
      [403, 404].includes(detail.error.status) ? (
        <section className="panel">
          <h2>
            {detail.error.status === 403
              ? "권한이 없습니다"
              : "신청을 찾을 수 없습니다"}
          </h2>
          <Link to="/my/leaves">내 휴가로 이동</Link>
        </section>
      ) : detail.loading ? (
        <p role="status">신청을 불러오는 중…</p>
      ) : (
        detail.data && (
          <>
            <section className="panel">
              <h2>
                {detail.data.employee.name} ({detail.data.employee.employeeNo}) ·{" "}
                {leaveTypeLabels[detail.data.type]}
              </h2>
              <LeaveStatus status={detail.data.status}/>
              <dl className="details section-gap">
                <div>
                  <dt>기간</dt>
                  <dd>
                    {detail.data.startDate} ~ {detail.data.endDate}
                  </dd>
                </div>
                <div>
                  <dt>일수</dt>
                  <dd>{detail.data.days}일</dd>
                </div>
                <div>
                  <dt>결정자</dt>
                  <dd>{detail.data.decidedBy?.name || "해당 없음"}</dd>
                </div>
                <div>
                  <dt>결정 시각</dt>
                  <dd>{detail.data.decidedAt ? <time dateTime={detail.data.decidedAt}>{formatSeoul(detail.data.decidedAt).slice(0,16)} (KST)</time> : "아직 처리되지 않았습니다"}</dd>
                </div>
                <div>
                  <dt>취소 주체</dt>
                  <dd>
                    {detail.data.cancelledBy === "SELF"
                      ? "본인"
                      : detail.data.cancelledBy === "SYSTEM"
                        ? "시스템"
                        : "해당 없음"}
                  </dd>
                </div>
              </dl>
              <h3 className="section-gap">신청 사유</h3>
              <p className="wrap">{detail.data.reason}</p>
              {detail.data.rejectReason && (
                <>
                  <h3>반려 사유</h3>
                  <p className="wrap">{detail.data.rejectReason}</p>
                </>
              )}
              <div className="actions">
                {detail.data.status === "PENDING" && detail.data.allowedActions.length === 1 && detail.data.allowedActions.includes("REJECT") && <p className="notice info">시작일이 지나 승인할 수 없습니다. 반려만 가능합니다.</p>}
                {detail.data.allowedActions.map((a) => (
                  <button
                    key={a}
                    className={
                      a === "APPROVE"
                        ? "primary"
                        : a === "REJECT"
                          ? "danger"
                          : a === "CANCEL" ? "danger"
                          : ""
                    }
                    onClick={() => {
                      setAction(a);
                      setReason("");
                      setReasonError("");
                      setError(undefined);
                    }}
                  >
                    {actionLabels[a]}
                  </button>
                ))}
              </div>
              {!detail.data.allowedActions.length && (
                <p className="muted">현재 처리할 수 있는 동작이 없습니다.</p>
              )}
              {message && (
                <p className="notice success" role="status">
                  {message}
                </p>
              )}
            </section>
            <DetailBalance
              key={`${id}:${refreshKey}`}
              employeeId={detail.data.employee.id}
              own={detail.data.employee.id === user?.id}
            />
          </>
        )
      )}
      {detail.error &&
        !(
          detail.error instanceof ApiError &&
          [403, 404].includes(detail.error.status)
        ) && <button onClick={detail.reload}>다시 시도</button>}
      {action && (
        <Modal
          titleId="leave-action-title"
          busy={busy}
          onClose={() => setAction(undefined)}
        >
          <h2 id="leave-action-title">{actionLabels[action]} 확인</h2>
          {detail.data && <p className="readonly-block">{detail.data.employee.name} ({detail.data.employee.employeeNo}) · {leaveTypeLabels[detail.data.type]} · {detail.data.startDate} ~ {detail.data.endDate} · {detail.data.days}일</p>}
          <p>최신 신청 상태와 잔액은 서버에서 다시 확인합니다.</p>
          <ErrorNotice error={error} />
          {action === "REJECT" && (
            <Field name="rejectReason" label="반려 사유 *" error={reasonError}>
              <textarea
                id="rejectReason"
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          {action === "REJECT" && <p className="muted">{reason.length} / 200자 · 반려 사유는 신청자가 상세 화면에서 봅니다. 알림에는 포함되지 않습니다.</p>}
          <div className="actions">
            <button disabled={busy} onClick={() => setAction(undefined)}>
              닫기
            </button>
            <button className={action === "REJECT" || action === "CANCEL" ? "danger-solid" : "primary"} disabled={busy} onClick={process}>
              {busy ? "처리 중…" : `${actionLabels[action]} 확정`}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function DetailBalance({
  employeeId,
  own,
}: {
  employeeId: number;
  own: boolean;
}) {
  const result = useResource<LeaveBalance>(
    own ? "/leaves/me/balance" : `/employees/${employeeId}/leave-balance`,
  );
  return (
    <div className="section-gap">
      <ErrorNotice error={result.error} />
      {result.data && <BalanceCard balance={result.data} />}
    </div>
  );
}
