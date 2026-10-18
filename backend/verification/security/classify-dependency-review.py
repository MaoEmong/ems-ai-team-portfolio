"""Materialize source-reviewed reachability triage; does not prove exploitation."""
from pathlib import Path
from collections import Counter
import datetime
import json

root=Path.cwd()
path=root/'backend/verification/20261018-backend-dependency-audit.json'
data=json.loads(path.read_text(encoding='utf-8'))
conditional={'CONDITIONAL_NOT_CONFIGURED','NO_EXPLICIT_FEATURE_PATH',
 'ALLOWLISTED_APP_PATHS','LIMITED_FIXED_PATTERN_PATH','NO_UNTRUSTED_EXPRESSION_PATH',
 'NO_PUBLIC_RESOURCE_PATH','CONDITIONAL_DEPLOYMENT'}
def evidence(f):
    component=f['component']
    if 'logback' in component: return 'application.yml / Dockerfile: no receiver or user-controlled logging configuration'
    if 'jackson' in component: return 'Dto, EvaluationDto, AiJson, MVC controllers: typed DTOs / blocking JSON, no identified special parser/typing configuration'
    if 'commons-lang3' in component: return 'runtime inventory / SheetCodec / FileService: transitive calls not fully traced'
    if 'log4j' in component: return 'runtime inventory / main logging search: Logback implementation, no MapMessage construction'
    if 'tomcat' in component: return 'application.yml / Dockerfile / SecurityConfig / docker-compose.yml: embedded HTTP, custom JWT, optional connectors not enabled'
    if 'spring-boot' in component: return 'application.yml / Dockerfile / runtime inventory: embedded server, non-root container, no Artemis configuration'
    if 'spring-data' in component: return 'ApiController / EmployeeService / CatalogService: fixed sort whitelist, no projection or Pageable input binding'
    if 'spring-security' in component: return 'SecurityConfig / AuthService / SecurityReviewWebTest: local symmetric JWT; eager HeaderWriterFilter regression'
    if 'spring-expression' in component: return 'main controllers: constant PreAuthorize expressions; no user-supplied SpEL'
    if component.endswith('spring-core'): return 'SecurityConfig / controller mappings: fixed route patterns, no external matcher patterns found'
    if component.endswith('spring-web'): return 'LlmClients / AI server configuration: no application UriComponentsBuilder input path'
    return 'MVC controllers / SecurityConfig / application.yml / docker-compose.yml: JSON endpoints, separate static frontend, no JSP/XSLT/SSE/WAF configuration'

for finding in data['findings']:
    assessment=finding['assessment']
    category='실제 도달 가능' if assessment=='VENDOR_WORKAROUND' else ('조건 미충족' if assessment in conditional else '판단 불가')
    finding['reviewClassification']=category
    finding['sourceEvidence']=evidence(finding)
    finding['classificationScope']='Current source and default Compose only; static prerequisite assessment, not an exploitation test'
data['classificationCounts']=dict(Counter(f['reviewClassification'] for f in data['findings']))
data['classifiedAt']=datetime.datetime.now().astimezone().isoformat()
data['classificationPolicy']='Actual application path / unmet prerequisites / unable to determine; version match is not an exploitable vulnerability count'
data['patchDecision']='Vendor header workaround applied; no dependency upgrade. Other High/Critical paths remain conditional or undetermined; complete MySQL regression unavailable because Docker engine was not running. No minor/major upgrade performed.'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# 런타임 advisory 68건의 항목별 도달성 분류','',
 '기준: 2026-10-18의 런타임 해결 버전 91개와 OSV 조회(22:29:06~22:29:13 KST). 테스트·빌드 의존성, JDK, 컨테이너 OS는 제외했다. **버전 일치 68건**이며 취약점 재현 68건이 아니다. 다음 세 분류는 현재 소스와 기본 Compose의 정적 조건 판단이다. 조건 미충족은 배포 설정이 달라져도 안전하다는 뜻이 아니다. 판단 불가는 미해결 검토 대상으로 남긴다.','',
 '실제 도달 가능은 취약 기능이 현재 애플리케이션에서 활성인 항목이다. 헤더 건은 공식 eager 우회를 적용했으므로 현재 공격 성공을 뜻하지 않는다. 다른 항목은 동적 재현을 수행하지 않았다.','',
 '분류 집계: '+', '.join(f'{k} {v}건' for k,v in data['classificationCounts'].items())+'.','',
 '각 GHSA 링크는 advisory 원문이며 고정 버전·전체 참조는 [감사 JSON](../../backend/verification/20261018-backend-dependency-audit.json)에 있다. sourceEvidence의 Java 클래스는 backend/src/main/java/com/portfolio/ems 기준이다.','',
 '| 항목·CVE | 해결 구성요소·버전 | 심각도 | 분류 | 근거 경로·조건 | 조치·잔여 |',
 '|---|---|---|---|---|---|']
def clean(s): return str(s).replace('|',' / ').replace('\n',' ')
for f in data['findings']:
    link=f"[{f['id']}](https://github.com/advisories/{f['id']})"
    aliases=', '.join(f.get('aliases',[]))
    action='공식 eager 헤더 우회 적용·MVC 200/401/403 PASS. 버전은 유지.' if f['assessment']=='VENDOR_WORKAROUND' else ('현재 조건 미충족. 기능·프록시 설정 변경 시 재평가. 버전 유지.' if f['reviewClassification']=='조건 미충족' else '도달성/공격 조건 미입증. 미해결로 유지, 운영 공개 전 추가 검증·호환 패치 검토.')
    row=[link+(' / '+aliases if aliases else ''),f['component']+' '+f['version'],f['severity'],f['reviewClassification'],f['sourceEvidence']+'; '+f['summary']+'; '+f['reachabilityNote'],action]
    lines.append('| '+' | '.join(clean(c) for c in row)+' |')
lines += ['','## 패치 판단','',
 '검토 범위는 실제 도달 가능한 High/Critical에 대한 동일 마이너 내 패치와 전체 백엔드 재검증이다. 이번 실제 활성 헤더 경로는 승인받은 공급자 우회로 완화했고, 의존성 버전 교체는 하지 않았다. 나머지 잠재 파서·전송/환경 경로를 근거 없이 실제 도달 가능으로 올리거나 해소했다고 쓰지 않았다. Docker 엔진 부재로 전체 MySQL 재검증이 불가능한 상태이기도 하다. 이후 패치 검토는 동일 마이너 호환성·공식 고정 버전·전체 테스트 PASS를 갖춰 별도로 진행한다. 마이너·메이저 교체는 수행하지 않았다.','']
(root/'docs/security/backend-dependency-triage.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'rows':len(data['findings']),'counts':data['classificationCounts']},ensure_ascii=True))
