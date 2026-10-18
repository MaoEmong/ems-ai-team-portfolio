# 0114: 공개 준비 점검에서 보안 헤더를 먼저 작성한다

- 상태: 적용 (2026-10-18)
- 수행: Codex(백엔드). 범위: 최소 보안 수정.

## 배경

해결 버전 Spring Security 6.5.5는 [CVE-2026-22732 공식 공지](https://spring.io/security/cve-2026-22732/)의 lazy response header 영향 범위에 포함된다. 포트폴리오 공개 점검 중 발견했으며 전체 프레임워크 강제 업데이트는 이번 지시에 포함되지 않는다.

## 결정

공급자가 제시한 `HeaderWriterFilter.setShouldWriteHeadersEagerly(true)`를 ObjectPostProcessor로 설정한다. 기존 JWT·CORS·권한·오류 계약은 유지한다. `SecurityReviewWebTest`에서 실제 filter chain의 eager 설정과 200/401/403 보안/캐시 헤더를 검사한다. DB repository는 mock이며 MySQL 트랜잭션 증거로 취급하지 않는다.

## 결과와 제한

영향 단위/MVC 전체 147개 및 bootJar가 통과했다. MySQL 테스트는 Docker 엔진 부재로 초기화 실패했고 업무 테스트는 미실행이다. 이 우회는 라이브러리 버전을 올리지 않으므로 OSV 버전 매칭에는 계속 나타날 수 있다. 다른 의존성 위험과 호환 패치 업그레이드는 별도 검증 과제로 남긴다. 화면·API DTO·Flyway 변경은 없다. 자세한 결과는 [보안 보고서](../security/backend-security-review.md)에 있다.
