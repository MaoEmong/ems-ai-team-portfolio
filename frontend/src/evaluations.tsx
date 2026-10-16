import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, request, send } from './api';
import { useAuth } from './auth';
import { EvaluationSummaryAi } from './ai';
import { Field, FormErrors, Modal, useResource } from './ui';
import { Pager, WorkflowError, StateBadge } from './payroll';
import type { Page } from './types';
import type { EvaluationAnswer, EvaluationCycle, EvaluationCycleDetail as Cycle, EvaluationAssignmentSummary as Assignment, EvaluationDetail as Detail, EvaluationSummary, PersonRef } from './types-phase3b';

const stateLabel: Record<string,string>={SELF_DRAFT:'자기평가 작성 중',SELF_SUBMITTED:'평가 진행 중',MANAGER_DRAFT:'평가 진행 중',FINALIZED:'최종 확정',DRAFT:'초안',OPEN:'진행 중',CLOSED:'종료'};
type CycleInput={name:string;startDate:string;endDate:string;items:{name:string;sortOrder:number}[];assignments:{employeeId:number;reviewerId:number}[]};
function PersonIdField({id,label,value,onChange,disabled=false}:{id:string;label:string;value:string|number;onChange:(value:string)=>void;disabled?:boolean}) {
  const [person,setPerson]=useState<PersonRef>();
  const [error,setError]=useState<unknown>();
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const lookup=async()=>{
    if(lock.current)return;
    setError(undefined);setPerson(undefined);
    if(!/^[1-9]\d*$/.test(String(value))){setError(new Error('양의 사원 ID를 입력하세요.'));return;}
    lock.current=true;setBusy(true);
    try {
      const result=await request<PersonRef>(`/employees/${value}`);
      setPerson({id:result.id,employeeNo:result.employeeNo,name:result.name});
    } catch(e){setError(e);} finally{lock.current=false;setBusy(false);}
  };
  return <div><Field name={id} label={label}><input id={id} type="number" min="1" step="1" value={value || ''} disabled={disabled || busy} onChange={e=>{setPerson(undefined);setError(undefined);onChange(e.target.value);}}/></Field><button type="button" disabled={disabled || busy} onClick={()=>void lookup()}>{label} 확인</button>{person?.id===Number(value) && <p role="status">{person.name} ({person.employeeNo})</p>}<WorkflowError error={error} subject="사원"/></div>;
}
export function validateCycle(value:CycleInput) {
  const errors:Record<string,string>={};
  if(!value.name.trim() || value.name.length>100)errors.name='주기 이름을 1~100자로 입력하세요.';
  if(!value.startDate || !value.endDate || value.startDate>value.endDate)errors.startDate='시작일과 종료일을 순서에 맞게 입력하세요.';
  if(value.items.length<1 || value.items.length>20 || value.items.some(i=>!i.name.trim() || i.name.length>100 || !Number.isInteger(i.sortOrder) || i.sortOrder<0 || i.sortOrder>10000) || new Set(value.items.map(i=>i.name.trim())).size!==value.items.length || new Set(value.items.map(i=>i.sortOrder)).size!==value.items.length)errors.items='항목은 1~20개, 이름은 1~100자이며 이름과 순서는 중복될 수 없습니다.';
  if(!value.assignments.length || value.assignments.some(a=>!Number.isSafeInteger(a.employeeId) || a.employeeId<1 || !Number.isSafeInteger(a.reviewerId) || a.reviewerId<1 || a.employeeId===a.reviewerId) || new Set(value.assignments.map(a=>a.employeeId)).size!==value.assignments.length)errors.assignments='서로 다른 대상 사원을 1명 이상 배정하고, 본인이 아닌 평가자 ID를 입력하세요.';
  return errors;
}
export function validateAnswers(answers:EvaluationAnswer[],submit:boolean) {
  const errors:Record<string,string>={};
  answers.forEach(a=>{if((submit && a.score===null) || (a.score!==null && (!Number.isInteger(a.score) || a.score<1 || a.score>5)))errors[`score-${a.itemId}`]='점수를 1~5 정수로 선택하세요.';if((a.comment?.length ?? 0)>1000)errors[`comment-${a.itemId}`]='코멘트는 1000자 이하로 입력하세요.';});return errors;
}
function Incomplete({value}:{value:{incomplete:boolean}}){return value.incomplete?<p className="notice">미완료 · 주기가 종료되어 최종 확정되지 않았습니다. 결과가 없습니다.</p>:null;}
export function EvaluationCycles(){
  const [page,setPage]=useState(0);const resource=useResource<Page<EvaluationCycle>>(`/evaluation-cycles?page=${page}&size=20`);
  return <><h1>평가 주기 관리</h1><Link className="button primary" to="/admin/reviews/new">주기 등록</Link><WorkflowError error={resource.error} subject="평가 주기"/>{resource.loading?<p role="status">불러오는 중…</p>:!resource.error && <section className="panel"><div className="table-wrap"><table className="responsive-table phase3b-table"><thead><tr><th>주기</th><th>표시 기간</th><th>상태</th></tr></thead><tbody>{resource.data?.content.map(c=><tr key={c.id}><td data-label="주기"><Link to={`/admin/reviews/${c.id}`}>{c.name}</Link></td><td data-label="표시 기간">{c.startDate} ~ {c.endDate}</td><td data-label="상태"><StateBadge state={c.status}/></td></tr>)}</tbody></table></div>{!resource.data?.content.length && <p className="empty">평가 주기가 없습니다.</p>}<Pager page={page} total={resource.data?.totalPages ?? 0} change={setPage}/></section>}</>;
}
function CycleForm({initial,onSaved}:{initial?:Cycle;onSaved:(value:Pick<EvaluationCycle,'id'>)=>void}){
  const [value,setValue]=useState<CycleInput>(()=>initial?{name:initial.name,startDate:initial.startDate,endDate:initial.endDate,items:initial.items.map(({name,sortOrder})=>({name,sortOrder})),assignments:initial.assignments.map(({employee,reviewer})=>({employeeId:employee.id,reviewerId:reviewer.id}))}:{name:'',startDate:'',endDate:'',items:[{name:'',sortOrder:1}],assignments:[{employeeId:0,reviewerId:0}]});
  const [errors,setErrors]=useState<Record<string,string>>({});const [error,setError]=useState<unknown>();const [busy,setBusy]=useState(false);const lock=useRef(false);const [orderMessage,setOrderMessage]=useState('');
  const save=async()=>{if(lock.current)return;const errors=validateCycle(value);setErrors(errors);if(Object.keys(errors).length)return;lock.current=true;setBusy(true);setError(undefined);try{onSaved(await send<EvaluationCycle>(initial?`/evaluation-cycles/${initial.id}`:'/evaluation-cycles',initial?'PUT':'POST',{...value,items:value.items.map((item,index)=>({...item,sortOrder:index+1}))}));}catch(e){setError(e);if(initial && e instanceof ApiError && e.status===409){const latest=await request<Cycle>(`/evaluation-cycles/${initial.id}`).catch(()=>undefined);if(latest)onSaved(latest);}}finally{lock.current=false;setBusy(false);}};
  const move=(index:number,delta:number)=>{const items=[...value.items];[items[index],items[index+delta]]=[items[index+delta],items[index]];setValue({...value,items:items.map((item,i)=>({...item,sortOrder:i+1}))});setOrderMessage(`${value.items[index].name}, ${index+1}번째에서 ${index+delta+1}번째로`);};
  return <form className="panel" onSubmit={e=>{e.preventDefault();void save();}}>
    <WorkflowError error={error} subject="평가 주기"/><FormErrors errors={errors}/>
    <fieldset disabled={busy}><legend>초안 전체 교체</legend>
      <Field name="name" label="주기 이름" error={errors.name}><input id="name" maxLength={100} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></Field>
      <Field name="startDate" label="시작일" error={errors.startDate}><input id="startDate" type="date" value={value.startDate} onChange={e=>setValue({...value,startDate:e.target.value})}/></Field>
      <Field name="endDate" label="종료일"><input id="endDate" type="date" value={value.endDate} onChange={e=>setValue({...value,endDate:e.target.value})}/></Field>
      <h3 id="items">평가 항목</h3><p>모든 항목의 가중치는 같습니다.</p>
      {value.items.map((item,index)=><div key={index} className="evaluation-item-row"><Field name={`item-${index}`} label={`항목 ${index+1} 이름`}><input id={`item-${index}`} maxLength={100} value={item.name} onChange={e=>setValue({...value,items:value.items.map((v,i)=>i===index?{...v,name:e.target.value}:v)})}/></Field><button type="button" disabled={index===0} aria-label={`${item.name || '항목'}를 위로 이동`} onClick={()=>move(index,-1)}>↑</button><button type="button" disabled={index===value.items.length-1} aria-label={`${item.name || '항목'}를 아래로 이동`} onClick={()=>move(index,1)}>↓</button><button type="button" onClick={()=>setValue({...value,items:value.items.filter((_,i)=>i!==index)})}>항목 {index+1} 삭제</button></div>)}
      <p role="status">{orderMessage}</p><button type="button" disabled={value.items.length>=20} onClick={()=>setValue({...value,items:[...value.items,{name:'',sortOrder:Math.max(0,...value.items.map(i=>i.sortOrder))+1}]})}>항목 추가</button>
      <h3 id="assignments">대상·평가자 배정</h3><p>대상은 입사일이 도래한 재직·휴직 사원, 평가자는 본인이 아닌 활성 재직 관리자입니다. 유효성은 서버가 최종 확인합니다.</p>
      {value.assignments.map((a,index)=><div className="form-grid evaluation-assignment-row" key={index}>
        {(['employeeId','reviewerId'] as const).map(key=><PersonIdField key={key} id={`${key}-${index}`} label={`${index+1} ${key==='employeeId'?'대상 사원':'평가자'} ID`} value={a[key]} disabled={busy} onChange={input=>setValue({...value,assignments:value.assignments.map((v,i)=>i===index?{...v,[key]:Number(input)}:v)})}/>)}
        <button type="button" onClick={()=>setValue({...value,assignments:value.assignments.filter((_,i)=>i!==index)})}>배정 {index+1} 삭제</button>
      </div>)}
      <button type="button" onClick={()=>setValue({...value,assignments:[...value.assignments,{employeeId:0,reviewerId:0}]})}>대상 추가</button><button style={{marginLeft:8,marginTop:20}} className="primary" type="submit">{busy?'저장 중…':'초안 저장'}</button>
    </fieldset>
  </form>;
}
export function EvaluationCycleCreate(){const navigate=useNavigate();return <><h1>평가 주기 등록</h1><CycleForm onSaved={v=>navigate(`/admin/reviews/${v.id}`)}/></>;}
export function EvaluationCycleDetail(){const {id}=useParams();return <EvaluationCycleDetailScreen key={id}/>;}
function EvaluationCycleDetailScreen(){
  const {id}=useParams();const resource=useResource<Cycle>(`/evaluation-cycles/${id}`);const [editing,setEditing]=useState(false);const [action,setAction]=useState<'OPEN'|'CLOSE'|Assignment>();const [reviewer,setReviewer]=useState('');const [checked,setChecked]=useState(false);const [busy,setBusy]=useState(false);const lock=useRef(false);const [error,setError]=useState<unknown>();
  const refresh=()=>{resource.reload();void request('/evaluation-cycles?page=0&size=20').catch(()=>{});};
  const execute=async()=>{if(lock.current || !action || !checked)return;const cycle=resource.data;if(!cycle || cycle.status==='CLOSED')return;if(typeof action==='string' && !cycle.allowedActions.includes(action))return;if(typeof action!=='string' && (action.evaluationId===null || !cycle.assignments.some(a=>a.evaluationId===action.evaluationId && a.allowedActions.includes('REASSIGN_REVIEWER'))))return;lock.current=true;setBusy(true);setError(undefined);try{if(typeof action==='string')await send(`/evaluation-cycles/${id}/${action==='OPEN'?'open':'close'}`,'POST');else{if(!/^[1-9]\d*$/.test(reviewer) || Number(reviewer)===action.employee.id)throw new Error('본인이 아닌 평가자 ID를 입력하세요.');await send(`/evaluations/${action.evaluationId}/reviewer`,'PUT',{reviewerId:Number(reviewer)});}setAction(undefined);}catch(e){setError(e);}finally{refresh();lock.current=false;setBusy(false);}};
  const cycle=resource.data;
  return <><h1>평가 주기 상세</h1><WorkflowError error={error || resource.error} subject="평가 주기"/>{resource.loading?<p role="status">불러오는 중…</p>:!resource.error && cycle && <>
    <section className="panel"><h2>{cycle.name} · <StateBadge state={cycle.status}/></h2><p>{cycle.startDate} ~ {cycle.endDate} · 종료일은 표시용이며 자동 마감되지 않습니다.</p><div className="actions workflow-actions">{cycle.allowedActions.map(a=><button className={a==='OPEN'?'primary':''} key={a} disabled={busy} onClick={()=>{if(a==='EDIT')setEditing(!editing);else{if(editing){setError(new Error('초안 편집 내용을 저장한 뒤 주기를 열어 주세요.'));return;}setAction(a);setChecked(false);setError(undefined);}}}>{a==='EDIT'?'초안 편집':a==='OPEN'?'주기 열기':'주기 종료'}</button>)}</div></section>
    {editing && cycle.allowedActions.includes('EDIT')?<CycleForm key={cycle.id} initial={cycle} onSaved={()=>{setEditing(false);refresh();}}/>:<section className="panel">
      <h3>평가 항목</h3><p>{cycle.status==='DRAFT'?'모든 항목의 가중치는 같습니다.':'주기를 연 시점의 항목으로 고정되었습니다(스냅샷).'}</p><ol>{cycle.items.map(i=><li key={i.id}>{i.name}</li>)}</ol>
      <h3>대상·평가자 / 진행 현황</h3><div className="table-wrap"><table className="responsive-table phase3b-table"><thead><tr><th>대상</th><th>평가자</th><th>상태</th><th>관리</th></tr></thead><tbody>
        {cycle.assignments.map(a=><tr key={a.employee.id}>
          <td data-label="대상">{a.employee.name} ({a.employee.employeeNo})</td><td data-label="평가자">{a.reviewer.name} ({a.reviewer.employeeNo})</td>
          <td data-label="상태">{a.state?<StateBadge state={a.state}/>:'—'}{a.incomplete && <span className="badge">미완료</span>}</td>
          <td data-label="관리">{cycle.status==='OPEN' && a.evaluationId!==null && a.allowedActions.includes('REASSIGN_REVIEWER') && <button disabled={busy} onClick={()=>{setAction(a);setReviewer('');setChecked(false);setError(undefined);}}>평가자 변경</button>}</td>
        </tr>)}
      </tbody></table></div>
    </section>}
  </>}
    {action && <Modal titleId="cycle-action-title" busy={busy} onClose={()=>setAction(undefined)}>
      <h2 id="cycle-action-title">{action==='OPEN'?'주기 열기':action==='CLOSE'?'주기 종료':'평가자 변경'}</h2>
      <p>{action==='OPEN'?'주기를 열면 항목과 배정을 고정하고 자기평가를 시작합니다.':action==='CLOSE'?'종료하면 작성을 차단하고 미확정 평가서는 미완료로 남습니다. 되돌릴 수 없습니다.':'기존 관리자 초안의 점수·코멘트가 삭제되고 새 평가자가 처음부터 작성합니다. 되돌릴 수 없습니다. 자기평가는 유지됩니다.'}</p>
      {typeof action!=='string' && <PersonIdField id="new-reviewer" label="새 평가자 ID" value={reviewer} disabled={busy} onChange={setReviewer}/>}
      <WorkflowError error={error} subject="평가"/>
      <label className="confirmation-check"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>내용을 확인했습니다</label><div className="actions workflow-actions"><button disabled={busy} onClick={()=>setAction(undefined)}>취소</button><button disabled={busy || !checked || resource.loading || cycle?.status==='CLOSED'} className={action==='OPEN'?'primary':'danger-solid'} onClick={execute}>{action==='CLOSE'?'주기 종료 확정':'변경 확정'}</button></div></Modal>}
  </>;
}
export function EvaluationList({assigned=false}:{assigned?:boolean}){
  const {user}=useAuth();const [page,setPage]=useState(0);const [cycleId,setCycleId]=useState('');const resource=useResource<Page<EvaluationSummary>>(`/evaluations/${assigned?'assigned':'me'}?page=${page}&size=20${cycleId?`&cycleId=${encodeURIComponent(cycleId)}`:''}`);
  return <><h1>{assigned?'내가 평가할 사원':'내 평가'}</h1><nav className="actions workflow-actions"><Link className="button" to="/my/evaluations">내 평가</Link> {user?.role==='ADMIN' && <Link className="button" to="/assigned-evaluations">내가 평가할 사원</Link>}</nav><WorkflowError error={resource.error} subject="평가"/><section className="panel"><Field name="cycle-filter" label="주기 ID 필터"><small className="muted">목록에 있는 주기의 ID로 좁힙니다. 비우면 전체 참여 주기입니다.</small><input id="cycle-filter" type="number" min="1" value={cycleId} onChange={e=>{setCycleId(e.target.value);setPage(0);}}/></Field>{resource.loading?<p role="status">불러오는 중…</p>:!resource.error && <><div className="table-wrap"><table className="responsive-table phase3b-table"><thead><tr><th>주기</th><th>대상</th><th>기간 (표시용)</th><th>상태</th><th>상세</th></tr></thead><tbody>{resource.data?.content.map(v=><tr key={v.id}><td data-label="주기">{v.cycle.name}</td><td data-label="대상">{v.employee.name} ({v.employee.employeeNo})</td><td data-label="기간 (표시용)">{v.cycle.startDate} ~ {v.cycle.endDate}</td><td data-label="상태"><StateBadge state={v.state}/><Incomplete value={v}/></td><td data-label="상세"><Link to={`/evaluations/${v.id}`}>{v.allowedActions.some(a=>a.startsWith('SAVE_'))?'작성하기':'상세 보기'}</Link></td></tr>)}</tbody></table></div>{!resource.data?.content.length && <p className="empty">{assigned?'배정된 평가가 없습니다.':'내 평가가 없습니다.'}</p>}<Pager page={page} total={resource.data?.totalPages ?? 0} change={setPage}/></>}</section></>;
}
export function AssignedEvaluations(){return <EvaluationList assigned/>;}
export function EvaluationDetail(){const {id}=useParams();return <EvaluationDetailScreen key={id}/>;}
function EvaluationDetailScreen(){
  const {id}=useParams();const {user}=useAuth();const resource=useResource<Detail>(`/evaluations/${id}`);
  const [answers,setAnswers]=useState<EvaluationAnswer[]>([]);const [errors,setErrors]=useState<Record<string,string>>({});const [error,setError]=useState<unknown>();const [busy,setBusy]=useState(false);const lock=useRef(false);const [confirm,setConfirm]=useState(false);const [checked,setChecked]=useState(false);const [message,setMessage]=useState('');const [dirty,setDirty]=useState(false);
  const detail=resource.data;const self=detail?.employee.id===user?.id;const phase=self?'self':'manager';
  const mayEdit=!!detail && detail.cycle.status==='OPEN' && (self?detail.allowedActions.includes('SAVE_SELF') || detail.allowedActions.includes('SUBMIT_SELF'):detail.reviewer.id===user?.id && (detail.allowedActions.includes('SAVE_MANAGER') || detail.allowedActions.includes('SUBMIT_MANAGER')));
  useEffect(()=>{if(!detail || resource.loading || resource.error){setAnswers([]);return;}const writable=detail.cycle.status==='OPEN' && (self?detail.allowedActions.some(a=>a==='SAVE_SELF'||a==='SUBMIT_SELF'):detail.reviewer.id===user?.id && detail.allowedActions.some(a=>a==='SAVE_MANAGER'||a==='SUBMIT_MANAGER'));const source=self?detail.selfAnswers:detail.managerAnswers;setAnswers(writable?detail.items.map(i=>{const a=source?.find(a=>a.itemId===i.id);return {itemId:i.id,score:a?.score ?? null,comment:a?.comment ?? ''};}):[]);setDirty(false);},[detail,resource.loading,resource.error,self,user?.id]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const refreshLists=()=>{void request('/evaluations/me?page=0&size=20').catch(()=>{});if(user?.role==='ADMIN')void request('/evaluations/assigned?page=0&size=20').catch(()=>{});};
  const execute=async(submit:boolean)=>{if(lock.current || !detail || !mayEdit || !detail.allowedActions.includes(`${submit?'SUBMIT':'SAVE'}_${self?'SELF':'MANAGER'}`))return;const errors=validateAnswers(answers,submit);setErrors(errors);if(Object.keys(errors).length){setConfirm(false);return;}lock.current=true;setBusy(true);setError(undefined);setMessage('');try{await send(`/evaluations/${id}/${phase}${submit?'/submit':''}`,submit?'POST':'PUT',{answers});setConfirm(false);setDirty(false);setMessage(submit?(self?'자기평가를 제출했습니다.':'최종 확정했습니다.'):'임시저장했습니다.');resource.reload();refreshLists();}catch(e){setError(e);if(e instanceof ApiError && [400,409,403,404].includes(e.status)){setConfirm(false);setAnswers([]);setDirty(false);resource.reload();refreshLists();}}finally{lock.current=false;setBusy(false);}};
  const update=(itemId:number,value:Partial<EvaluationAnswer>)=>{setAnswers(answers.map(a=>a.itemId===itemId?{...a,...value}:a));setDirty(true);};
  const readAnswers=(label:string,values:EvaluationAnswer[]) => <section className="panel"><h2>{label}</h2>{detail?.items.map(i=>{const a=values.find(a=>a.itemId===i.id);return <div key={i.id}><h3>{i.name}</h3><p>{a?.score ?? '미입력'}{a?.score!=null?'점':''}</p><p style={{whiteSpace:'pre-wrap'}}>{a?.comment}</p></div>;})}</section>;
  return <><h1>평가서</h1><Link to={self?'/my/evaluations':'/assigned-evaluations'} onClick={e=>{if(dirty && !window.confirm('저장하지 않은 내용이 있습니다. 이동할까요?'))e.preventDefault();}}>목록으로 이동</Link><WorkflowError error={error || resource.error} subject="평가서"/><p role="status">{message}</p>{resource.loading?<p role="status">불러오는 중…</p>:!resource.error && detail && <><section className="panel"><h2>{detail.cycle.name} · <StateBadge state={detail.state}/></h2><p>{detail.employee.name} ({detail.employee.employeeNo}) · 평가자 {detail.reviewer.name} ({detail.reviewer.employeeNo})</p><p>{detail.cycle.startDate} ~ {detail.cycle.endDate} (표시용) · 주기 {stateLabel[detail.cycle.status]}</p><Incomplete value={detail}/>{detail.cycle.status==='CLOSED' && <p>주기가 종료되어 작성할 수 없습니다.</p>}<p>항목은 주기를 연 시점의 스냅샷입니다. 회수·반려·재개방은 지원하지 않습니다.</p></section>{mayEdit && <section className="panel"><h2>{self?'자기평가 작성':'관리자 평가 작성'}</h2><p>{self?'제출 후 수정할 수 없습니다.':'제출하면 즉시 확정되어 대상자에게 공개됩니다. 수정·회수할 수 없습니다.'}</p><FormErrors errors={errors}/><fieldset className="evaluation-answers" disabled={busy}><legend>점수와 코멘트</legend><p>작성 현황 {answers.filter(a=>a.score!==null).length} / {detail.items.length}항목 (표에서 센 수)</p>{detail.items.map(i=>{const a=answers.find(a=>a.itemId===i.id);return <fieldset key={i.id}><legend>{i.name}</legend><Field name={`score-${i.id}`} label={`${i.name} 점수`} error={errors[`score-${i.id}`]}><select id={`score-${i.id}`} value={a?.score ?? ''} onChange={e=>update(i.id,{score:e.target.value===''?null:Number(e.target.value)})}><option value="">미입력</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}점</option>)}</select></Field><Field name={`comment-${i.id}`} label={`${i.name} 코멘트`} error={errors[`comment-${i.id}`]}><textarea id={`comment-${i.id}`} maxLength={1000} value={a?.comment ?? ''} onChange={e=>update(i.id,{comment:e.target.value})}/></Field><small>{a?.comment?.length ?? 0} / 1000자</small></fieldset>;})}<div className="actions workflow-actions">{detail.allowedActions.includes(`SAVE_${self?'SELF':'MANAGER'}`) && <button onClick={()=>void execute(false)}>임시저장</button>}{detail.allowedActions.includes(`SUBMIT_${self?'SELF':'MANAGER'}`) && <button className="primary" onClick={()=>{const errors=validateAnswers(answers,true);setErrors(errors);if(!Object.keys(errors).length){setConfirm(true);setChecked(false);}}}>{self?'제출':'제출 · 최종 확정'}</button>}</div></fieldset></section>}{!mayEdit && Object.hasOwn(detail,'managerAnswers') && detail.managerAnswers && readAnswers('관리자 평가',detail.managerAnswers)}{(!mayEdit || !self) && readAnswers('자기평가 (참고)',detail.selfAnswers)}{detail.state==='FINALIZED' && typeof detail.finalScore==='number' && <section className="panel"><h2>최종 평균</h2><p>{detail.finalScore?.toFixed(2)}</p></section>}{detail.state==='FINALIZED' && !!detail.grade && <section className="panel"><h2>최종 등급</h2><p><span className="badge">{detail.grade}</span></p><p>등급 기준: S ≥ 4.50 · A ≥ 3.50 · B ≥ 2.50 · C ≥ 1.50 · D &lt; 1.50</p><p>평균과 등급은 서버가 산정한 값입니다.</p></section>}{detail.state==='FINALIZED' && (self || detail.reviewer.id===user?.id) && <section className='ai-summary-area' aria-labelledby='ai-summary-heading'><h2 id='ai-summary-heading'>AI 평가 요약 보조</h2><EvaluationSummaryAi key={detail.id} evaluationId={detail.id}/></section>}</>}{confirm && <Modal titleId="evaluation-submit-title" busy={busy} onClose={()=>setConfirm(false)}><h2 id="evaluation-submit-title">{self?'자기평가 제출 확인':'최종 확정 확인'}</h2><p>{self?'제출하면 수정할 수 없고 평가자가 관리자 평가를 시작합니다.':'확정하면 점수·코멘트·등급이 대상자에게 공개됩니다. 수정·회수·재개방할 수 없습니다.'}</p><label><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>내용을 확인했습니다</label><div className="actions workflow-actions"><button disabled={busy} onClick={()=>setConfirm(false)}>취소</button><button disabled={busy || !checked || resource.loading || !mayEdit} className={self?'primary':'danger-solid'} onClick={()=>void execute(true)}>제출 확정</button></div></Modal>}</>;
}
