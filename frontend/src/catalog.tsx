import { useState, type FormEvent } from "react";
import { send } from "./api";
import { ErrorNotice, Field, Modal, fieldErrors, useResource } from "./ui";
import type { Department, Position } from "./types";
export function Catalog({ kind }: { kind: "departments" | "positions" | "job-titles" }) {
  const department = kind === "departments";
  const position = kind === "positions";
  const title = department ? "부서" : position ? "직급" : "직책";
  const result = useResource<(Department & Partial<Position>)[]>(`/${kind}`);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("1");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<unknown>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  function invalidParent(id: number) {
    const seen = new Set<number>();
    let current = result.data?.find(d => d.id === id);
    while (current && !seen.has(current.id)) {
      if (current.id === editing) return true;
      seen.add(current.id);
      current = result.data?.find(d => d.id === current?.parentId);
    }
    return false;
  }
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(
    null,
  );
  const reset = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setLevel("1");
    setParentId("");
    setErrors({});
    setError(undefined);
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    const validation: Record<string, string> = {};
    if (!name.trim()) validation.name = "이름을 입력하세요.";
    if (name.length > 100) validation.name = "이름은 100자 이하로 입력하세요.";
    if (!position && description.length > 500) validation.description = "설명은 500자 이하로 입력하세요.";
    if (position && (!level.trim() || !Number.isInteger(Number(level))))
      validation.level = "정수를 입력하세요.";
    setErrors(validation);
    setError(undefined);
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      await send(
        `/${kind}${editing ? `/${editing}` : ""}`,
        editing ? "PUT" : "POST",
        position ? { name, level: Number(level) } : { name, description, ...(department ? {parentId: parentId ? Number(parentId) : null} : {}) },
      );
      reset();
      result.reload();
    } catch (e) {
      setError(e);
      setErrors(fieldErrors(e));
      result.reload();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError(undefined);
    try {
      await send(`/${kind}/${deleting.id}`, "DELETE");
      setDeleting(null);
      reset();
      result.reload();
    } catch (e) {
      setError(e);
      result.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">ORGANIZATION</p>
          <h1>{title} 관리</h1>
          <p className="muted">
            현재 소속 사원(퇴사자 포함) 또는 과거 발령 이력에서 참조하는 {title}
            는 삭제할 수 없습니다.
            {department && " 하위 부서가 있는 부서도 삭제할 수 없습니다."}
          </p>
        </div>
      </div>
      <div className="catalog-grid">
        <section className="panel">
          <h2>{title} 목록</h2>
          <ErrorNotice error={result.error} />
          {result.error && <button onClick={result.reload}>다시 시도</button>}
          {result.loading ? (
            <p role="status">목록을 불러오는 중…</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>{position ? "정렬 순서" : "설명"}</th>
                      {department && <th>상위 부서</th>}
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data?.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>
                          {position ? item.level : item.description || "—"}
                        </td>
                        {department && <td>{result.data?.find(d=>d.id===item.parentId)?.name || "최상위"}</td>}
                        <td>
                          <div className="actions">
                            <button
                              disabled={busy}
                              onClick={() => {
                                setEditing(item.id);
                                setName(item.name);
                                setDescription(item.description || "");
                                setLevel(String(item.level ?? 1));
                                setParentId(item.parentId ? String(item.parentId) : "");
                                setErrors({});
                                setError(undefined);
                              }}
                            >
                              수정<span className="sr-only"> {item.name}</span>
                            </button>
                            <button
                              className="danger"
                              disabled={busy}
                              onClick={() => {
                                setError(undefined);
                                setDeleting(item);
                              }}
                            >
                              삭제<span className="sr-only"> {item.name}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!result.data?.length && !result.error && (
                <p className="empty">등록된 {title}가 없습니다.</p>
              )}
            </>
          )}
        </section>
        <form className="panel" onSubmit={save} noValidate>
          <h2>
            {title} {editing ? "수정" : "등록"}
          </h2>
          {!deleting && <ErrorNotice error={error} />}
          <Field name="name" label={`${title} 이름 *`} error={errors.name}>
            <input
              id="name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {!position ? (
            <Field name="description" label="설명" error={errors.description}>
              <textarea
                id="description"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          ) : (
            <Field name="level" label="정렬 순서 *" error={errors.level}>
              <input
                id="level"
                type="number"
                step="1"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              />
            </Field>
          )}
          {department && <Field name="parentDepartment" label="상위 부서" error={errors.parentId}><select id="parentDepartment" value={parentId} disabled={busy} onChange={e=>setParentId(e.target.value)}><option value="">최상위 부서</option>{result.data?.map(d=><option key={d.id} value={d.id} disabled={invalidParent(d.id)}>{d.name}{invalidParent(d.id) ? " (자기 또는 하위 부서)" : ""}</option>)}</select><small className="muted">상위를 바꾸면 하위 부서도 함께 옮겨집니다. 사원의 소속은 바뀌지 않으며 순환 여부는 서버가 최종 확인합니다.</small></Field>}
          <div className="actions">
            {editing && (
              <button type="button" disabled={busy} onClick={reset}>
                수정 취소
              </button>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "저장 중…" : editing ? "변경 저장" : "등록"}
            </button>
          </div>
        </form>
      </div>
      {deleting && (
        <Modal
          titleId="delete-title"
          busy={busy}
          onClose={() => {
            setDeleting(null);
            setError(undefined);
          }}
        >
          <h2 id="delete-title">{title} 삭제 확인</h2>
          <p>{deleting.name}을(를) 삭제하시겠습니까?</p>
          <ErrorNotice error={error} />
          <div className="actions">
            <button
              autoFocus
              disabled={busy}
              onClick={() => {
                setDeleting(null);
                setError(undefined);
              }}
            >
              취소
            </button>
            <button className="danger" disabled={busy} onClick={remove}>
              {busy ? "삭제 중…" : "삭제"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
