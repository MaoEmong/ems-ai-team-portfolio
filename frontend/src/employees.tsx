import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "./auth";
import { ApiError, send } from "./api";
import { FileActions } from "./files";
import { Appointments } from "./appointments";
import {
  ErrorNotice,
  FormErrors,
  Field,
  Modal,
  fieldErrors,
  statusLabels,
  useResource,
} from "./ui";
import type { Department, Employee, Page, Position } from "./types";
import {
  blankEmployee,
  validateEmployee,
  type EmployeeForm,
} from "./validation";
export function EmployeeList() {
  const [filters, setFilters] = useState({
    keyword: "",
    departmentId: "",
    positionId: "",
    status: "",
    sort: "employeeNo,asc",
    size: "20",
  });
  const [page, setPage] = useState(0);
  const departments = useResource<Department[]>("/departments");
  const positions = useResource<Position[]>("/positions");
  const query = new URLSearchParams(
    Object.entries({ ...filters, page: String(page) }).filter(
      ([, value]) => value !== "",
    ),
  );
  const result = useResource<Page<Employee>>(`/employees?${query}`);
  const update = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">PEOPLE</p>
          <h1>사원 관리</h1>
          <p className="muted">조직의 구성원과 재직 현황을 확인하세요.</p>
        </div>
        <Link className="button primary" to="/employees/new">
          + 사원 등록
        </Link>
      </div>
      <FileActions filters={filters} total={result.data?.totalElements} />
      <section className="panel">
        <div className="filters">
          <Field name="keyword" label="사원 검색">
            <input
              id="keyword"
              placeholder="이름, 사번, 이메일"
              value={filters.keyword}
              onChange={(e) => update("keyword", e.target.value)}
            />
          </Field>
          <Field name="departmentId" label="부서">
            <select
              id="departmentId"
              value={filters.departmentId}
              onChange={(e) => update("departmentId", e.target.value)}
            >
              <option value="">모든 부서</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field name="positionId" label="직급">
            <select
              id="positionId"
              value={filters.positionId}
              onChange={(e) => update("positionId", e.target.value)}
            >
              <option value="">모든 직급</option>
              {positions.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field name="status" label="재직 상태">
            <select
              id="status"
              value={filters.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">재직·휴직</option>
              {Object.entries(statusLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field name="sort" label="정렬">
            <select
              id="sort"
              value={filters.sort}
              onChange={(e) => update("sort", e.target.value)}
            >
              {[
                ["employeeNo", "사번"],
                ["name", "이름"],
                ["hireDate", "입사일"],
              ].flatMap(([v, l]) =>
                ["asc", "desc"].map((order) => (
                  <option key={v + order} value={`${v},${order}`}>
                    {l} {order === "asc" ? "오름차순" : "내림차순"}
                  </option>
                )),
              )}
            </select>
          </Field>
        </div>
        <ErrorNotice
          error={departments.error || positions.error || result.error}
        />
        {result.error && <button onClick={result.reload}>다시 시도</button>}
        {result.loading ? (
          <p role="status">사원 목록을 불러오는 중…</p>
        ) : (
          !result.error && (
            <>
              <div className="table-wrap">
                <table className="responsive-table employee-table">
                  <caption className="sr-only">사원 목록</caption>
                  <thead>
                    <tr>
                      <th>사번</th>
                      <th>이름</th>
                      <th>부서</th>
                      <th>직급</th>
                      <th>입사일</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data?.content.map((e) => (
                      <tr key={e.id}>
                        <td data-label="사번">{e.employeeNo}</td>
                        <td data-label="이름">
                          <Link to={`/employees/${e.id}`}>{e.name}</Link>
                        </td>
                        <td data-label="부서">{e.department.name}</td>
                        <td data-label="직급">{e.position.name}</td>
                        <td data-label="입사일">{e.hireDate}</td>
                        <td data-label="상태">
                          <span
                            className={`badge badge--${e.status === "ACTIVE" ? "success" : e.status === "ON_LEAVE" ? "warning" : "neutral"}`}
                          >
                            {statusLabels[e.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!result.data?.content.length && (
                <p className="empty">조건에 맞는 사원이 없습니다.</p>
              )}
              <div className="pagination">
                <span>총 {result.data?.totalElements ?? 0}명</span>
                <label>
                  페이지 크기{" "}
                  <select
                    value={filters.size}
                    onChange={(e) => update("size", e.target.value)}
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  이전
                </button>
                <span>
                  {page + 1} / {Math.max(1, result.data?.totalPages ?? 0)}
                </span>
                <button
                  disabled={page + 1 >= (result.data?.totalPages ?? 0)}
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
export function EmployeeDetail({ self = false }: { self?: boolean }) {
  const { id } = useParams();
  const { user } = useAuth();
  const target = self ? user!.id : id;
  const result = useResource<Employee>(`/employees/${target}`);
  const [retiring, setRetiring] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  if (result.loading && !result.data)
    return <p role="status">사원 정보를 불러오는 중…</p>;
  if (result.error)
    return (
      <>
        <ErrorNotice error={result.error} />
        <button onClick={result.reload}>다시 시도</button>
      </>
    );
  const e = result.data!;
  async function retire(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await send(`/employees/${target}/retire`, "POST", { retireDate: date });
      setRetiring(false);
      result.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">{self ? "MY PROFILE" : "EMPLOYEE PROFILE"}</p>
          <h1>{self ? "내 정보" : e.name}</h1>
          <span className={`badge ${e.status === "ACTIVE" ? "badge--success" : e.status === "ON_LEAVE" ? "badge--warning" : "badge--danger"}`}>{e.status === "ACTIVE" ? "재직" : e.status === "ON_LEAVE" ? "휴직" : "퇴사"}</span>
          <p className="muted">
            {e.employeeNo} · {e.department.name} · {e.position.name}
          </p>
        </div>
        {user?.role === "ADMIN" && !self && e.status !== "RETIRED" && (
          <div className="actions">
            <Link className="button" to={`/employees/${e.id}/edit`}>
              정보 수정
            </Link>
            <button
              className="danger"
              onClick={() => {
                setError(undefined);
                setRetiring(true);
              }}
            >
              퇴사 처리
            </button>
          </div>
        )}
      </div>
      <section className="panel">
        <h2>기본 정보</h2>
        <dl className="details">
          {[
            ["이름", e.name],
            ["사번", e.employeeNo],
            ["이메일", e.email],
            ["전화번호", e.phone || "—"],
            ["부서", e.department.name],
            ["직급", e.position.name],
            ["입사일", e.hireDate],
            ["재직 상태", statusLabels[e.status]],
            ["퇴사일", e.retireDate || "—"],
            ["역할", e.role === "ADMIN" ? "관리자" : "일반 사원"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Appointments
        employee={e}
        canEdit={user?.role === "ADMIN" && !self}
        onSaved={result.reload}
      />
      {retiring && (
        <Modal
          titleId="retire-title"
          busy={busy}
          onClose={() => setRetiring(false)}
        >
          <h2 id="retire-title">퇴사 처리 확인</h2>
          <p>
            {e.name} 님을 퇴사 처리하면 계정이 비활성화됩니다. 사번은 재사용할
            수 없습니다.
          </p>
          <form onSubmit={retire}>
            <ErrorNotice error={error} />
            <Field
              name="retireDate"
              label="퇴사일"
              error={fieldErrors(error).retireDate}
            >
              <input
                autoFocus
                required
                id="retireDate"
                type="date"
                min={e.hireDate}
                value={date}
                onChange={(ev) => setDate(ev.target.value)}
              />
            </Field>
            <div className="actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRetiring(false)}
              >
                취소
              </button>
              <button className="danger" disabled={busy}>
                {busy ? "처리 중…" : "퇴사 처리"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function EmployeeEditor() {
  const { id } = useParams();
  const creating = !id;
  const navigate = useNavigate();
  const [form, setForm] = useState<EmployeeForm>(blankEmployee);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const departments = useResource<Department[]>("/departments");
  const positions = useResource<Position[]>("/positions");
  const existing = useResource<Employee | Department[]>(
    id ? `/employees/${id}` : "/departments",
  );
  useEffect(() => {
    if (id && existing.data && !Array.isArray(existing.data)) {
      const e = existing.data;
      setForm({
        ...blankEmployee,
        ...e,
        departmentId: String(e.department.id),
        positionId: String(e.position.id),
      });
    }
  }, [id, existing.data]);
  const update = (name: keyof EmployeeForm, value: string) =>
    setForm((f) => ({ ...f, [name]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateEmployee(form, creating);
    setErrors(validation);
    setError(undefined);
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      const {
        employeeNo,
        initialPassword,
        status,
        departmentId,
        positionId,
        ...rest
      } = form;
      const payload = {
        ...rest,
        ...(creating
          ? {
              employeeNo,
              initialPassword,
              departmentId: Number(departmentId),
              positionId: Number(positionId),
            }
          : { status }),
      };
      const employee = await send<Employee>(
        creating ? "/employees" : `/employees/${id}`,
        creating ? "POST" : "PUT",
        payload,
      );
      navigate(`/employees/${employee.id}`);
    } catch (e) {
      setError(e);
      setErrors(fieldErrors(e));
    } finally {
      setBusy(false);
    }
  }
  if (departments.loading || positions.loading || existing.loading)
    return <p role="status">입력 정보를 준비하는 중…</p>;
  if (departments.error || positions.error || existing.error)
    return (
      <ErrorNotice
        error={departments.error || positions.error || existing.error}
      />
    );
  if (
    !creating &&
    !Array.isArray(existing.data) &&
    existing.data?.status === "RETIRED"
  )
    return <div role="alert">퇴사한 사원은 수정할 수 없습니다.</div>;
  const input = (
    name: keyof EmployeeForm,
    label: string,
    type = "text",
    maxLength?: number,
  ) => (
    <Field name={name} label={label} error={errors[name]}>
      <input
        id={name}
        type={type}
        maxLength={maxLength}
        value={form[name]}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        onChange={(e) => update(name, e.target.value)}
        autoComplete={name === "initialPassword" ? "new-password" : undefined}
      />
    </Field>
  );
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">EMPLOYEE</p>
          <h1>{creating ? "사원 등록" : "사원 정보 수정"}</h1>
          <p className="muted">
            {creating
              ? "사번은 로그인 아이디로 사용되며 변경할 수 없습니다."
              : `사번 ${form.employeeNo}`}
          </p>
        </div>
      </div>
      <form className="panel" onSubmit={submit} noValidate>
        <ErrorNotice error={error} />
        <FormErrors errors={errors} />
        {error instanceof ApiError &&
          error.body.code === "APPOINTMENT_REQUIRED" && (
            <p className="notice info">
              부서·직급은 발령으로만 변경할 수 있습니다.{" "}
              <Link to={`/employees/${id}#appointments`}>
                발령 등록하러 가기
              </Link>
            </p>
          )}
        <p className="muted">* 표시는 필수 항목입니다.</p>
        <div className="form-grid">
          <h2 className="form-wide">기본 정보</h2>
          {creating && input("employeeNo", "사번 *", "text", 50)}
          {input("name", "이름 *", "text", 100)}
          {input("email", "이메일 *", "email", 254)}
          {input("phone", "전화번호", "tel", 30)}
          {input("hireDate", "입사일 *", "date")}
          <h2 className="form-wide">소속</h2>
          {creating ? (
            <>
              <Field
                name="departmentId"
                label="부서 *"
                error={errors.departmentId}
              >
                <select
                  id="departmentId"
                  value={form.departmentId}
                  onChange={(e) => update("departmentId", e.target.value)}
                >
                  <option value="">선택하세요</option>
                  {departments.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="positionId" label="직급 *" error={errors.positionId}>
                <select
                  id="positionId"
                  value={form.positionId}
                  onChange={(e) => update("positionId", e.target.value)}
                >
                  <option value="">선택하세요</option>
                  {positions.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <div className="readonly-block form-wide">
              <strong>소속 (읽기 전용)</strong>
              <p>
                부서:{" "}
                {!Array.isArray(existing.data) &&
                  existing.data?.department.name}{" "}
                · 직급:{" "}
                {!Array.isArray(existing.data) && existing.data?.position.name}
              </p>
              <p>
                부서·직급은 발령 등록으로만 바꿀 수 있습니다.{" "}
                <Link to={`/employees/${id}#appointments`}>
                  발령 등록하러 가기
                </Link>
              </p>
            </div>
          )}
          <h2 className="form-wide">계정</h2>
          <Field name="role" label="역할 *" error={errors.role}>
            <select
              id="role"
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
            >
              <option value="EMPLOYEE">일반 사원</option>
              <option value="ADMIN">관리자</option>
            </select>
          </Field>
          {!creating && (
            <Field name="status" label="재직 상태 *" error={errors.status}>
              <select
                id="status"
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="ACTIVE">재직</option>
                <option value="ON_LEAVE">휴직</option>
              </select>
            </Field>
          )}
          {creating && input("initialPassword", "초기 비밀번호 *", "password")}
        </div>
        <div className="actions">
          <Link className="button" to={id ? `/employees/${id}` : "/employees"}>
            취소
          </Link>
          <button className="primary" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </>
  );
}
