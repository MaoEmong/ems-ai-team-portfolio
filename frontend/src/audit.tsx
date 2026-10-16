import { auditTarget, ExportFilters } from "./audit-values";
import { useState, type FormEvent } from "react";
import type { AuditLog, Page } from "./types";
import { ErrorNotice, Field, useResource } from "./ui";
import { formatSeoul, seoulDateRange } from "./phase2-utils";
export const actionLabels: Record<string, string> = {
  LOGIN_SUCCESS: "로그인 성공",
  LOGIN_FAILURE: "로그인 실패",
  EMPLOYEE_CREATE: "사원 등록",
  EMPLOYEE_UPDATE: "사원 수정",
  EMPLOYEE_RETIRE: "퇴사 처리",
  APPOINTMENT_CREATE: "발령 등록",
  DEPARTMENT_CREATE: "부서 등록",
  DEPARTMENT_UPDATE: "부서 수정",
  DEPARTMENT_DELETE: "부서 삭제",
  POSITION_CREATE: "직급 등록",
  POSITION_UPDATE: "직급 수정",
  POSITION_DELETE: "직급 삭제",
  EMPLOYEE_IMPORT: "엑셀 가져오기",
  EMPLOYEE_EXPORT: "사원 내보내기",
};
const labels: Record<string, string> = {
  employeeNo: "사번",
  name: "이름",
  email: "이메일",
  phone: "전화번호",
  hireDate: "입사일",
  status: "재직 상태",
  retireDate: "퇴사일",
  department: "부서",
  departmentId: "부서 ID",
  position: "직급",
  positionId: "직급 ID",
  role: "역할",
  description: "설명",
  level: "정렬 순서",
  format: "파일 형식",
  rowCount: "행 수",
  filters: "검색 조건",
  importedCount: "등록 인원",
  code: "오류 코드",
  errorCount: "오류 수",
  appointmentId: "발령 ID",
  source: "등록 경로",
  reason: "사유",
};
function textValue(value: unknown): string {
  if (value === null || value === undefined) return "해당 없음";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return (
    (
      {
        ACTIVE: "재직",
        ON_LEAVE: "휴직",
        RETIRED: "퇴사",
        ADMIN: "관리자",
        EMPLOYEE: "일반 사원",
      } as Record<string, string>
    )[String(value)] || String(value)
  );
}
function Changes({ item }: { item: AuditLog }) {
  const keys = Array.from(
    new Set([
      ...Object.keys(item.before || {}),
      ...Object.keys(item.after || {}),
    ]),
  );
  const changed = keys.filter(
    (k) => JSON.stringify(item.before?.[k]) !== JSON.stringify(item.after?.[k]),
  );
  const same = keys.filter((k) => !changed.includes(k));
  const rows = (list: string[]) => (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">변경 전후 값</caption>
        <thead>
          <tr>
            <th>항목</th>
            <th>변경 전</th>
            <th>변경 후</th>
          </tr>
        </thead>
        <tbody>
          {list.map((k) => (
            <tr key={k}>
              <th scope="row">{labels[k] || k}</th>
              <td className="wrap">{textValue(item.before?.[k])}</td>
              <td className="wrap">{textValue(item.after?.[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="audit-detail">
      <h3>변경 전후 값</h3>
      <p className="muted">
        이름·부서·직급은 기록 당시 값입니다. 현재 값과 다를 수 있습니다.
      </p>
      {!keys.length ? (
        <p>변경 전: 해당 없음 · 변경 후: 해당 없음</p>
      ) : (
        <>
          {rows(changed)}
          {same.length > 0 && (
            <details>
              <summary>변경 없는 값 {same.length}개</summary>
              {rows(same)}
            </details>
          )}
        </>
      )}
      {item.action === "EMPLOYEE_EXPORT" && item.success && (
        <p className="notice info">
          서버 파일 생성 성공입니다. 사용자 저장 완료를 의미하지 않습니다.
        </p>
      )}
      {item.action === "EMPLOYEE_IMPORT" && !item.success && (
        <p className="notice info">
          가져오기가 전부 취소되어 등록된 사원이 없습니다. 오류 수는 행 오류
          건수이며 파일 전체 오류는 1건으로 기록됩니다.
        </p>
      )}
      {Object.keys(item.metadata).length > 0 && (
        <dl className="metadata">
          {Object.entries(item.metadata).map(([k, v]) => (
            <div key={k}>
              <dt>{labels[k] || k}</dt>
              <dd>
                {k === "filters" ? (
                  <ExportFilters value={v} />
                ) : (
                  <pre>
                    {k === "reason" && v === "BAD_CREDENTIALS"
                      ? "아이디 또는 비밀번호 불일치"
                      : k === "reason" && v === "DISABLED"
                        ? "비활성 계정"
                        : textValue(v)}
                  </pre>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
const blank = {
  actorId: "",
  targetType: "",
  targetId: "",
  action: "",
  success: "",
  start: "",
  end: "",
};
export function AuditLogs() {
  const [form, setForm] = useState(blank);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<unknown>();
  const result = useResource<Page<AuditLog>>(
    `/audit-logs?${query}&page=${page}&size=20`,
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { start, end, ...filters } = form;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries({
        ...filters,
        ...seoulDateRange(start, end),
      }))
        if (v) params.set(k, v);
      setQuery(params.toString());
      setPage(0);
      setError(undefined);
    } catch (e) {
      setError(e);
    }
  }
  const input = (
    name: "actorId" | "targetId" | "start" | "end",
    label: string,
    type = "text",
  ) => (
    <Field name={name} label={label}>
      <input
        id={name}
        type={type}
        min={type === "number" ? 1 : undefined}
        value={form[name]}
        onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
      />
    </Field>
  );
  return (
    <>
      <div className="title-row">
        <div>
          <h1>감사 로그</h1>
          <p className="muted">
            누가 언제 무엇을 변경했는지 확인하세요. 관리자 전용 조회 화면입니다.
          </p>
        </div>
      </div>
      <section className="panel">
        <form onSubmit={submit}>
          <p className="muted">
            기본 조회는 전체 기간입니다. 필요한 기간을 지정해 조회하세요.
          </p>
          <div className="audit-period form-grid">
            {input("start", "시작일 (서울)", "date")}
            {input("end", "종료일 (서울, 포함)", "date")}
          </div>
          <div className="audit-filters">
            {input("actorId", "행위자 ID", "number")}
            <Field name="targetType" label="대상 유형">
              <select
                id="targetType"
                value={form.targetType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, targetType: e.target.value }))
                }
              >
                <option value="">모든 대상</option>
                <option value="EMPLOYEE">사원</option>
                <option value="DEPARTMENT">부서</option>
                <option value="POSITION">직급</option>
              </select>
            </Field>
            {input("targetId", "대상 ID", "number")}
            <Field name="action" label="행위">
              <select
                id="action"
                value={form.action}
                onChange={(e) =>
                  setForm((f) => ({ ...f, action: e.target.value }))
                }
              >
                <option value="">모든 행위</option>
                {Object.entries(actionLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="success" label="성공 여부">
              <select
                id="success"
                value={form.success}
                onChange={(e) =>
                  setForm((f) => ({ ...f, success: e.target.value }))
                }
              >
                <option value="">전체</option>
                <option value="true">성공</option>
                <option value="false">실패</option>
              </select>
            </Field>
          </div>
          <div className="actions">
            <button className="primary">조회</button>
            <button
              type="button"
              onClick={() => {
                setForm(blank);
                setQuery("");
                setPage(0);
                setError(undefined);
              }}
            >
              필터 초기화
            </button>
            <span className="muted">
              시작일 00:00부터 종료일 다음 날 00:00 전까지
            </span>
          </div>
        </form>
        <ErrorNotice error={error || result.error} />
        {result.error && <button onClick={result.reload}>다시 시도</button>}
        {result.loading ? (
          <p role="status">감사 로그를 불러오는 중…</p>
        ) : (
          result.data && (
            <>
              <p className="result-summary">
                총 {result.data.totalElements}건 · 최신순
              </p>
              {!result.data.content.length ? (
                <p className="empty">조건에 맞는 기록이 없습니다.</p>
              ) : (
                <div className="audit-list">
                  {result.data.content.map((item) => (
                    <details className="audit-row" key={item.id}>
                      <summary>
                        <span className="audit-time">
                          {formatSeoul(item.occurredAt)} (KST)
                        </span>
                        <strong>
                          {actionLabels[item.action] || item.action}
                        </strong>
                        <span>
                          {item.actor
                            ? `${item.actor.name} (${item.actor.employeeNo})`
                            : "확인 불가"}{" "}
                          → {auditTarget(item)}
                          {item.targetId !== null
                            ? ` (ID ${item.targetId})`
                            : ""}
                        </span>
                        <span
                          className={`badge ${item.success ? "badge--success" : "badge--danger"}`}
                        >
                          {item.success ? "성공" : "! 실패"}
                        </span>
                        <span className="detail-label detail-open">
                          상세 보기
                        </span>
                        <span className="detail-label detail-close">접기</span>
                      </summary>
                      <Changes item={item} />
                    </details>
                  ))}
                </div>
              )}
              <div className="pagination">
                <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                  이전
                </button>
                <span>
                  {page + 1} / {Math.max(1, result.data.totalPages)}
                </span>
                <button
                  disabled={page + 1 >= result.data.totalPages}
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
