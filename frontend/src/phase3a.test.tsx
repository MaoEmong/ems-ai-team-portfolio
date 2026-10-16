import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {App} from './App';
import {AuthProvider} from './auth';
import {TOKEN_KEY} from './api';
import {AttendanceBadges,validateCorrection} from './attendance';
import {validateLeave} from './leaves';
import type {AttendanceDay,LeaveItem} from './types-phase3a';
const day:AttendanceDay={date:'2026-10-16',checkIn:null,checkOut:null,late:false,earlyLeave:false,status:'NO_RECORD',expectedStart:'09:00:00',expectedEnd:'18:00:00',leaves:[],corrected:false};
const item:LeaveItem={id:91,employee:{id:2,employeeNo:'EMP001',name:'가상 사원'},type:'ANNUAL',startDate:'2026-10-19',endDate:'2026-10-19',days:1,reason:'합성 사유',status:'PENDING',rejectReason:null,decidedBy:null,decidedAt:null,cancelledBy:null,createdAt:'2026-10-16T09:00:00+09:00',allowedActions:['APPROVE','REJECT']};
const balance={periodStart:'2026-01-01',periodEnd:'2026-12-31',granted:9,used:1,reserved:1,available:7,approverAvailable:false};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const page=(content:unknown[])=>({content,page:0,size:20,totalElements:content.length,totalPages:content.length?1:0});
function handler(input:RequestInfo|URL){const path=new URL(String(input)).pathname;if(path.endsWith('/auth/me'))return json({id:1,employeeNo:'admin',name:'가상 관리자',role:'ADMIN'});if(path.endsWith('/unread-count'))return json({count:0});if(path.includes('/notifications'))return json(page([]));if(path.endsWith('/today'))return json(day);if(path.includes('balance'))return json(balance);if(path.endsWith('/leaves/91'))return json(item);if(path.includes('/leaves'))return json(page([item]));if(path.includes('/attendance'))return json({employeeId:1,month:'2026-10',days:[day]});return json({});}
beforeEach(()=>{sessionStorage.setItem(TOKEN_KEY,'test');vi.stubGlobal('fetch',vi.fn(async(input)=>handler(input)));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
function mount(path:string){render(<MemoryRouter initialEntries={[path]}><AuthProvider><App/></AuthProvider></MemoryRouter>)}
it('지각과 조퇴를 동시에 표시하고 미기록·미완료를 구분한다',()=>{const view=render(<AttendanceBadges day={{...day,late:true,earlyLeave:true,status:'INCOMPLETE'}}/>);expect(screen.getByText('지각')).toBeTruthy();expect(screen.getByText('조퇴')).toBeTruthy();expect(screen.getByText('미완료')).toBeTruthy();view.rerender(<AttendanceBadges day={day}/>);expect(screen.getByText('미기록')).toBeTruthy();});
it('정정은 출근·사유 필수이며 퇴근은 선택이다',()=>{expect(validateCorrection({checkIn:'',checkOut:'',reason:''})).toHaveProperty('reason');expect(validateCorrection({checkIn:'09:00:00',checkOut:'',reason:'정정'})).toEqual({});expect(validateCorrection({checkIn:'10:00:00',checkOut:'09:00:00',reason:'정정'})).toHaveProperty('checkOut');});
it('서버 today 기준으로 오늘 출근 전·미래 배지 없음·과거 미기록을 표시한다',()=>{const view=render(<AttendanceBadges day={day} today="2026-10-16"/>);expect(screen.getByText('출근 전')).toBeTruthy();view.rerender(<AttendanceBadges day={{...day,date:'2026-10-19'}} today="2026-10-16"/>);expect(screen.queryByText('미기록')).toBeNull();expect(view.container.querySelectorAll('.badge')).toHaveLength(0);view.rerender(<AttendanceBadges day={{...day,date:'2026-10-15'}} today="2026-10-16"/>);expect(screen.getByText('미기록')).toBeTruthy();});
it('오늘 미완료는 근무 중으로 표시하고 지난 미완료는 구분한다',()=>{const view=render(<AttendanceBadges day={{...day,status:'INCOMPLETE'}} today="2026-10-16"/>);expect(screen.getByText('근무 중')).toBeTruthy();view.rerender(<AttendanceBadges day={{...day,date:'2026-10-15',status:'INCOMPLETE'}} today="2026-10-16"/>);expect(screen.getByText('미완료')).toBeTruthy();});
it('휴가 폼은 필수 사유·기간과 반차 동일일을 검증한다',()=>{expect(validateLeave({type:'HALF_AM',startDate:'2026-10-19',endDate:'2026-10-20',reason:''})).toEqual(expect.objectContaining({reason:expect.any(String),endDate:expect.any(String)}));});
it('출근 요청에 시각을 보내지 않고 409 후 오늘 기록을 다시 조회한다',async()=>{
 let reads=0;vi.mocked(fetch).mockImplementation(async(input,init)=>{const p=String(input);if(p.endsWith('/attendance/me/today')){reads++;return json(reads>1?{...day,checkIn:'2026-10-16T09:00:00+09:00',status:'INCOMPLETE'}:day)}if(p.endsWith('/check-in')){expect(init?.body).toBeUndefined();return json({code:'ALREADY_CHECKED_IN',message:'이미 출근했습니다.',fieldErrors:[]},409)}return handler(input)});
 mount('/my/attendance');await userEvent.click(await screen.findByRole('button',{name:'출근하기'}));await screen.findByRole('button',{name:'퇴근하기'});expect(reads).toBeGreaterThan(1);expect(screen.getByRole('alert').textContent).toContain('이미 출근');
});
it('서버 allowedActions에 없는 결재 버튼을 표시하지 않는다',async()=>{vi.mocked(fetch).mockImplementation(async(input)=>String(input).endsWith('/leaves/91')?json({...item,allowedActions:['CANCEL']}):handler(input));mount('/leaves/91');await screen.findByRole('button',{name:'신청 취소'});expect(screen.queryByRole('button',{name:'승인'})).toBeNull();expect(screen.queryByRole('button',{name:'반려'})).toBeNull();});
it('결재 충돌 후 상세와 대상 잔액을 다시 조회한다',async()=>{let detailReads=0,balanceReads=0;vi.mocked(fetch).mockImplementation(async(input)=>{const p=String(input);if(p.endsWith('/approve'))return json({code:'LEAVE_ALREADY_PROCESSED',message:'다른 관리자가 처리했습니다.',fieldErrors:[]},409);if(p.endsWith('/leaves/91')){detailReads++;return json(detailReads>1?{...item,status:'APPROVED',allowedActions:[]}:item)}if(p.endsWith('/leave-balance')){balanceReads++;return json(balance)}return handler(input)});mount('/leaves/91');await userEvent.click(await screen.findByRole('button',{name:'승인'}));await userEvent.click(screen.getByRole('button',{name:'승인 확정'}));await waitFor(()=>expect(detailReads).toBeGreaterThan(1));await waitFor(()=>expect(balanceReads).toBeGreaterThan(1));});
it('반려 사유가 없으면 요청을 보내지 않는다',async()=>{mount('/leaves/91');await userEvent.click(await screen.findByRole('button',{name:'반려'}));await userEvent.click(screen.getByRole('button',{name:'반려 확정'}));expect(within(screen.getByRole('dialog')).getByText('반려 사유를 1~200자로 입력하세요.')).toBeTruthy();expect(vi.mocked(fetch).mock.calls.some(([p])=>String(p).endsWith('/reject'))).toBe(false);});
for(const path of ['/admin/attendance','/admin/leaves'])it(`일반 사원 관리 화면 차단 ${path}`,async()=>{vi.mocked(fetch).mockImplementation(async(input)=>String(input).endsWith('/auth/me')?json({id:2,employeeNo:'EMP001',name:'가상 사원',role:'EMPLOYEE'}):handler(input));mount(path);expect(await screen.findByRole('heading',{name:'권한이 없습니다'})).toBeTruthy();});
it('승인자 부재는 안내하되 신청 버튼을 유지한다',async()=>{mount('/my/leaves');await screen.findByText(/승인 가능한 다른 관리자가 없습니다/);expect((screen.getByRole('button',{name:'휴가 신청하기'}) as HTMLButtonElement).disabled).toBe(false);});

it('지난 PENDING도 서버 CANCEL을 따르면 취소 버튼을 유지한다',async()=>{
 vi.mocked(fetch).mockImplementation(async input=>String(input).endsWith('/leaves/91')?json({...item,startDate:'2020-01-01',endDate:'2020-01-01',allowedActions:['CANCEL']}):handler(input));
 mount('/leaves/91');expect(await screen.findByRole('button',{name:'신청 취소'})).toBeTruthy();
});
it('LEAVE_START_PASSED는 모달 안내와 상세·잔액 재조회를 수행한다',async()=>{
 let reads=0,balances=0;
 vi.mocked(fetch).mockImplementation(async input=>{const p=String(input);if(p.endsWith('/approve'))return json({code:'LEAVE_START_PASSED',message:'LEAVE_START_PASSED',fieldErrors:[]},409);if(p.endsWith('/leaves/91')){reads++;return json({...item,allowedActions:reads>1?['REJECT']:['APPROVE','REJECT']})}if(p.endsWith('/leave-balance')){balances++;return json(balance)}return handler(input)});
 mount('/leaves/91');await userEvent.click(await screen.findByRole('button',{name:'승인'}));await userEvent.click(screen.getByRole('button',{name:'승인 확정'}));
 await waitFor(()=>expect(reads).toBeGreaterThan(1));await waitFor(()=>expect(balances).toBeGreaterThan(1));expect(within(screen.getByRole('dialog')).getByText(/시작일이 지나 승인하거나/)).toBeTruthy();
 await userEvent.click(screen.getByRole('button',{name:'닫기'}));expect(screen.queryByRole('button',{name:'승인'})).toBeNull();expect(screen.getByRole('button',{name:'반려'})).toBeTruthy();
});

