package com.portfolio.ems;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.*;
import java.sql.*;
import java.time.*;
import java.util.*;

@Service
@Transactional(isolation=Isolation.READ_COMMITTED)
class EvaluationService {
 private final JdbcTemplate jdbc;
 private final ObjectMapper json;
 private final AuditService audit;
 private final Clock clock;
 private final Validator validator;
 EvaluationService(JdbcTemplate jdbc,ObjectMapper json,AuditService audit,Clock clock,Validator validator) {
  this.jdbc=jdbc;this.json=json;this.audit=audit;this.clock=clock;this.validator=validator;
 }
 private record Cycle(long id,String name,LocalDate start,LocalDate end,String status) {}
 private record Form(long id,long cycleId,long employeeId,long reviewerId,String state,
  List<EvaluationDto.Item> items,List<EvaluationDto.Answer> self,List<EvaluationDto.Answer> manager,
  BigDecimal score,String grade) {}
 private static final TypeReference<List<EvaluationDto.Item>> ITEMS=new TypeReference<>() {};
 private static final TypeReference<List<EvaluationDto.Answer>> ANSWERS=new TypeReference<>() {};

 public Dto.PageView<Map<String,Object>> cycles(int page,int size,Dto.User user) {
  admin(user);AppointmentStore.validatePage(page,size);
  long count=jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_cycle",Long.class);
  var rows=jdbc.queryForList("SELECT id FROM evaluation_cycle ORDER BY id DESC LIMIT ? OFFSET ?",Long.class,size,(long)page*size)
   .stream().map(id->cycleView(loadCycle(id,false))).toList();
  return page(rows,page,size,count);
 }
 public Map<String,Object> cycle(long id,Dto.User user) {
  admin(user);var cycle=loadCycle(id,false);var view=cycleView(cycle);
  view.put("assignments",assignmentSummaries(cycle));return view;
 }
 public Map<String,Object> create(EvaluationDto.CycleInput input,Dto.User user) {
  admin(user);validateCycle(input);
  long id=insert("INSERT INTO evaluation_cycle(name,start_date,end_date,status) VALUES(?,?,?,'DRAFT')",input.name(),input.startDate(),input.endDate());
  replaceChildren(id,input);
  cycleAudit("CREATE",id,null,"DRAFT");
  return cycleView(loadCycle(id,false));
 }
 public Map<String,Object> update(long id,EvaluationDto.CycleInput input,Dto.User user) {
  admin(user);var cycle=loadCycle(id,true);requireState(cycle,"DRAFT");validateCycle(input);
  jdbc.update("UPDATE evaluation_cycle SET name=?,start_date=?,end_date=? WHERE id=?",input.name(),input.startDate(),input.endDate(),id);
  replaceChildren(id,input);cycleAudit("UPDATE",id,"DRAFT","DRAFT");return cycleView(loadCycle(id,false));
 }
 public Map<String,Object> transition(long id,boolean open,Dto.User user) {
  admin(user);var cycle=loadCycle(id,true);requireState(cycle,open?"DRAFT":"OPEN");
  if(open) {
   var assignments=assignments(id);
   // Recheck eligibility at OPEN, not just when the DRAFT was last edited.
   for(var a:assignments) { target(a.employeeId());reviewer(a.employeeId(),a.reviewerId()); }
   String snapshot=encode(items(id));
   for(var a:assignments) jdbc.update("INSERT INTO evaluation_form(cycle_id,employee_id,reviewer_id,state,items_json,self_answers_json,manager_answers_json) VALUES(?,?,?,'SELF_DRAFT',?,'[]','[]')",id,a.employeeId(),a.reviewerId(),snapshot);
  }
  String status=open?"OPEN":"CLOSED";
  jdbc.update("UPDATE evaluation_cycle SET status=? WHERE id=?",status,id);
  cycleAudit(open?"OPEN":"CLOSE",id,cycle.status(),status);
  return cycleView(loadCycle(id,false));
 }

