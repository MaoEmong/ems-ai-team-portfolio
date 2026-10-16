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
import java.math.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@Tag("mysql") @Testcontainers
@SpringBootTest(properties={"ems.jwt-secret=test-phase3-secret-at-least-32-bytes","ems.seed.admin-login-id=TESTADMIN","ems.seed.admin-password=test-admin-password","ems.seed.demo-admin-password=test-demo-password"})
@AutoConfigureMockMvc @Import(Phase3MySqlTest.TimeConfig.class)
class Phase3MySqlTest {
 static class MutableClock extends Clock{
  volatile Instant instant=Instant.parse("2026-10-16T00:00:00Z");
  public ZoneId getZone(){return ZoneId.of("Asia/Seoul");}
  public Clock withZone(ZoneId zone){return Clock.fixed(instant,zone);}
  public Instant instant(){return instant;}
 }
 @TestConfiguration static class TimeConfig{@Bean @Primary MutableClock phase3Clock(){return new MutableClock();}}
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",mysql::getJdbcUrl);r.add("spring.datasource.username",mysql::getUsername);r.add("spring.datasource.password",mysql::getPassword);}
 @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired JdbcTemplate jdbc;@Autowired MutableClock clock;@Autowired DemoSeeder seeder;
 @MockitoSpyBean NotificationService notifications;
 String admin;
 @BeforeEach void setup()throws Exception{at("2026-10-16T09:00:00+09:00");admin=login("TESTADMIN","test-admin-password");}
 void at(String t){clock.instant=OffsetDateTime.parse(t).toInstant();}
 ResultActions call(MockHttpServletRequestBuilder r,String token,Object body)throws Exception{if(token!=null)r.header("Authorization","Bearer "+token);if(body!=null)r.contentType("application/json").content(json.writeValueAsString(body));return mvc.perform(r);}
 JsonNode result(ResultActions r)throws Exception{return json.readTree(r.andReturn().getResponse().getContentAsString());}
 String login(String no,String pass)throws Exception{return result(call(post("/api/v1/auth/login"),null,Map.of("loginId",no,"password",pass)).andExpect(status().isOk())).get("accessToken").asText();}
 record Person(long id,String token,String no){}
 Person employee(String hire)throws Exception{
  String no="P3"+UUID.randomUUID().toString().replace("-","").substring(0,12);
  long id=result(call(post("/api/v1/employees"),admin,Map.of("employeeNo",no,"name","합성3A","email",no+"@example.invalid","hireDate",hire,"departmentId",1,"positionId",1,"role","EMPLOYEE","initialPassword","test-employee-password")).andExpect(status().isCreated())).get("id").asLong();
  return new Person(id,login(no,"test-employee-password"),no);
 }
 Map<String,Object> request(String type,String start,String end){return Map.of("type",type,"startDate",start,"endDate",end,"reason","비공개 합성 사유");}
 JsonNode leave(Person p,String type,String start,String end)throws Exception{return result(call(post("/api/v1/leaves"),p.token,request(type,start,end)).andExpect(status().isCreated()));}
 JsonNode balance(Person p)throws Exception{return result(call(get("/api/v1/leaves/me/balance"),p.token,null).andExpect(status().isOk()));}
 void approve(long id)throws Exception{call(post("/api/v1/leaves/"+id+"/approve"),admin,null).andExpect(status().isOk());}
 long count(String table){return jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Long.class);}
 @Test void exactAttendanceBoundariesAndDuplicates()throws Exception{
  var p=employee("2025-01-01");
  call(post("/api/v1/attendance/me/check-out"),p.token,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_CHECKED_IN"));
  call(post("/api/v1/attendance/me/check-in"),p.token,null).andExpect(status().isOk()).andExpect(jsonPath("$.late").value(false));
  call(post("/api/v1/attendance/me/check-in"),p.token,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_CHECKED_IN"));
  at("2026-10-16T18:00:00+09:00");
  call(post("/api/v1/attendance/me/check-out"),p.token,null).andExpect(status().isOk()).andExpect(jsonPath("$.earlyLeave").value(false)).andExpect(jsonPath("$.status").value("COMPLETE"));
  call(post("/api/v1/attendance/me/check-out"),p.token,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_CHECKED_OUT"));
  var other=employee("2025-01-01");at("2026-10-16T09:00:01+09:00");
  call(post("/api/v1/attendance/me/check-in"),other.token,null).andExpect(jsonPath("$.late").value(true));
  at("2026-10-16T17:59:59+09:00");
  call(post("/api/v1/attendance/me/check-out"),other.token,null).andExpect(jsonPath("$.earlyLeave").value(true));
 }
 @Test void weekendInactiveAndFutureHireAreRejected()throws Exception{
  var p=employee("2025-01-01");at("2026-10-17T09:00:00+09:00");
  call(post("/api/v1/attendance/me/check-in"),p.token,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("NOT_A_WORKDAY"));
  at("2026-10-16T09:00:00+09:00");jdbc.update("UPDATE employee SET status='ON_LEAVE' WHERE id=?",p.id);
  call(post("/api/v1/attendance/me/check-in"),p.token,null).andExpect(jsonPath("$.code").value("EMPLOYEE_NOT_ACTIVE"));
  var future=employee("2027-01-01");
  call(post("/api/v1/leaves"),future.token,request("SICK","2026-10-19","2026-10-19")).andExpect(jsonPath("$.code").value("EMPLOYEE_NOT_ACTIVE"));
 }
 @Test void halfDaysAndTwoApprovedHalvesUseLiveLeaveState()throws Exception{
  var p=employee("2025-01-01");var am=leave(p,"HALF_AM","2026-10-16","2026-10-16");approve(am.get("id").asLong());
  at("2026-10-16T14:00:00+09:00");
  call(post("/api/v1/attendance/me/check-in"),p.token,null).andExpect(jsonPath("$.expectedStart").value("14:00:00")).andExpect(jsonPath("$.late").value(false));
  var pm=leave(p,"HALF_PM","2026-10-16","2026-10-16");approve(pm.get("id").asLong());
  call(get("/api/v1/attendance/me/today"),p.token,null).andExpect(jsonPath("$.status").value("LEAVE")).andExpect(jsonPath("$.leaves.length()").value(2)).andExpect(jsonPath("$.expectedEnd").value("14:00:00"));
  var q=employee("2025-01-01");approve(leave(q,"HALF_PM","2026-10-16","2026-10-16").get("id").asLong());
  call(post("/api/v1/attendance/me/check-in"),q.token,null).andExpect(status().isOk());
  call(post("/api/v1/attendance/me/check-out"),q.token,null).andExpect(jsonPath("$.earlyLeave").value(false));
 }
 @Test void fullLeavePreventsCheckInAndCorrectionIsAuditedAndNotified()throws Exception{
  var p=employee("2025-01-01");approve(leave(p,"ANNUAL","2026-10-16","2026-10-16").get("id").asLong());
  call(post("/api/v1/attendance/me/check-in"),p.token,null).andExpect(jsonPath("$.code").value("ON_LEAVE_DAY"));
  at("2026-10-16T18:00:00+09:00");
  call(put("/api/v1/attendance/"+p.id+"/2026-10-16"),admin,Map.of("checkIn","2026-10-16T09:01:00+09:00","checkOut","2026-10-16T17:00:00+09:00","reason","비공개 정정 사유"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.corrected").value(true)).andExpect(jsonPath("$.late").value(false)).andExpect(jsonPath("$.earlyLeave").value(false));
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action='ATTENDANCE_CORRECT' AND target_id=?",Long.class,p.id)).isEqualTo(1);
  String message=jdbc.queryForObject("SELECT message FROM notification WHERE recipient_id=? AND type='ATTENDANCE_CORRECTED'",String.class,p.id);
  assertThat(message).doesNotContain("비공개");
  call(get("/api/v1/attendance/me").param("month","2026-10"),p.token,null).andExpect(jsonPath("$.days.length()").value(22));
 }
 @Test void reserveApproveCancelAndRejectRestoreBalance()throws Exception{
  var p=employee("2025-01-01");assertThat(balance(p).get("granted").decimalValue()).isEqualByComparingTo("15");
  long id=leave(p,"HALF_AM","2026-10-19","2026-10-19").get("id").asLong();
  assertThat(balance(p).get("reserved").decimalValue()).isEqualByComparingTo("0.5");approve(id);
  assertThat(balance(p).get("used").decimalValue()).isEqualByComparingTo("0.5");
  call(post("/api/v1/leaves/"+id+"/cancel"),p.token,null).andExpect(jsonPath("$.cancelledBy").value("SELF"));
  assertThat(balance(p).get("available").decimalValue()).isEqualByComparingTo("15");
  long second=leave(p,"ANNUAL","2026-10-20","2026-10-20").get("id").asLong();
  call(post("/api/v1/leaves/"+second+"/reject"),admin,Map.of("reason","합성 반려")).andExpect(jsonPath("$.status").value("REJECTED"));
  assertThat(balance(p).get("reserved").decimalValue()).isZero();
 }
 @Test void overlapBalancePeriodAndHalfValidation()throws Exception{
  var p=employee("2026-10-01");
  call(post("/api/v1/leaves"),p.token,request("ANNUAL","2026-10-19","2026-10-19")).andExpect(jsonPath("$.code").value("INSUFFICIENT_LEAVE_BALANCE"));
  leave(p,"SICK","2026-10-19","2026-10-19");
  call(post("/api/v1/leaves"),p.token,request("SICK","2026-10-19","2026-10-19")).andExpect(jsonPath("$.code").value("LEAVE_OVERLAP"));
  call(post("/api/v1/leaves"),p.token,request("SICK","2027-09-30","2027-10-01")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("LEAVE_PERIOD_BOUNDARY"));
  call(post("/api/v1/leaves"),p.token,request("HALF_AM","2026-10-20","2026-10-21")).andExpect(status().isBadRequest());
  call(post("/api/v1/leaves"),p.token,request("SICK","2026-10-17","2026-10-18")).andExpect(status().isBadRequest());
 }
 @Test void selfDecisionsForbiddenAndPastPendingCanCancelOrReject()throws Exception{
  String demo=login("DEMO001","test-demo-password");
  long own=result(call(post("/api/v1/leaves"),admin,request("SICK","2026-10-19","2026-10-19")).andExpect(status().isCreated())).get("id").asLong();
  call(post("/api/v1/leaves/"+own+"/approve"),admin,null).andExpect(status().isForbidden());
  call(post("/api/v1/leaves/"+own+"/reject"),admin,Map.of("reason","사유")).andExpect(status().isForbidden());
  call(post("/api/v1/leaves/"+own+"/approve"),demo,null).andExpect(status().isOk());
  call(post("/api/v1/leaves/"+own+"/approve"),demo,null).andExpect(jsonPath("$.code").value("LEAVE_ALREADY_PROCESSED"));
  var p=employee("2025-01-01");long id=leave(p,"SICK","2026-10-16","2026-10-16").get("id").asLong();
  var q=employee("2025-01-01");long rejection=leave(q,"SICK","2026-10-16","2026-10-16").get("id").asLong();
  at("2026-10-19T09:00:00+09:00");
  call(post("/api/v1/leaves/"+own+"/cancel"),admin,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LEAVE_START_PASSED"));
  call(post("/api/v1/leaves/"+id+"/approve"),admin,null).andExpect(jsonPath("$.code").value("LEAVE_START_PASSED"));
  call(get("/api/v1/leaves/"+id),p.token,null).andExpect(jsonPath("$.allowedActions[0]").value("CANCEL"));
  call(post("/api/v1/leaves/"+id+"/cancel"),p.token,null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
  call(post("/api/v1/leaves/"+rejection+"/reject"),admin,Map.of("reason","기간 경과")).andExpect(status().isOk());
 }
 @Test void notificationOwnershipReadAllAndPrivacy()throws Exception{
  var p=employee("2025-01-01");var q=employee("2025-01-01");
  long id=leave(p,"SICK","2026-10-19","2026-10-19").get("id").asLong();
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE type='LEAVE_REQUESTED' AND target_id=?",Long.class,id)).isEqualTo(2);
  approve(id);
  long first=jdbc.queryForObject("SELECT id FROM notification WHERE recipient_id=? AND type='LEAVE_APPROVED'",Long.class,p.id);
  long secondLeave=leave(p,"SICK","2026-10-20","2026-10-20").get("id").asLong();approve(secondLeave);
  call(post("/api/v1/notifications/"+first+"/read"),q.token,null).andExpect(status().isNotFound());
  call(post("/api/v1/notifications/me/read-all"),p.token,Map.of("upToId",first)).andExpect(jsonPath("$.updatedCount").value(1));
  call(get("/api/v1/notifications/me/unread-count"),p.token,null).andExpect(jsonPath("$.count").value(1));
  call(post("/api/v1/notifications/"+first+"/read"),p.token,null).andExpect(status().isNoContent());
  call(post("/api/v1/notifications/"+first+"/read"),p.token,null).andExpect(status().isNoContent());
  String body=call(get("/api/v1/notifications/me"),p.token,null).andReturn().getResponse().getContentAsString();assertThat(body).doesNotContain("비공개");
  call(get("/api/v1/leaves/"+id),q.token,null).andExpect(status().isForbidden());
  call(get("/api/v1/leaves"),p.token,null).andExpect(status().isForbidden());
 }
 @Test void retirementCancelsFutureAndHireDateIsProtected()throws Exception{
  var p=employee("2025-01-01");long a=leave(p,"ANNUAL","2026-10-19","2026-10-19").get("id").asLong();approve(a);
  long b=leave(p,"SICK","2026-10-20","2026-10-20").get("id").asLong();
  call(put("/api/v1/employees/"+p.id),admin,Map.of("name","합성","email",p.no+"@example.invalid","hireDate","2025-02-01","status","ACTIVE","role","EMPLOYEE")).andExpect(jsonPath("$.code").value("LEAVE_RECORDS_EXIST"));
  call(post("/api/v1/employees/"+p.id+"/retire"),admin,Map.of("retireDate","2026-10-16")).andExpect(status().isOk());
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM leave_request WHERE employee_id=? AND cancelled_by='SYSTEM'",Long.class,p.id)).isEqualTo(2);
  assertThat(jdbc.queryForObject("SELECT used+reserved FROM leave_balance WHERE employee_id=?",BigDecimal.class,p.id)).isZero();
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action='LEAVE_CANCEL' AND target_id IN (?,?) AND JSON_EXTRACT(metadata_json,'$.system')=true",Long.class,a,b)).isEqualTo(2);
 }
 @Test void notificationFailureRollsBackLeaveBalanceAuditAndNotification()throws Exception{
  var p=employee("2025-01-01");long requests=count("leave_request"),audits=count("audit_log"),messages=count("notification");
  NotificationService target=org.springframework.test.util.AopTestUtils.getUltimateTargetObject(notifications);
  doAnswer(i->{i.callRealMethod();throw new IllegalStateException("injected notification failure");}).when(target).send(anyLong(),eq("LEAVE_REQUESTED"),anyLong(),isNull());
  try{assertThatThrownBy(()->call(post("/api/v1/leaves"),p.token,request("ANNUAL","2026-10-19","2026-10-19"))).hasRootCauseInstanceOf(IllegalStateException.class);}
  finally{reset(target);}
  assertThat(count("leave_request")).isEqualTo(requests);assertThat(count("audit_log")).isEqualTo(audits);assertThat(count("notification")).isEqualTo(messages);
  assertThat(balance(p).get("reserved").decimalValue()).isZero();
 }
 @Test void concurrentDifferentRequestsCannotExceedOneAccruedDay()throws Exception{
  var p=employee("2026-09-16");ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
  try{
   var futures=new ArrayList<Future<Integer>>();
   for(String day:List.of("2026-10-19","2026-10-20"))futures.add(pool.submit(()->{start.await();return call(post("/api/v1/leaves"),p.token,request("ANNUAL",day,day)).andReturn().getResponse().getStatus();}));
   start.countDown();var statuses=new ArrayList<Integer>();for(var f:futures)statuses.add(f.get(30,TimeUnit.SECONDS));
   assertThat(statuses).containsExactlyInAnyOrder(201,409);assertThat(balance(p).get("reserved").decimalValue()).isEqualByComparingTo("1");
   long id=jdbc.queryForObject("SELECT id FROM leave_request WHERE employee_id=?",Long.class,p.id);
   CountDownLatch go=new CountDownLatch(1);Callable<Integer> approve=()->{go.await();return call(post("/api/v1/leaves/"+id+"/approve"),admin,null).andReturn().getResponse().getStatus();};
   var first=pool.submit(approve);var second=pool.submit(approve);go.countDown();
   assertThat(List.of(first.get(30,TimeUnit.SECONDS),second.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
   assertThat(balance(p).get("used").decimalValue()).isEqualByComparingTo("1");assertThat(balance(p).get("available").decimalValue()).isZero();
   assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action=\'LEAVE_APPROVE\' AND target_id=?",Long.class,id)).isEqualTo(1);
   assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE type=\'LEAVE_APPROVED\' AND target_id=?",Long.class,id)).isEqualTo(1);
  }finally{pool.shutdownNow();}
 }
 @Test void seedDistributionAndRerunPreserveExistingData()throws Exception{
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM employee WHERE employee_no LIKE 'DEMO%'",Long.class)).isEqualTo(30);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM employee WHERE employee_no LIKE 'DEMO%' AND status='RETIRED'",Long.class)).isEqualTo(5);
  assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT DATE_FORMAT(hire_date,'%Y-%m')) FROM employee WHERE employee_no LIKE 'DEMO%' AND hire_date>='2025-11-01'",Long.class)).isEqualTo(12);
  assertThat(jdbc.queryForObject("SELECT role FROM user_account a JOIN employee e ON e.id=a.employee_id WHERE e.employee_no='DEMO001'",String.class)).isEqualTo("ADMIN");
  var p=employee("2020-01-01");long before=count("employee");seeder.run(null);assertThat(count("employee")).isEqualTo(before);
  assertThat(jdbc.queryForObject("SELECT hire_date FROM employee WHERE id=?",LocalDate.class,p.id)).isEqualTo(LocalDate.of(2020,1,1));
 }

 @Test void correctionValidatesTimesAndProtectsHireDate()throws Exception{
  var p=employee("2025-01-01");at("2026-10-16T18:00:00+09:00");
  call(put("/api/v1/attendance/"+p.id+"/2026-10-17"),admin,Map.of("checkIn","2026-10-17T09:00:00+09:00","reason","사유")).andExpect(jsonPath("$.code").value("NOT_A_WORKDAY"));
  call(put("/api/v1/attendance/"+p.id+"/2026-10-16"),admin,Map.of("checkIn","2026-10-16T19:00:00+09:00","reason","사유")).andExpect(status().isBadRequest());
  call(put("/api/v1/attendance/"+p.id+"/2026-10-16"),admin,Map.of("checkIn","2026-10-16T09:00:00+09:00","checkOut","2026-10-16T08:00:00+09:00","reason","사유")).andExpect(status().isBadRequest());
  call(put("/api/v1/attendance/"+p.id+"/2026-10-15"),admin,Map.of("checkIn","2026-10-15T09:00:00+09:00","reason","사유")).andExpect(status().isOk());
  call(put("/api/v1/employees/"+p.id),admin,Map.of("name","합성","email",p.no+"@example.invalid","hireDate","2026-10-16","status","ACTIVE","role","EMPLOYEE")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("hireDate"));
 }
 @Test void approvalFailureRestoresPendingReservationAndAudit()throws Exception{
  var p=employee("2025-01-01");long id=leave(p,"HALF_AM","2026-10-19","2026-10-19").get("id").asLong();
  long audits=count("audit_log"),messages=count("notification");
  NotificationService target=org.springframework.test.util.AopTestUtils.getUltimateTargetObject(notifications);
  doAnswer(i->{i.callRealMethod();throw new IllegalStateException("injected approval notification failure");}).when(target).send(eq(p.id),eq("LEAVE_APPROVED"),eq(id),isNull());
  try{assertThatThrownBy(()->approve(id)).hasRootCauseInstanceOf(IllegalStateException.class);}finally{reset(target);}
  assertThat(jdbc.queryForObject("SELECT status FROM leave_request WHERE id=?",String.class,id)).isEqualTo("PENDING");
  var b=balance(p);assertThat(b.get("used").decimalValue()).isZero();assertThat(b.get("reserved").decimalValue()).isEqualByComparingTo("0.5");
  assertThat(count("audit_log")).isEqualTo(audits);assertThat(count("notification")).isEqualTo(messages);
 }
}