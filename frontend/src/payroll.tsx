import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, request, send } from './api';
import { ErrorNotice, Field, Modal, useResource } from './ui';
import { useAuth } from './auth';
import { formatSeoul } from './phase2-utils';
import type { Employee, Page } from './types';
import { DEMO_PAY_NOTICE, type PayrollMonth, type PayrollDetail, type Payslip, type SalarySetting } from './types-phase3b';

const percent = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
export function PayNotice({ notice }: { notice?: string }) {
  return <aside className="notice info"><p>{DEMO_PAY_NOTICE}</p>{notice && notice !== DEMO_PAY_NOTICE && <p>{notice}</p>}</aside>;
}
export function WorkflowError({ error, subject }: { error: unknown; subject: string }) {
  const messages:Record<string,string>={SALARY_SETTING_MISSING:'대상 사원 중 급여 설정이 없는 사람이 있어 월 전체 처리가 취소되었습니다. 사원 급여 설정을 확인하세요.',PAYROLL_ALREADY_EXISTS:'이미 생성된 월입니다. 급여 목록에서 해당 월을 열어 주세요.',PAYROLL_CONFIRMED:'이미 확정된 월입니다. 수정·재계산할 수 없습니다.',PAYROLL_BUSY:'다른 급여 작업이 진행 중입니다. 잠시 후 다시 시도하세요.',EVALUATION_STATE_CONFLICT:'평가 상태가 변경되었습니다. 최신 상태를 다시 확인하세요.',EVALUATION_CYCLE_CLOSED:'평가 주기가 종료되어 작성·재배정할 수 없습니다.',EVALUATION_REVIEWER_INVALID:'본인이 아닌, 로그인 가능한 재직 중 관리자만 평가자로 배정할 수 있습니다.'};
  return <><ErrorNotice error={error}/>{error instanceof ApiError && messages[error.body.code] && <p role="alert">{messages[error.body.code]}</p>}{error instanceof ApiError && !!error.body.fieldErrors?.length && <ul>{error.body.fieldErrors.map((e,i)=><li key={i}>{e.field}: {e.reason}</li>)}</ul>}{error instanceof ApiError && error.status === 404 && <p role="alert">{subject}를 찾을 수 없거나 접근할 수 없습니다.</p>}{error instanceof ApiError && [400,409].includes(error.status) && <p role="status">요청을 완료하지 못했습니다. 최신 목록과 상세를 다시 확인하세요.</p>}</>;
}
export function Pager({ page, total, change }: { page: number; total: number; change: (page: number) => void }) {
  return <nav aria-label="페이지"><button disabled={page === 0} onClick={() => change(page - 1)}>이전</button><span> {page + 1} / {Math.max(total,1)} </span><button disabled={page + 1 >= total} onClick={() => change(page + 1)}>다음</button></nav>;
}
export function SalarySettings() {
  const [id,setId] = useState('');
  const [employee,setEmployee] = useState<Employee>();
  const [setting,setSetting] = useState<SalarySetting>();
  const [base,setBase] = useState(''); const [allowance,setAllowance] = useState('');
  const [error,setError] = useState<unknown>(); const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false); const lock = useRef(false);
  const load = async () => {
    if (lock.current) return; lock.current=true; setBusy(true); setEmployee(undefined); setSetting(undefined); setError(undefined); setMessage('');
    try {
      if (!/^[1-9]\d*$/.test(id)) throw new Error('양의 사원 ID를 입력하세요.');
      const person = await request<Employee>(`/employees/${id}`); setEmployee(person);
      try { const value = await request<SalarySetting>(`/employees/${id}/salary-setting`); setSetting(value); setBase(String(value.baseSalary)); setAllowance(String(value.allowance)); }
      catch(e) { if(e instanceof ApiError && e.status===404) {setBase('');setAllowance('');setMessage('급여 설정이 없습니다. 새 설정을 입력하세요.');} else throw e; }
    } catch(e) {setError(e);} finally {lock.current=false;setBusy(false);}
  };
  const save = async () => {
    if(lock.current || !employee) return; lock.current=true;setBusy(true);setError(undefined);setMessage('');
    try {
      if (![base,allowance].every(v=>/^\d+$/.test(v) && Number(v)<=1_000_000_000)) throw new Error('기본급과 수당은 0~1,000,000,000 정수 원으로 입력하세요.');
      const value = await send<SalarySetting>(`/employees/${employee.id}/salary-setting`,'PUT',{baseSalary:Number(base),allowance:Number(allowance)});setSetting(value);setMessage('저장했습니다. 이미 생성한 명세는 자동 변경되지 않습니다.');
    } catch(e) {setError(e);if(e instanceof ApiError && [400,409].includes(e.status)){const latest=await request<SalarySetting>(`/employees/${employee.id}/salary-setting`).catch(()=>undefined);setSetting(latest);}} finally {lock.current=false;setBusy(false);}
  };
  return <><h1>사원 급여 설정</h1><PayNotice/><section className="panel"><Field name="employee-id" label="사원 ID"><input id="employee-id" value={id} disabled={busy} onChange={e=>{setId(e.target.value);setEmployee(undefined);setSetting(undefined);setMessage('');}}/></Field><button disabled={busy} onClick={load}>사원 조회</button><WorkflowError error={error} subject="사원"/><p role="status">{message}</p>{employee && <><h2>{employee.name} ({employee.employeeNo})</h2><p>기본급·수당 각각 0~1,000,000,000원, 정수 원만 입력합니다.</p><Field name="base-salary" label="기본급 (원)"><input id="base-salary" inputMode="numeric" value={base?Number(base).toLocaleString('ko-KR'):''} disabled={busy} onChange={e=>setBase(e.target.value.replaceAll(',',''))}/></Field><Field name="allowance" label="수당 (원)"><input id="allowance" inputMode="numeric" value={allowance?Number(allowance).toLocaleString('ko-KR'):''} disabled={busy} onChange={e=>setAllowance(e.target.value.replaceAll(',',''))}/></Field>{setting && <p>산식 버전 {setting.formulaVersion} · 서버 고정 공제율: {setting.deductionRates.map(percent).join(' · ')}</p>}<button className="primary" disabled={busy} onClick={save}>설정 저장</button></>}</section></>;
}
export function SeoulTime({value}:{value:string|null}) { return value ? <time dateTime={value}>{formatSeoul(value).slice(0,16)} (KST)</time> : <span>미확정</span>; }
export function StateBadge({state}:{state:string}) { const label:Record<string,string>={DRAFT:'초안',CONFIRMED:'확정',OPEN:'진행 중',CLOSED:'종료',SELF_DRAFT:'자기평가 작성 중',SELF_SUBMITTED:'평가 진행 중',MANAGER_DRAFT:'평가 진행 중',FINALIZED:'최종 확정'}; return <span className={`badge ${['CONFIRMED','FINALIZED'].includes(state)?'badge--success':['CLOSED','DRAFT'].includes(state)?'':'badge--info'}`}>{label[state]||state}</span>; }
function Snapshot({value}:{value:PayrollMonth|Payslip}) {
  return <dl className="snapshot-grid"><dt>생성 시점 / 처리자</dt><dd><SeoulTime value={value.generatedAt}/> / {value.generatedBy.name}</dd><dt>확정 시점 / 처리자</dt><dd><SeoulTime value={value.confirmedAt}/> / {value.confirmedBy?.name || '—'}</dd></dl>;
}
export function PayslipView({value,showNotice=true}:{value:Payslip;showNotice?:boolean}) {
  return <section className="panel">{showNotice && <PayNotice notice={value.demoNotice}/>}<h2>{value.month} · {value.employee.name} ({value.employee.employeeNo})</h2><p><StateBadge state={value.status}/> · {value.department.name} / {value.position.name} / {value.jobTitle?.name || '—'}</p><p>생성 시점의 설정과 소속 스냅샷입니다. 과거 이력을 복원한 것이 아닙니다. 산식 버전 {value.formulaVersion}</p><div className="pay-net">실수령<strong>{won(value.netPay)}</strong></div><div className="payslip-columns"><div className="table-wrap"><table className="payslip-amount-table"><caption>서버 산정 지급</caption><thead><tr><th>항목</th><th>금액</th></tr></thead><tbody>{[['기본급',value.baseSalary],['수당',value.allowance],['총지급',value.grossPay]].map(([name,amount])=><tr key={name}><td data-label="항목">{name}</td><td data-label="금액">{won(amount as number)}</td></tr>)}</tbody></table></div><div className="table-wrap"><table className="payslip-amount-table"><caption>서버 산정 공제</caption><thead><tr><th>항목</th><th>공제율</th><th>금액</th></tr></thead><tbody>{value.deductions.map((d,i)=><tr key={i}><td data-label="항목">{d.name}</td><td data-label="공제율">{percent(d.rateBps)}</td><td data-label="금액">{won(d.amount)}</td></tr>)}<tr><td data-label="항목">총공제</td><td data-label="공제율">—</td><td data-label="금액">{won(value.totalDeductions)}</td></tr></tbody></table></div></div><Snapshot value={value}/></section>;
}
export function PayslipDetail() {
  const {id}=useParams();return <PayslipDetailScreen key={id}/>;
}
function PayslipDetailScreen() {
  const {id} = useParams();const resource=useResource<Payslip>(`/payslips/${id}`);
  return <><h1>급여명세서</h1><PayNotice notice={resource.data?.demoNotice}/><WorkflowError error={resource.error} subject="급여명세서"/>{resource.loading ? <p role="status">불러오는 중…</p> : !resource.error && resource.data && <PayslipView value={resource.data} showNotice={false}/>}</>;
}
export function PayrollList({ mine=false }: { mine?:boolean }) {
  const [page,setPage]=useState(0);const [month,setMonth]=useState('');const [status,setStatus]=useState('');const [generateMonth,setGenerateMonth]=useState('');
  const resource=useResource<Page<PayrollMonth | Payslip>>(`${mine?'/payslips/me':'/payrolls'}?page=${page}&size=20${month?`&month=${month}`:''}${!mine && status?`&status=${status}`:''}`);
  const [error,setError]=useState<unknown>();const [busy,setBusy]=useState(false);const lock=useRef(false);
  const generate=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError(undefined);try{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(generateMonth))throw new Error('생성할 월을 입력하세요.');await send('/payrolls','POST',{month:generateMonth});resource.reload();}catch(e){setError(e);if(e instanceof ApiError && [400,409].includes(e.status))resource.reload();}finally{lock.current=false;setBusy(false);}};
  return <><h1>{mine?'내 급여명세서':'급여 관리'}</h1><PayNotice/>{!mine && <section className="panel"><p><Link to="/admin/payroll/settings">사원 급여 설정</Link></p><Field name="generate-month" label="생성할 월"><input id="generate-month" type="month" value={generateMonth} onChange={e=>setGenerateMonth(e.target.value)}/></Field><p>과거월도 생성 시점의 설정·소속으로 생성됩니다. 미래 월은 서버가 거절합니다.</p><button disabled={busy} onClick={generate}>월 급여 생성</button></section>}<WorkflowError error={error || resource.error} subject="급여"/><section className="panel"><Field name="pay-month" label="조회 월"><input id="pay-month" type="month" value={month} onChange={e=>{setMonth(e.target.value);setPage(0);}}/></Field>{!mine && <Field name="pay-status" label="상태"><select id="pay-status" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">전체</option><option value="DRAFT">초안</option><option value="CONFIRMED">확정</option></select></Field>}{resource.loading?<p role="status">불러오는 중…</p>:!resource.error && <><div className="table-wrap"><table className="responsive-table phase3b-table"><thead><tr><th>월</th><th>상태</th><th>{mine?'부서 (당시)':'대상 수'}</th><th>생성·확정 시점 / 처리자</th><th>상세</th></tr></thead><tbody>{resource.data?.content.map(v=><tr key={'id' in v?v.id:v.month}><td data-label="월">{v.month}</td><td data-label="상태"><StateBadge state={v.status}/></td><td data-label={mine?'부서 (당시)':'대상 수'}>{'netPay' in v?v.department.name:`${v.count}명`}</td><td data-label="생성·확정 시점 / 처리자"><div className="event-times"><p>생성 <SeoulTime value={v.generatedAt}/> · {v.generatedBy.name}</p><p>확정 <SeoulTime value={v.confirmedAt}/> · {v.confirmedBy?.name || '—'}</p></div></td><td data-label="상세"><Link to={mine?`/my/payslips/${(v as Payslip).id}`:`/admin/payroll/${v.month}`}>상세 보기</Link></td></tr>)}</tbody></table></div>{!resource.data?.content.length && <p className="empty">{mine?'확정된 급여명세서가 없습니다.':'생성된 급여가 없습니다.'}</p>}<Pager page={page} total={resource.data?.totalPages ?? 0} change={setPage}/></>}</section></>;
}
export function MyPayslips(){return <PayrollList mine/>;}
function PayrollRows({payslips}:{payslips:Payslip[]}) {
  const [query,setQuery]=useState('');const [selected,setSelected]=useState<number>();
  const visible=payslips.filter(v=>`${v.employee.name} ${v.employee.employeeNo}`.includes(query));
  return <section className="panel"><Field name="payslip-search" label="이름·사번 검색"><input id="payslip-search" value={query} onChange={e=>setQuery(e.target.value)}/></Field><div className="table-wrap"><table className="responsive-table phase3b-table"><caption>생성 당시 스냅샷 · 과거 이력 복원 아님</caption><thead><tr><th>사원 (당시)</th><th>부서</th><th>직급</th><th>직책</th><th>총지급</th><th>총공제</th><th>실수령</th><th>명세</th></tr></thead><tbody>{visible.map(v=><tr key={v.id}><td data-label="사원 (당시)">{v.employee.name} ({v.employee.employeeNo})</td><td data-label="부서">{v.department.name}</td><td data-label="직급">{v.position.name}</td><td data-label="직책">{v.jobTitle?.name ?? '—'}</td><td data-label="총지급">{won(v.grossPay)}</td><td data-label="총공제">{won(v.totalDeductions)}</td><td data-label="실수령">{won(v.netPay)}</td><td data-label="명세"><button onClick={()=>setSelected(selected===v.id?undefined:v.id)}>{v.employee.name} 명세</button></td></tr>)}</tbody></table></div>{!visible.length && <p className="empty">조건에 맞는 명세가 없습니다.</p>}{payslips.filter(v=>v.id===selected).map(v=><PayslipView key={v.id} value={v} showNotice={false}/>)}</section>;
}
export function PayrollMonthDetail() {
  const {month}=useParams();return <PayrollMonthDetailScreen key={month}/>;
}
function PayrollMonthDetailScreen() {
  const {month}=useParams();const resource=useResource<PayrollDetail>(`/payrolls/${month}`);
  // Refresh the corresponding list after every mutation/conflict as well as this detail.
  const [error,setError]=useState<unknown>();const [action,setAction]=useState<'RECALCULATE'|'CONFIRM'>();const [checked,setChecked]=useState(false);const [busy,setBusy]=useState(false);const lock=useRef(false);const {user}=useAuth();
  const execute=async()=>{if(lock.current || !action || !checked || !resource.data?.payroll.allowedActions.includes(action))return;lock.current=true;setBusy(true);setError(undefined);try{await send(`/payrolls/${month}/${action==='CONFIRM'?'confirm':'recalculate'}`,'POST');setAction(undefined);}catch(e){setError(e);}finally{resource.reload();void request(`/payrolls?month=${month}&page=0&size=20`).catch(()=>{});lock.current=false;setBusy(false);}};
  const value=resource.data;
  return <><h1>{month} 월 급여</h1><PayNotice/><WorkflowError error={error || resource.error} subject="월 급여"/>{resource.loading?<p role="status">불러오는 중…</p>:!resource.error && value && <><section className="panel"><h2>{value.payroll.status==='CONFIRMED'?'확정 · 변경 불가':'초안'} · {value.payroll.count}명</h2><Snapshot value={value.payroll}/><div className="actions workflow-actions">{user?.role==='ADMIN' && value.payroll.allowedActions.map(a=><button key={a} disabled={busy} onClick={()=>{setAction(a);setChecked(false);setError(undefined);}}>{a==='CONFIRM'?'월 전체 확정':'재계산'}</button>)}</div></section><PayrollRows payslips={value.payslips}/></>}{action && <Modal titleId="pay-confirm-title" busy={busy} onClose={()=>setAction(undefined)}><h2 id="pay-confirm-title">{action==='CONFIRM'?'월 전체 확정 확인':'재계산 확인'}</h2><p>{month} 급여 {value?.payroll.count ?? 0}건을 {action==='CONFIRM'?'확정':'재계산'}합니다. {action==='CONFIRM'?'확정하면 사원이 자기 명세를 볼 수 있게 됩니다. ':''}</p><p>{action==='CONFIRM'?'확정 후 수정·삭제·취소·재생성을 할 수 없습니다.':'현재 대상자·설정·소속으로 월 전체 초안을 교체합니다. 기존 스냅샷이 변경됩니다.'}</p><WorkflowError error={error} subject="급여"/><label className="confirmation-check"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>내용을 확인했습니다</label><div className="actions workflow-actions"><button disabled={busy} onClick={()=>setAction(undefined)}>취소</button><button className={action==='CONFIRM'?'danger-solid':'danger'} disabled={busy || !checked || resource.loading || !value?.payroll.allowedActions.includes(action)} onClick={execute}>{action==='CONFIRM'?'확정 실행':'재계산 실행'}</button></div></Modal>}</>;
}
