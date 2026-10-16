// Actual Compose API + Chromium. Never print credentials or tokens.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,expect}=require('../../frontend/node_modules/@playwright/test');
const env=Object.fromEntries(fs.readFileSync(process.argv[2]||'backend/build/compose-smoke.env','utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const results=[],facts={};let browser,page,token;
const secret=crypto.randomBytes(20).toString('hex'),prefix='Q3A'+Date.now();
const out=path.join(__dirname,'phase3a-screenshots');fs.mkdirSync(out,{recursive:true});
const ok=(x,m)=>{if(!x)throw Error(m);};
async function check(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,result:'FAIL',detail:e.message.slice(0,1800)});console.log('FAIL '+name);}}
async function api(method,route,data,status=200,auth=token){const r=await page.request.fetch('http://localhost:8080/api/v1'+route,{method,headers:{Authorization:'Bearer '+auth},...(data?{data}:{})});ok(r.status()===status,method+' '+route+' expected '+status+' got '+r.status());return status===204?null:r.json();}
async function all(route,auth=token){const out=[];for(let n=0;;n++){const x=await api('GET',route+(route.includes('?')?'&':'?')+'page='+n+'&size=100',null,200,auth);out.push(...x.content);if(n+1>=x.totalPages)return out;}}
async function login(p,id,password){await p.goto('http://localhost:5173/login');await p.getByLabel('아이디 (사번)').fill(id);await p.getByLabel('비밀번호',{exact:true}).fill(password);await p.getByRole('button',{name:'로그인',exact:true}).click();await expect(p.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();}
async function shot(p,name){await p.waitForLoadState('networkidle');await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
function addDays(date,n){const x=new Date(date+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);}
function weekday(date){const d=new Date(date+'T00:00:00Z').getUTCDay();return d!==0&&d!==6;}
async function main(){
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
 await login(page,env.ADMIN_LOGIN_ID,env.ADMIN_INITIAL_PASSWORD);token=await page.evaluate(()=>sessionStorage.getItem('ems.accessToken'));
 const base=await api('GET','/dashboard');facts.baseline=base;const today=base.asOfDate;
 const deps=await api('GET','/departments'),pos=await api('GET','/positions');
 async function create(suffix,role){return api('POST','/employees',{employeeNo:prefix+suffix,name:'합성3A'+suffix,email:prefix+suffix+'@example.invalid',phone:'',hireDate:'2023-01-01',departmentId:deps[0].id,positionId:pos[0].id,role,initialPassword:secret},201);}
 const employee=await create('EMP','EMPLOYEE'),other=await create('ADMIN','ADMIN');
 const employeeAuth=(await api('POST','/auth/login',{loginId:employee.employeeNo,password:secret})).accessToken;
 const otherAuth=(await api('POST','/auth/login',{loginId:other.employeeNo,password:secret})).accessToken;
 const user=await browser.newPage({viewport:{width:1440,height:1000}});user.setDefaultTimeout(12000);await login(user,employee.employeeNo,secret);
 const balance=()=>api('GET','/leaves/me/balance',null,200,employeeAuth);
 const notes=(auth)=>all('/notifications/me',auth);
 const leave=(type,date,auth=employeeAuth,endDate=date)=>api('POST','/leaves',{type,startDate:date,endDate,reason:'PRIVATE_REASON_'+prefix},201,auth);
 let next=addDays(today,1);while(!weekday(next))next=addDays(next,1);let next2=addDays(next,1);while(!weekday(next2))next2=addDays(next2,1);
 await check('UI own check-in checkout and duplicate API conflicts',async()=>{
  await user.goto('http://localhost:5173/my/attendance');
  await expect(user.getByRole('button',{name:'출근하기',exact:true})).toBeVisible();
  await api('POST','/attendance/me/check-out',null,409,employeeAuth);
  const w=user.waitForResponse(r=>r.url().endsWith('/attendance/me/check-in')&&r.request().method()==='POST');await user.getByRole('button',{name:'출근하기',exact:true}).click();ok((await w).status()===200,'checkin');
  ok((await api('POST','/attendance/me/check-in',null,409,employeeAuth)).code==='ALREADY_CHECKED_IN','duplicate in');
  // Server stores seconds: ensure check-out is later without changing clocks.
  await new Promise(r=>setTimeout(r,1100));
  const wait=user.waitForResponse(r=>r.url().endsWith('/attendance/me/check-out')&&r.request().method()==='POST');await user.getByRole('button',{name:'퇴근하기',exact:true}).click();ok((await wait).status()===200,'checkout');
  ok((await api('POST','/attendance/me/check-out',null,409,employeeAuth)).code==='ALREADY_CHECKED_OUT','duplicate out');facts.attendance=await api('GET','/attendance/me/today',null,200,employeeAuth);await shot(user,'attendance');
 });
 await check('UI blank past workday means unrecorded not absent',async()=>{
  const m=await api('GET','/attendance/me?month='+today.slice(0,7),null,200,employeeAuth);ok(m.days.some(d=>d.date<today&&d.status==='NO_RECORD'&&d.checkIn===null),'unrecorded API');await expect(user.getByText('미기록',{exact:true}).first()).toBeVisible();ok(!(await user.locator('.badge').allTextContents()).some(s=>s.includes('결근')),'no absent badge');await expect(user.getByText(/미기록은 결근 판정이 아닙니다/)).toBeVisible();
 });
 let prior=addDays(today,-1);while(!weekday(prior))prior=addDays(prior,-1);
 await check('ADMIN correction requires reason and writes audit and recipient notification',async()=>{
  const route='/attendance/'+employee.id+'/'+prior,data={checkIn:prior+'T09:10:00+09:00',checkOut:prior+'T17:30:00+09:00'};
  await api('PUT',route,{...data,reason:''},400);
  const before=(await notes(employeeAuth)).length;
  const r=await api('PUT',route,{...data,reason:'PRIVATE_CORRECTION_'+prefix});ok(r.corrected&&r.late&&r.earlyLeave,'correction values');
  const audit=await all('/audit-logs?action=ATTENDANCE_CORRECT&targetId='+employee.id);ok(audit.length===1&&audit[0].metadata.reason==='PRIVATE_CORRECTION_'+prefix,'audit reason');
  const n=await notes(employeeAuth);ok(n.length===before+1&&n[0].type==='ATTENDANCE_CORRECTED'&&!JSON.stringify(n).includes('PRIVATE_CORRECTION_'),'notification privacy');
 });
 await check('UI existing employee GET identity and corrected values',async()=>{
  await page.goto('http://localhost:5173/admin/attendance');await page.getByLabel('사원 ID',{exact:true}).fill(String(employee.id));
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/employees/'+employee.id)&&r.status()===200);await page.getByRole('button',{name:'사원 조회',exact:true}).click();const x=await(await response).json();
  await expect(page.getByText(new RegExp(employee.employeeNo)).first()).toBeVisible();await expect(page.getByText(new RegExp(employee.name)).first()).toBeVisible();ok(x.id===employee.id&&x.employeeNo===employee.employeeNo,'identity API');await shot(page,'admin-attendance');
 });
 await check('Future ADMIN PUT rejected with fieldErrors and no side effects',async()=>{
  const future=addDays(today,3),month=future.slice(0,7),route='/attendance?employeeId='+employee.id+'&month='+month;
  const before=await api('GET',route),a=await all('/audit-logs?action=ATTENDANCE_CORRECT&targetId='+employee.id),n=await notes(employeeAuth);
  const err=await api('PUT','/attendance/'+employee.id+'/'+future,{checkIn:future+'T09:00:00+09:00',checkOut:null,reason:'future should fail'},400);
  ok(err.code==='VALIDATION_ERROR'&&err.fieldErrors.length>0,'error fields');facts.futureRejection={code:err.code,fieldErrors:err.fieldErrors};
  ok(JSON.stringify(await api('GET',route))===JSON.stringify(before),'attendance unchanged');ok((await all('/audit-logs?action=ATTENDANCE_CORRECT&targetId='+employee.id)).length===a.length,'audit unchanged');ok((await notes(employeeAuth)).length===n.length,'notifications unchanged');
 });
 let annual;
 await check('UI leave request reserves balance and targets all other active admins',async()=>{
  const before=await balance();facts.balanceBaseline=before;
  await user.goto('http://localhost:5173/my/leaves');await user.getByLabel('시작일 *').fill(next);await user.getByLabel('종료일 *').fill(next);await user.getByLabel('신청 사유 *').fill('PRIVATE_REASON_'+prefix);
  const wait=user.waitForResponse(r=>r.url().endsWith('/api/v1/leaves')&&r.request().method()==='POST');await user.getByRole('button',{name:'휴가 신청하기',exact:true}).click();const r=await wait;ok(r.status()===201,'leave201');annual=await r.json();ok(annual.allowedActions.includes('CANCEL'),'cancel action');
  const after=await balance();ok(after.reserved===before.reserved+1&&after.available===before.available-1,'reserve1');
  for(const auth of [token,otherAuth])ok((await notes(auth)).some(n=>n.targetId===annual.id&&n.type==='LEAVE_REQUESTED'),'admin recipient');ok(!(await notes(employeeAuth)).some(n=>n.targetId===annual.id&&n.type==='LEAVE_REQUESTED'),'applicant excluded');await shot(user,'leave-pending');
 });
 await check('Overlap and insufficient balance conflicts do not change reservation',async()=>{
  const before=await balance();ok((await api('POST','/leaves',{type:'ANNUAL',startDate:next,endDate:next,reason:'overlap'},409,employeeAuth)).code==='LEAVE_OVERLAP','overlap');
  const start=next2,end='2026-12-30';
  ok((await api('POST','/leaves',{type:'ANNUAL',startDate:start,endDate:end,reason:'insufficient'},409,employeeAuth)).code==='INSUFFICIENT_LEAVE_BALANCE','insufficient');ok(JSON.stringify(await balance())===JSON.stringify(before),'unchanged');
 });
 await check('UI different ADMIN approval moves reservation once and notifies applicant',async()=>{
  await page.goto('http://localhost:5173/leaves/'+annual.id);await page.getByRole('button',{name:'승인',exact:true}).click();const w=page.waitForResponse(r=>r.url().endsWith('/leaves/'+annual.id+'/approve'));await page.getByRole('button',{name:'승인 확정',exact:true}).click();ok((await w).status()===200,'approve');
  const b=await balance();ok(b.reserved===facts.balanceBaseline.reserved&&b.used===facts.balanceBaseline.used+1,'used once');
  const count=(await notes(employeeAuth)).filter(n=>n.targetId===annual.id&&n.type==='LEAVE_APPROVED').length;ok(count===1,'approval note');await api('POST','/leaves/'+annual.id+'/approve',null,409);ok((await notes(employeeAuth)).filter(n=>n.targetId===annual.id&&n.type==='LEAVE_APPROVED').length===count,'no duplicate note');await shot(page,'leave-approved');
 });
 await check('UI pre-start cancellation restores used balance',async()=>{
  await user.goto('http://localhost:5173/leaves/'+annual.id);await user.getByRole('button',{name:'신청 취소',exact:true}).click();const w=user.waitForResponse(r=>r.url().endsWith('/leaves/'+annual.id+'/cancel'));await user.getByRole('button',{name:'신청 취소 확정',exact:true}).click();ok((await w).status()===200,'cancel');
  const b=await balance();ok(b.used===facts.balanceBaseline.used&&b.reserved===facts.balanceBaseline.reserved,'restored');await shot(user,'leave-cancelled');
 });
 await check('ADMIN self approval and rejection forbidden',async()=>{
  const own=await leave('SICK',next,otherAuth);await api('POST','/leaves/'+own.id+'/approve',null,403,otherAuth);await api('POST','/leaves/'+own.id+'/reject',{reason:'self'},403,otherAuth);await api('POST','/leaves/'+own.id+'/cancel',null,200,otherAuth);
 });
 await check('Different ADMIN rejection restores reservation and sends private notification',async()=>{
  const before=await balance(),l=await leave('HALF_AM',next2);ok((await balance()).reserved===before.reserved+0.5,'half reserved');await api('POST','/leaves/'+l.id+'/reject',{reason:'PRIVATE_REJECT_'+prefix},200,otherAuth);ok((await balance()).available===before.available,'rejected restore');const n=await notes(employeeAuth);ok(n.some(n=>n.type==='LEAVE_REJECTED'&&n.targetId===l.id),'rejected notify');ok(!JSON.stringify(n).includes('PRIVATE_'),'no private reasons');await api('POST','/leaves/'+l.id+'/reject',{reason:'repeat'},409,otherAuth);
 });
 await check('Notification read idempotence owner isolation and read-all upper bound',async()=>{
  const list=await notes(employeeAuth),first=list[0];await api('POST','/notifications/'+first.id+'/read',null,204,employeeAuth);await api('POST','/notifications/'+first.id+'/read',null,204,employeeAuth);await api('POST','/notifications/'+first.id+'/read',null,404,otherAuth);
  const upto=Math.min(...list.map(n=>n.id));await api('POST','/notifications/me/read-all',{upToId:upto},200,employeeAuth);const after=await notes(employeeAuth);ok(after.filter(n=>n.id<=upto).every(n=>n.read),'old read');ok(after.some(n=>n.id>upto&&!n.read),'newer remains');await api('POST','/notifications/me/read-all',{upToId:Math.max(...after.map(n=>n.id))},200,employeeAuth);ok((await api('GET','/notifications/me/unread-count',null,200,employeeAuth)).count===0,'all read');
 });
 await check('UI notifications privacy and account switch clears prior inbox',async()=>{
  await user.getByRole('button',{name:/알림 .*미읽음/}).click();await expect(user.getByRole('dialog')).toBeVisible();ok(!(await user.getByRole('dialog').innerText()).includes('PRIVATE_'),'preview privacy');await shot(user,'notifications');await user.getByRole('button',{name:'닫기',exact:true}).click();await user.getByRole('button',{name:'로그아웃',exact:true}).click();await login(user,other.employeeNo,secret);const current=await user.evaluate(()=>sessionStorage.getItem('ems.accessToken'));const r=await user.request.get('http://localhost:8080/api/v1/notifications/me',{headers:{Authorization:'Bearer '+current}});const x=await r.json();ok(!x.content.some(n=>n.type==='ATTENDANCE_CORRECTED'&&n.targetDate===prior),'different inbox');await user.getByRole('button',{name:/알림 .*미읽음/}).click();ok(!(await user.getByRole('dialog').innerText()).includes('근태가 정정'),'no old UI note');
 });
 results.push({name:'Past PENDING Clock-controlled transition, exact time and leap-year boundaries',result:'NOT_RUN',reason:'Browser server clock unchanged; connect backend Clock/MySQL tests'});
 facts.final=await api('GET','/dashboard');
}
main().catch(e=>{results.push({name:'prerequisite',result:'FAIL',detail:e.message});console.log('HARNESS FAILED');}).finally(async()=>{if(browser)await browser.close();fs.writeFileSync(path.join(__dirname,'phase3a-results.json'),JSON.stringify({timestamp:new Date().toISOString(),facts,results},null,2));process.exitCode=results.some(x=>x.result==='FAIL')?1:0;});