 public Dto.PageView<Map<String,Object>> forms(boolean assigned,Long cycleId,int page,int size,Dto.User user) {
  authenticated(user);AppointmentStore.validatePage(page,size);
  if(cycleId!=null&&cycleId<=0)throw ApiException.invalid("cycleId","양의 ID가 필요합니다.");
  String where=" WHERE "+(assigned?"reviewer_id":"employee_id")+"=?";
  var parameters=new ArrayList<Object>();parameters.add(user.id());
  if(cycleId!=null) { where+=" AND cycle_id=?";parameters.add(cycleId); }
  long count=jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_form"+where,Long.class,parameters.toArray());
  parameters.add(size);parameters.add((long)page*size);
  var rows=jdbc.queryForList("SELECT id FROM evaluation_form"+where+" ORDER BY id DESC LIMIT ? OFFSET ?",Long.class,parameters.toArray())
   .stream().map(id->{var f=loadForm(id,false);return formView(f,loadCycle(f.cycleId(),false),user,false);}).toList();
  return page(rows,page,size,count);
 }
 public Map<String,Object> get(long id,Dto.User user) {
  authenticated(user);var form=loadForm(id,false);relation(form,user);
  return formView(form,loadCycle(form.cycleId(),false),user,true);
 }

 public Map<String,Object> write(long id,boolean manager,boolean submit,EvaluationDto.Answers input,Dto.User user) {
  authenticated(user);
  var cycle=lockCycleForForm(id);var before=loadForm(id,true);
  if(manager) {
   if(before.employeeId()==user.id())throw forbidden();
   if(before.reviewerId()!=user.id())throw ApiException.missing();
  } else if(before.employeeId()!=user.id())throw ApiException.missing();
  requireState(cycle,"OPEN");
  reviewer(before.employeeId(),before.reviewerId());
  if(manager ? !Set.of("SELF_SUBMITTED","MANAGER_DRAFT").contains(before.state()) : !"SELF_DRAFT".equals(before.state()))throw conflict();
  validateAnswers(input,before.items(),submit);
  String state=manager?(submit?"FINALIZED":"MANAGER_DRAFT"):(submit?"SELF_SUBMITTED":"SELF_DRAFT");
  if(manager) {
   BigDecimal score=submit?score(input.answers()):null;
   jdbc.update("UPDATE evaluation_form SET manager_answers_json=?,state=?,final_score=?,grade=? WHERE id=?",encode(input.answers()),state,score,submit?grade(score):null,id);
  } else jdbc.update("UPDATE evaluation_form SET self_answers_json=?,state=? WHERE id=?",encode(input.answers()),state,id);
  String action=manager?(submit?"FINALIZE":"MANAGER_SAVE"):(submit?"SELF_SUBMIT":"SELF_SAVE");
  audit.record("EVALUATION_"+action,"EVALUATION",id,null,state(before.state()),state(state),
   Map.of("cycleId",before.cycleId(),"employeeId",before.employeeId(),"reviewerId",before.reviewerId()));
  return formView(loadForm(id,false),cycle,user,true);
 }

 public Map<String,Object> reassign(long id,Long reviewerId,Dto.User user) {
  admin(user);var cycle=lockCycleForForm(id);var before=loadForm(id,true);
  requireState(cycle,"OPEN");if("FINALIZED".equals(before.state()))throw conflict();
  if(reviewerId==null||reviewerId<=0)throw ApiException.invalid("reviewerId","양의 ID가 필요합니다.");
  reviewer(before.employeeId(),reviewerId);
  String next="MANAGER_DRAFT".equals(before.state())?"SELF_SUBMITTED":before.state();
  jdbc.update("UPDATE evaluation_form SET reviewer_id=?,manager_answers_json='[]',final_score=NULL,grade=NULL,state=? WHERE id=?",reviewerId,next,id);
  jdbc.update("UPDATE evaluation_assignment SET reviewer_id=? WHERE cycle_id=? AND employee_id=?",reviewerId,before.cycleId(),before.employeeId());
  audit.record("EVALUATION_REASSIGN","EVALUATION",id,null,state(before.state()),state(next),
   Map.of("cycleId",before.cycleId(),"employeeId",before.employeeId(),"oldReviewerId",before.reviewerId(),"newReviewerId",reviewerId));
  return formView(loadForm(id,false),cycle,user,false);
 }

