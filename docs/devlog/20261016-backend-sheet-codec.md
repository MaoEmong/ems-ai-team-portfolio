# 2026-10-16 순수 파일 코덱 구현

- 담당: 백엔드팀 엑셀처리담당, 검증 작업.
- 변경 소유권: `SheetCodec.java`, `SheetCodecTest.java`, 이 개발일지 세 파일.
- 담당 지시의 확정 세부 계약을 적용했다. 기존 DTO, Gradle, DB/서비스/컨트롤러, API 문서 및 프론트는 수정하지 않았다.

## 구현

- `@Component SheetCodec`은 주입받은 Bean Validation `Validator`를 사용한다. 공개 `read`, `template`, `export`와 내부 공개 `Row` record를 제공한다.
- 가져오기는 5MiB 업로드 제한, xlsx 확장자와 ZIP 서명, 실제 ZIP 스트림의 엔트리 10MiB·전체 20MiB 제한을 먼저 검사한다. 중복 엔트리와 10,000개 초과 엔트리를 거절한다. 100,000바이트를 넘는 엔트리는 압축률 100:1 초과도 거절한다. ZIP/POI 파싱 오류는 입력 원문 없이 `IMPORT_INVALID_FILE`로 변환한다. 암호화 Office 파일의 OLE 컨테이너와 암호화 ZIP은 허용하지 않는다.
- employees 시트의 정확한 9개 헤더를 검사한다. 빈 행을 건너뛰고 실제 Excel 행 번호를 보존한다. 0행·1,000행 초과는 파일 오류다.
- 사번·날짜·비밀번호와 기타 텍스트를 문자열 셀로만 읽으며 trim하지 않는다. 부서·직급은 양의 Long 범위 정수 문자열 또는 정수 숫자 셀을 허용한다. 수식은 실행하거나 캐시값으로 대체하지 않고 행 오류로 반환한다.
- 날짜는 4자리 연도 YYYY-MM-DD와 실제 달력 날짜를 검증한다. DTO Bean Validation 및 비밀번호 UTF-8 72바이트 제한을 적용한다. 오류 사유는 고정 문구만 사용하며 입력 원문을 포함하지 않는다.
- 양식은 employees 헤더만 생성하고 사번·입사일·초기 비밀번호 열의 기본 서식을 `@`로 설정한다. departments(id,name), positions(id,name,level) 참조 시트를 생성한다.
- 내보내기는 지정 10개 필드만 사용한다. xlsx 셀은 모두 문자열이고, CSV는 UTF-8 BOM·CRLF·따옴표 이스케이프와 지정된 6개 수식 시작 문자 방어를 적용한다.
- DB 참조·중복, 트랜잭션, 감사 및 내보내기 행 상한/HTTP 파라미터 검증은 서비스 계층의 소유 범위다. export의 format은 검증 완료된 xlsx/csv를 받으며 다른 문자열은 IllegalArgumentException이다.

## 검증 코드와 실행 상태

- 정상 파싱과 앞자리 0/공백/행 번호 보존, 숫자 사번·날짜·비밀번호, 수식, 잘못된 날짜·ID·DTO 필드, 비밀번호 바이트 경계, 헤더/시트, 빈 파일/1,000행 경계, 업로드 크기/손상 ZIP, 실제 ZIP 크기/압축률, 양식 참조/텍스트 서식, CSV BOM/이스케이프, xlsx 문자열 출력 테스트를 작성했다.
- ZIP 제한 테스트는 정상 통합문서에 추가 엔트리를 넣어 구성한다. 작은 추가 엔트리는 정상 파싱하는 대조 사례도 포함한다.
- 담당 지시에 따라 빌드와 테스트를 실행하지 않았다. 테스트 통과를 주장하지 않는다.
- 통합 전제: 담당이 Apache POI 5.5.1 의존성과 `ImportProblem.invalidFile/tooLarge/rows`, `ImportRowError` 타입을 추가한다. 통합 실행 및 결과 피드백은 담당이 담당한다.

## 첫 통합 테스트 피드백 수정

- 담당 실행 결과: 전체 46개 중 45개 통과, `rejectsActualEntrySizeAndExcessiveCompression`의 작은 추가 엔트리 정상 대조 사례 실패. compileJava/compileTestJava/bootJar 성공은 담당 보고 기준이다.
- 기존 테스트 XML의 실패 위치는 ZIP 사전검사가 아니라 POI 통합문서 열기 이후의 예외 변환 지점이었다. 테스트 ZIP 생성기가 콘텐츠 타입 선언 없이 `entry0` 항목을 추가하여 정상 OPC 패키지 조건을 만족하지 않았다.
- 테스트 생성기만 수정: 추가 항목을 `entryN.bin`으로 만들고 `[Content_Types].xml`에 `bin`의 `application/octet-stream` 기본 콘텐츠 타입을 등록한다. 작은 파일 정상 대조 및 큰 ZIP 제한 검증을 유지한다. 운영 코덱의 보안 제한은 변경하지 않았다.
- 수정 후 테스트와 빌드는 실행하지 않았다. 담당 재실행으로 결과 확인이 필요하다.
