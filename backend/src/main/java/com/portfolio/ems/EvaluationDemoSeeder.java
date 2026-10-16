package com.portfolio.ems;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import java.sql.Statement;
import java.time.*;
import java.util.*;

/** Synthetic initial data, invoked only by DemoSeeder's empty-database transaction. */
@Component
class EvaluationDemoSeeder {
 private final JdbcTemplate jdbc;
 private final ObjectMapper json;
 private final Clock clock;
 EvaluationDemoSeeder(JdbcTemplate jdbc,ObjectMapper json,Clock clock) {this.jdbc=jdbc;this.json=json;this.clock=clock;}

 @Transactional(propagation=Propagation.MANDATORY)
 public void seed() {
  if(jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_cycle",Long.class)>0)return;
  LocalDate today=LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul")));
  var reviewers=jdbc.queryForList("SELECT e.id FROM employee e JOIN user_account a ON a.employee_id=e.id WHERE e.status='ACTIVE' AND e.hire_date<=? AND a.enabled=true AND a.role='ADMIN' ORDER BY e.id",Long.class,today);
  if(reviewers.isEmpty())throw new IllegalStateException("Synthetic evaluation reviewer missing");
  long reviewer=reviewers.getFirst();
  var employees=jdbc.queryForList("SELECT e.id FROM employee e JOIN user_account a ON a.employee_id=e.id WHERE e.id<>? AND e.status='ACTIVE' AND e.hire_date<=? AND a.enabled=true ORDER BY e.id LIMIT 4",Long.class,reviewer,today);
  if(employees.size()!=4)throw new IllegalStateException("Synthetic evaluation subjects missing");
  long cycle=insert("INSERT INTO evaluation_cycle(name,start_date,end_date,status) VALUES(?,?,?,'OPEN')","합성 데모 평가",today.withDayOfMonth(1),today.withDayOfMonth(1).plusMonths(2).minusDays(1));
  long first=insert("INSERT INTO evaluation_item(cycle_id,name,sort_order) VALUES(?,?,?)",cycle,"합성 업무 수행",1);
  long second=insert("INSERT INTO evaluation_item(cycle_id,name,sort_order) VALUES(?,?,?)",cycle,"합성 협업",2);
  String items=encode(List.of(new EvaluationDto.Item(first,"합성 업무 수행",1),new EvaluationDto.Item(second,"합성 협업",2)));
  String self=encode(List.of(new EvaluationDto.Answer(first,4,"합성 자기평가 예시"),new EvaluationDto.Answer(second,4,"합성 자기평가 예시")));
  String manager=encode(List.of(new EvaluationDto.Answer(first,5,"합성 관리자평가 예시"),new EvaluationDto.Answer(second,4,"합성 관리자평가 예시")));
  String draft=encode(List.of(new EvaluationDto.Answer(first,3,"합성 관리자 초안 예시")));
  String[] states={"SELF_DRAFT","SELF_SUBMITTED","MANAGER_DRAFT","FINALIZED"};
  for(int i=0;i<employees.size();i++) {
   long employee=employees.get(i);
   jdbc.update("INSERT INTO evaluation_assignment(cycle_id,employee_id,reviewer_id) VALUES(?,?,?)",cycle,employee,reviewer);
   jdbc.update("INSERT INTO evaluation_form(cycle_id,employee_id,reviewer_id,state,items_json,self_answers_json,manager_answers_json,final_score,grade) VALUES(?,?,?,?,?,?,?,?,?)",cycle,employee,reviewer,states[i],items,i==0?"[]":self,i==2?draft:i==3?manager:"[]",i==3?new java.math.BigDecimal("4.50"):null,i==3?"S":null);
  }
 }
 private long insert(String sql,Object... args) {
  var key=new GeneratedKeyHolder();jdbc.update(c->{var s=c.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<args.length;i++)s.setObject(i+1,args[i]);return s;},key);
  return Objects.requireNonNull(key.getKey()).longValue();
 }
 private String encode(Object value) {
  try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Synthetic evaluation serialization failed",e);}
 }
}
