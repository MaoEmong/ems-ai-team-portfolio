import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { ErrorNotice, useResource } from "./ui";
import type { Organization as OrganizationData } from "./types-phase3b";

export function Organization() {
  const result = useResource<OrganizationData>("/organization");
  const { user } = useAuth();
  const [mode, setMode] = useState<"list" | "tree">("list");
  const [selected, setSelected] = useState<number>();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<number>();
  const [query, setQuery] = useState("");
  const tree = useRef<HTMLUListElement>(null);
  const data = result.data;
  const selectedId = selected ?? data?.departments[0]?.id;
  const department = data?.departments.find(d => d.id === selectedId);
  const people = data?.employees.filter(e => e.department.id === selectedId) || [];
  const children = (parentId:number|null) => data?.departments.filter(d => d.parentId === parentId || (parentId === null && !data.departments.some(parent => parent.id === d.parentId))) || [];
  const matching = new Set<number>();
  if (data && query.trim()) {
    const needle = query.trim().toLocaleLowerCase();
    for (const d of data.departments) if (d.name.toLocaleLowerCase().includes(needle)) matching.add(d.id);
    for (const e of data.employees) if (`${e.name} ${e.employeeNo}`.toLocaleLowerCase().includes(needle)) matching.add(e.department.id);
    for (const id of [...matching]) {
      const seen = new Set<number>(); let current = data.departments.find(d => d.id === id);
      while (current?.parentId && !seen.has(current.id)) { seen.add(current.id); matching.add(current.parentId); current = data.departments.find(d => d.id === current!.parentId); }
    }
  }
  function toggle(id:number, open?:boolean) { setExpanded(previous => { const next = new Set(previous); if(open ?? !next.has(id)) next.add(id); else next.delete(id); return next; }); }
  function keyboard(e:KeyboardEvent<HTMLElement>, id:number, parentId:number|null, hasChildren:boolean) {
    e.stopPropagation();
    const items = Array.from(tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') || []);
    const index = items.indexOf(e.currentTarget);
    let target:HTMLElement|undefined;
    if(e.key === "ArrowDown") target = items[index + 1];
    else if(e.key === "ArrowUp") target = items[index - 1];
    else if(e.key === "Home") target = items[0];
    else if(e.key === "End") target = items.at(-1);
    else if(e.key === "ArrowRight" && hasChildren) { if(!expanded.has(id)) toggle(id,true); else target=items[index+1]; }
    else if(e.key === "ArrowLeft") { if(expanded.has(id)) toggle(id,false); else if(parentId) target=items.find(el => el.dataset.id === String(parentId)); }
    else if(e.key === "Enter" || e.key === " ") setSelected(id);
    else return;
    e.preventDefault(); if(target) { setFocus(Number(target.dataset.id)); target.focus(); }
  }
  function branches(parentId:number|null, depth=1, seen=new Set<number>()):React.ReactNode {
    const entries = children(parentId).filter(d => !query.trim() || matching.has(d.id));
    return entries.map((d,index) => {
      if(seen.has(d.id)) return null;
      const hasChildren = children(d.id).length > 0;
      const open = !!query.trim() || expanded.has(d.id);
      const count = data!.employees.filter(e => e.department.id === d.id).length;
      const title = <>{hasChildren ? open ? "▾ " : "▸ " : ""}{d.name} <small>({count}){count === 0 ? " 빈 부서" : ""}</small></>;
      const descendants = branches(d.id,depth+1,new Set([...seen,d.id]));
      return mode === "list" ? <li key={d.id}><button aria-pressed={selectedId===d.id} onClick={()=>setSelected(d.id)}>{title}</button>{hasChildren && <ul>{descendants}</ul>}</li> : <li key={d.id} role="treeitem" data-id={d.id} aria-level={depth} aria-posinset={index+1} aria-setsize={entries.length} aria-selected={selectedId===d.id} aria-expanded={hasChildren ? open : undefined} tabIndex={(focus ?? data?.departments.find(x=>x.parentId===null)?.id)===d.id?0:-1} onFocus={e=>{e.stopPropagation();setFocus(d.id)}} onClick={e=>{e.stopPropagation();setSelected(d.id)}} onKeyDown={e=>keyboard(e,d.id,d.parentId,hasChildren)}><span className="tree-label">{title}</span>{hasChildren && <button tabIndex={-1} aria-label={`${d.name} ${open ? "접기" : "펼치기"}`} onClick={e=>{e.stopPropagation();toggle(d.id)}}>{open ? "접기" : "펼치기"}</button>}{hasChildren && open && <ul role="group">{descendants}</ul>}</li>;
    });
  }
  return <><div className="title-row"><div><h1>조직도</h1><p className="muted">재직·휴직 사원과 빈 부서를 표시합니다. 직책은 시스템 권한을 부여하지 않습니다.</p></div>{user?.role === "ADMIN" && <Link className="button" to="/departments">부서 계층 관리</Link>}</div><ErrorNotice error={result.error}/>{result.error && <button onClick={result.reload}>다시 시도</button>}{result.loading ? <p role="status">조직도를 불러오는 중…</p> : !result.error && data && <><section className="panel organization-toolbar"><label htmlFor="organization-search">부서·사원 검색</label><input id="organization-search" value={query} onChange={e=>setQuery(e.target.value)}/><div className="actions section-gap"><button aria-pressed={mode==="list"} onClick={()=>setMode("list")}>계층 목록 보기</button><button aria-pressed={mode==="tree"} onClick={()=>setMode("tree")}>트리 보기</button><button onClick={()=>setExpanded(new Set(data.departments.map(d=>d.id)))}>모두 펼치기</button><button onClick={()=>setExpanded(new Set())}>모두 접기</button></div></section>{!data.departments.length ? <p className="empty">등록된 부서가 없습니다.</p> : <div className="organization-grid section-gap"><section className="panel"><h2>부서 계층</h2>{query.trim() && matching.size === 0 && <p className="empty">검색 결과가 없습니다.</p>}<ul className="organization-tree" ref={tree} role={mode==="tree"?"tree":undefined} aria-label="부서 계층">{branches(null)}</ul></section><section className="panel"><h2 aria-live="polite">{department?.name || "부서를 선택하세요"}</h2>{department && <><p className="muted">직속 {people.length}명(표에서 센 수) · 상위 {data.departments.find(d=>d.id===department.parentId)?.name || "최상위"}</p>{!people.length ? <p className="empty">이 부서에는 재직·휴직 사원이 없습니다.</p> : <div className="table-wrap"><table className="responsive-table organization-people-table"><caption>{department.name} 소속 사원</caption><thead><tr><th>이름·사번</th><th>직급</th><th>직책</th><th>상태</th></tr></thead><tbody>{people.map(e=><tr key={e.id}><td data-label="이름·사번">{e.name} ({e.employeeNo})</td><td data-label="직급">{e.position.name}</td><td data-label="직책">{e.jobTitle?.name || "—"}</td><td data-label="상태"><span className={`badge ${e.onLeave ? "badge--warning" : "badge--success"}`}>{e.onLeave?"휴직":"재직"}</span></td></tr>)}</tbody></table></div>}</>}</section></div>}</>}</>;
}
