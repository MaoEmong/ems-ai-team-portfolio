package com.portfolio.ems;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Tag("mysql") @Testcontainers
@SpringBootTest(properties={"ems.jwt-secret=evaluation-mysql-test-secret-at-least-32-bytes","ems.seed.enabled=false"})
@AutoConfigureMockMvc
class EvaluationMySqlTest {
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
  r.add("spring.datasource.url",mysql::getJdbcUrl);r.add("spring.datasource.username",mysql::getUsername);r.add("spring.datasource.password",mysql::getPassword);
 }
 @Autowired EvaluationService service;
 @Autowired EvaluationDemoSeeder seeder;
 @Autowired JdbcTemplate jdbc;
 @Autowired ObjectMapper json;
 @Autowired MockMvc mvc;
 @Autowired PlatformTransactionManager transactions;
 @MockitoSpyBean AuditService audit;
 static final Dto.User ADMIN=new Dto.User(1001L,"EVAL_ADMIN","합성 관리자",Role.ADMIN);
 static final Dto.User NEXT=new Dto.User(1002L,"EVAL_NEXT","합성 새 평가자",Role.ADMIN);
 static final Dto.User OTHER=new Dto.User(1003L,"EVAL_OTHER","합성 다른 관리자",Role.ADMIN);
 static final Dto.User SELF=new Dto.User(1004L,"EVAL_SELF","합성 대상자",Role.EMPLOYEE);

 @BeforeEach void fixtures() {
  reset(auditSpy());SecurityContextHolder.clearContext();
  jdbc.update("DELETE FROM evaluation_form");jdbc.update("DELETE FROM evaluation_assignment");jdbc.update("DELETE FROM evaluation_item");jdbc.update("DELETE FROM evaluation_cycle");jdbc.update("DELETE FROM audit_log");
  jdbc.update("DELETE FROM user_account");jdbc.update("DELETE FROM employee");
  long department=jdbc.queryForObject("SELECT MIN(id) FROM department",Long.class);
  long position=jdbc.queryForObject("SELECT MIN(id) FROM job_position",Long.class);
  for(int i=1;i<=7;i++) {
   long id=1000L+i;String number="EVAL_"+i;
   jdbc.update("INSERT INTO employee(id,employee_no,name,email,hire_date,status,department_id,position_id) VALUES(?,?,?,?,?,'ACTIVE',?,?)",id,number,"합성 사원 "+i,number+"@example.invalid",LocalDate.of(2020,1,1),department,position);
   jdbc.update("INSERT INTO user_account(employee_id,password_hash,role,enabled) VALUES(?,?,?,true)",id,"synthetic-unused-password-hash",i<=3?"ADMIN":"EMPLOYEE");
  }
 }
 @AfterEach void clearIdentity() { SecurityContextHolder.clearContext(); }

 @Test void fullWorkflowHidesManagerDraftAndPublishesOnlyAtFinalization() throws Exception {
  long cycle=create(2);open(cycle);long id=form(cycle);
  assertThat(as(SELF,()->service.get(id,SELF))).doesNotContainKeys("managerAnswers","finalScore","grade");
  assertThat(as(SELF,()->service.get(id,SELF)).get("allowedActions")).isEqualTo(List.of("SAVE_SELF","SUBMIT_SELF"));
  assertThat((List<?>)as(ADMIN,()->service.get(id,ADMIN)).get("allowedActions")).isEmpty();
  var self=answers(cycle,1,1);
  as(SELF,()->service.write(id,false,true,self,SELF));
  assertThat(as(ADMIN,()->service.get(id,ADMIN)).get("allowedActions")).isEqualTo(List.of("SAVE_MANAGER","SUBMIT_MANAGER"));
  as(ADMIN,()->service.write(id,true,false,answers(cycle,5,4),ADMIN));
  assertThat(as(SELF,()->service.get(id,SELF))).doesNotContainKeys("managerAnswers","finalScore","grade");
  mvc.perform(get("/api/v1/evaluations/"+id).with(authentication(auth(SELF)))).andExpect(status().isOk())
   .andExpect(jsonPath("$.managerAnswers").doesNotExist()).andExpect(jsonPath("$.finalScore").doesNotExist()).andExpect(jsonPath("$.grade").doesNotExist());
  var finalized=as(ADMIN,()->service.write(id,true,true,answers(cycle,5,4),ADMIN));
  assertThat((BigDecimal)finalized.get("finalScore")).isEqualByComparingTo("4.50");assertThat(finalized.get("grade")).isEqualTo("S");
  assertThat(as(SELF,()->service.get(id,SELF))).containsKeys("managerAnswers","finalScore","grade");
  var page=as(ADMIN,()->service.forms(true,cycle,0,20,ADMIN));
  assertThat(page.content()).hasSize(1);assertThat(page.content().getFirst()).containsOnlyKeys("id","cycle","employee","reviewer","state","incomplete","allowedActions");
  assertThat((List<?>)page.content().getFirst().get("allowedActions")).isEmpty();
  expect("EVALUATION_STATE_CONFLICT",()->as(ADMIN,()->service.reassign(id,NEXT.id(),ADMIN)));
  expect("EVALUATION_STATE_CONFLICT",()->as(SELF,()->service.write(id,false,true,self,SELF)));
 }

 @Test void unrelatedAdminAndWrongWriterGet404AndSelfApprovalGets403() {
  long cycle=create(1);open(cycle);long id=form(cycle);
  expect("NOT_FOUND",()->as(OTHER,()->service.get(id,OTHER)));
  expect("NOT_FOUND",()->as(OTHER,()->service.write(id,true,false,answers(cycle,4),OTHER)));
  expect("NOT_FOUND",()->as(ADMIN,()->service.write(id,false,false,answers(cycle,4),ADMIN)));
  expect("FORBIDDEN",()->as(SELF,()->service.write(id,true,true,answers(cycle,4),SELF)));
  expect("FORBIDDEN",()->as(SELF,()->service.reassign(id,NEXT.id(),SELF)));
  expect("FORBIDDEN",()->as(ADMIN,()->service.create(input(1,ADMIN.id(),ADMIN.id()),ADMIN)));
 }

 @Test void validatesDraftConfigurationAndReviewerEligibility() {
  var reversed=new EvaluationDto.CycleInput("합성",LocalDate.of(2026,2,1),LocalDate.of(2026,1,1),List.of(new EvaluationDto.ItemInput("합성",1)),List.of(new EvaluationDto.Assignment(SELF.id(),ADMIN.id())));
  expect("VALIDATION_ERROR",()->as(ADMIN,()->service.create(reversed,ADMIN)));
  var duplicate=new EvaluationDto.CycleInput("합성",LocalDate.of(2026,1,1),LocalDate.of(2026,12,31),List.of(new EvaluationDto.ItemInput("합성1",1),new EvaluationDto.ItemInput("합성2",1)),List.of(new EvaluationDto.Assignment(SELF.id(),ADMIN.id())));
  expect("VALIDATION_ERROR",()->as(ADMIN,()->service.create(duplicate,ADMIN)));
  expect("EVALUATION_REVIEWER_INVALID",()->as(ADMIN,()->service.create(input(1,SELF.id(),1005L),ADMIN)));
  jdbc.update("UPDATE user_account SET enabled=false WHERE employee_id=?",NEXT.id());
  expect("EVALUATION_REVIEWER_INVALID",()->as(ADMIN,()->service.create(input(1,SELF.id(),NEXT.id()),ADMIN)));
  jdbc.update("UPDATE user_account SET enabled=true WHERE employee_id=?",NEXT.id());
  jdbc.update("UPDATE employee SET hire_date=? WHERE id=?",LocalDate.now().plusYears(1),NEXT.id());
  expect("EVALUATION_REVIEWER_INVALID",()->as(ADMIN,()->service.create(input(1,SELF.id(),NEXT.id()),ADMIN)));
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_cycle",Long.class)).isZero();
 }

 @Test void draftUpdateReplacesChildrenAndOpeningFreezesItemSnapshots() {
  long cycle=create(1);long old=items(cycle).getFirst();
  as(ADMIN,()->service.update(cycle,input(2,SELF.id(),ADMIN.id()),ADMIN));
  assertThat(items(cycle)).hasSize(2).doesNotContain(old);
  open(cycle);long id=form(cycle);
  expect("EVALUATION_STATE_CONFLICT",()->as(ADMIN,()->service.update(cycle,input(1,SELF.id(),ADMIN.id()),ADMIN)));
  jdbc.update("UPDATE evaluation_item SET name='합성 변경 이름' WHERE cycle_id=?",cycle);
  var detail=as(SELF,()->service.get(id,SELF));
  assertThat(detail.get("items").toString()).doesNotContain("합성 변경 이름");
 }

 @Test void validatesAllAnswersBeforeSavingAndSupportsPartialNullDraftReplacement() {
  long cycle=create(2);open(cycle);long id=form(cycle);long item=items(cycle).getFirst();
  var partial=new EvaluationDto.Answers(List.of(new EvaluationDto.Answer(item,null,"합성 부분초안")));
  as(SELF,()->service.write(id,false,false,partial,SELF));
  expect("VALIDATION_ERROR",()->as(SELF,()->service.write(id,false,true,partial,SELF)));
  expect("VALIDATION_ERROR",()->as(SELF,()->service.write(id,false,false,new EvaluationDto.Answers(List.of(new EvaluationDto.Answer(item,4,""),new EvaluationDto.Answer(item,5,""))),SELF)));
  expect("VALIDATION_ERROR",()->as(SELF,()->service.write(id,false,false,new EvaluationDto.Answers(List.of(new EvaluationDto.Answer(Long.MAX_VALUE,4,""))),SELF)));
  assertThat(jdbc.queryForObject("SELECT state FROM evaluation_form WHERE id=?",String.class,id)).isEqualTo("SELF_DRAFT");
  assertThat(as(SELF,()->service.get(id,SELF)).get("selfAnswers")).isEqualTo(partial.answers());
  as(SELF,()->service.write(id,false,false,new EvaluationDto.Answers(List.of()),SELF));
  assertThat((List<?>)as(SELF,()->service.get(id,SELF)).get("selfAnswers")).isEmpty();
 }

 @Test void reassignClearsManagerDraftAndRevokesOldReviewerImmediately() {
  long cycle=create(2);open(cycle);long id=form(cycle);
  as(SELF,()->service.write(id,false,true,answers(cycle,4,4),SELF));
  as(ADMIN,()->service.write(id,true,false,answers(cycle,1,1),ADMIN));
  var summary=as(OTHER,()->service.reassign(id,NEXT.id(),OTHER));
  assertThat(summary.get("state")).isEqualTo("SELF_SUBMITTED");assertThat(summary).doesNotContainKeys("selfAnswers","managerAnswers","finalScore","grade");
  expect("NOT_FOUND",()->as(ADMIN,()->service.get(id,ADMIN)));
  assertThat((List<?>)as(NEXT,()->service.get(id,NEXT)).get("managerAnswers")).isEmpty();
  assertThat(as(ADMIN,()->service.forms(true,cycle,0,20,ADMIN)).content()).isEmpty();
  assertThat(as(NEXT,()->service.forms(true,cycle,0,20,NEXT)).content()).hasSize(1);
  assertThat(jdbc.queryForObject("SELECT reviewer_id FROM evaluation_assignment WHERE cycle_id=?",Long.class,cycle)).isEqualTo(NEXT.id());
  assertThat(as(NEXT,()->service.write(id,true,true,answers(cycle,4,3),NEXT)).get("grade")).isEqualTo("A");
 }

 @Test void reassignPreservesSelfDraftAndSelfSubmittedStates() {
  long cycle=create(1);open(cycle);long id=form(cycle);
  assertThat(as(OTHER,()->service.reassign(id,NEXT.id(),OTHER)).get("state")).isEqualTo("SELF_DRAFT");
  as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF));
  assertThat(as(OTHER,()->service.reassign(id,ADMIN.id(),OTHER)).get("state")).isEqualTo("SELF_SUBMITTED");
 }

 @Test void closedCycleKeepsIncompleteStateAndBlocksAllWritesAndReassignment() {
  long cycle=create(1);open(cycle);long id=form(cycle);
  as(ADMIN,()->service.transition(cycle,false,ADMIN));
  var detail=as(SELF,()->service.get(id,SELF));
  assertThat(detail.get("state")).isEqualTo("SELF_DRAFT");assertThat(detail.get("incomplete")).isEqualTo(true);
  assertThat((List<?>)detail.get("allowedActions")).isEmpty();
  expect("EVALUATION_CYCLE_CLOSED",()->as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF)));
  expect("EVALUATION_CYCLE_CLOSED",()->as(ADMIN,()->service.reassign(id,NEXT.id(),ADMIN)));
 }

 @Test void endDateDoesNotAutomaticallyCloseAnOpenCycle() {
  var input=new EvaluationDto.CycleInput("합성 과거 주기",LocalDate.of(2020,1,1),LocalDate.of(2020,1,31),List.of(new EvaluationDto.ItemInput("합성 항목",1)),List.of(new EvaluationDto.Assignment(SELF.id(),ADMIN.id())));
  long cycle=((Number)as(ADMIN,()->service.create(input,ADMIN)).get("id")).longValue();
  open(cycle);long id=form(cycle);
  assertThat(as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF)).get("state")).isEqualTo("SELF_SUBMITTED");
 }

 @Test void reviewerIsRevalidatedButSubjectRetirementDoesNotBlockAssignedReviewer() {
  long cycle=create(1);open(cycle);long id=form(cycle);
  as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF));
  jdbc.update("UPDATE user_account SET enabled=false WHERE employee_id=?",ADMIN.id());
  expect("EVALUATION_REVIEWER_INVALID",()->as(ADMIN,()->service.write(id,true,true,answers(cycle,4),ADMIN)));
  jdbc.update("UPDATE user_account SET enabled=true WHERE employee_id=?",ADMIN.id());
  jdbc.update("UPDATE employee SET status='RETIRED',retire_date=? WHERE id=?",LocalDate.now(),SELF.id());
  jdbc.update("UPDATE user_account SET enabled=false WHERE employee_id=?",SELF.id());
  assertThat(as(ADMIN,()->service.write(id,true,true,answers(cycle,4),ADMIN)).get("state")).isEqualTo("FINALIZED");
 }

 @Test void concurrentSelfSubmissionsHaveOneSuccessAndOne409() throws Exception {
  long cycle=create(1);open(cycle);long id=form(cycle);
  assertThat(race(()->as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF)))).containsExactlyInAnyOrder("OK","EVALUATION_STATE_CONFLICT");
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action='EVALUATION_SELF_SUBMIT'",Long.class)).isEqualTo(1);
 }
 @Test void concurrentManagerSubmissionsHaveOneFinalizationAndOne409() throws Exception {
  long cycle=create(1);open(cycle);long id=form(cycle);
  as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF));
  assertThat(race(()->as(ADMIN,()->service.write(id,true,true,answers(cycle,5),ADMIN)))).containsExactlyInAnyOrder("OK","EVALUATION_STATE_CONFLICT");
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM audit_log WHERE action='EVALUATION_FINALIZE'",Long.class)).isEqualTo(1);
 }

 @Test void closeLockSerializesAgainstSubmissionAtReadCommitted() throws Exception {
  long cycle=create(1);open(cycle);long id=form(cycle);
  var pool=Executors.newSingleThreadExecutor();var started=new CountDownLatch(1);
  var tx=new TransactionTemplate(transactions);tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  try {
   Future<String> pending=tx.execute(status->{
    jdbc.queryForObject("SELECT id FROM evaluation_cycle WHERE id=? FOR UPDATE",Long.class,cycle);
    Future<String> future=pool.submit(()->{started.countDown();return result(()->as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF)));});
    await(started);
    as(ADMIN,()->service.transition(cycle,false,ADMIN));
    return future;
   });
   assertThat(pending.get(20,TimeUnit.SECONDS)).isEqualTo("EVALUATION_CYCLE_CLOSED");
   assertThat(jdbc.queryForObject("SELECT state FROM evaluation_form WHERE id=?",String.class,id)).isEqualTo("SELF_DRAFT");
  } finally {pool.shutdownNow();}
 }

 @Test void auditFailureRollsBackSubmissionCycleCreationAndReassignment() {
  long cycle=create(1);open(cycle);long id=form(cycle);
  failAudit("EVALUATION_SELF_SUBMIT");
  assertThatThrownBy(()->as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF))).isInstanceOf(IllegalStateException.class);
  assertThat(jdbc.queryForObject("SELECT state FROM evaluation_form WHERE id=?",String.class,id)).isEqualTo("SELF_DRAFT");
  assertThat((List<?>)as(SELF,()->service.get(id,SELF)).get("selfAnswers")).isEmpty();
  reset(auditSpy());failAudit("EVALUATION_REASSIGN");
  assertThatThrownBy(()->as(OTHER,()->service.reassign(id,NEXT.id(),OTHER))).isInstanceOf(IllegalStateException.class);
  assertThat(jdbc.queryForObject("SELECT reviewer_id FROM evaluation_form WHERE id=?",Long.class,id)).isEqualTo(ADMIN.id());
  assertThat(jdbc.queryForObject("SELECT reviewer_id FROM evaluation_assignment WHERE cycle_id=?",Long.class,cycle)).isEqualTo(ADMIN.id());
  reset(auditSpy());failAudit("EVALUATION_CYCLE_CREATE");
  assertThatThrownBy(()->create(1)).isInstanceOf(IllegalStateException.class);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_cycle",Long.class)).isEqualTo(1);
 }

 @Test void auditFailureRollsBackFinalScoreAndOpeningSnapshots() {
  long cycle=create(2);failAudit("EVALUATION_CYCLE_OPEN");
  assertThatThrownBy(()->open(cycle)).isInstanceOf(IllegalStateException.class);
  assertThat(jdbc.queryForObject("SELECT status FROM evaluation_cycle WHERE id=?",String.class,cycle)).isEqualTo("DRAFT");
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_form WHERE cycle_id=?",Long.class,cycle)).isZero();
  reset(auditSpy());open(cycle);long id=form(cycle);
  as(SELF,()->service.write(id,false,true,answers(cycle,1,1),SELF));
  as(ADMIN,()->service.write(id,true,false,answers(cycle,2,2),ADMIN));
  failAudit("EVALUATION_FINALIZE");
  assertThatThrownBy(()->as(ADMIN,()->service.write(id,true,true,answers(cycle,5,4),ADMIN))).isInstanceOf(IllegalStateException.class);
  var detail=as(ADMIN,()->service.get(id,ADMIN));
  assertThat(detail.get("state")).isEqualTo("MANAGER_DRAFT");assertThat(detail.get("finalScore")).isNull();assertThat(detail.get("grade")).isNull();
  assertThat(detail.get("managerAnswers")).isEqualTo(answers(cycle,2,2).answers());
 }

 @Test void reassignmentLockRevokesOldReviewerBeforeWaitingSubmission() throws Exception {
  long cycle=create(1);open(cycle);long id=form(cycle);
  as(SELF,()->service.write(id,false,true,answers(cycle,4),SELF));
  var pool=Executors.newSingleThreadExecutor();var started=new CountDownLatch(1);
  var tx=new TransactionTemplate(transactions);tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
  try {
   Future<String> pending=tx.execute(status->{
    jdbc.queryForObject("SELECT id FROM evaluation_cycle WHERE id=? FOR UPDATE",Long.class,cycle);
    Future<String> future=pool.submit(()->{started.countDown();return result(()->as(ADMIN,()->service.write(id,true,true,answers(cycle,5),ADMIN)));});
    await(started);as(OTHER,()->service.reassign(id,NEXT.id(),OTHER));return future;
   });
   assertThat(pending.get(20,TimeUnit.SECONDS)).isEqualTo("NOT_FOUND");
   assertThat(jdbc.queryForObject("SELECT state FROM evaluation_form WHERE id=?",String.class,id)).isEqualTo("SELF_SUBMITTED");
   assertThat((List<?>)as(NEXT,()->service.get(id,NEXT)).get("managerAnswers")).isEmpty();
  } finally {pool.shutdownNow();}
 }

 @Test void auditContainsOnlyIdsAndStatesAndNoAnswersOrGrades() throws Exception {
  long cycle=create(1);open(cycle);long id=form(cycle);
  as(SELF,()->service.write(id,false,true,answers(cycle,1),SELF));
  as(ADMIN,()->service.write(id,true,true,answers(cycle,5),ADMIN));
  var logs=jdbc.queryForList("SELECT before_json,after_json,metadata_json,target_label FROM audit_log WHERE action LIKE 'EVALUATION%'");
  assertThat(logs).hasSize(4);
  for(var log:logs) {
   for(String field:List.of("before_json","after_json")) if(log.get(field)!=null) {
    var tree=json.readTree(log.get(field).toString());assertThat(tree.size()).isEqualTo(1);assertThat(tree.has("state")).isTrue();
   }
   var metadata=json.readTree(log.get("metadata_json").toString());
   metadata.fieldNames().forEachRemaining(key->assertThat(key).isIn("cycleId","employeeId","reviewerId"));
   assertThat(log.get("target_label")).isNull();
   assertThat(log.toString()).doesNotContain("합성 응답","finalScore","grade","comment","score");
  }
 }

 @ParameterizedTest @CsvSource({"'5;4',4.50,S","'4;3;3',3.33,B","'1;2',1.50,C","'1;1',1.00,D","'4;3',3.50,A","'3;2',2.50,B","'4;4;5',4.33,A","'4;4;4;5;5;5',4.50,S","'1;1;2',1.33,D","'1;2;2',1.67,C","'1;1;1;1;1;1;1;1;1;1;1;1;1;1;2;2',1.13,D"})
 void storesRoundedManagerAverageAndServerGrade(String scores,String expected,String grade) {
  int[] values=Arrays.stream(scores.split(";")).mapToInt(Integer::parseInt).toArray();
  long cycle=create(values.length);open(cycle);long id=form(cycle);
  int[] self=new int[values.length];Arrays.fill(self,1);
  as(SELF,()->service.write(id,false,true,answers(cycle,self),SELF));
  var result=as(ADMIN,()->service.write(id,true,true,answers(cycle,values),ADMIN));
  assertThat((BigDecimal)result.get("finalScore")).isEqualByComparingTo(expected);assertThat(result.get("grade")).isEqualTo(grade);
  assertThat(jdbc.queryForObject("SELECT final_score FROM evaluation_form WHERE id=?",BigDecimal.class,id)).isEqualByComparingTo(expected);
 }

 @Test void demoSeederRequiresTransactionAndCreatesFourSyntheticStatesOnlyOnce() {
  assertThatThrownBy(seeder::seed).isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
  new TransactionTemplate(transactions).executeWithoutResult(status->seeder.seed());
  assertThat(jdbc.queryForList("SELECT state FROM evaluation_form ORDER BY id",String.class)).containsExactly("SELF_DRAFT","SELF_SUBMITTED","MANAGER_DRAFT","FINALIZED");
  assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT employee_id) FROM evaluation_form",Long.class)).isEqualTo(4);
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_form WHERE reviewer_id=employee_id",Long.class)).isZero();
  new TransactionTemplate(transactions).executeWithoutResult(status->seeder.seed());
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_cycle",Long.class)).isEqualTo(1);
 }

 @Test void cycleDetailDraftAssignmentsAreSortedSafeSummariesWhileOtherResponsesKeepIdPairs() throws Exception {
  long cycle=createSummaryCycle();
  var summaries=cycleAssignments(cycle);
  assertThat(summaries).hasSize(2);
  assertThat(summaries.get(0).path("employee").path("employeeNo").asText()).isEqualTo("A_SYNTHETIC");
  assertThat(summaries.get(1).path("employee").path("employeeNo").asText()).isEqualTo("Z_SYNTHETIC");
  for(var summary:summaries) {
   assertSummaryKeys(summary);
   assertThat(summary.has("evaluationId")).isTrue();assertThat(summary.get("evaluationId").isNull()).isTrue();
   assertThat(summary.has("state")).isTrue();assertThat(summary.get("state").isNull()).isTrue();
   assertThat(summary.path("incomplete").asBoolean()).isFalse();assertThat(summary.path("allowedActions")).isEmpty();
  }
  var list=as(ADMIN,()->service.cycles(0,20,ADMIN));
  JsonNode listAssignment=json.valueToTree(list.content().getFirst().get("assignments"));
  assertIdPairs(listAssignment);
  var base=input(1,SELF.id(),ADMIN.id());
  var updated=as(ADMIN,()->service.update(cycle,new EvaluationDto.CycleInput(base.name(),base.startDate(),base.endDate(),base.items(),List.of(new EvaluationDto.Assignment(SELF.id(),ADMIN.id()),new EvaluationDto.Assignment(1005L,ADMIN.id()))),ADMIN));
  assertIdPairs(json.valueToTree(updated.get("assignments")));
  var opened=as(ADMIN,()->service.transition(cycle,true,ADMIN));assertIdPairs(json.valueToTree(opened.get("assignments")));
  for(var summary:cycleAssignments(cycle)) {
   assertThat(summary.path("state").asText()).isEqualTo("SELF_DRAFT");
   assertThat(summary.path("evaluationId").asLong()).isPositive();
   assertThat(summary.path("incomplete").asBoolean()).isFalse();
  }
  mvc.perform(get("/api/v1/evaluation-cycles/"+cycle).with(authentication(auth(OTHER)))).andExpect(status().isOk())
   .andExpect(jsonPath("$.assignments[0].employee.employeeNo").value("A_SYNTHETIC"))
   .andExpect(jsonPath("$.assignments[0].allowedActions[0]").value("REASSIGN_REVIEWER"))
   .andExpect(jsonPath("$.assignments[0].managerAnswers").doesNotExist()).andExpect(jsonPath("$.assignments[0].grade").doesNotExist());
  expect("FORBIDDEN",()->as(SELF,()->service.cycle(cycle,SELF)));
 }

 @Test void cycleDetailOpenAndClosedSummariesExposeManagementStateWithoutAnswers() {
  long cycle=createSummaryCycle();open(cycle);long selfForm=form(cycle);
  // Preserve a final result and an unfinished draft to cover both CLOSED outcomes.
  as(SELF,()->service.write(selfForm,false,true,answers(cycle,1),SELF));
  as(ADMIN,()->service.write(selfForm,true,true,answers(cycle,5),ADMIN));
  long otherForm=jdbc.queryForObject("SELECT id FROM evaluation_form WHERE cycle_id=? AND employee_id=?",Long.class,cycle,1005L);
  var otherEmployee=new Dto.User(1005L,"A_SYNTHETIC","합성 다른 대상",Role.EMPLOYEE);
  as(otherEmployee,()->service.write(otherForm,false,true,answers(cycle,4),otherEmployee));
  as(ADMIN,()->service.write(otherForm,true,false,answers(cycle,2),ADMIN));
  var openSummaries=cycleAssignments(cycle);
  assertThat(openSummaries.get(0).path("state").asText()).isEqualTo("MANAGER_DRAFT");
  assertThat(openSummaries.get(0).path("evaluationId").asLong()).isEqualTo(otherForm);
  assertThat(openSummaries.get(0).path("allowedActions").get(0).asText()).isEqualTo("REASSIGN_REVIEWER");
  assertThat(openSummaries.get(0).path("incomplete").asBoolean()).isFalse();
  assertThat(openSummaries.get(1).path("state").asText()).isEqualTo("FINALIZED");
  assertThat(openSummaries.get(1).path("allowedActions")).isEmpty();
  openSummaries.forEach(EvaluationMySqlTest::assertSummaryKeys);
  // An unrelated ADMIN gains management summaries, never the private form.
  expect("NOT_FOUND",()->as(OTHER,()->service.get(selfForm,OTHER)));
  as(OTHER,()->service.reassign(otherForm,NEXT.id(),OTHER));
  var reassigned=cycleAssignments(cycle).getFirst();
  assertThat(reassigned.path("reviewer").path("id").asLong()).isEqualTo(NEXT.id());
  assertThat(reassigned.path("state").asText()).isEqualTo("SELF_SUBMITTED");
  var closed=as(ADMIN,()->service.transition(cycle,false,ADMIN));assertIdPairs(json.valueToTree(closed.get("assignments")));
  var closedSummaries=cycleAssignments(cycle);
  assertThat(closedSummaries.get(0).path("incomplete").asBoolean()).isTrue();
  assertThat(closedSummaries.get(1).path("incomplete").asBoolean()).isFalse();
  for(var summary:closedSummaries) {assertSummaryKeys(summary);assertThat(summary.path("allowedActions")).isEmpty();}
 }

 private long createSummaryCycle() {
  jdbc.update("UPDATE employee SET employee_no='Z_SYNTHETIC' WHERE id=?",SELF.id());
  jdbc.update("UPDATE employee SET employee_no='A_SYNTHETIC' WHERE id=1005");
  var base=input(1,SELF.id(),ADMIN.id());
  var input=new EvaluationDto.CycleInput(base.name(),base.startDate(),base.endDate(),base.items(),List.of(new EvaluationDto.Assignment(SELF.id(),ADMIN.id()),new EvaluationDto.Assignment(1005L,ADMIN.id())));
  var created=as(ADMIN,()->service.create(input,ADMIN));assertIdPairs(json.valueToTree(created.get("assignments")));
  return ((Number)created.get("id")).longValue();
 }
 private List<JsonNode> cycleAssignments(long cycle) {
  JsonNode rows=json.valueToTree(as(OTHER,()->service.cycle(cycle,OTHER)).get("assignments"));
  var result=new ArrayList<JsonNode>();rows.forEach(result::add);return result;
 }
 private static void assertIdPairs(JsonNode assignments) {
  for(var assignment:assignments) {
   var keys=new HashSet<String>();assignment.fieldNames().forEachRemaining(keys::add);
   assertThat(keys).containsExactlyInAnyOrder("employeeId","reviewerId");
  }
 }
 private static void assertSummaryKeys(JsonNode summary) {
  var keys=new HashSet<String>();summary.fieldNames().forEachRemaining(keys::add);
  assertThat(keys).containsExactlyInAnyOrder("evaluationId","employee","reviewer","state","incomplete","allowedActions");
  for(String name:List.of("employee","reviewer")) {
   var personKeys=new HashSet<String>();summary.path(name).fieldNames().forEachRemaining(personKeys::add);
   assertThat(personKeys).containsExactlyInAnyOrder("id","employeeNo","name");
  }
 }

 private long create(int count) {return ((Number)as(ADMIN,()->service.create(input(count,SELF.id(),ADMIN.id()),ADMIN)).get("id")).longValue();}
 private void open(long cycle) {as(ADMIN,()->service.transition(cycle,true,ADMIN));}
 private long form(long cycle) {return jdbc.queryForObject("SELECT id FROM evaluation_form WHERE cycle_id=? AND employee_id=?",Long.class,cycle,SELF.id());}
 private List<Long> items(long cycle) {return jdbc.queryForList("SELECT id FROM evaluation_item WHERE cycle_id=? ORDER BY sort_order,id",Long.class,cycle);}
 private EvaluationDto.CycleInput input(int count,long employee,long reviewer) {
  var items=new ArrayList<EvaluationDto.ItemInput>();for(int i=1;i<=count;i++)items.add(new EvaluationDto.ItemInput("합성 항목 "+i,i));
  return new EvaluationDto.CycleInput("합성 평가 주기",LocalDate.of(2026,1,1),LocalDate.of(2026,12,31),items,List.of(new EvaluationDto.Assignment(employee,reviewer)));
 }
 private EvaluationDto.Answers answers(long cycle,int... scores) {
  var items=items(cycle);var answers=new ArrayList<EvaluationDto.Answer>();
  for(int i=0;i<scores.length;i++)answers.add(new EvaluationDto.Answer(items.get(i),scores[i],"합성 응답"));
  return new EvaluationDto.Answers(answers);
 }
 private static UsernamePasswordAuthenticationToken auth(Dto.User user) {
  return UsernamePasswordAuthenticationToken.authenticated(user,null,List.of(new SimpleGrantedAuthority("ROLE_"+user.role().name())));
 }
 private static <T>T as(Dto.User user,Supplier<T> operation) {
  var previous=SecurityContextHolder.getContext();var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(auth(user));SecurityContextHolder.setContext(context);
  try{return operation.get();}finally{SecurityContextHolder.setContext(previous);}
 }
 private static void expect(String code,Runnable operation) {assertThatThrownBy(operation::run).isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo(code));}
 private AuditService auditSpy() {return AopTestUtils.getUltimateTargetObject(audit);}
 private void failAudit(String action) {doThrow(new IllegalStateException("synthetic audit failure")).when(auditSpy()).record(eq(action),anyString(),anyLong(),isNull(),nullable(Object.class),nullable(Object.class),anyMap());}
 private static String result(Supplier<?> operation) {try{operation.get();return "OK";}catch(ApiException e){return e.code;}}
 private static void await(CountDownLatch latch) {try{if(!latch.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Test synchronization timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}}
 private static List<String> race(Supplier<?> operation) throws Exception {
  var pool=Executors.newFixedThreadPool(2);var ready=new CountDownLatch(2);var go=new CountDownLatch(1);
  Callable<String> task=()->{ready.countDown();await(go);return result(operation);};
  try{var first=pool.submit(task);var second=pool.submit(task);await(ready);go.countDown();return List.of(first.get(20,TimeUnit.SECONDS),second.get(20,TimeUnit.SECONDS));}
  finally{pool.shutdownNow();}
 }
}
