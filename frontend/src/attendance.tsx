import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, send } from "./api";
import { ErrorNotice, Field, Modal, fieldErrors, useResource } from "./ui";
import type { Employee } from "./types";
import type { AttendanceDay, AttendanceMonth } from "./types-phase3a";
import { leaveTypeLabels, refreshWork } from "./types-phase3a";
export function clockText(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";
}
const statuses = {
  NO_RECORD: "미기록",
  INCOMPLETE: "미완료",
  COMPLETE: "완료",
  LEAVE: "휴가",
};
export function AttendanceBadges({ day, today, card = false }: { day: AttendanceDay; today?: string; card?: boolean }) {
  const label = day.status === "NO_RECORD" && today ? (day.date > today ? "" : day.date === today ? "출근 전" : "미기록") : day.status === "INCOMPLETE" && day.date === today ? "근무 중" : day.status === "COMPLETE" ? (card ? "퇴근 완료" : day.late || day.earlyLeave ? "" : "정상") : statuses[day.status];
  return (
    <span className="actions">
      {label && <span className="badge">{label}</span>}
      {day.late && <span className="badge badge--warning">지각</span>}
      {day.earlyLeave && <span className="badge badge--warning">조퇴</span>}
      {day.corrected && <span className="badge">정정됨</span>}
    </span>
  );
}
function dateLabel(date: string) { return `${date} (${new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" }).format(new Date(`${date}T12:00:00+09:00`))})`; }
function basis(day: AttendanceDay) { return day.status === "LEAVE" ? "—" : `${day.expectedStart.slice(0,5)} ~ ${day.expectedEnd.slice(0,5)}`; }
export function EmployeeIdentity({ id }: { id: string }) {
  const employee = useResource<Employee>(`/employees/${id}`);
  return <div className="readonly-block"><ErrorNotice error={employee.error}/>{employee.loading ? "사원 정보를 불러오는 중…" : employee.data?.name ? <>선택한 사원: <strong>{employee.data.name} ({employee.data.employeeNo})</strong> · {employee.data.department?.name} · {employee.data.position?.name}</> : `사원 ID ${id}`}</div>;
}
export function validateCorrection(form: {
  checkIn: string;
  checkOut: string;
  reason: string;
}) {
  const errors: Record<string, string> = {};
  if (!form.checkIn) errors.checkIn = "출근 시각을 입력하세요.";
  if (!form.reason.trim() || form.reason.length > 200)
    errors.reason = "정정 사유를 1~200자로 입력하세요.";
  if (form.checkIn && form.checkOut && form.checkIn >= form.checkOut)
    errors.checkOut = "퇴근 시각은 출근 시각보다 늦어야 합니다.";
  return errors;
}
function Correction({
  employeeId,
  day,
  onClose,
  onSaved,
}: {
  employeeId: string;
  day: AttendanceDay;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    checkIn: day.checkIn ? clockText(day.checkIn) : "",
    checkOut: day.checkOut ? clockText(day.checkOut) : "",
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateCorrection(form);
    setErrors(found);
    if (Object.keys(found).length || busy) return;
    setBusy(true);
    setError(undefined);
    const stamp = (v: string) =>
      `${day.date}T${v.length === 5 ? v + ":00" : v}+09:00`;
    try {
      await send(`/attendance/${employeeId}/${day.date}`, "PUT", {
        checkIn: stamp(form.checkIn),
        checkOut: form.checkOut ? stamp(form.checkOut) : null,
        reason: form.reason.trim(),
      });
      refreshWork();
      onSaved();
    } catch (e) {
      setError(e);
      setErrors(fieldErrors(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal titleId="correction-title" busy={busy} onClose={onClose}>
      <h2 id="correction-title">근태 정정</h2>
      <EmployeeIdentity id={employeeId}/>
      <p>
        {day.date} · 사원 ID {employeeId} · 서울 시각
      </p>
      <div className="readonly-block">현재 기록: 출근 {clockText(day.checkIn)} · 퇴근 {clockText(day.checkOut)}<AttendanceBadges day={day}/></div>
      <p className="muted">
        해당 날짜 안의 실제 시각을 입력하세요. 미래 시각은 허용하지 않습니다.
        퇴근을 비우면 미완료로 남습니다.
      </p>
      <form noValidate onSubmit={submit}>
        <ErrorNotice error={error} />
        <div className="form-grid">
          {(["checkIn", "checkOut"] as const).map((k) => (
            <Field
              key={k}
              name={k}
              label={k === "checkIn" ? "출근 시각 *" : "퇴근 시각 (선택)"}
              error={errors[k]}
            >
              <input
                id={k}
                type="time"
                step="1"
                value={form[k]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [k]: e.target.value }))
                }
              />
            </Field>
          ))}
        </div>
        <button type="button" onClick={() => setForm(f => ({...f, checkOut: ""}))}>퇴근 비우기</button>
        <Field
          name="correctionReason"
          label="정정 사유 *"
          error={errors.reason}
        >
          <textarea
            id="correctionReason"
            maxLength={200}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </Field>
        <p className="muted">
          {form.reason.length} / 200자 · 변경 전후 값이 감사 로그에 기록되고
          대상 사원에게 알림이 전송됩니다.
          알림에는 정정 사유가 포함되지 않습니다. 승인된 종일 휴가일은 지각·조퇴로 판정하지 않습니다.
        </p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "저장 중…" : "정정 저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function AttendanceTable({
  employeeId,
  month,
  admin,
  today,
}: {
  employeeId: string;
  month: string;
  admin: boolean;
  today: string;
}) {
  const path = admin
    ? `/attendance?employeeId=${encodeURIComponent(employeeId)}&month=${month}`
    : `/attendance/me?month=${month}`;
  const result = useResource<AttendanceMonth>(path);
  const [editing, setEditing] = useState<AttendanceDay>();
  const [message, setMessage] = useState("");
  return (
    <section className="panel">
      <h2>월별 근태</h2>
      {admin && <EmployeeIdentity id={employeeId}/>}
      <p className="muted">
        근무일(월~금)만 표시합니다. 미기록은 결근 판정이 아닙니다. 근무 시간
        합계는 제공하지 않습니다.
      </p>
      <ErrorNotice error={result.error} />
      {result.error && <button onClick={result.reload}>다시 시도</button>}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      {result.loading ? (
        <p role="status">근태를 불러오는 중…</p>
      ) : (
        result.data && (
          <>
            {!result.data.days.length ? (
              <p className="empty">표시할 근태가 없습니다.</p>
            ) : (
              <><div className="table-wrap attendance-desktop">
                <table className="responsive-table">
                  <caption>{month} 근태 · 시각은 서울 기준</caption>
                  <thead>
                    <tr>
                      {[
                        "날짜",
                        "출근",
                        "퇴근",
                        "판정",
                        "적용 기준",
                        "휴가",
                        ...(admin ? ["관리"] : []),
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.days.map((day) => (
                      <tr key={day.date}>
                        <td data-label="날짜">{dateLabel(day.date)}</td>
                        <td data-label="출근">{clockText(day.checkIn)}</td>
                        <td data-label="퇴근">{clockText(day.checkOut)}</td>
                        <td data-label="판정">
                          <AttendanceBadges day={day} today={today}/>
                        </td>
                        <td data-label="적용 기준">
                          <span>
                            {basis(day)}
                          </span>
                        </td>
                        <td data-label="휴가">
                          <span>
                            {day.leaves
                              .map((l) => leaveTypeLabels[l.type])
                              .join(" · ")}
                          </span>
                        </td>
                        {admin && day.date <= today && (
                          <td data-label="관리">
                            <button
                              onClick={() => setEditing(day)}
                              aria-label={`${day.date} 정정`}
                            >
                              정정
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div><ul className="attendance-cards" aria-label={`${month} 날짜별 근태`}>{result.data.days.map(day => <li key={day.date}><div className="attendance-card-top"><strong>{dateLabel(day.date)}</strong><AttendanceBadges day={day} today={today}/></div><p>출근 {clockText(day.checkIn)} · 퇴근 {clockText(day.checkOut)}</p><div className="attendance-card-bottom"><small>기준 {basis(day)}{day.leaves.length ? ` · ${day.leaves.map(l => leaveTypeLabels[l.type]).join(" · ")}` : ""}</small>{admin && day.date <= today && <button aria-label={`${day.date} 정정`} onClick={() => setEditing(day)}>정정</button>}</div></li>)}</ul></>
            )}
          </>
        )
      )}
      {editing && (
        <Correction
          employeeId={employeeId}
          day={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setMessage(`${editing.date} 근태를 정정했습니다.`);
            result.reload();
          }}
        />
      )}
    </section>
  );
}
export function Attendance({ admin = false }: { admin?: boolean }) {
  const today = useResource<AttendanceDay>("/attendance/me/today");
  const [search, setSearch] = useSearchParams();
  const [employeeInput, setEmployeeInput] = useState(
    search.get("employeeId") || "",
  );
  const [employeeId, setEmployeeId] = useState(search.get("employeeId") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const month = search.get("month") || today.data?.date.slice(0, 7) || "";
  async function record(action: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      await send(`/attendance/me/${action}`, "POST");
      setMessage(
        action === "check-in" ? "출근을 기록했습니다." : "퇴근을 기록했습니다.",
      );
      today.reload();
      setRevision((r) => r + 1);
      refreshWork();
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && e.status === 409) {
        today.reload();
        setRevision((r) => r + 1);
        setMessage("오늘 기록을 다시 조회했습니다. 최신 상태를 확인하세요.");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="title-row">
        <div>
          <h1>{admin ? "근태 관리" : "출퇴근·근태"}</h1>
          <p className="muted">판정과 시각은 서버(서울) 기준입니다.</p>
        </div>
      </div>
      {!admin && (
        <section className="panel">
          <h2>오늘 출퇴근 {today.data?.date}</h2>
          <ErrorNotice error={today.error || error} />
          {today.error && <button onClick={today.reload}>다시 시도</button>}
          {today.loading ? (
            <p role="status">오늘 기록을 불러오는 중…</p>
          ) : (
            today.data && (
              <>
                <AttendanceBadges day={today.data} today={today.data.date} card/>
                <dl className="details section-gap">
                  <div>
                    <dt>출근</dt>
                    <dd>{clockText(today.data.checkIn)}</dd>
                  </div>
                  <div>
                    <dt>퇴근</dt>
                    <dd>{clockText(today.data.checkOut)}</dd>
                  </div>
                  <div>
                    <dt>적용 기준</dt>
                    <dd>
                      {today.data.expectedStart} ~ {today.data.expectedEnd}
                    </dd>
                  </div>
                </dl>
                <p>
                  {today.data.leaves
                    .map((l) => leaveTypeLabels[l.type])
                    .join(" · ")}
                </p>
                <div className="actions attendance-clock-actions">
                  {today.data.status !== "LEAVE" && !today.data.checkIn && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => record("check-in")}
                    >
                      출근하기
                    </button>
                  )}
                  {today.data.checkIn && !today.data.checkOut && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => record("check-out")}
                    >
                      퇴근하기
                    </button>
                  )}
                </div>
                {today.data.status === "LEAVE" && <p>승인된 휴가일입니다.</p>}
              </>
            )
          )}
          {message && (
            <p role="status" className="notice success">
              {message}
            </p>
          )}
          <p className="muted">
            퇴근은 오늘 기록에만 적용됩니다. 전날 퇴근 누락은 관리자에게 정정을
            요청하세요.
          </p>
        </section>
      )}
      <section className="panel section-gap">
        <div className="form-grid">
          {admin && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEmployeeId(employeeInput);
              }}
            >
              <Field name="attendanceEmployee" label="사원 ID">
                <input
                  id="attendanceEmployee"
                  type="number"
                  min="1"
                  required
                  value={employeeInput}
                  onChange={(e) => setEmployeeInput(e.target.value)}
                />
              </Field>
              <button>사원 조회</button>
            </form>
          )}
          <Field name="attendanceMonth" label="조회 월">
            <input
              id="attendanceMonth"
              type="month"
              value={month}
              onChange={(e) => {
                const q = new URLSearchParams(search);
                q.set("month", e.target.value);
                setSearch(q);
              }}
            />
          </Field>
        </div>
      </section>
      {month && (!admin || employeeId) ? (
        <AttendanceTable
          key={`${employeeId}:${month}:${revision}`}
          admin={admin}
          employeeId={employeeId}
          month={month}
          today={today.data?.date || ""}
        />
      ) : (
        <p className="empty">
          {admin
            ? "조회할 사원 ID를 입력하세요."
            : "기준 날짜를 불러오는 중입니다."}
        </p>
      )}
    </>
  );
}
