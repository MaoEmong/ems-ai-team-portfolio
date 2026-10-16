package com.portfolio.ems;

import com.fasterxml.jackson.databind.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.mock.web.MockMultipartFile;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.io.*;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Tag("mysql") @Testcontainers
@SpringBootTest(properties={"ems.jwt-secret=test-phase2-secret-at-least-32-bytes","ems.seed.admin-login-id=TESTADMIN","ems.seed.admin-password=test-admin-password"})
@AutoConfigureMockMvc @Import(Phase2MySqlTest.TimeConfig.class)
class Phase2MySqlTest {
 @TestConfiguration static class TimeConfig {
  @Bean @Primary Clock fixedClock() {return Clock.fixed(Instant.parse("2026-10-15T15:30:00Z"),ZoneId.of("Asia/Seoul"));}
 }
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
  r.add("spring.datasource.url",mysql::getJdbcUrl);r.add("spring.datasource.username",mysql::getUsername);r.add("spring.datasource.password",mysql::getPassword);
 }
 @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired JdbcTemplate jdbc;
 @MockitoSpyBean AuditService audit;
 String admin;
 String unique() {return "T"+UUID.randomUUID().toString().replace("-","").substring(0,12);}
 @BeforeEach void loginAdmin() throws Exception {admin=login("TESTADMIN","test-admin-password");}
 ResultActions call(MockHttpServletRequestBuilder r,String token,Object payload) throws Exception {
  if(token!=null)r.header("Authorization","Bearer "+token);
  if(payload!=null)r.contentType("application/json").content(json.writeValueAsString(payload));
  return mvc.perform(r);
 }
 JsonNode response(ResultActions r) throws Exception {return json.readTree(r.andReturn().getResponse().getContentAsString());}
 String login(String id,String password) throws Exception {
  return response(call(post("/api/v1/auth/login"),null,Map.of("loginId",id,"password",password)).andExpect(status().isOk())).get("accessToken").asText();
 }
 JsonNode employee(String no) throws Exception {
  return response(call(post("/api/v1/employees"),admin,Map.of("employeeNo",no,"name","합성사원","email",no+"@example.invalid",
   "phone","000-0000-0000","hireDate","2026-01-01","departmentId",1,"positionId",1,"role","EMPLOYEE","initialPassword","test-employee-password")).andExpect(status().isCreated()));
 }
 Map<String,Object> update(JsonNode e) {
  var m=new HashMap<String,Object>();m.put("name",e.get("name").asText());m.put("email",e.get("email").asText());m.put("phone","000-0000-0000");
  m.put("hireDate","2026-01-01");m.put("status","ACTIVE");m.put("role","EMPLOYEE");return m;
 }
 Map<String,Object> appoint(int department,int position,String date) {
  return Map.of("departmentId",department,"positionId",position,"effectiveDate",date,"reason","합성 발령");
 }
 long count(String table) {return jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Long.class);}
 @Test void appointmentHistoryAndPutPolicyAndDates() throws Exception {
  var e=employee(unique());long id=e.get("id").asLong();
  var u=update(e);
  call(put("/api/v1/employees/"+id),admin,u).andExpect(status().isOk());
  u.put("departmentId",null);u.put("positionId",1);
  call(put("/api/v1/employees/"+id),admin,u).andExpect(status().isOk());
  u.put("departmentId",2);
  call(put("/api/v1/employees/"+id),admin,u).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("APPOINTMENT_REQUIRED"));
  call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(1,1,"2026-10-01")).andExpect(status().isBadRequest());
  call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(2,2,"2026-10-17")).andExpect(status().isBadRequest());
  long a=response(call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(2,2,"2026-10-01"))
   .andExpect(status().isCreated()).andExpect(jsonPath("$.fromDepartment.id").value(1)).andExpect(jsonPath("$.toDepartment.id").value(2))
   .andExpect(jsonPath("$.createdAt").value("2026-10-16T00:30:00+09:00"))).get("id").asLong();
  call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(3,3,"2026-10-01")).andExpect(status().isCreated());
  var list=response(call(get("/api/v1/employees/"+id+"/appointments"),admin,null).andExpect(status().isOk()));
  assertThat(list.get("totalElements").asInt()).isEqualTo(2);
  assertThat(list.at("/content/0/id").asLong()).isGreaterThan(a);
  call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(2,2,"2026-09-30")).andExpect(status().isBadRequest());
  u.remove("departmentId");u.remove("positionId");u.put("hireDate","2026-10-02");
  call(put("/api/v1/employees/"+id),admin,u).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("hireDate"));
  call(post("/api/v1/employees/"+id+"/retire"),admin,Map.of("retireDate","2026-09-30")).andExpect(status().isBadRequest());
  call(post("/api/v1/employees/"+id+"/retire"),admin,Map.of("retireDate","2026-10-16")).andExpect(status().isOk());
  call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(2,2,"2026-10-16")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMPLOYEE_RETIRED"));
 }
 @Test void auditFailureRollsBackAppointmentAndCurrentOrganization() throws Exception {
  var e=employee(unique());long id=e.get("id").asLong();long beforeHistory=count("appointment"),beforeAudit=count("audit_log");
  doAnswer(invocation->{invocation.callRealMethod();throw new IllegalStateException("simulated audit storage failure");})
   .when((AuditService)org.springframework.test.util.AopTestUtils.getUltimateTargetObject(audit)).record(eq("APPOINTMENT_CREATE"),anyString(),anyLong(),anyString(),any(),any(),anyMap());
  assertThatThrownBy(()->call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(2,2,"2026-10-01"))).isInstanceOf(Exception.class);
  assertThat(count("appointment")).isEqualTo(beforeHistory);assertThat(count("audit_log")).isEqualTo(beforeAudit);
  assertThat(jdbc.queryForObject("SELECT department_id FROM employee WHERE id=?",Long.class,id)).isEqualTo(1);
 }
 @Test void historyReferencesBlockCatalogDeletionAndPreserveNames() throws Exception {
  String suffix=unique();
  long d=response(call(post("/api/v1/departments"),admin,Map.of("name",suffix,"description","합성")).andExpect(status().isCreated())).get("id").asLong();
  long p=response(call(post("/api/v1/positions"),admin,Map.of("name",suffix,"level",7)).andExpect(status().isCreated())).get("id").asLong();
  long id=employee(unique()).get("id").asLong();
  call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint((int)d,(int)p,"2026-10-01")).andExpect(status().isCreated());
  call(put("/api/v1/departments/"+d),admin,Map.of("name",suffix+"수정")).andExpect(status().isOk());
  call(put("/api/v1/positions/"+p),admin,Map.of("name",suffix+"수정","level",8)).andExpect(status().isOk());
  call(post("/api/v1/employees/"+id+"/appointments"),admin,appoint(1,1,"2026-10-02")).andExpect(status().isCreated());
  call(get("/api/v1/employees/"+id+"/appointments"),admin,null).andExpect(status().isOk())
   .andExpect(jsonPath("$.content[1].toDepartment.name").value(suffix)).andExpect(jsonPath("$.content[1].toPosition.level").value(7));
  call(delete("/api/v1/departments/"+d),admin,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DEPARTMENT_IN_USE"));
  call(delete("/api/v1/positions/"+p),admin,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("POSITION_IN_USE"));
 }
 @Test @org.springframework.transaction.annotation.Transactional
 void dashboardUsesSeoulDayAndTwelveMonthsWithoutFutureDates() throws Exception {
  // Isolate a deliberately empty month; the transaction rolls this fixture back.
  jdbc.update("UPDATE employee SET hire_date='2020-01-01' WHERE hire_date>='2025-11-01' AND hire_date<'2025-12-01'");
  JsonNode before=response(call(get("/api/v1/dashboard"),admin,null).andExpect(status().isOk()));
  long id=employee(unique()).get("id").asLong();
  jdbc.update("UPDATE employee SET hire_date='2026-10-17' WHERE id=?",id);
  JsonNode after=response(call(get("/api/v1/dashboard"),admin,null).andExpect(status().isOk()));
  assertThat(after.get("asOfDate").asText()).isEqualTo("2026-10-16");
  assertThat(after.get("monthly").size()).isEqualTo(12);
  assertThat(after.at("/monthly/0/month").asText()).isEqualTo("2025-11");
  assertThat(after.at("/monthly/0/hires").asInt()).isZero();
  assertThat(after.at("/monthly/11/month").asText()).isEqualTo("2026-10");
  assertThat(after.at("/thisMonth/hires")).isEqualTo(before.at("/thisMonth/hires"));
  assertThat(after.at("/headcount/employed").asInt()).isEqualTo(before.at("/headcount/employed").asInt()+1);
  jdbc.update("UPDATE employee SET hire_date='2026-10-16',status='RETIRED',retire_date='2026-10-17' WHERE id=?",id);
  after=response(call(get("/api/v1/dashboard"),admin,null).andExpect(status().isOk()));
  assertThat(after.at("/thisMonth/hires").asInt()).isEqualTo(before.at("/thisMonth/hires").asInt()+1);
  assertThat(after.at("/thisMonth/retirements")).isEqualTo(before.at("/thisMonth/retirements"));
 }
 byte[] workbook(String[][] rows) throws Exception {
  try(var w=new XSSFWorkbook();var out=new ByteArrayOutputStream()) {
   var s=w.createSheet("employees");String[] headers={"employeeNo","name","email","phone","hireDate","departmentId","positionId","role","initialPassword"};
   var h=s.createRow(0);for(int i=0;i<headers.length;i++)h.createCell(i).setCellValue(headers[i]);
   for(int n=0;n<rows.length;n++){var r=s.createRow(n+1);for(int i=0;i<rows[n].length;i++)r.createCell(i).setCellValue(rows[n][i]);}
   w.write(out);return out.toByteArray();
  }
 }
 String[] row(String no) {return new String[]{no,"합성업로드",no+"@example.invalid","","2026-01-01","1","1","EMPLOYEE","not-logged-import-password"};}
 ResultActions upload(byte[] bytes,String token) throws Exception {
  return mvc.perform(multipart("/api/v1/employees/import").file(new MockMultipartFile("file","employees.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",bytes))
   .header("Authorization","Bearer "+token));
 }
 @Test void normalImportCreatesRowsAccountsAndSuccessAudits() throws Exception {
  long e=count("employee"),a=count("user_account"),h=count("appointment");
  upload(workbook(new String[][]{row("000"+unique()),row(unique())}),admin).andExpect(status().isCreated()).andExpect(jsonPath("$.importedCount").value(2));
  assertThat(count("employee")).isEqualTo(e+2);assertThat(count("user_account")).isEqualTo(a+2);assertThat(count("appointment")).isEqualTo(h);
  var log=response(call(get("/api/v1/audit-logs").param("action","EMPLOYEE_IMPORT").param("success","true"),admin,null).andExpect(status().isOk()));
  assertThat(log.at("/content/0/metadata/importedCount").asInt()).isEqualTo(2);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action='EMPLOYEE_CREATE' AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.source'))='IMPORT'",Long.class)).isGreaterThanOrEqualTo(2);
 }
 @Test void middleInvalidRowRollsBackEverythingAndLeavesOneFailureAudit() throws Exception {
  long e=count("employee"),a=count("user_account"),h=count("appointment"),logs=count("audit_log");
  String[] bad=row(unique());bad[2]="invalid";
  upload(workbook(new String[][]{row(unique()),bad,row(unique())}),admin).andExpect(status().isBadRequest())
   .andExpect(jsonPath("$.code").value("IMPORT_VALIDATION_ERROR")).andExpect(jsonPath("$.rowErrors[0].row").value(3));
  assertThat(count("employee")).isEqualTo(e);assertThat(count("user_account")).isEqualTo(a);assertThat(count("appointment")).isEqualTo(h);
  assertThat(count("audit_log")).isEqualTo(logs+1);
  assertThat(jdbc.queryForObject("SELECT success FROM audit_log ORDER BY id DESC LIMIT 1",Boolean.class)).isFalse();
 }
 @Test void lateImportConflictRollsBackAlreadyInsertedRowsAndAudits() throws Exception {
  long e=count("employee"),a=count("user_account"),logs=count("audit_log");
  var calls=new java.util.concurrent.atomic.AtomicInteger();
  doAnswer(invocation->{invocation.callRealMethod();if(calls.incrementAndGet()==2)throw new org.springframework.dao.DataIntegrityViolationException("simulated late conflict");return null;})
   .when((AuditService)org.springframework.test.util.AopTestUtils.getUltimateTargetObject(audit)).record(eq("EMPLOYEE_CREATE"),anyString(),anyLong(),anyString(),isNull(),any(),eq(Map.of("source","IMPORT")));
  upload(workbook(new String[][]{row(unique()),row(unique())}),admin).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IMPORT_CONFLICT"));
  assertThat(count("employee")).isEqualTo(e);assertThat(count("user_account")).isEqualTo(a);assertThat(count("audit_log")).isEqualTo(logs+1);
 }
 @Test void importDuplicatesUseActualDatabaseCollation() throws Exception {
  String base=unique();String[] a=row("Café"+base),b=row("CAFE"+base);b[2]=unique()+"@example.invalid";
  upload(workbook(new String[][]{a,b}),admin).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IMPORT_VALIDATION_ERROR"));
  String existing=unique();employee(existing);
  upload(workbook(new String[][]{row(existing.toLowerCase(Locale.ROOT))}),admin).andExpect(status().isBadRequest());
 }
 @Test void formulaAndNumericIdentifiersAreRejectedAndSafeExportUsesFullFilter() throws Exception {
  byte[] data=workbook(new String[][]{row(unique())});
  try(var w=new XSSFWorkbook(new ByteArrayInputStream(data));var out=new ByteArrayOutputStream()) {
   w.getSheet("employees").getRow(1).getCell(0).setCellValue(123);
   w.getSheet("employees").getRow(1).getCell(1).setCellFormula("1+1");w.write(out);data=out.toByteArray();
  }
  upload(data,admin).andExpect(status().isBadRequest()).andExpect(jsonPath("$.rowErrors").isNotEmpty());
  String no=unique();var e=employee(no);var u=update(e);u.put("name","=1+1");call(put("/api/v1/employees/"+e.get("id").asLong()),admin,u).andExpect(status().isOk());
  byte[] csv=call(get("/api/v1/employees/export").param("format","csv").param("keyword",no).param("page","99").param("size","1")
   .header("Origin","http://localhost:5173"),admin,null).andExpect(status().isOk())
   .andExpect(header().string("Content-Disposition","attachment; filename*=UTF-8''ems-employees-20261016.csv"))
   .andExpect(header().string("Access-Control-Expose-Headers","Location, Content-Disposition")).andReturn().getResponse().getContentAsByteArray();
  assertThat(Arrays.copyOf(csv,3)).containsExactly((byte)0xef,(byte)0xbb,(byte)0xbf);
  assertThat(new String(csv,java.nio.charset.StandardCharsets.UTF_8)).contains("'=1+1").doesNotContain("test-employee-password");
  call(get("/api/v1/employees/export"),admin,null).andExpect(status().isBadRequest());
  var template=call(get("/api/v1/employees/import-template"),admin,null).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
  try(var w=new XSSFWorkbook(new ByteArrayInputStream(template))) {assertThat(w.getSheet("departments")).isNotNull();assertThat(w.getSheet("positions")).isNotNull();}
 }
 @Test void employeePermissionsAndAuditSecrecyAndLoginFailureIdentity() throws Exception {
  String no=unique();long id=employee(no).get("id").asLong();String token=login(no,"test-employee-password");
  call(get("/api/v1/employees/"+id+"/appointments"),token,null).andExpect(status().isOk());
  call(get("/api/v1/employees/1/appointments"),token,null).andExpect(status().isForbidden());
  for(String path:List.of("/dashboard","/audit-logs","/employees/export?format=csv","/employees/import-template"))
   call(get("/api/v1"+path),token,null).andExpect(status().isForbidden());
  call(post("/api/v1/employees/"+id+"/appointments"),token,appoint(2,2,"2026-10-01")).andExpect(status().isForbidden());
  upload(workbook(new String[][]{row(unique())}),token).andExpect(status().isForbidden());
  call(post("/api/v1/auth/login"),null,Map.of("loginId",no,"password","SECRET-NEVER-LOG")).andExpect(status().isUnauthorized());
  call(post("/api/v1/auth/login"),null,Map.of("loginId","UNKNOWN-SECRET-LOGIN","password","SECRET-NEVER-LOG")).andExpect(status().isUnauthorized());
  var logs=response(call(get("/api/v1/audit-logs").param("action","LOGIN_FAILURE"),admin,null).andExpect(status().isOk()));
  assertThat(logs.at("/content/0/actor").isNull()).isTrue();assertThat(logs.at("/content/1/actor/id").asLong()).isEqualTo(id);
  String all=jdbc.queryForObject("SELECT CAST(JSON_ARRAYAGG(JSON_OBJECT('before',before_json,'after',after_json,'metadata',metadata_json,'actor',actor_snapshot)) AS CHAR) FROM audit_log",String.class);
  assertThat(all).doesNotContain("SECRET-NEVER-LOG","UNKNOWN-SECRET-LOGIN","not-logged-import-password","test-employee-password","passwordHash","accessToken","$2a$");
  call(get("/api/v1/audit-logs").param("from","2026-10-17T00:00:00+09:00").param("to","2026-10-16T00:00:00+09:00"),admin,null).andExpect(status().isBadRequest());
  call(get("/api/v1/audit-logs").param("from","2026-10-16T00:30:00+09:00").param("to","2026-10-16T00:30:00+09:00"),admin,null)
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
 }
 @Test void catalogAuditActionsAndKeywordMetadataAreComplete() throws Exception {
  String name=unique();
  long d=response(call(post("/api/v1/departments"),admin,Map.of("name",name)).andExpect(status().isCreated())).get("id").asLong();
  call(put("/api/v1/departments/"+d),admin,Map.of("name",name+"2")).andExpect(status().isOk());
  call(delete("/api/v1/departments/"+d),admin,null).andExpect(status().isNoContent());
  long p=response(call(post("/api/v1/positions"),admin,Map.of("name",name,"level",5)).andExpect(status().isCreated())).get("id").asLong();
  call(put("/api/v1/positions/"+p),admin,Map.of("name",name+"2","level",6)).andExpect(status().isOk());
  call(delete("/api/v1/positions/"+p),admin,null).andExpect(status().isNoContent());
  var actions=jdbc.queryForList("SELECT action FROM audit_log WHERE target_id=? AND target_type='DEPARTMENT'",String.class,d);
  assertThat(actions).contains("DEPARTMENT_CREATE","DEPARTMENT_UPDATE","DEPARTMENT_DELETE");
  assertThat(jdbc.queryForList("SELECT action FROM audit_log WHERE target_id=? AND target_type='POSITION'",String.class,p))
   .contains("POSITION_CREATE","POSITION_UPDATE","POSITION_DELETE");
  call(get("/api/v1/employees/export").param("format","xlsx").param("keyword","x".repeat(101)),admin,null).andExpect(status().isOk());
  String keyword=jdbc.queryForObject("SELECT JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.filters.keyword')) FROM audit_log WHERE action='EMPLOYEE_EXPORT' ORDER BY id DESC LIMIT 1",String.class);
  assertThat(keyword).hasSize(100);
 }
 @Test void invalidOversizeAndMissingFileEachLeaveOneFailureAudit() throws Exception {
  long logs=count("audit_log");
  upload(new byte[]{1,2,3},admin).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IMPORT_INVALID_FILE"));
  upload(new byte[5242881],admin).andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.code").value("FILE_TOO_LARGE"));
  mvc.perform(multipart("/api/v1/employees/import").header("Authorization","Bearer "+admin)).andExpect(status().isBadRequest());
  assertThat(count("audit_log")).isEqualTo(logs+3);
 }
}
