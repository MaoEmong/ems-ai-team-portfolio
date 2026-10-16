package com.portfolio.ems;
import com.fasterxml.jackson.databind.*;
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
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.time.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@Tag("mysql") @Testcontainers
@SpringBootTest(properties={"ems.jwt-secret=test-phase3b-secret-at-least-32-bytes","ems.seed.admin-login-id=TESTADMIN","ems.seed.admin-password=test-admin-password"})
@AutoConfigureMockMvc @Import(OrganizationPayrollMySqlTest.TimeConfig.class)
class OrganizationPayrollMySqlTest{
 @TestConfiguration static class TimeConfig{@Bean @Primary Clock orgPayrollClock(){return Clock.fixed(Instant.parse("2026-10-16T09:00:00Z"),ZoneId.of("Asia/Seoul"));}}
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",mysql::getJdbcUrl);r.add("spring.datasource.username",mysql::getUsername);r.add("spring.datasource.password",mysql::getPassword);}
 @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired JdbcTemplate jdbc;@MockitoSpyBean AuditService audit;
 String admin;String unique(){return "B"+UUID.randomUUID().toString().replace("-","").substring(0,12);}
 @BeforeEach void setup()throws Exception{
  admin=login("TESTADMIN","test-admin-password");
  jdbc.update("DELETE FROM payslip");jdbc.update("DELETE FROM payroll_month");
  jdbc.update("INSERT INTO salary_setting(employee_id,base_salary,allowance,formula_version,rate1,rate2,rate3) SELECT id,100,1,'DEMO_V1',450,350,300 FROM employee ON DUPLICATE KEY UPDATE base_salary=100,allowance=1");
 }
 ResultActions call(MockHttpServletRequestBuilder r,String token,Object body)throws Exception{if(token!=null)r.header("Authorization","Bearer "+token);if(body!=null)r.contentType("application/json").content(json.writeValueAsString(body));return mvc.perform(r);}
 JsonNode result(ResultActions r)throws Exception{return json.readTree(r.andReturn().getResponse().getContentAsString());}
 String login(String no,String pass)throws Exception{return result(call(post("/api/v1/auth/login"),null,Map.of("loginId",no,"password",pass)).andExpect(status().isOk())).get("accessToken").asText();}
 record Person(long id,String no,String token){}
 Person employee()throws Exception{String no=unique();long id=result(call(post("/api/v1/employees"),admin,Map.of("employeeNo",no,"name","합성3B","email",no+"@example.invalid","hireDate","2025-01-01","departmentId",1,"positionId",1,"role","EMPLOYEE","initialPassword","test-employee-password")).andExpect(status().isCreated())).get("id").asLong();return new Person(id,no,login(no,"test-employee-password"));}
 long department()throws Exception{return result(call(post("/api/v1/departments"),admin,Map.of("name",unique())).andExpect(status().isCreated())).get("id").asLong();}
 @Test void concurrentDepartmentMovesCannotCreateCycle()throws Exception{
  long a=department(),b=department();ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch go=new CountDownLatch(1);
  try{
   var x=pool.submit(()->{go.await();return call(put("/api/v1/departments/"+a),admin,Map.of("name","A"+a,"parentId",b)).andReturn().getResponse().getStatus();});
   var y=pool.submit(()->{go.await();return call(put("/api/v1/departments/"+b),admin,Map.of("name","B"+b,"parentId",a)).andReturn().getResponse().getStatus();});go.countDown();
   assertThat(List.of(x.get(30,TimeUnit.SECONDS),y.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
   long parent=jdbc.queryForObject("SELECT parent_id FROM department WHERE id IN (?,?) AND parent_id IS NOT NULL LIMIT 1",Long.class,a,b);
   call(delete("/api/v1/departments/"+parent),admin,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DEPARTMENT_HAS_CHILDREN"));
  }finally{pool.shutdownNow();}
 }
 @Test void organizationIsMinimalAndTitlesUseAppointmentOnly()throws Exception{
  var e=employee();String label=unique();long title=result(call(post("/api/v1/job-titles"),admin,Map.of("name",label)).andExpect(status().isCreated())).get("id").asLong();
  long app=result(call(post("/api/v1/employees/"+e.id+"/appointments"),admin,Map.of("departmentId",1,"positionId",1,"effectiveDate","2026-10-16","reason","합성직책","changeJobTitle",true,"jobTitleId",title)).andExpect(status().isCreated())).get("id").asLong();
  assertThat(jdbc.queryForObject("SELECT to_job_title_name FROM appointment WHERE id=?",String.class,app)).isEqualTo(label);
  var update=new HashMap<String,Object>(Map.of("name","합성3B","email",e.no+"@example.invalid","hireDate","2025-01-01","status","ACTIVE","role","EMPLOYEE"));
  update.put("jobTitleId",title);call(put("/api/v1/employees/"+e.id),admin,update).andExpect(status().isOk());
  update.put("jobTitleId",null);call(put("/api/v1/employees/"+e.id),admin,update).andExpect(status().isOk()).andExpect(jsonPath("$.jobTitle.id").value(title));
  update.put("jobTitleId",title+1000);call(put("/api/v1/employees/"+e.id),admin,update).andExpect(jsonPath("$.code").value("APPOINTMENT_REQUIRED"));
  call(delete("/api/v1/job-titles/"+title),admin,null).andExpect(jsonPath("$.code").value("JOB_TITLE_IN_USE"));
  String body=call(get("/api/v1/organization"),e.token,null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();assertThat(body).doesNotContain("email","phone","salary","password");
  call(post("/api/v1/employees/"+e.id+"/retire"),admin,Map.of("retireDate","2026-10-16")).andExpect(status().isOk()).andExpect(jsonPath("$.jobTitle").doesNotExist());
  assertThat(jdbc.queryForObject("SELECT to_job_title_id FROM appointment WHERE id=?",Long.class,app)).isEqualTo(title);
 }
 @Test void oldAppointmentPayloadKeepsTitleAndAuditFailureRollsBackRetirement()throws Exception{
  var e=employee();long title=result(call(post("/api/v1/job-titles"),admin,Map.of("name",unique())).andExpect(status().isCreated())).get("id").asLong();
  call(post("/api/v1/employees/"+e.id+"/appointments"),admin,Map.of("departmentId",1,"positionId",1,"effectiveDate","2026-10-01","reason","합성","changeJobTitle",true,"jobTitleId",title)).andExpect(status().isCreated());
  call(post("/api/v1/employees/"+e.id+"/appointments"),admin,Map.of("departmentId",2,"positionId",1,"effectiveDate","2026-10-02","reason","구계약")).andExpect(status().isCreated()).andExpect(jsonPath("$.toJobTitle.id").value(title));
  AuditService target=org.springframework.test.util.AopTestUtils.getUltimateTargetObject(audit);
  doAnswer(i->{i.callRealMethod();throw new IllegalStateException("injected retirement audit failure");}).when(target).record(eq("EMPLOYEE_RETIRE"),anyString(),anyLong(),anyString(),any(),any(),anyMap());
  try{assertThatThrownBy(()->call(post("/api/v1/employees/"+e.id+"/retire"),admin,Map.of("retireDate","2026-10-16"))).hasRootCauseInstanceOf(IllegalStateException.class);}finally{reset(target);}
  assertThat(jdbc.queryForObject("SELECT job_title_id FROM employee WHERE id=?",Long.class,e.id)).isEqualTo(title);
  assertThat(jdbc.queryForObject("SELECT enabled FROM user_account WHERE employee_id=?",Boolean.class,e.id)).isTrue();
 }
 @Test void payrollRoundSnapshotsAndOwnership()throws Exception{
  var e=employee();call(put("/api/v1/employees/"+e.id+"/salary-setting"),admin,Map.of("baseSalary",100,"allowance",1)).andExpect(status().isOk());
  call(post("/api/v1/payrolls"),admin,Map.of("month","2026-09")).andExpect(status().isCreated());
  long id=jdbc.queryForObject("SELECT s.id FROM payslip s JOIN payroll_month p ON p.id=s.payroll_id WHERE p.pay_month='2026-09' AND employee_id=?",Long.class,e.id);
  call(get("/api/v1/payslips/"+id),e.token,null).andExpect(status().isNotFound());
  call(post("/api/v1/payrolls/2026-09/confirm"),admin,null).andExpect(status().isOk());
  var before=result(call(get("/api/v1/payslips/"+id),e.token,null).andExpect(status().isOk()));assertThat(before.get("netPay").asLong()).isEqualTo(89);
  call(put("/api/v1/employees/"+e.id+"/salary-setting"),admin,Map.of("baseSalary",999,"allowance",0)).andExpect(status().isOk());
  call(post("/api/v1/employees/"+e.id+"/appointments"),admin,Map.of("departmentId",2,"positionId",2,"effectiveDate","2026-10-16","reason","합성 변경")).andExpect(status().isCreated());
  assertThat(result(call(get("/api/v1/payslips/"+id),e.token,null))).isEqualTo(before);
  var other=employee();call(get("/api/v1/payslips/"+id),other.token,null).andExpect(status().isNotFound());
  call(post("/api/v1/payrolls/2026-09/recalculate"),admin,null).andExpect(jsonPath("$.code").value("PAYROLL_CONFIRMED"));
  call(post("/api/v1/payrolls"),admin,Map.of("month","2026-09")).andExpect(jsonPath("$.code").value("PAYROLL_ALREADY_EXISTS"));
  String audits=jdbc.queryForObject("SELECT GROUP_CONCAT(COALESCE(before_json,''),COALESCE(after_json,''),metadata_json) FROM audit_log WHERE action LIKE 'PAYROLL_%' OR action='SALARY_SETTING_UPDATE'",String.class);
  assertThat(audits).doesNotContain("baseSalary","netPay","allowance","grossPay");
 }
 @Test void missingSettingAndInjectedFailureLeaveNoPayroll()throws Exception{
  var e=employee();
  call(post("/api/v1/payrolls"),admin,Map.of("month","2026-09")).andExpect(jsonPath("$.code").value("SALARY_SETTING_MISSING"));
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payroll_month",Long.class)).isZero();
  call(put("/api/v1/employees/"+e.id+"/salary-setting"),admin,Map.of("baseSalary",100,"allowance",0));
  AuditService target=org.springframework.test.util.AopTestUtils.getUltimateTargetObject(audit);
  doAnswer(i->{i.callRealMethod();throw new IllegalStateException("injected payroll audit failure");}).when(target).record(eq("PAYROLL_GENERATE"),anyString(),anyLong(),anyString(),any(),any(),anyMap());
  try{assertThatThrownBy(()->call(post("/api/v1/payrolls"),admin,Map.of("month","2026-09"))).hasRootCauseInstanceOf(IllegalStateException.class);}finally{reset(target);}
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payroll_month",Long.class)).isZero();assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payslip",Long.class)).isZero();
 }
 @Test void namedLockContentionIsImmediate409AndConcurrentConfirmIsSingle()throws Exception{
  call(post("/api/v1/payrolls"),admin,Map.of("month","2026-09")).andExpect(status().isCreated());
  try(var c=DriverManager.getConnection(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword());var s=c.createStatement()){
   String db=jdbc.queryForObject("SELECT DATABASE()",String.class);s.executeQuery("SELECT GET_LOCK('"+db+":ems-payroll:2026-09',0)").close();
   call(post("/api/v1/payrolls/2026-09/confirm"),admin,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYROLL_BUSY"));
   s.executeQuery("SELECT RELEASE_LOCK('"+db+":ems-payroll:2026-09')").close();
  }
  ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch go=new CountDownLatch(1);
  try{Callable<Integer> action=()->{go.await();return call(post("/api/v1/payrolls/2026-09/confirm"),admin,null).andReturn().getResponse().getStatus();};
   var a=pool.submit(action);var b=pool.submit(action);go.countDown();assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
  }finally{pool.shutdownNow();}
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action='PAYROLL_CONFIRM' AND target_id=(SELECT id FROM payroll_month WHERE pay_month='2026-09')",Long.class)).isEqualTo(1);
 }
 @Test void monthBoundaryAndRecalculationUseCurrentTargetSet()throws Exception{
  call(post("/api/v1/payrolls"),admin,Map.of("month","2026-11")).andExpect(status().isBadRequest());
  call(post("/api/v1/payrolls"),admin,Map.of("month","1900-01")).andExpect(status().isBadRequest());
  call(post("/api/v1/payrolls"),admin,Map.of("month","2026-09")).andExpect(status().isCreated());
  var e=employee();call(put("/api/v1/employees/"+e.id+"/salary-setting"),admin,Map.of("baseSalary",200,"allowance",0));
  call(post("/api/v1/payrolls/2026-09/recalculate"),admin,null).andExpect(status().isOk());
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payslip WHERE employee_id=?",Long.class,e.id)).isEqualTo(1);
 }
}
