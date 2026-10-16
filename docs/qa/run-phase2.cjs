const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium,expect}=require('../../frontend/node_modules/@playwright/test');
const Excel=require('../../frontend/node_modules/exceljs');
const root=path.resolve(__dirname,'../..');
const env=Object.fromEntries(fs.readFileSync(process.argv[2]||path.join(root,'backend/build/compose-smoke.env'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const results=[],facts={}; const stamp=Date.now().toString(),password=crypto.randomBytes(20).toString('hex');
const prefix='P2'+stamp; let browser,page,token;
function ok(v,m){if(!v)throw Error(m);}
async function check(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,result:'FAIL',detail:e.message.slice(0,1800)});console.log('FAIL '+name);}}
async function raw(method,route,data,auth=token){return page.request.fetch('http://localhost:8080/api/v1'+route,{method,headers:{Authorization:'Bearer '+auth},...(data?{data}:{})});}
async function api(method,route,data,status=200,auth=token){const r=await raw(method,route,data,auth);ok(r.status()===status,method+' '+route+' expected '+status+' got '+r.status());return status===204?null:r.json();}
async function all(route){let list=[];for(let n=0;;n++){const x=await api('GET',route+(route.includes('?')?'&':'?')+'size=100&page='+n);list.push(...x.content);if(n+1>=x.totalPages)return list;}}
async function shots(name){await page.screenshot({path:path.join(__dirname,'phase2-screenshots',name+'.png'),fullPage:true});}
async function download(button){const [d]=await Promise.all([page.waitForEvent('download'),button.click()]);const stream=await d.createReadStream();const chunks=[];for await(const c of stream)chunks.push(c);return {name:d.suggestedFilename(),buffer:Buffer.concat(chunks)};}
function csvParse(text){const rows=[];let row=[],value='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){value+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(value);value='';}else if((c==='\r'||c==='\n')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}else value+=c;}if(value||row.length){row.push(value);rows.push(row);}return rows;}
const headers=['employeeNo','name','email','phone','hireDate','departmentId','positionId','role','initialPassword'];
async function xlsx(rows){const w=new Excel.Workbook();const s=w.addWorksheet('employees');s.addRow(headers);rows.forEach(r=>s.addRow(r));return Buffer.from(await w.xlsx.writeBuffer());}
async function upload(buffer,name='qa.xlsx'){await page.getByLabel('사원 등록 파일').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});await page.getByRole('button',{name:'등록 내용 확인',exact:true}).click();const wait=page.waitForResponse(r=>r.url().endsWith('/employees/import')&&r.request().method()==='POST');await page.getByRole('button',{name:'전체 등록',exact:true}).click();return wait;}
async function main(){
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);fs.mkdirSync(path.join(__dirname,'phase2-screenshots'),{recursive:true});
 await page.goto('http://localhost:5173/login');await page.getByLabel('아이디 (사번)').fill(env.ADMIN_LOGIN_ID);await page.getByLabel('비밀번호',{exact:true}).fill(env.ADMIN_INITIAL_PASSWORD);await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('heading',{name:'대시보드',exact:true})).toBeVisible();token=await page.evaluate(()=>sessionStorage.getItem('ems.accessToken'));
 const baseline=await api('GET','/dashboard');facts.baseline=baseline;const today=baseline.asOfDate;
 const deps=await api('GET','/departments'),positions=await api('GET','/positions');
 await check('Dashboard current data baseline and 12-month date aggregates',async()=>{
  const employees=(await Promise.all(['ACTIVE','ON_LEAVE','RETIRED'].map(s=>all('/employees?status='+s)))).flat();
  ok(baseline.headcount.active===employees.filter(e=>e.status==='ACTIVE').length,'active count');ok(baseline.headcount.onLeave===employees.filter(e=>e.status==='ON_LEAVE').length,'leave count');ok(baseline.headcount.retired===employees.filter(e=>e.status==='RETIRED').length,'retired count');
  ok(baseline.headcount.employed===baseline.headcount.active+baseline.headcount.onLeave,'employed sum');
  for(const [key,prop] of [['byDepartment','department'],['byPosition','position']])for(const group of baseline[key])ok(group.count===employees.filter(e=>e.status!=='RETIRED'&&e[prop].id===group[prop+'Id']).length,'distribution');
  ok(baseline.monthly.length===12,'12 months');ok(baseline.monthly.at(-1).month===today.slice(0,7),'last month');
  for(const m of baseline.monthly){ok(m.hires===employees.filter(e=>e.hireDate.startsWith(m.month)&&e.hireDate<=today).length,'monthly hires');ok(m.retirements===employees.filter(e=>e.retireDate&&e.retireDate.startsWith(m.month)&&e.retireDate<=today).length,'monthly retirements');}
  ok(baseline.thisMonth.hires===baseline.monthly.at(-1).hires&&baseline.thisMonth.retirements===baseline.monthly.at(-1).retirements,'month summary');await shots('dashboard');
 });
 const body={employeeNo:prefix,name:'=QA 합성발령',email:prefix+'@example.invalid',phone:'+000000',hireDate:today,departmentId:deps[0].id,positionId:positions[0].id,role:'EMPLOYEE',initialPassword:password};
 const e=await api('POST','/employees',body,201);
 const login=await api('POST','/auth/login',{loginId:prefix,password});const empToken=login.accessToken;
 const update={name:body.name,email:body.email,phone:body.phone,hireDate:today,status:'ACTIVE',role:'EMPLOYEE'};
 await check('Dashboard creation delta and current-month hires',async()=>{const d=await api('GET','/dashboard');ok(d.headcount.employed===baseline.headcount.employed+1,'headcount delta');ok(d.thisMonth.hires===baseline.thisMonth.hires+1,'hires delta');});
 let appointment;
 await check('Real UI appointment synchronizes organization history and audit',async()=>{
  await page.goto('http://localhost:5173/employees/'+e.id);await page.getByRole('button',{name:'발령 등록',exact:true}).click();await page.getByLabel('발령 후 부서 *').selectOption(String(deps[1].id));await page.getByLabel('발령 후 직급 *').selectOption(String(positions[1].id));await page.getByLabel('발령 사유 *').fill('합성 통합검수 이동');
  const w=page.waitForResponse(r=>r.url().endsWith('/appointments')&&r.request().method()==='POST');await page.getByRole('dialog').getByRole('button',{name:'발령 등록',exact:true}).click();const r=await w;ok(r.status()===201,'appointment 201');appointment=await r.json();await expect(page.getByText('합성 통합검수 이동',{exact:true})).toBeVisible();await shots('appointment-history');
  const current=await api('GET','/employees/'+e.id);ok(current.department.id===deps[1].id&&current.position.id===positions[1].id,'current organization');const history=await api('GET','/employees/'+e.id+'/appointments');ok(history.content[0].id===appointment.id,'history id');
  const audit=await all('/audit-logs?action=APPOINTMENT_CREATE&targetId='+e.id);ok(audit.length===1&&audit[0].metadata.appointmentId===appointment.id,'audit exact');ok(audit[0].before.department.id===deps[0].id&&audit[0].after.department.id===deps[1].id,'before after');
 });
 await check('PUT omitted null same preserved and changed organization rejected',async()=>{
  for(const extra of [{},{departmentId:null,positionId:null},{departmentId:deps[1].id,positionId:positions[1].id}]){const x=await api('PUT','/employees/'+e.id,{...update,...extra});ok(x.department.id===deps[1].id&&x.position.id===positions[1].id,'preserved');}
  const x=await api('PUT','/employees/'+e.id,{...update,departmentId:deps[0].id},409);ok(x.code==='APPOINTMENT_REQUIRED','409 code');
 });
 await check('Appointment date no-change reason and hire-retire boundaries',async()=>{
  const valid={effectiveDate:today,departmentId:deps[0].id,positionId:positions[0].id,reason:'검수'};
  for(const change of [{effectiveDate:'2099-01-01'},{effectiveDate:'2000-01-01'},{departmentId:deps[1].id,positionId:positions[1].id},{reason:''}])await api('POST','/employees/'+e.id+'/appointments',{...valid,...change},400);
  await api('PUT','/employees/'+e.id,{...update,hireDate:'2099-01-01'},400);await api('POST','/employees/'+e.id+'/retire',{retireDate:'2000-01-01'},400);
 });
 await check('EMPLOYEE history own only and phase2 admin authorization',async()=>{
  await api('GET','/employees/'+e.id+'/appointments',null,200,empToken);await api('GET','/employees/1/appointments',null,403,empToken);
  for(const route of ['/dashboard','/audit-logs','/employees/export?format=csv','/employees/import-template'])await api('GET',route,null,403,empToken);
  await api('POST','/employees/'+e.id+'/appointments',{effectiveDate:today,departmentId:deps[0].id,positionId:positions[0].id,reason:'denied'},403,empToken);
 });
 await check('Actual UI CSV XLSX downloads parsed vs filtered sorted list',async()=>{
  await page.goto('http://localhost:5173/employees');await page.locator('#keyword').fill(prefix);await page.locator('#sort').selectOption('employeeNo,desc');await expect(page.getByRole('link',{name:body.name,exact:true})).toBeVisible();
  const expected=await all('/employees?keyword='+prefix+'&sort=employeeNo,desc');
  const csv=await download(page.getByRole('button',{name:'CSV 내보내기',exact:true}));ok(csv.buffer.subarray(0,3).equals(Buffer.from([239,187,191])),'BOM');const rows=csvParse(csv.buffer.toString('utf8').replace(/^\uFEFF/,''));ok(rows.slice(1).map(r=>r[0]).join()===expected.map(e=>e.employeeNo).join(),'csv order');ok(rows[1][1].startsWith("'=")&&rows[1][3].startsWith("'+"),'formula escaping');
  const dl=await download(page.getByRole('button',{name:'현재 조건으로 내보내기 (xlsx)',exact:true}));const w=new Excel.Workbook();await w.xlsx.load(dl.buffer);const s=w.worksheets[0];ok(s.rowCount===expected.length+1,'xlsx row count');ok(s.getRow(2).getCell(1).value===expected[0].employeeNo,'xlsx order');s.eachRow(r=>r.eachCell(c=>ok(c.type===Excel.ValueType.String,'all string cells')));
  ok(!rows[0].some(x=>/password|hash/i.test(x))&&!csv.buffer.toString().includes(password),'secret excluded');facts.downloads={csvName:csv.name,xlsxName:dl.name,rows:expected.length,headers:rows[0]};
  const r=await raw('GET','/employees/export?format=csv&keyword='+prefix+'&sort=employeeNo,desc&page=99&size=1');ok(r.status()===200&&r.headers()['content-disposition'].includes("filename*=UTF-8''"),'filename contract');
 });
 await page.goto('http://localhost:5173/employees/import');
 await check('Actual template download has import and reference sheets',async()=>{const dl=await download(page.getByRole('button',{name:'양식 다운로드',exact:true}));const w=new Excel.Workbook();await w.xlsx.load(dl.buffer);ok(w.getWorksheet('employees')&&w.getWorksheet('departments')&&w.getWorksheet('positions'),'template sheets');ok(w.getWorksheet('employees').getRow(1).values.slice(1).join()===headers.join(),'template headers');});
 const row=(no,email)=>[no,'합성가져오기',email,'',today,String(deps[0].id),String(positions[0].id),'EMPLOYEE',password];
 await check('UI invalid XLSX row3 total rollback and exactly one failure audit',async()=>{
  const before=await api('GET','/dashboard'),logs=await all('/audit-logs?action=EMPLOYEE_IMPORT&success=false');
  const buf=await xlsx([row(prefix+'BAD1',prefix+'bad1@example.invalid'),row(prefix+'BAD2',body.email)]);
  const r=await upload(buf,'invalid.xlsx');ok(r.status()===400,'invalid400');const error=await r.json();ok(error.code==='IMPORT_VALIDATION_ERROR'&&error.rowErrors.some(x=>x.row===3&&x.field==='email'),'row3');
  ok((await all('/employees?keyword='+prefix+'BAD')).length===0,'zero employees');ok((await api('GET','/dashboard')).headcount.employed===before.headcount.employed,'zero delta');
  const after=await all('/audit-logs?action=EMPLOYEE_IMPORT&success=false');ok(after.length===logs.length+1&&after[0].metadata.errorCount===error.rowErrors.length,'one failure audit');ok(!JSON.stringify(error).includes(password),'error excludes password');await shots('import-errors');
 });
 await check('UI valid XLSX two rows preserves leading zero and success audit',async()=>{
  const before=await api('GET','/dashboard'),logs=await all('/audit-logs?action=EMPLOYEE_IMPORT&success=true');
  const r=await upload(await xlsx([row('00'+prefix+'A',prefix+'a@example.invalid'),row('00'+prefix+'B',prefix+'b@example.invalid')]),'valid.xlsx');ok(r.status()===201,'valid201');ok((await r.json()).importedCount===2,'count2');
  const added=await all('/employees?keyword=00'+prefix);ok(added.length===2&&added.every(x=>x.employeeNo.startsWith('00')),'leading zero');
  ok((await api('GET','/dashboard')).headcount.employed===before.headcount.employed+2,'delta2');
  const after=await all('/audit-logs?action=EMPLOYEE_IMPORT&success=true');ok(after.length===logs.length+1&&after[0].metadata.importedCount===2,'import audit');for(const x of added){const a=await all('/audit-logs?action=EMPLOYEE_CREATE&targetId='+x.id);ok(a.length===1&&a[0].metadata.source==='IMPORT','create source');}
 });
 await check('Audit filters exact half-open boundary and secrets excluded',async()=>{
  const logs=await all('/audit-logs?targetId='+e.id+'&targetType=EMPLOYEE&success=true');ok(logs.length>=4,'target logs');const a=logs[0],t=encodeURIComponent(a.occurredAt);
  const from=await all('/audit-logs?targetId='+e.id+'&from='+t);ok(from.some(x=>x.id===a.id),'inclusive from');
  const to=await all('/audit-logs?targetId='+e.id+'&to='+t);ok(!to.some(x=>x.id===a.id),'exclusive to');
  const filtered=await all('/audit-logs?actorId='+a.actor.id+'&action='+a.action+'&targetType=EMPLOYEE&targetId='+e.id+'&success=true');ok(filtered.every(x=>x.actor.id===a.actor.id&&x.action===a.action&&x.targetId===e.id&&x.success),'AND filters');
  const serialized=JSON.stringify(await all('/audit-logs'));ok(!serialized.includes(password)&&!serialized.includes(token)&&!/"(?:password|passwordHash|initialPassword|accessToken)"\s*:/.test(serialized),'sensitive values');
  await page.goto('http://localhost:5173/audit-logs');await expect(page.getByText('상세 보기').first()).toBeVisible();await page.getByText('상세 보기').first().click();await shots('audit');
 });
 await check('Unknown login failure actor null and no input stored',async()=>{const unknown='unknown-'+stamp;await api('POST','/auth/login',{loginId:unknown,password},401);const a=(await all('/audit-logs?action=LOGIN_FAILURE'))[0];ok(a.actor===null&&a.metadata.reason==='BAD_CREDENTIALS'&&!JSON.stringify(a).includes(unknown),'unknown login privacy');});
 await check('Retirement delta and retired appointment rejection',async()=>{const before=await api('GET','/dashboard');await api('POST','/employees/'+e.id+'/retire',{retireDate:today});const after=await api('GET','/dashboard');ok(after.headcount.employed===before.headcount.employed-1&&after.thisMonth.retirements===before.thisMonth.retirements+1,'retire delta');await api('POST','/employees/'+e.id+'/appointments',{effectiveDate:today,departmentId:deps[0].id,positionId:positions[0].id,reason:'retired'},409);facts.final=after;});
 await check('Actual API mobile dashboard no document overflow',async()=>{await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:5173/dashboard');await expect(page.getByRole('heading',{name:'대시보드',exact:true})).toBeVisible();ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow');await shots('dashboard-mobile');});
}
main().catch(e=>{results.push({name:'harness prerequisite',result:'FAIL',detail:e.message});console.log('HARNESS FAILED');}).finally(async()=>{if(browser)await browser.close();fs.writeFileSync(path.join(__dirname,'phase2-results.json'),JSON.stringify({timestamp:new Date().toISOString(),facts,results},null,2));process.exitCode=results.some(x=>x.result==='FAIL')?1:0;});
