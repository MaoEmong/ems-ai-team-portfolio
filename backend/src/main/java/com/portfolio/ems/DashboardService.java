package com.portfolio.ems;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
@Configuration
class BusinessClock {
 @Bean Clock clock() { return Clock.system(ZoneId.of("Asia/Seoul")); }
}
@Service
class DashboardService {
 private final JdbcTemplate jdbc;private final Clock clock;
 DashboardService(JdbcTemplate jdbc,Clock clock) {this.jdbc=jdbc;this.clock=clock;}
 @Transactional(readOnly=true)
 public Map<String,Object> get() {
  LocalDate today=LocalDate.now(clock); YearMonth month=YearMonth.from(today); LocalDate start=month.minusMonths(11).atDay(1);
  Map<String,Long> states=new HashMap<>();
  jdbc.query("SELECT status,COUNT(*) n FROM employee GROUP BY status",(org.springframework.jdbc.core.RowCallbackHandler)r->states.put(r.getString(1),r.getLong(2)));
  long active=states.getOrDefault("ACTIVE",0L),leave=states.getOrDefault("ON_LEAVE",0L);
  var depts=jdbc.query("SELECT d.id,d.name,COUNT(*) n FROM employee e JOIN department d ON d.id=e.department_id WHERE e.status IN ('ACTIVE','ON_LEAVE') GROUP BY d.id,d.name ORDER BY d.name,d.id",
   (r,n)->Map.of("departmentId",r.getLong("id"),"name",r.getString("name"),"count",r.getLong("n")));
  var positions=jdbc.query("SELECT p.id,p.name,p.level,COUNT(*) n FROM employee e JOIN job_position p ON p.id=e.position_id WHERE e.status IN ('ACTIVE','ON_LEAVE') GROUP BY p.id,p.name,p.level ORDER BY p.level,p.id",
   (r,n)->Map.of("positionId",r.getLong("id"),"name",r.getString("name"),"level",r.getInt("level"),"count",r.getLong("n")));
  Map<String,Long> hires=dates("hire_date",start,today),retired=dates("retire_date",start,today);
  List<Map<String,Object>> monthly=new ArrayList<>();
  for(int i=0;i<12;i++) {String key=month.minusMonths(11-i).toString();monthly.add(Map.of("month",key,"hires",hires.getOrDefault(key,0L),"retirements",retired.getOrDefault(key,0L)));}
  return Map.of("asOfDate",today,"headcount",Map.of("active",active,"onLeave",leave,"employed",active+leave,"retired",states.getOrDefault("RETIRED",0L)),
   "byDepartment",depts,"byPosition",positions,"thisMonth",Map.of("hires",hires.getOrDefault(month.toString(),0L),"retirements",retired.getOrDefault(month.toString(),0L)),
   "monthly",monthly);
 }
 private Map<String,Long> dates(String column,LocalDate start,LocalDate end) {
  Map<String,Long> result=new HashMap<>();
  jdbc.query("SELECT DATE_FORMAT("+column+",'%Y-%m') m,COUNT(*) n FROM employee WHERE "+column+">=? AND "+column+"<=? GROUP BY m",
   (org.springframework.jdbc.core.RowCallbackHandler)r->result.put(r.getString("m"),r.getLong("n")),start,end);
  return result;
 }
}
