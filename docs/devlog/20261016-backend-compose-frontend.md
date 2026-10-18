# 2026-10-16 Compose 프론트 통합

## 구현 기준
작업 범위: 확정된 프론트 Docker 설정을 Compose에 통합하고 세 서비스 기동, 프론트 HTTP 200, CORS, 실제 API 경로를 확인한다. gradlew 실행 비트를 확인하되 Git 인덱스 변경·커밋은 하지 않는다. 검증 후 down으로 종료하고 볼륨을 유지한다. frontend/ 및 공통 문서는 수정하지 않는다.

## 수행 내용과 판단 근거
- frontend/README.md, Dockerfile, src/api.ts를 읽고 확정 계약을 확인했다.
- docker-compose.yml의 주석을 frontend 서비스로 전환: context=./frontend, build args VITE_API_URL=http://localhost:8080 및 VITE_MOCK_API="false", ports=5173:5173, depends_on=backend.
- Vite 정적 번들이므로 런타임 environment 대신 빌드 인자를 사용했다. 이는 프론트 빌드 설정과 실제 API 연결 조건에 따른 결정이다.
- src/api.ts는 origin 뒤에 /api/v1 및 개별 경로를 붙인다. origin에 /api/v1을 중복 추가하지 않았다.
- 기존 검증용 ems-backend-smoke 프로젝트와 Git 제외 환경파일 backend/build/compose-smoke.env를 재사용했다. 비밀값·토큰은 출력하지 않았다.
- 실제 Chromium 브라우저로 nginx가 제공한 번들을 실행하고 관리자 로그인→사원 목록 네트워크 응답을 검증했다. 목업 성공을 실제 연동 성공으로 대신하지 않았다.

## 실행 명령과 결과
작업 디렉터리: E:/portfolio/ems. 기본 셸 로그온 오류를 피하기 위해 승인된 실행 경로 사용.

| 명령/검증 | 결과 |
| --- | --- |
| docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env up --build -d | backend 및 frontend 이미지 빌드 성공, 세 컨테이너 기동 |
| docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env ps | mysql healthy, backend Up, frontend Up |
| node backend/build/compose-frontend-check.cjs | Playwright Chromium 실제 브라우저 검증 통과 |
| GET http://localhost:5173 | HTTP 200 |
| GET http://localhost:5173/employees | HTTP 200, root 요소가 있는 SPA fallback HTML |
| OPTIONS http://localhost:8080/api/v1/employees | HTTP 200; Origin=http://localhost:5173, 요청 메서드 GET, 요청 헤더 authorization,content-type |
| CORS 응답 | Access-Control-Allow-Origin=http://localhost:5173, 허용 메서드 GET 및 헤더 authorization 확인 |
| 실제 브라우저 로그인 요청 | POST http://localhost:8080/api/v1/auth/login → 200, 허용 Origin 확인 |
| 실제 브라우저 목록 요청 | GET http://localhost:8080/api/v1/employees?keyword=&departmentId=&positionId=&status=&sort=employeeNo%2Casc&size=20&page=0 → 200, totalElements=31 |
| 토큰 저장 | sessionStorage ems.accessToken 존재 확인; 값은 출력하지 않음 |
| git -c safe.directory=E:/portfolio/ems ls-files --stage backend/gradlew | 결과 없음: 인덱스 미등록 |
| git -c safe.directory=E:/portfolio/ems status --short -- backend/gradlew | ?? backend/gradlew: 미추적 상태 |
| docker compose --project-name ems-backend-smoke --env-file backend/build/compose-smoke.env down | 세 컨테이너 및 프로젝트 네트워크 제거, -v 사용하지 않음 |
| down 후 ps --all | 컨테이너 없음 |
| docker volume ls --filter name=ems-backend-smoke_mysql_data | 검증용 mysql_data 볼륨 유지 확인 |
| Get-NetTCPConnection -State Listen -LocalPort 3306,8080,5173 | 리스너 없음, 포트 반환 확인 |

마지막 PowerShell 묶음의 종료 코드는 포트 조회 대상이 없어서 1이었다. 앞선 Compose down은 컨테이너 제거 완료를 출력했고 ps --all은 비어 있었다. 이를 Compose 종료 실패로 해석하지 않았다.

## 문제와 인계
- API 경로 불일치 없음. 프론트 파일 수정 및 계약 변경 없음.
- gradlew가 아직 미추적이므로 Git 모드 100755를 현재 인덱스에서 확인할 수 없다. 문서QA가 스테이징한 뒤 `git update-index --chmod=+x backend/gradlew`로 설정하고 `git ls-files --stage backend/gradlew`에서 100755를 확인해야 한다. 백엔드팀은 인덱스 변경·커밋을 하지 않았다.
- 검증용 Playwright 스크립트는 backend/build/compose-frontend-check.cjs에 있으며 Git 제외 일회성 산출물이다. 이번 변경의 지속 산출물은 docker-compose.yml 및 이 개발일지다.
- 이번 범위의 기동·CORS·경로 검증은 실제 실행 완료했다. 전체 기능 E2E와 최종 통합 커밋은 문서QA의 별도 검수 범위다.
- 구현·검증은 Codex가 수행했다. 사람 검수 또는 제품 LLM 호출을 수행했다고 기록하지 않는다.
