export function seoulToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function seoulDateRange(start: string, end: string) {
  if (start && end && start > end)
    throw new Error("종료일은 시작일 이후여야 합니다.");
  const result: Record<string, string> = {};
  if (start) result.from = `${start}T00:00:00+09:00`;
  if (end) {
    const next = new Date(`${end}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    result.to = `${next.toISOString().slice(0, 10)}T00:00:00+09:00`;
  }
  return result;
}
export function exportQuery(
  filters: Record<string, string>,
  format: "xlsx" | "csv",
) {
  const query = new URLSearchParams({ format });
  for (const key of ["keyword", "departmentId", "positionId", "status", "sort"])
    if (filters[key]) query.set(key, filters[key]);
  return query.toString();
}
export function formatSeoul(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
