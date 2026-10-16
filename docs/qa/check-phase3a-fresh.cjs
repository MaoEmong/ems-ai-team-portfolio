const fs=require('node:fs'),path=require('node:path');
const {chromium,expect}=require('../../frontend/node_modules/@playwright/test');
const env=Object.fromEntries(fs.readFileSync(process.argv[2]||'.env.qa3a-local','utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.includes('=')&&!x.startsWith('#')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
let browser;
(async()=>{
 browser=await chromium.launch({headless:true});const p=await browser.newPage({viewport:{width:1440,height:1000}});
 let ready=false;for(let n=0;n<30;n++){try{const r=await p.request.post('http://localhost:8080/api/v1/auth/login',{data:{loginId:env.ADMIN_LOGIN_ID,password:env.ADMIN_INITIAL_PASSWORD}});if(r.status()===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw Error('Backend readiness failed');
 await p.goto('http://localhost:5173/login');await p.getByLabel('아이디 (사번)').fill(env.ADMIN_LOGIN_ID);await p.getByLabel('비밀번호',{exact:true}).fill(env.ADMIN_INITIAL_PASSWORD);await p.getByRole('button',{name:'로그인',exact:true}).click();await expect(p.getByRole('heading',{name:'대시보드',exact:true})).toBeVisible();
 const auth=await p.evaluate(()=>sessionStorage.getItem('ems.accessToken'));
 const get=async(r)=>{const x=await p.request.get('http://localhost:8080/api/v1'+r,{headers:{Authorization:'Bearer '+auth}});if(x.status()!==200)throw Error('Fresh read '+r);return x.json();};
 const d=await get('/dashboard'),list=await get('/employees'),retired=await get('/employees?status=RETIRED'),demo=await get('/employees?keyword=DEMO001');
 if(d.headcount.employed!==26||d.headcount.retired!==5||list.totalElements!==26||retired.totalElements!==5||demo.content[0].role!=='ADMIN')throw Error('Fresh seed counts/role');
 if(d.monthly.length!==12||d.monthly.filter(m=>m.hires>0).length<10)throw Error('12 month seed distribution');
 await p.waitForLoadState('networkidle');await p.screenshot({path:path.join(__dirname,'phase3a-screenshots/dashboard-fresh.png'),fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(__dirname,'phase3a-screenshots/dashboard-fresh-mobile.png'),fullPage:true});
 const r=await p.request.post('http://localhost:8080/api/v1/auth/login',{data:{loginId:'DEMO001',password:env.DEMO_ADMIN_INITIAL_PASSWORD}});if(r.status()!==200||(await r.json()).user.role!=='ADMIN')throw Error('DEMO001 local password login');
 fs.writeFileSync(path.join(__dirname,'phase3a-fresh-results.json'),JSON.stringify({timestamp:new Date().toISOString(),result:'PASS',defaultList:26,retired:5,total:31,demo001Role:'ADMIN',demo001Login:'PASS',dashboard:d},null,2));console.log('FRESH PASS total31/default26/retired5/DEMO001/12-month distribution');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
