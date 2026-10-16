import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNotifications } from './use-notifications';
import { request, TOKEN_KEY } from './api';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const list=(id:number)=>({content:[{id,type:'LEAVE_APPROVED',targetType:'LEAVE',targetId:1,targetDate:null,message:'휴가가 승인되었습니다.',read:false,createdAt:'2026-10-16T09:00:00+09:00'}],page:0,size:20,totalElements:1,totalPages:1});
beforeEach(()=>{sessionStorage.setItem(TOKEN_KEY,'session-A');vi.stubGlobal('fetch',vi.fn(async(input)=>String(input).endsWith('/unread-count')?json({count:1}):json(list(7))));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();sessionStorage.clear();});
it('30초마다 보이는 화면만 갱신하고 업무 처리·화면 복귀 즉시 갱신한다',async()=>{
 vi.useFakeTimers();let visible='visible';vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visible as DocumentVisibilityState);
 const hook=renderHook(()=>useNotifications(1));
 await act(async()=>{await vi.advanceTimersByTimeAsync(0)});expect(hook.result.current.count).toBe(1);expect(fetch).toHaveBeenCalledTimes(2);
 await act(async()=>{await vi.advanceTimersByTimeAsync(30000)});expect(fetch).toHaveBeenCalledTimes(4);
 visible='hidden';await act(async()=>{await vi.advanceTimersByTimeAsync(30000)});expect(fetch).toHaveBeenCalledTimes(4);
 visible='visible';await act(async()=>{document.dispatchEvent(new Event('visibilitychange'))});expect(fetch).toHaveBeenCalledTimes(6);
 await act(async()=>{window.dispatchEvent(new Event('ems:work-updated'))});expect(fetch).toHaveBeenCalledTimes(8);
 hook.unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(30000)});expect(fetch).toHaveBeenCalledTimes(8);
});
it('단건 읽음과 캡처한 upToId를 전송하고 재조회한다',async()=>{
 const hook=renderHook(()=>useNotifications(1));await waitFor(()=>expect(hook.result.current.items).toHaveLength(1));
 await act(async()=>{await hook.result.current.read(7)});
 expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/notifications/7/read'),expect.objectContaining({method:'POST'}));
 await act(async()=>{await hook.result.current.readAll(7)});
 expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/notifications/me/read-all'),expect.objectContaining({method:'POST',body:JSON.stringify({upToId:7})}));
});
it('계정 전환 후 늦은 이전 응답과 로그아웃 캐시를 폐기한다',async()=>{
 const pending:((r:Response)=>void)[]=[];
 vi.mocked(fetch).mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
 const hook=renderHook(({owner})=>useNotifications(owner),{initialProps:{owner:1 as number|null}});
 expect(pending).toHaveLength(2);
 sessionStorage.setItem(TOKEN_KEY,'session-B');hook.rerender({owner:2});expect(hook.result.current.items).toHaveLength(0);
 await act(async()=>{pending[2](json(list(22)));pending[3](json({count:2}))});expect(hook.result.current.items[0].id).toBe(22);
 await act(async()=>{pending[0](json(list(11)));pending[1](json({count:9}))});expect(hook.result.current.count).toBe(2);expect(hook.result.current.items[0].id).toBe(22);
 hook.rerender({owner:null});expect(hook.result.current.items).toHaveLength(0);expect(hook.result.current.count).toBe(0);
});
it('이전 세션의 401은 새 로그인 토큰을 삭제하지 않는다',async()=>{
 let resolve!:(value:Response)=>void;vi.mocked(fetch).mockImplementation(()=>new Promise(r=>{resolve=r}));
 const pending=request('/notifications/me/unread-count').catch(e=>e);
 sessionStorage.setItem(TOKEN_KEY,'session-B');resolve(json({code:'UNAUTHORIZED',message:'만료',fieldErrors:[]},401));await pending;
 expect(sessionStorage.getItem(TOKEN_KEY)).toBe('session-B');
});