 private void validateCycle(EvaluationDto.CycleInput input) {
  validate(input);
  if(input.startDate().isAfter(input.endDate()))throw ApiException.invalid("endDate","시작일 이후여야 합니다.");
  var orders=new HashSet<Integer>();
  for(var item:input.items())if(!orders.add(item.sortOrder()))throw ApiException.invalid("items","순서는 중복될 수 없습니다.");
  var employees=new HashSet<Long>();
  for(var a:input.assignments()) {
   if(!employees.add(a.employeeId()))throw ApiException.invalid("assignments","대상자는 중복될 수 없습니다.");
   target(a.employeeId());reviewer(a.employeeId(),a.reviewerId());
  }
 }
 private void validate(Object input) {
  if(input==null)throw ApiException.invalid("body","입력값이 필요합니다.");
  var violations=validator.validate(input);
  if(!violations.isEmpty())throw ApiException.invalid(violations.iterator().next().getPropertyPath().toString(),"입력 형식과 범위를 확인해 주세요.");
 }
 private void validateAnswers(EvaluationDto.Answers input,List<EvaluationDto.Item> items,boolean submit) {
  validate(input);
  var known=new HashSet<Long>();items.forEach(i->known.add(i.id()));
  var seen=new HashSet<Long>();
  for(var answer:input.answers()) {
   if(!known.contains(answer.itemId())||!seen.add(answer.itemId()))throw ApiException.invalid("answers","알려진 항목을 중복 없이 입력해 주세요.");
   if(submit&&answer.score()==null)throw ApiException.invalid("answers","제출에는 모든 항목의 점수가 필요합니다.");
  }
  if(submit&&!seen.equals(known))throw ApiException.invalid("answers","제출에는 모든 항목의 점수가 필요합니다.");
 }
 private void target(long employeeId) {
  if(jdbc.queryForObject("SELECT COUNT(*) FROM employee WHERE id=?",Long.class,employeeId)==0)throw ApiException.missing();
  var matches=jdbc.queryForList("SELECT id FROM employee WHERE id=? AND status IN ('ACTIVE','ON_LEAVE') AND hire_date<=?",Long.class,employeeId,today());
  if(matches.isEmpty())throw ApiException.invalid("assignments","활성 또는 휴직 중인 입사일 도래 사원이 필요합니다.");
 }
 private boolean validReviewer(long reviewerId) {
  return jdbc.queryForObject("SELECT COUNT(*) FROM employee e JOIN user_account a ON a.employee_id=e.id WHERE e.id=? AND e.status='ACTIVE' AND e.hire_date<=? AND a.enabled=true AND a.role='ADMIN'",Long.class,reviewerId,today())==1;
 }
 private void reviewer(long employeeId,long reviewerId) {
  if(employeeId==reviewerId)throw forbidden();
  if(!validReviewer(reviewerId))throw ApiException.conflict("EVALUATION_REVIEWER_INVALID");
 }
 private LocalDate today() { return LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul"))); }
 private void replaceChildren(long id,EvaluationDto.CycleInput input) {
  jdbc.update("DELETE FROM evaluation_assignment WHERE cycle_id=?",id);
  jdbc.update("DELETE FROM evaluation_item WHERE cycle_id=?",id);
  for(var item:input.items())jdbc.update("INSERT INTO evaluation_item(cycle_id,name,sort_order) VALUES(?,?,?)",id,item.name(),item.sortOrder());
  for(var a:input.assignments())jdbc.update("INSERT INTO evaluation_assignment(cycle_id,employee_id,reviewer_id) VALUES(?,?,?)",id,a.employeeId(),a.reviewerId());
 }
 private Cycle loadCycle(long id,boolean lock) {
  var rows=jdbc.query("SELECT * FROM evaluation_cycle WHERE id=?"+(lock?" FOR UPDATE":""),(r,n)->new Cycle(r.getLong("id"),r.getString("name"),r.getObject("start_date",LocalDate.class),r.getObject("end_date",LocalDate.class),r.getString("status")),id);
  if(rows.isEmpty())throw ApiException.missing();return rows.getFirst();
 }
 // cycle_id never changes. Discover it first, then acquire all write locks cycle -> form.
 private Cycle lockCycleForForm(long id) {
  var ids=jdbc.queryForList("SELECT cycle_id FROM evaluation_form WHERE id=?",Long.class,id);
  if(ids.isEmpty())throw ApiException.missing();return loadCycle(ids.getFirst(),true);
 }
 private Form loadForm(long id,boolean lock) {
  var rows=jdbc.query("SELECT * FROM evaluation_form WHERE id=?"+(lock?" FOR UPDATE":""),(r,n)->new Form(r.getLong("id"),r.getLong("cycle_id"),r.getLong("employee_id"),r.getLong("reviewer_id"),r.getString("state"),decode(r.getString("items_json"),ITEMS),decode(r.getString("self_answers_json"),ANSWERS),decode(r.getString("manager_answers_json"),ANSWERS),r.getBigDecimal("final_score"),r.getString("grade")),id);
  if(rows.isEmpty())throw ApiException.missing();return rows.getFirst();
 }
 private List<EvaluationDto.Item> items(long id) {
  return jdbc.query("SELECT id,name,sort_order FROM evaluation_item WHERE cycle_id=? ORDER BY sort_order,id",(r,n)->new EvaluationDto.Item(r.getLong(1),r.getString(2),r.getInt(3)),id);
 }
 private List<EvaluationDto.Assignment> assignments(long id) {
  return jdbc.query("SELECT employee_id,reviewer_id FROM evaluation_assignment WHERE cycle_id=? ORDER BY employee_id",(r,n)->new EvaluationDto.Assignment(r.getLong(1),r.getLong(2)),id);
 }
 // Cycle-detail management summaries deliberately never select answers or scores.
 private List<Map<String,Object>> assignmentSummaries(Cycle cycle) {
  return jdbc.query("""
   SELECT f.id AS evaluation_id,f.state AS form_state,
          e.id AS employee_id,e.employee_no,e.name AS employee_name,
          reviewer.id AS reviewer_id,reviewer.employee_no AS reviewer_no,reviewer.name AS reviewer_name
   FROM evaluation_assignment a
   JOIN employee e ON e.id=a.employee_id
   JOIN employee reviewer ON reviewer.id=a.reviewer_id
   LEFT JOIN evaluation_form f ON f.cycle_id=a.cycle_id AND f.employee_id=a.employee_id
   WHERE a.cycle_id=? ORDER BY e.employee_no ASC,a.id ASC
   """,(r,n)->{
    boolean draft="DRAFT".equals(cycle.status());
    Long evaluationId=draft?null:r.getObject("evaluation_id",Long.class);
    String formState=draft?null:r.getString("form_state");
    var summary=new LinkedHashMap<String,Object>();
    summary.put("evaluationId",evaluationId);
    summary.put("employee",Map.of("id",r.getLong("employee_id"),"employeeNo",r.getString("employee_no"),"name",r.getString("employee_name")));
    summary.put("reviewer",Map.of("id",r.getLong("reviewer_id"),"employeeNo",r.getString("reviewer_no"),"name",r.getString("reviewer_name")));
    summary.put("state",formState);
    summary.put("incomplete","CLOSED".equals(cycle.status())&&!"FINALIZED".equals(formState));
    summary.put("allowedActions","OPEN".equals(cycle.status())&&evaluationId!=null&&!"FINALIZED".equals(formState)?List.of("REASSIGN_REVIEWER"):List.of());
    return summary;
   },cycle.id());
 }
 private Map<String,Object> cycleRef(Cycle c) {
  return Map.of("id",c.id(),"name",c.name(),"status",c.status(),"startDate",c.start(),"endDate",c.end());
 }
 private Map<String,Object> cycleView(Cycle c) {
  var view=new LinkedHashMap<>(cycleRef(c));view.put("items",items(c.id()));view.put("assignments",assignments(c.id()));
  view.put("allowedActions",switch(c.status()) {case "DRAFT"->List.of("EDIT","OPEN");case "OPEN"->List.of("CLOSE");default->List.of();});return view;
 }
 private Map<String,Object> person(long id) {
  return jdbc.queryForObject("SELECT id,employee_no,name FROM employee WHERE id=?",(r,n)->Map.<String,Object>of("id",r.getLong(1),"employeeNo",r.getString(2),"name",r.getString(3)),id);
 }
 private Map<String,Object> formView(Form f,Cycle c,Dto.User user,boolean detail) {
  var view=new LinkedHashMap<String,Object>();view.put("id",f.id());view.put("cycle",cycleRef(c));
  view.put("employee",person(f.employeeId()));view.put("reviewer",person(f.reviewerId()));view.put("state",f.state());
  view.put("incomplete","CLOSED".equals(c.status())&&!"FINALIZED".equals(f.state()));
  var actions=new ArrayList<String>();
  if("OPEN".equals(c.status())) {
   boolean eligible=validReviewer(f.reviewerId());
   if(f.employeeId()==user.id()&&"SELF_DRAFT".equals(f.state())&&eligible)actions.addAll(List.of("SAVE_SELF","SUBMIT_SELF"));
   if(f.reviewerId()==user.id()&&eligible&&Set.of("SELF_SUBMITTED","MANAGER_DRAFT").contains(f.state()))actions.addAll(List.of("SAVE_MANAGER","SUBMIT_MANAGER"));
   if(!detail&&user.role()==Role.ADMIN&&!"FINALIZED".equals(f.state()))actions.add("REASSIGN_REVIEWER");
  }
  view.put("allowedActions",List.copyOf(actions));
  if(detail) {
   view.put("items",f.items());view.put("selfAnswers",f.self());
   if(f.reviewerId()==user.id()||"FINALIZED".equals(f.state())) {
    view.put("managerAnswers",f.manager());view.put("finalScore",f.score());view.put("grade",f.grade());
   }
  }
  return view;
 }
 private static void relation(Form form,Dto.User user) {
  if(form.employeeId()!=user.id()&&form.reviewerId()!=user.id())throw ApiException.missing();
 }
 private static void authenticated(Dto.User user) { if(user==null)throw new ApiException(401,"UNAUTHORIZED","인증이 필요합니다."); }
 private static void admin(Dto.User user) { authenticated(user);if(user.role()!=Role.ADMIN)throw forbidden(); }
 private static ApiException forbidden() { return new ApiException(403,"FORBIDDEN","접근 권한이 없습니다."); }
 private static ApiException conflict() { return ApiException.conflict("EVALUATION_STATE_CONFLICT"); }
 private static void requireState(Cycle c,String expected) {
  if("CLOSED".equals(c.status()))throw ApiException.conflict("EVALUATION_CYCLE_CLOSED");
  if(!expected.equals(c.status()))throw conflict();
 }
 private static Map<String,String> state(String value) { return Map.of("state",value); }
 private void cycleAudit(String action,long id,String before,String after) {
  audit.record("EVALUATION_CYCLE_"+action,"EVALUATION_CYCLE",id,null,before==null?null:state(before),state(after),Map.of("cycleId",id));
 }
 static BigDecimal score(List<EvaluationDto.Answer> answers) {
  BigDecimal sum=answers.stream().map(a->BigDecimal.valueOf(a.score())).reduce(BigDecimal.ZERO,BigDecimal::add);
  return sum.divide(BigDecimal.valueOf(answers.size()),2,RoundingMode.HALF_UP);
 }
 static String grade(BigDecimal score) {
  for(var entry:List.of(Map.entry("4.50","S"),Map.entry("3.50","A"),Map.entry("2.50","B"),Map.entry("1.50","C")))if(score.compareTo(new BigDecimal(entry.getKey()))>=0)return entry.getValue();
  return "D";
 }
 private String encode(Object value) {
  try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Evaluation serialization failed",e);}
 }
 private <T>T decode(String value,TypeReference<T> type) {
  try{return json.readValue(value,type);}catch(Exception e){throw new IllegalStateException("Evaluation data invalid",e);}
 }
 private long insert(String sql,Object... parameters) {
  var key=new GeneratedKeyHolder();jdbc.update(c->{var s=c.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<parameters.length;i++)s.setObject(i+1,parameters[i]);return s;},key);
  return Objects.requireNonNull(key.getKey()).longValue();
 }
 private static <T>Dto.PageView<T> page(List<T> rows,int page,int size,long count) { return new Dto.PageView<>(rows,page,size,count,(int)((count+size-1)/size)); }
}
