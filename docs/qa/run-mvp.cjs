// Real Compose API + Chromium checks. No tokens/passwords are written to output.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium, expect } = require('../../frontend/node_modules/@playwright/test');
const root = path.resolve(__dirname, '../..');
const env = Object.fromEntries(fs.readFileSync(process.argv[2] || path.join(root, 'backend/build/compose-smoke.env'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.includes('=') && !x.startsWith('#')).map(x => [x.slice(0,x.indexOf('=')), x.slice(x.indexOf('=')+1)]));
const results = [];
const stamp = Date.now().toString();
const password = crypto.randomBytes(20).toString('hex');
let browser;
async function check(name, fn) { try { await fn(); results.push({name, result:'PASS'}); console.log('PASS '+name); } catch(e) { results.push({name,result:'FAIL',detail:String(e.message).slice(0,1500)}); console.log('FAIL '+name); } }
function assert(x, m) { if(!x) throw Error(m); }
async function main() {
 browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 page.setDefaultTimeout(12000);
 const screenshots = path.join(__dirname,'screenshots'); fs.mkdirSync(screenshots,{recursive:true});
 await page.goto('http://localhost:5173');
 await check('UI admin login and actual employee list', async()=>{
  await page.locator('#loginId').fill(env.ADMIN_LOGIN_ID); await page.locator('#password').fill(env.ADMIN_INITIAL_PASSWORD);
  const response=page.waitForResponse(r=>r.url().includes('/api/v1/employees?') && r.status()===200);
  await page.getByRole('button',{name:'로그인',exact:true}).click(); await response;
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.screenshot({path:path.join(screenshots,'admin-list.png'),fullPage:true});
 });
 const token=await page.evaluate(()=>sessionStorage.getItem('ems.accessToken'));
 assert(token,'Admin login prerequisite failed');
 async function api(method, route, data, expected=200, auth=token) {
  const r=await page.request.fetch('http://localhost:8080/api/v1'+route,{method,headers:{Authorization:'Bearer '+auth},...(data?{data}:{})});
  assert(r.status()===expected,method+' '+route+' expected '+expected+' got '+r.status());
  return r.status()===204?null:await r.json();
 }
 const deps=await api('GET','/departments'), pos=await api('GET','/positions');
 await check('UI pagination and sorting',async()=>{
  await page.getByLabel('페이지 크기').selectOption('10'); await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button',{name:'다음',exact:true}).click(); await expect(page.getByText('2 /',{exact:false})).toBeVisible();
  await page.locator('#sort').selectOption('employeeNo,desc');
  await expect(page.getByText('1 /',{exact:false})).toBeVisible();
 });
 await check('API all supported sorts and page metadata',async()=>{
  for(const field of ['employeeNo','name','hireDate']) for(const dir of ['asc','desc']) {
   const x=await api('GET',`/employees?size=10&page=1&sort=${field},${dir}`);
   assert(x.page===1&&x.size===10&&x.content.length===10&&x.totalPages>=3,'page metadata');
   const values=x.content.map(e=>e[field]);
   for(let i=1;i<values.length;i++) assert(dir==='asc'?values[i-1]<=values[i]:values[i-1]>=values[i],'sort order '+field);
  }
 });
 await check('UI department position status filters and empty search',async()=>{
  await page.locator('#departmentId').selectOption(String(deps[0].id));
  await page.locator('#positionId').selectOption(String(pos[0].id));
  await page.locator('#status').selectOption('ACTIVE');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const rows=await page.locator('tbody tr').allTextContents(); assert(rows.every(r=>r.includes(deps[0].name)&&r.includes(pos[0].name)),'filter rows');
  await page.locator('#keyword').fill('NO_MATCH_'+stamp); await expect(page.getByText('조건에 맞는 사원이 없습니다.')).toBeVisible();
 });
 let emp;
 await check('UI employee create 201',async()=>{
  await page.goto('http://localhost:5173/employees/new');
  for(const [id,value] of Object.entries({employeeNo:'QA'+stamp,name:'가상검수사원',email:'qa'+stamp+'@example.invalid',phone:'010-0000-0000',hireDate:'2026-01-01',initialPassword:password})) await page.locator('#'+id).fill(value);
  await page.locator('#departmentId').selectOption(String(deps[0].id)); await page.locator('#positionId').selectOption(String(pos[0].id));
  const wait=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/employees'));
  await page.getByRole('button',{name:'저장',exact:true}).click(); const r=await wait; assert(r.status()===201,'create status'); emp=await r.json();
  await expect(page.getByRole('heading',{name:'가상검수사원',exact:true})).toBeVisible();
 });
 assert(emp,'Employee create prerequisite failed');
 const payload={employeeNo:emp.employeeNo,name:emp.name,email:emp.email,phone:emp.phone,hireDate:emp.hireDate,departmentId:deps[0].id,positionId:pos[0].id,role:'EMPLOYEE',initialPassword:password};
 await check('API duplicate employee number 409',async()=>{const x=await api('POST','/employees',{...payload,email:'duplicate'+stamp+'@example.invalid'},409);assert(x.code==='DUPLICATE_EMPLOYEE_NO','code');});
 await check('UI employee edit 200',async()=>{
  await page.getByRole('link',{name:'정보 수정',exact:true}).click(); await page.locator('#name').fill('가상검수수정');
  const wait=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/employees/'+emp.id));
  await page.getByRole('button',{name:'저장',exact:true}).click(); assert((await wait).status()===200,'edit status');
  await expect(page.getByRole('heading',{name:'가상검수수정',exact:true})).toBeVisible();
 });
 await check('API keyword name number email and combined filters',async()=>{
  for(const keyword of ['가상검수수정',emp.employeeNo,emp.email]) {const x=await api('GET','/employees?keyword='+encodeURIComponent(keyword)+'&departmentId='+deps[0].id+'&positionId='+pos[0].id+'&status=ACTIVE');assert(x.content.some(e=>e.id===emp.id),'search result');}
 });
 const employeePage=await browser.newPage(); employeePage.setDefaultTimeout(12000);
 let employeeToken;
 await check('UI EMPLOYEE login own profile',async()=>{
  await employeePage.goto('http://localhost:5173/login'); await employeePage.locator('#loginId').fill(emp.employeeNo); await employeePage.locator('#password').fill(password); await employeePage.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(employeePage.getByRole('heading',{name:'내 정보',exact:true})).toBeVisible(); await expect(employeePage.getByText('가상검수수정',{exact:true}).last()).toBeVisible();
  employeeToken=await employeePage.evaluate(()=>sessionStorage.getItem('ems.accessToken'));
  await employeePage.screenshot({path:path.join(screenshots,'employee-profile.png'),fullPage:true});
 });
 await check('UI EMPLOYEE management guard and other profile 403',async()=>{
  for(const route of ['/employees','/departments','/positions']) {await employeePage.goto('http://localhost:5173'+route); await expect(employeePage.getByRole('heading',{name:'권한이 없습니다'})).toBeVisible();}
  const wait=employeePage.waitForResponse(r=>r.url().endsWith('/employees/1')&&r.status()===403); await employeePage.goto('http://localhost:5173/employees/1'); await wait; await expect(employeePage.getByRole('alert')).toBeVisible();
 });
 await check('API EMPLOYEE own only and catalog read exceptions',async()=>{
  await api('GET','/employees/'+emp.id,null,200,employeeToken);
  for(const route of ['/employees','/employees/1']) await api('GET',route,null,403,employeeToken);
  await api('PUT','/employees/'+emp.id,{...payload,status:'ACTIVE'},403,employeeToken);
  for(const kind of ['departments','positions']) {await api('GET','/'+kind,null,200,employeeToken);await api('POST','/'+kind,{name:'DENIED',level:1},403,employeeToken);}
 });
 for(const kind of ['departments','positions']) await check('UI '+kind+' CRUD and in-use 409',async()=>{
  await page.goto('http://localhost:5173/'+kind); const name='QA'+kind+stamp;
  await page.locator('#name').fill(name); if(kind==='positions') await page.locator('#level').fill('99');
  let wait=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/'+kind)); await page.getByRole('button',{name:'등록',exact:true}).click(); assert((await wait).status()===201,'catalog create');
  await page.getByRole('row').filter({hasText:name}).getByRole('button',{name:/수정/}).click(); await page.locator('#name').fill(name+'Updated');
  wait=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/'+kind+'/')); await page.getByRole('button',{name:'변경 저장'}).click(); assert((await wait).status()===200,'catalog update');
  await page.getByRole('row').filter({hasText:name+'Updated'}).getByRole('button',{name:/삭제/}).click(); wait=page.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().includes('/'+kind+'/')); await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click(); assert((await wait).status()===204,'catalog delete');
  const used=kind==='departments'?deps[0]:pos[0]; await page.getByRole('row').filter({hasText:used.name}).getByRole('button',{name:/삭제/}).click(); wait=page.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().endsWith('/'+kind+'/'+used.id)); await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click(); assert((await wait).status()===409,'in-use conflict'); await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); await page.getByRole('button',{name:'취소',exact:true}).click();
 });
 await check('UI retire employee 200 and hide edit',async()=>{
  await page.goto('http://localhost:5173/employees/'+emp.id); await page.getByRole('button',{name:'퇴사 처리',exact:true}).click(); await page.locator('#retireDate').fill('2026-10-16');
  const wait=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/retire')); await page.getByRole('dialog').getByRole('button',{name:'퇴사 처리',exact:true}).click(); assert((await wait).status()===200,'retire'); await expect(page.getByRole('link',{name:'정보 수정',exact:true})).toHaveCount(0);
 });
 await check('UI retired excluded by default and status query includes',async()=>{
  await page.goto('http://localhost:5173/employees'); await page.locator('#keyword').fill(emp.employeeNo); await expect(page.getByText('조건에 맞는 사원이 없습니다.')).toBeVisible(); await page.locator('#status').selectOption('RETIRED'); await expect(page.getByRole('link',{name:'가상검수수정'})).toBeVisible();
 });
 await check('API retired edit and repeated retirement 409, old JWT 401',async()=>{
  for(const [method,route,data] of [['PUT','/employees/'+emp.id,{...payload,status:'ACTIVE'}],['POST','/employees/'+emp.id+'/retire',{retireDate:'2026-10-16'}]]) {const x=await api(method,route,data,409);assert(x.code==='EMPLOYEE_RETIRED','retired code');}
  await api('GET','/auth/me',null,401,employeeToken);
 });
 await check('UI retired existing session redirects login and clears token',async()=>{await employeePage.goto('http://localhost:5173/me');await expect(employeePage).toHaveURL(/\/login$/);assert(!await employeePage.evaluate(()=>sessionStorage.getItem('ems.accessToken')),'cleared token');});
 await check('API retired-only department and position references block deletion',async()=>{
  const d=await api('POST','/departments',{name:'RetiredOnly'+stamp},201);
  const p=await api('POST','/positions',{name:'RetiredOnly'+stamp,level:90},201);
  const e=await api('POST','/employees',{...payload,employeeNo:'QAR'+stamp,email:'retired'+stamp+'@example.invalid',departmentId:d.id,positionId:p.id},201);
  await api('POST','/employees/'+e.id+'/retire',{retireDate:'2026-10-16'});
  assert((await api('DELETE','/departments/'+d.id,null,409)).code==='DEPARTMENT_IN_USE','department retired reference');
  assert((await api('DELETE','/positions/'+p.id,null,409)).code==='POSITION_IN_USE','position retired reference');
 });
 await check('API validation 400, missing 404, duplicate email and names 409',async()=>{
  const invalid=await api('POST','/employees',{},400);assert(invalid.code==='VALIDATION_ERROR'&&invalid.fieldErrors.length>0,'field errors');
  await api('GET','/employees/999999999',null,404);
  assert((await api('POST','/employees',{...payload,employeeNo:'QAD'+stamp},409)).code==='DUPLICATE_EMAIL','email duplicate');
  for(const [kind,data] of [['departments',{name:deps[0].name}],['positions',{name:pos[0].name,level:1}]]) assert((await api('POST','/'+kind,data,409)).code==='DUPLICATE_NAME','name duplicate');
  await api('GET','/employees?size=101',null,400);
  await api('GET','/employees',null,401,'invalid-token');
 });
 await check('UI admin logout clears session',async()=>{await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page).toHaveURL(/\/login$/);assert(!await page.evaluate(()=>sessionStorage.getItem('ems.accessToken')),'logout token');});
}
main().catch(e=>{results.push({name:'prerequisite or harness',result:'FAIL',detail:e.message});console.log('HARNESS FAILED');}).finally(async()=>{if(browser) await browser.close();fs.writeFileSync(path.join(__dirname,'mvp-results.json'),JSON.stringify({timestamp:new Date().toISOString(),results},null,2));process.exitCode=results.some(x=>x.result==='FAIL')?1:0;});
