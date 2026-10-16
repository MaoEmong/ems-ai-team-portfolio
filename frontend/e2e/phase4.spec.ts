import { test, expect, type Page } from '@playwright/test';
async function login(page:Page,id:string){await page.getByLabel('아이디 (사번)').fill(id);await page.getByLabel('비밀번호',{exact:true}).fill('demo1234!');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();}
async function nav(page:Page,name:string){const toggle=page.getByRole('button',{name:'메뉴 펼치기'});if(await toggle.isVisible())await toggle.click();await page.getByRole('navigation',{name:'주 메뉴'}).getByRole('link',{name,exact:true}).click();}
async function shot(page:Page,name:string){await page.evaluate(async()=>{window.scrollTo(0,0);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`design-evidence/phase4/${name}.png`,fullPage:true});}
for(const mobile of [false,true])test(`4단계 AI ${mobile?'모바일':'데스크톱'}`,async({page})=>{
 test.setTimeout(60000);const prefix=mobile?'mobile':'desktop';
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});await page.clock.setFixedTime(new Date('2026-10-16T20:00:00+09:00'));
 await page.goto('/login');await login(page,'admin');await nav(page,'사원 관리');
 await page.getByText('자연어로 필터 제안 (AI)',{exact:true}).click();
 await expect(page.getByText(/실제 추론 아님/).first()).toBeVisible();await shot(page,`${prefix}-search-ready`);
 await page.getByLabel('필터 제안 질문').fill('재직 중인 개발팀 사원을 이름순으로');await page.getByRole('button',{name:'AI로 필터 제안',exact:true}).click();
 await expect(page.getByRole('button',{name:'제안 적용',exact:true})).toBeVisible();await expect(page.getByLabel('재직 상태',{exact:true})).toHaveValue('');await expect(page.getByLabel('부서',{exact:true})).toHaveValue('');await shot(page,`${prefix}-search-proposal`);
 await page.getByRole('button',{name:'제안 적용',exact:true}).click();await expect(page.getByText('AI 제안 필터를 적용했습니다. 필터는 직접 바꿀 수 있습니다.')).toBeVisible();await shot(page,`${prefix}-search-applied`);
 await page.getByLabel('필터 제안 질문').fill('팀장 직책 사원');await page.getByRole('button',{name:'AI로 필터 제안',exact:true}).click();await expect(page.getByText('필터로 바꿀 수 없는 질문입니다',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'제안 적용',exact:true})).toHaveCount(0);await shot(page,`${prefix}-search-unsupported`);
 await nav(page,'규정 Q&A');await page.getByLabel('규정 질문').fill('오전 반차일의 출근 기준은 언제인가요?');await page.getByRole('button',{name:'AI로 답변 찾기',exact:true}).click();await expect(page.getByRole('heading',{name:'답변',exact:true})).toBeVisible();await expect(page.getByText(/DEMO-ATTENDANCE/)).toBeVisible();await shot(page,`${prefix}-policy-answer`);
 await page.getByLabel('규정 질문').fill('외계 행성 출장 규정은?');await page.getByRole('button',{name:'AI로 답변 찾기',exact:true}).click();await expect(page.getByRole('heading',{name:'답변할 수 없음',exact:true})).toBeVisible();await shot(page,`${prefix}-policy-no-evidence`);
 await nav(page,'담당 평가');await page.getByRole('row').filter({hasText:'테스트 사원 4'}).getByRole('link').click();await page.getByText('AI 코멘트 요약 (참고용 · 읽기 전용)',{exact:true}).click();await page.getByRole('button',{name:'AI로 요약 만들기',exact:true}).click();await expect(page.getByRole('heading',{name:'자기평가·관리자 코멘트 요약',exact:true})).toBeVisible();await shot(page,`${prefix}-evaluation-summary`);
 await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page,'EMP001');await nav(page,'내 평가');await page.getByRole('row').filter({hasText:'합성 데모 평가'}).getByRole('link').click();await expect(page.getByText('AI 코멘트 요약 (참고용 · 읽기 전용)',{exact:true})).toHaveCount(0);await shot(page,`${prefix}-unfinalized-no-summary`);
 await nav(page,'규정 Q&A');await expect(page.getByLabel('규정 질문')).toHaveValue('');await shot(page,`${prefix}-policy-employee`);
});
