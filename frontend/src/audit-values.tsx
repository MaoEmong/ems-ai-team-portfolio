import type { AuditLog } from "./types";
export function auditTarget(item: AuditLog) {
  if (item.action.startsWith("LOGIN_")) return "해당 없음";
  if (["EMPLOYEE_IMPORT", "EMPLOYEE_EXPORT"].includes(item.action))
    return "사원 · 여러 사원(개별 대상 없음)";
  return (
    (item.targetLabel ? `${({EMPLOYEE:"사원", DEPARTMENT:"부서", POSITION:"직급"} as Record<string,string>)[item.targetType || ""] || "대상"} · ${item.targetLabel}` : "") ||
    (
      { EMPLOYEE: "사원", DEPARTMENT: "부서", POSITION: "직급" } as Record<
        string,
        string
      >
    )[item.targetType || ""] ||
    "해당 없음"
  );
}
export function ExportFilters({ value }: { value: unknown }) {
  const filters =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const labels = {
    keyword: "검색어",
    departmentId: "부서 ID",
    positionId: "직급 ID",
    status: "재직 상태",
    sort: "정렬",
  };
  return (
    <div className="table-wrap">
      <table>
        <caption>내보내기 조건</caption>
        <tbody>
          {Object.entries(labels).map(([key, label]) => {
            const value = filters[key];
            const text =
              value === null || value === undefined || value === ""
                ? "조건 없음"
                : String(value);
            return (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td className="wrap">
                  {key === "keyword" && text.length > 100
                    ? `${text.slice(0, 100)}… (100자까지만 표시)`
                    : text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
