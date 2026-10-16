import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError, request, send } from './api';
import { PayrollMonthDetail, PayslipView, WorkflowError } from './payroll';
import { EvaluationCycleCreate, EvaluationCycleDetail, EvaluationDetail, validateAnswers, validateCycle } from './evaluations';
import type { EvaluationDetail as Detail, EvaluationCycleDetail as Cycle, PayrollDetail, Payslip } from './types-phase3b';

vi.mock('./api',async()=>({...await vi.importActual<typeof import('./api')>('./api'),request:vi.fn(),send:vi.fn()}));
vi.mock('./auth',()=>({useAuth:()=>({user:{id:1,name:'본인',employeeNo:'EMP001',role:'ADMIN'}})}));
const actor={id:1,name:'관리자'};
const slip:Payslip={id:11,month:'2026-09',status:'CONFIRMED',employee:{id:1,name:'본인',employeeNo:'EMP001'},department:{id:1,name:'부서'},position:{id:1,name:'사원',level:1},jobTitle:null,baseSalary:100,allowance:1,grossPay:777,deductions:[{name:'서버 공제',rateBps:450,amount:17}],totalDeductions:19,netPay:123,formulaVersion:'SERVER_TEST',generatedAt:'2026-10-16T09:00:00+09:00',generatedBy:actor,confirmedAt:null,confirmedBy:null,demoNotice:'서버 데모 고지'};
const payroll:PayrollDetail={payroll:{month:'2026-09',status:'DRAFT',count:1,generatedAt:slip.generatedAt,generatedBy:actor,confirmedAt:null,confirmedBy:null,allowedActions:['RECALCULATE','CONFIRM']},payslips:[slip]};
const evaluation:Detail={id:9,cycle:{id:1,name:'하반기',status:'OPEN',startDate:'2026-07-01',endDate:'2026-12-31'},employee:slip.employee,reviewer:{id:2,name:'평가자',employeeNo:'ADMIN002'},state:'SELF_DRAFT',incomplete:false,items:[{id:1,name:'협업',sortOrder:1}],selfAnswers:[],allowedActions:['SAVE_SELF','SUBMIT_SELF']};
const conflict=()=>new ApiError(409,{code:'EVALUATION_STATE_CONFLICT',message:'상태가 변경되었습니다.',fieldErrors:[]});
function mount(node:React.ReactNode,path='/evaluations/9',route='/evaluations/:id') {render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={node}/></Routes></MemoryRouter>);}
beforeEach(()=>{vi.mocked(request).mockReset();vi.mocked(send).mockReset();vi.mocked(request).mockImplementation((async(path:string)=>path.startsWith('/payrolls/2026-09')?payroll:path==='/evaluations/9'?evaluation:{content:[],totalPages:0}) as typeof request);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('관리자 초안에 null 결과 키가 있어도 최종 결과 카드를 만들지 않는다',async()=>{
  vi.mocked(request).mockResolvedValue({...evaluation,employee:{id:3,name:'대상',employeeNo:'EMP003'},reviewer:slip.employee,state:'MANAGER_DRAFT',managerAnswers:[],finalScore:null,grade:null,allowedActions:['SAVE_MANAGER','SUBMIT_MANAGER']});
  mount(<EvaluationDetail/>);await screen.findByRole('heading',{name:'관리자 평가 작성'});
  expect(screen.queryByRole('heading',{name:'최종 평균'})).toBeNull();expect(screen.queryByRole('heading',{name:'최종 등급'})).toBeNull();
});
it('배정 ID는 기존 사원 조회로 이름·사번을 확인하고 ID 변경 시 이전 식별을 지운다',async()=>{
  vi.mocked(request).mockResolvedValue({id:3,name:'확인 대상',employeeNo:'EMP003'});
  mount(<EvaluationCycleCreate/>,'/admin/reviews/new','/admin/reviews/new');
  const input=screen.getByLabelText('1 대상 사원 ID');
  await userEvent.type(input,'3');await userEvent.click(screen.getByRole('button',{name:'1 대상 사원 ID 확인'}));
  await screen.findByText('확인 대상 (EMP003)');expect(request).toHaveBeenCalledWith('/employees/3');
  await userEvent.clear(input);await userEvent.type(input,'4');expect(screen.queryByText('확인 대상 (EMP003)')).toBeNull();
  vi.mocked(request).mockResolvedValue({id:2,name:'확인 평가자',employeeNo:'ADMIN002'});
  await userEvent.type(screen.getByLabelText('1 평가자 ID'),'2');await userEvent.click(screen.getByRole('button',{name:'1 평가자 ID 확인'}));
  await screen.findByText('확인 평가자 (ADMIN002)');expect(request).toHaveBeenCalledWith('/employees/2');expect(send).not.toHaveBeenCalled();
});

it('서버 금액과 데모 고지·스냅샷을 재계산 없이 표시한다',()=>{render(<PayslipView value={slip}/>);expect(screen.getByText('777원')).toBeTruthy();expect(screen.getByText('123원')).toBeTruthy();expect(screen.getByText('17원')).toBeTruthy();expect(screen.getByText('서버 데모 고지')).toBeTruthy();expect(screen.getByText(/SERVER_TEST/)).toBeTruthy();});
it('월 allowedActions가 비면 재계산·확정 버튼이 없다',async()=>{vi.mocked(request).mockResolvedValue({...payroll,payroll:{...payroll.payroll,allowedActions:[]}});mount(<PayrollMonthDetail/>,'/admin/payroll/2026-09','/admin/payroll/:month');await screen.findByText('초안 · 1명');expect(screen.queryByRole('button',{name:'재계산'})).toBeNull();expect(screen.queryByRole('button',{name:'월 전체 확정'})).toBeNull();});
for(const action of ['재계산','월 전체 확정'])it(`${action}은 모달 확인 전 요청하지 않고 중복 제출을 막는다`,async()=>{let resolve!:(value:unknown)=>void;vi.mocked(send).mockReturnValue(new Promise(r=>{resolve=r;}));mount(<PayrollMonthDetail/>,'/admin/payroll/2026-09','/admin/payroll/:month');await userEvent.click(await screen.findByRole('button',{name:action}));const dialog=screen.getByRole('dialog');const execute=within(dialog).getByRole('button',{name:action==='재계산'?'재계산 실행':'확정 실행'});expect((execute as HTMLButtonElement).disabled).toBe(true);expect(send).not.toHaveBeenCalled();await userEvent.click(within(dialog).getByRole('checkbox'));await userEvent.dblClick(execute);expect(send).toHaveBeenCalledTimes(1);resolve(undefined);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());});
it('월 처리 409 뒤 상세와 월 목록을 재조회한다',async()=>{vi.mocked(send).mockRejectedValue(new ApiError(409,{code:'PAYROLL_BUSY',message:'처리 중입니다.',fieldErrors:[]}));mount(<PayrollMonthDetail/>,'/admin/payroll/2026-09','/admin/payroll/:month');await userEvent.click(await screen.findByRole('button',{name:'재계산'}));await userEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox'));await userEvent.click(screen.getByRole('button',{name:'재계산 실행'}));await waitFor(()=>expect(vi.mocked(request).mock.calls.filter(([p])=>p==='/payrolls/2026-09').length).toBeGreaterThan(1));expect(request).toHaveBeenCalledWith('/payrolls?month=2026-09&page=0&size=20');});
it('공개 전 관리자 답변·결과 영역을 생성하지 않는다',async()=>{mount(<EvaluationDetail/>);await screen.findByRole('heading',{name:'하반기 · 자기평가 작성 중'});expect(screen.queryByRole('heading',{name:'관리자 평가'})).toBeNull();expect(screen.queryByRole('heading',{name:'최종 평균'})).toBeNull();expect(screen.queryByRole('heading',{name:'최종 등급'})).toBeNull();});
it('확정 결과는 관리자 답변과 다른 서버 점수·등급도 그대로 표시한다',async()=>{vi.mocked(request).mockResolvedValue({...evaluation,state:'FINALIZED',allowedActions:[],managerAnswers:[{itemId:1,score:1,comment:'서버 코멘트'}],finalScore:4.87,grade:'A'});mount(<EvaluationDetail/>);await screen.findByText('4.87');expect(screen.getByText('A')).toBeTruthy();expect(screen.getByText('서버 코멘트')).toBeTruthy();expect(screen.queryByRole('button',{name:'임시저장'})).toBeNull();});
it('초안 null점수는 허용하고 제출·범위·코멘트 오류는 차단한다',()=>{expect(validateAnswers([{itemId:1,score:null}],false)).toEqual({});expect(validateAnswers([{itemId:1,score:null}],true)).toHaveProperty('score-1');expect(validateAnswers([{itemId:1,score:1.5,comment:'x'.repeat(1001)}],false)).toHaveProperty('comment-1');expect(validateAnswers([{itemId:1,score:6}],false)).toHaveProperty('score-1');});
it('빈 점수 초안은 저장하며 빈 제출은 요청·모달을 열지 않는다',async()=>{vi.mocked(send).mockResolvedValue(evaluation);mount(<EvaluationDetail/>);await userEvent.click(await screen.findByRole('button',{name:'제출'}));expect(screen.queryByRole('dialog')).toBeNull();expect(send).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('button',{name:'임시저장'}));await waitFor(()=>expect(send).toHaveBeenCalledWith('/evaluations/9/self','PUT',{answers:[{itemId:1,score:null,comment:''}]}));});
it('평가 제출은 확인 후 요청하고 409 후 상세와 관계 목록을 재조회한다',async()=>{vi.mocked(send).mockRejectedValue(conflict());mount(<EvaluationDetail/>);await userEvent.selectOptions(await screen.findByLabelText('협업 점수'),'4');await userEvent.click(screen.getByRole('button',{name:'제출'}));expect(send).not.toHaveBeenCalled();await userEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox'));await userEvent.click(screen.getByRole('button',{name:'제출 확정'}));await waitFor(()=>expect(vi.mocked(request).mock.calls.filter(([p])=>p==='/evaluations/9').length).toBeGreaterThan(1));expect(request).toHaveBeenCalledWith('/evaluations/me?page=0&size=20');expect(request).toHaveBeenCalledWith('/evaluations/assigned?page=0&size=20');});
it('CLOSED 미완료 평가서는 허용 액션이 잘못 남아도 작성하지 않는다',async()=>{vi.mocked(request).mockResolvedValue({...evaluation,cycle:{...evaluation.cycle,status:'CLOSED'},incomplete:true});mount(<EvaluationDetail/>);await screen.findByText(/미완료 ·/);expect(screen.queryByRole('button',{name:'임시저장'})).toBeNull();expect(screen.queryByRole('combobox')).toBeNull();});
it('주기 전체 교체 입력은 항목 이름·순서 중복과 자기 결재를 차단한다',()=>{const valid={name:'주기',startDate:'2026-01-01',endDate:'2026-12-31',items:[{name:'협업',sortOrder:1}],assignments:[{employeeId:1,reviewerId:2}]};expect(validateCycle(valid)).toEqual({});expect(validateCycle({...valid,items:[...valid.items,...valid.items]})).toHaveProperty('items');expect(validateCycle({...valid,assignments:[{employeeId:1,reviewerId:1}]})).toHaveProperty('assignments');});
it('재배정은 참조형 요약 행 액션과 대상 ID를 따르고 확인 후 실행한다',async()=>{
  vi.mocked(request).mockResolvedValue({id:1,name:'주기',status:'OPEN',startDate:'2026-01-01',endDate:'2026-12-31',items:[],assignments:[{evaluationId:9,employee:slip.employee,reviewer:evaluation.reviewer,state:'MANAGER_DRAFT',incomplete:false,allowedActions:['REASSIGN_REVIEWER']}],allowedActions:['CLOSE']});vi.mocked(send).mockResolvedValue({});
  mount(<EvaluationCycleDetail/>,'/admin/reviews/1','/admin/reviews/:id');await userEvent.click(await screen.findByRole('button',{name:'평가자 변경'}));expect(screen.getByText(/기존 관리자 초안의 점수·코멘트가 삭제/)).toBeTruthy();expect(send).not.toHaveBeenCalled();
  const input=screen.getByLabelText('새 평가자 ID');await userEvent.type(input,'1');await userEvent.click(screen.getByRole('checkbox'));await userEvent.click(screen.getByRole('button',{name:'변경 확정'}));await screen.findAllByText('본인이 아닌 평가자 ID를 입력하세요.');expect(send).not.toHaveBeenCalled();
  await userEvent.clear(input);await userEvent.type(input,'3');await userEvent.click(screen.getByRole('button',{name:'변경 확정'}));await waitFor(()=>expect(send).toHaveBeenCalledWith('/evaluations/9/reviewer','PUT',{reviewerId:3}));
});
it('v1.1 DRAFT 참조 배정을 key 경고 없이 표시하고 PUT에는 ID쌍만 보낸다',async()=>{
  const draft:Cycle={id:1,name:'초안 주기',status:'DRAFT',startDate:'2026-01-01',endDate:'2026-12-31',items:[{id:1,name:'협업',sortOrder:1}],assignments:[{evaluationId:null,employee:slip.employee,reviewer:evaluation.reviewer,state:null,incomplete:false,allowedActions:[]},{evaluationId:null,employee:{id:3,name:'둘째 대상',employeeNo:'EMP003'},reviewer:evaluation.reviewer,state:null,incomplete:false,allowedActions:[]}],allowedActions:['EDIT','OPEN']};
  const consoleError=vi.spyOn(console,'error').mockImplementation(()=>{});vi.mocked(request).mockResolvedValue(draft);
  vi.mocked(send).mockResolvedValue({...draft,assignments:[{employeeId:1,reviewerId:2},{employeeId:3,reviewerId:2}]});
  mount(<EvaluationCycleDetail/>,'/admin/reviews/1','/admin/reviews/:id');await screen.findByText('둘째 대상 (EMP003)');expect(screen.getAllByRole('row')).toHaveLength(3);
  expect(consoleError.mock.calls.flat().some(value=>/unique.*key|same key/i.test(String(value)))).toBe(false);
  await userEvent.click(screen.getByRole('button',{name:'초안 편집'}));expect((screen.getByLabelText('1 대상 사원 ID') as HTMLInputElement).value).toBe('1');expect((screen.getByLabelText('1 평가자 ID') as HTMLInputElement).value).toBe('2');expect((screen.getByLabelText('2 대상 사원 ID') as HTMLInputElement).value).toBe('3');
  await userEvent.click(screen.getByRole('button',{name:'초안 저장'}));await waitFor(()=>expect(send).toHaveBeenCalledWith('/evaluation-cycles/1','PUT',{name:'초안 주기',startDate:'2026-01-01',endDate:'2026-12-31',items:[{name:'협업',sortOrder:1}],assignments:[{employeeId:1,reviewerId:2},{employeeId:3,reviewerId:2}]}));
});
for(const status of [403,404])it(`${status} 접근 오류는 권한·접근 안내를 제공한다`,()=>{render(<WorkflowError subject="평가서" error={new ApiError(status,{code:status===403?'FORBIDDEN':'NOT_FOUND',message:'조회할 수 없습니다.',fieldErrors:[]})}/>);expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);expect(screen.getByText(status===403?/권한이 없습니다/:/찾을 수 없거나 접근/)).toBeTruthy();});
it('배정 평가자의 제출은 manager 경로로 보내고 서버 확정 결과를 표시한다',async()=>{
  const assigned={...evaluation,employee:{id:3,name:'대상',employeeNo:'EMP003'},reviewer:slip.employee,state:'MANAGER_DRAFT',managerAnswers:[{itemId:1,score:2,comment:'초안'}],allowedActions:['SAVE_MANAGER','SUBMIT_MANAGER']};
  const finalized={...assigned,state:'FINALIZED',allowedActions:[],finalScore:4.91,grade:'S'};
  vi.mocked(request).mockResolvedValue(assigned);vi.mocked(send).mockImplementation((async()=>{vi.mocked(request).mockResolvedValue(finalized);return finalized;}) as typeof send);
  mount(<EvaluationDetail/>);await userEvent.click(await screen.findByRole('button',{name:'제출 · 최종 확정'}));expect(send).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('checkbox'));await userEvent.click(screen.getByRole('button',{name:'제출 확정'}));await screen.findByText('4.91');expect(send).toHaveBeenCalledWith('/evaluations/9/manager/submit','POST',{answers:[{itemId:1,score:2,comment:'초안'}]});expect(screen.getByText('S')).toBeTruthy();
});
it('주기 종료는 되돌릴 수 없음 안내와 확인 체크를 거친다',async()=>{
  vi.mocked(request).mockResolvedValue({id:1,name:'주기',status:'OPEN',startDate:'2026-01-01',endDate:'2026-12-31',items:[],assignments:[],allowedActions:['CLOSE']});vi.mocked(send).mockResolvedValue({});mount(<EvaluationCycleDetail/>,'/admin/reviews/1','/admin/reviews/:id');await userEvent.click(await screen.findByRole('button',{name:'주기 종료'}));expect(screen.getByText(/미확정 평가서는 미완료로 남습니다/)).toBeTruthy();expect((screen.getByRole('button',{name:'주기 종료 확정'}) as HTMLButtonElement).disabled).toBe(true);await userEvent.click(screen.getByRole('checkbox'));await userEvent.click(screen.getByRole('button',{name:'주기 종료 확정'}));await waitFor(()=>expect(send).toHaveBeenCalledWith('/evaluation-cycles/1/close','POST'));
});
