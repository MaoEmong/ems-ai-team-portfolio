import { useRef, useState, type FormEvent } from "react";
import type {
  Appointment,
  Department,
  Employee,
  Page,
  Position,
} from "./types";
import { ApiError, send } from "./api";
import { ErrorNotice, Field, Modal, fieldErrors, useResource } from "./ui";
import { seoulToday, formatSeoul } from "./phase2-utils";
import type { JobTitle } from "./types-phase3b";
export function validateAppointment(
  form: {
    effectiveDate: string;
    departmentId: string;
    positionId: string;
    reason: string;
    changeJobTitle?: boolean;
    jobTitleId?: string;
  },
  employee: Employee,
  lastDate: string,
  today = seoulToday(),
) {
  const errors: Record<string, string> = {};
  if (!form.departmentId) errors.departmentId = "부서를 선택하세요.";
  if (!form.positionId) errors.positionId = "직급을 선택하세요.";
  if (
    Number(form.departmentId) === employee.department.id &&
    Number(form.positionId) === employee.position.id &&
    !(form.changeJobTitle && (form.jobTitleId || "") !== String(employee.jobTitle?.id || ""))
  )
    errors.departmentId = "부서·직급·직책 중 하나 이상을 바꿔야 합니다.";
  if (
    !form.effectiveDate ||
    form.effectiveDate < employee.hireDate ||
    form.effectiveDate < lastDate ||
    form.effectiveDate > today
  )
    errors.effectiveDate =
      "입사일·마지막 발령일 이후, 오늘까지의 날짜를 입력하세요.";
  if (!form.reason.trim() || form.reason.length > 200)
    errors.reason = "사유를 1~200자로 입력하세요.";
  return errors;
}
function AppointmentForm({
  employee,
  lastDate,
  onClose,
  onSaved,
  onConflict,
}: {
  employee: Employee;
  lastDate: string;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const departments = useResource<Department[]>("/departments");
  const positions = useResource<Position[]>("/positions");
  const jobTitles = useResource<JobTitle[]>("/job-titles");
  const [form, setForm] = useState({
    departmentId: String(employee.department.id),
    positionId: String(employee.position.id),
    effectiveDate: seoulToday(),
    reason: "",
    changeJobTitle: false,
    jobTitleId: employee.jobTitle?.id ? String(employee.jobTitle.id) : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    setError(undefined);
    const found = validateAppointment(form, employee, lastDate);
    setErrors(found);
    if (Object.keys(found).length) return;
    lock.current = true;
    setBusy(true);
    try {
      await send(`/employees/${employee.id}/appointments`, "POST", {
        ...form,
        departmentId: Number(form.departmentId),
        positionId: Number(form.positionId),
        jobTitleId: form.changeJobTitle ? (form.jobTitleId ? Number(form.jobTitleId) : null) : undefined,
      });
      onSaved();
    } catch (e) {
      setError(e);
      setErrors(fieldErrors(e));
      if (e instanceof ApiError && e.status === 409) onConflict();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal titleId="appointment-title" busy={busy} onClose={onClose}>
      <h2 id="appointment-title">발령 등록</h2>
      <p>
        {employee.name} ({employee.employeeNo})의 부서·직급·직책을 변경합니다.
      </p>
      <div className="readonly-block">
        현재 소속: {employee.department.name} · {employee.position.name}
      </div>
      <form noValidate onSubmit={submit}>
        <label className="checkbox-label"><input type="checkbox" checked={form.changeJobTitle} onChange={e=>setForm(f=>({...f,changeJobTitle:e.target.checked}))}/>직책 변경</label>
        {form.changeJobTitle && <Field name="appointmentJobTitle" label="발령 후 직책"><select id="appointmentJobTitle" value={form.jobTitleId} onChange={e=>setForm(f=>({...f,jobTitleId:e.target.value}))}><option value="">직책 해제</option>{jobTitles.data?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
        <p className="muted">현재 직책: {employee.jobTitle?.name || "없음"}. 변경을 선택하지 않으면 유지합니다. 직책은 관리자 권한을 부여하지 않습니다.</p>
        <p className="notice info">변경 요약: {departments.data?.find(d=>d.id===Number(form.departmentId))?.name || employee.department.name} · {positions.data?.find(p=>p.id===Number(form.positionId))?.name || employee.position.name} · 직책 {form.changeJobTitle ? jobTitles.data?.find(t=>t.id===Number(form.jobTitleId))?.name || "해제" : `${employee.jobTitle?.name || "없음"} (유지)`}</p>
        <ErrorNotice error={jobTitles.error}/>
        <ErrorNotice error={error || departments.error || positions.error} />
        <div className="form-grid">
          <Field
            name="appointmentDepartment"
            label="발령 후 부서 *"
            error={errors.departmentId}
          >
            <select
              id="appointmentDepartment"
              value={form.departmentId}
              onChange={(e) =>
                setForm((f) => ({ ...f, departmentId: e.target.value }))
              }
            >
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.id === employee.department.id ? " (현재)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            name="appointmentPosition"
            label="발령 후 직급 *"
            error={errors.positionId}
          >
            <select
              id="appointmentPosition"
              value={form.positionId}
              onChange={(e) =>
                setForm((f) => ({ ...f, positionId: e.target.value }))
              }
            >
              {positions.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === employee.position.id ? " (현재)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          name="effectiveDate"
          label="발령일 *"
          error={errors.effectiveDate}
        >
          <input
            id="effectiveDate"
            type="date"
            min={[employee.hireDate, lastDate].sort().at(-1)}
            max={seoulToday()}
            value={form.effectiveDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, effectiveDate: e.target.value }))
            }
          />
        </Field>
        <p className="muted">
          {[employee.hireDate, lastDate].sort().at(-1)} ~ {seoulToday()} 사이
          (서울 기준)
        </p>
        <Field name="reason" label="발령 사유 *" error={errors.reason}>
          <textarea
            id="reason"
            maxLength={200}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </Field>
        <p className="muted">{form.reason.length} / 200자</p>
        <p className="notice info">
          등록하면 현재 소속이 바로 바뀌고 이력에 남습니다. 되돌리려면 새 발령을
          등록해야 합니다.
        </p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              departments.loading ||
              positions.loading ||
              !!departments.error ||
              !!positions.error
              || (form.changeJobTitle && (jobTitles.loading || !!jobTitles.error))
            }
            aria-busy={busy}
          >
            {busy ? "등록 중…" : "발령 등록"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Appointments({
  employee,
  canEdit,
  onSaved,
}: {
  employee: Employee;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const result = useResource<Page<Appointment>>(
    `/employees/${employee.id}/appointments?page=${page}&size=10`,
  );
  // Always obtain the latest effective date independently of the currently displayed page.
  const latest = useResource<Page<Appointment>>(
    `/employees/${employee.id}/appointments?page=0&size=1`,
  );
  function saved() {
    setOpen(false);
    setPage(0);
    result.reload();
    latest.reload();
    setMessage("발령을 등록했습니다.");
    onSaved();
  }
  return (
    <section className="panel section-gap" id="appointments">
      <div className="title-row">
        <div>
          <h2>{canEdit ? "발령 이력" : "내 발령 이력"}</h2>
          <p className="muted">
            발령일 기준 최신순 · 도입 이후 실제 변경만 기록됩니다.
          </p>
        </div>
        {canEdit && employee.status !== "RETIRED" && (
          <button
            className="primary"
            disabled={latest.loading || !!latest.error}
            onClick={() => setOpen(true)}
          >
            발령 등록
          </button>
        )}
      </div>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      <ErrorNotice error={result.error || latest.error} />
      {(result.error || latest.error) && (
        <button
          onClick={() => {
            result.reload();
            latest.reload();
          }}
        >
          다시 시도
        </button>
      )}
      {result.loading ? (
        <p role="status">발령 이력을 불러오는 중…</p>
      ) : (
        result.data && (
          <>
            {!result.data.content.length ? (
              <p className="empty">발령 이력이 없습니다.</p>
            ) : (
              <div className="table-wrap">
                <table className="responsive-table">
                  <caption className="sr-only">발령 이력</caption>
                  <thead>
                    <tr>
                      <th>발령일</th>
                      <th>부서</th>
                      <th>직급</th>
                      <th>사유</th>
                      <th>직책</th>
                      <th>등록자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.content.map((a) => (
                      <tr key={a.id}>
                        <td data-label="발령일">
                          {a.effectiveDate}
                          <small className="cell-note">
                            기록 {formatSeoul(a.createdAt)} (KST)
                          </small>
                        </td>
                        <td data-label="부서">
                          <span>
                            {a.fromDepartment.id === a.toDepartment.id ? (
                              <span className="muted">
                                {a.toDepartment.name} (변경 없음)
                              </span>
                            ) : (
                              <>
                                {a.fromDepartment.name} →{" "}
                                <strong>{a.toDepartment.name}</strong>
                              </>
                            )}
                          </span>
                        </td>
                        <td data-label="직급">
                          <span>
                            {a.fromPosition.id === a.toPosition.id ? (
                              <span className="muted">
                                {a.toPosition.name} (변경 없음)
                              </span>
                            ) : (
                              <>
                                {a.fromPosition.name} →{" "}
                                <strong>{a.toPosition.name}</strong>
                              </>
                            )}
                          </span>
                        </td>
                        <td data-label="사유" className="wrap">
                          {a.reason}
                        </td>
                        <td data-label="직책"><span>{a.fromJobTitle?.name || "—"} → {a.toJobTitle?.name || "—"}</span></td>
                        <td data-label="등록자">{a.createdBy.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.data.totalPages > 1 && (
              <div className="pagination">
                <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                  이전
                </button>
                <span>
                  {page + 1} / {result.data.totalPages}
                </span>
                <button
                  disabled={page + 1 >= result.data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  다음
                </button>
              </div>
            )}
          </>
        )
      )}
      <p className="muted">부서·직급·직책 이름과 등록자는 발령 당시 정보입니다. 과거 직책의 —는 기록되지 않은 정보이며 당시 직책을 복원했다는 뜻이 아닙니다.</p>
      {open && (
        <AppointmentForm
          employee={employee}
          lastDate={latest.data?.content[0]?.effectiveDate || employee.hireDate}
          onClose={() => setOpen(false)}
          onSaved={saved}
          onConflict={() => { result.reload(); latest.reload(); onSaved(); }}
        />
      )}
    </section>
  );
}
