import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, request, requestResponse } from "./api";
import { ErrorNotice, Field, Modal } from "./ui";
import { exportQuery } from "./phase2-utils";
export function downloadName(header: string | null, fallback: string) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let name = fallback;
  try {
    name = encoded
      ? decodeURIComponent(encoded)
      : header?.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
  } catch {
    /* Use safe fallback for malformed header. */
  }
  return name.replace(/[\\/\u0000-\u001f]/g, "_");
}
export async function downloadFile(path: string, fallback: string) {
  const response = await requestResponse(path);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName(
    response.headers.get("Content-Disposition"),
    fallback,
  );
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function FileActions({
  filters,
  total,
}: {
  filters: Record<string, string>;
  total?: number;
}) {
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  async function download(kind: "xlsx" | "csv" | "template") {
    if (lock.current) return;
    lock.current = true;
    setBusy(kind);
    setError(undefined);
    setMessage("");
    try {
      await downloadFile(
        kind === "template"
          ? "/employees/import-template"
          : `/employees/export?${exportQuery(filters, kind)}`,
        kind === "template"
          ? "ems-employees-import-template.xlsx"
          : `ems-employees.${kind}`,
      );
      setMessage("파일을 만들었습니다. 브라우저 다운로드를 확인하세요.");
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <div className="file-actions">
      <div className="actions">
        <span className="muted">
          현재 조건 전체 {total === undefined ? "" : `${total}명`} · 페이지 구분
          없음
        </span>
        <button disabled={!!busy} onClick={() => download("xlsx")}>
          {busy === "xlsx"
            ? "파일 만드는 중…"
            : "현재 조건으로 내보내기 (xlsx)"}
        </button>
        <button disabled={!!busy} onClick={() => download("csv")}>
          CSV 내보내기
        </button>
        <button disabled={!!busy} onClick={() => download("template")}>
          양식 다운로드
        </button>
        <Link className="button" to="/employees/import">
          엑셀 가져오기
        </Link>
      </div>
      <ErrorNotice error={error} />
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
const importLabels: Record<string, string> = {
  employeeNo: "사번",
  name: "이름",
  email: "이메일",
  phone: "전화번호",
  hireDate: "입사일",
  departmentId: "부서 ID",
  positionId: "직급 ID",
  role: "역할",
  initialPassword: "초기 비밀번호",
};
export function ImportEmployees() {
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [count, setCount] = useState<number>();
  const [templateBusy, setTemplateBusy] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [templateError, setTemplateError] = useState<unknown>();
  const rows =
    error instanceof ApiError && error.body.code === "IMPORT_VALIDATION_ERROR"
      ? error.body.rowErrors || []
      : [];
  function validate(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setCount(undefined);
    setOutcomeUnknown(false);
    if (!file) {
      setError(new Error("파일을 선택하세요."));
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError(new Error(".xlsx 파일만 올릴 수 있습니다."));
      return;
    }
    if (file.size > 5242880) {
      setError(new Error("파일 크기가 5MiB를 넘습니다."));
      return;
    }
    setConfirm(true);
  }
  async function upload() {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const data = new FormData();
      data.append("file", file);
      const result = await request<{ importedCount: number }>(
        "/employees/import",
        { method: "POST", body: data },
      );
      setCount(result.importedCount);
    } catch (e) {
      setError(e);
      setOutcomeUnknown(!(e instanceof ApiError) || e.status >= 500);
    } finally {
      lock.current = false;
      setBusy(false);
      setConfirm(false);
    }
  }
  async function template() {
    setTemplateBusy(true);
    setTemplateError(undefined);
    try {
      await downloadFile(
        "/employees/import-template",
        "ems-employees-import-template.xlsx",
      );
    } catch (e) {
      setTemplateError(e);
    } finally {
      setTemplateBusy(false);
    }
  }
  return (
    <>
      <div className="title-row">
        <div>
          <h1>엑셀 가져오기</h1>
          <p className="muted">
            양식에 사원 정보를 입력하고 한 번에 등록하세요.
          </p>
        </div>
        <button onClick={template} disabled={templateBusy}>
          {templateBusy ? "파일 만드는 중…" : "양식 다운로드"}
        </button>
      </div>
      <section className="panel">
        <ErrorNotice error={templateError} />
        <h2>파일 준비</h2>
        <ol className="instructions">
          <li>employees 시트를 사용하고 머리글을 유지하세요.</li>
          <li>departments·positions 참조 시트의 ID를 사용하세요.</li>
          <li>
            사번·입사일·초기 비밀번호는 문자열 셀로 입력하세요. 입사일은
            YYYY-MM-DD 형식입니다.
          </li>
        </ol>
        <p className="notice info">
          오류가 하나라도 있으면 등록이 전부 취소됩니다. 어떤 행도 부분 등록되지
          않습니다. .xlsx · 최대 5MiB · 데이터 1,000행 · 수식 셀 사용 불가
        </p>
        <form onSubmit={validate}>
          <Field name="importFile" label="사원 등록 파일">
            <span className="file-picker">
              <span className="button" aria-hidden="true">
                파일 선택
              </span>
              <input
                id="importFile"
                type="file"
                accept=".xlsx"
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setError(undefined);
                  setCount(undefined);
                  setOutcomeUnknown(false);
                }}
              />
            </span>
          </Field>
          <p className="muted">
            {file
              ? `${file.name} · ${(file.size / 1024).toFixed(1)} KiB`
              : "선택한 파일이 없습니다."}
          </p>
          <button className="primary" disabled={busy} aria-busy={busy}>
            {busy ? "파일을 검사하고 등록하는 중…" : "등록 내용 확인"}
          </button>
        </form>
        {!!error && (
          <div className="import-result">
            <div className="notice error" role="alert">
              <h2><span aria-hidden="true">! </span>
                {outcomeUnknown
                  ? "등록 결과 확인이 필요합니다"
                  : "등록이 모두 취소되었습니다"}
              </h2>
              <p>
                {outcomeUnknown
                  ? "연결 오류로 처리 결과를 확인하지 못했습니다. 사원 목록에서 등록 여부를 먼저 확인한 뒤 다시 시도하세요."
                  : "아무것도 등록되지 않았습니다. 오류를 고친 뒤 파일 전체를 다시 올려 주세요."}
              </p>
              {rows.length > 0 ? (
                <p>
                  파일의 {new Set(rows.map((r) => r.row)).size}개 행에서 오류{" "}
                  {rows.length}건이 발견되었습니다.
                </p>
              ) : error instanceof ApiError &&
                [
                  "전체 등록이 취소되었습니다",
                  "전체 등록이 취소되었습니다.",
                  "등록이 모두 취소되었습니다",
                  "등록이 모두 취소되었습니다.",
                ].includes(error.body.message) ? null : (
                <p>
                  {error instanceof ApiError
                    ? error.body.message
                    : error instanceof Error
                      ? error.message
                      : "파일을 확인하세요."}
                </p>
              )}
              {error instanceof ApiError &&
                error.body.code === "IMPORT_INVALID_FILE" && (
                  <p>
                    파일 형식·시트·머리글, 데이터 1~1,000행, 손상·암호 설정과
                    압축 해제 한도를 확인하세요.
                  </p>
                )}
            </div>
            {rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <caption>가져오기 오류 · 엑셀 실제 행 번호</caption>
                  <thead>
                    <tr>
                      <th scope="col">엑셀 행</th>
                      <th scope="col">항목</th>
                      <th scope="col">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <td className="row-number">{row.row}</td>
                        <td>
                          {importLabels[row.field] || "항목"}{" "}
                          <code>{row.field}</code>
                        </td>
                        <td className="wrap">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {count !== undefined && (
          <div className="notice success" role="status">
            <strong>{count}명을 등록했습니다.</strong>{" "}
            <Link to="/employees">사원 목록에서 보기</Link>
          </div>
        )}
      </section>
      {confirm && (
        <Modal
          titleId="import-confirm"
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          <h2 id="import-confirm">사원 일괄 등록 확인</h2>
          <p>
            {file?.name} 파일의 사원을 등록합니다. 오류가 있으면 전부
            취소됩니다.
          </p>
          {busy && (
            <p role="status">파일을 검사하고 등록하는 중… 창을 닫지 마세요.</p>
          )}
          <div className="actions">
            <button disabled={busy} onClick={() => setConfirm(false)}>
              취소
            </button>
            <button className="primary" disabled={busy} onClick={upload}>
              {busy ? "등록 중…" : "전체 등록"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
