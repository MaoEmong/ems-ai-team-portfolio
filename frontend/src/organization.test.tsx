import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import { App } from './App';
import { TOKEN_KEY } from './api';
import { validateAppointment } from './appointments';
import type { Employee } from './types';
const employee:Employee={id:2,employeeNo:'EMP001',name:'합성 사원',role:'EMPLOYEE',email:'synthetic@example.test',phone:'010-0000-0000',hireDate:'2020-01-01',status:'ACTIVE',retireDate:null,department:{id:2,name:'개발팀'},position:{id:1,name:'사원',level:1},jobTitle:{id:1,name:'팀장'}};
const data={departments:[{id:1,name:'본부',parentId:null},{id:2,name:'개발팀',parentId:1},{id:3,name:'빈 부서',parentId:null}],employees:[{...employee,onLeave:false}]};
const json=(v:unknown)=>new Response(JSON.stringify(v));
beforeEach(()=>{sessionStorage.setItem(TOKEN_KEY,'test');vi.stubGlobal('fetch',vi.fn(async(input)=>{const path=new URL(String(input)).pathname;if(path.endsWith('/auth/me'))return json(employee);if(path.endsWith('/unread-count'))return json({count:0});if(path.endsWith('/organization'))return json(data);return json({content:[],totalPages:0});}));});
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
function mount(path='/organization'){render(<MemoryRouter initialEntries={[path]}><AuthProvider><App/></AuthProvider></MemoryRouter>);}
it('일반 사원도 계층 목록에서 빈 부서와 소속 사원의 최소 업무 정보를 조회한다',async()=>{mount();await userEvent.click(await screen.findByRole('button',{name:/개발팀/}));const table=await screen.findByRole('table');expect(within(table).getByText('합성 사원 (EMP001)')).toBeTruthy();expect(within(table).getByText('팀장')).toBeTruthy();expect(screen.getByRole('button',{name:/^빈 부서/})).toBeTruthy();expect(screen.queryByText(employee.email)).toBeNull();expect(screen.queryByRole('link',{name:'부서 계층 관리'})).toBeNull();});
it('트리를 키보드로 펼치고 하위 부서를 선택할 수 있다',async()=>{mount();await userEvent.click(await screen.findByRole('button',{name:'트리 보기'}));const root=screen.getByRole('treeitem',{name:/본부/});root.focus();await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}');expect(document.activeElement?.getAttribute('data-id')).toBe('2');expect(await screen.findByRole('table')).toBeTruthy();});
it('직책만 변경하거나 해제하는 발령을 허용하고 유지 요청은 변경 없는 발령으로 검증한다',()=>{const form={effectiveDate:'2026-10-16',departmentId:'2',positionId:'1',reason:'합성 직책 변경',changeJobTitle:true,jobTitleId:''};expect(validateAppointment(form,employee,'','2026-10-16')).toEqual({});expect(validateAppointment({...form,jobTitleId:'2'},employee,'','2026-10-16')).toEqual({});expect(validateAppointment({...form,changeJobTitle:false},employee,'','2026-10-16')).toHaveProperty('departmentId');});
for(const path of ['/job-titles','/admin/payroll','/admin/reviews','/assigned-evaluations'])it(`일반 사원의 관리 경로 차단 ${path}`,async()=>{mount(path);expect(await screen.findByRole('heading',{name:'권한이 없습니다'})).toBeTruthy();});
