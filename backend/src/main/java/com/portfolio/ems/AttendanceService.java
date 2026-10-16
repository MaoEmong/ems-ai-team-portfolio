package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.sql.*;
import java.util.*;
@Service @Transactional
class AttendanceService {
 private final JdbcTemplate jdbc;private final EmployeeRepository employees;private final AuditService audit;private final NotificationService notifications;private final Clock clock;
 AttendanceService(JdbcTemplate jdbc,EmployeeRepository employees,AuditService audit,NotificationService notifications,Clock clock){this.jdbc=jdbc;this.employees=employees;this.audit=audit;this.notifications=notifications;this.clock=clock;}
 LocalDate today(){return LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul")));}
 OffsetDateTime now(){return clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime();}
 public AttendanceDay check(long id,boolean in){
  Employee e=employees.lockById(id).orElseThrow(ApiException::missing);LeaveService.active(e,today());
  if(!LeaveService.workday(today()))throw ApiException.conflict("NOT_A_WORKDAY");
  var day=day(id,today());
  if(in){
   if(day.status().equals("LEAVE"))throw ApiException.conflict("ON_LEAVE_DAY");
   if(day.checkIn()!=null)throw ApiException.conflict("ALREADY_CHECKED_IN");
   jdbc.update("INSERT INTO attendance(employee_id,work_date,check_in) VALUES(?,?,?)",id,today(),Timestamp.from(now().toInstant()));
  }else{
   if(day.checkIn()==null)throw ApiException.conflict("NOT_CHECKED_IN");
   if(day.checkOut()!=null)throw ApiException.conflict("ALREADY_CHECKED_OUT");
   jdbc.update("UPDATE attendance SET check_out=? WHERE employee_id=? AND work_date=?",Timestamp.from(now().toInstant()),id,today());
  }return day(id,today());
 }
 public AttendanceDay correct(long id,LocalDate date,CorrectionInput r){
  Employee e=employees.lockById(id).orElseThrow(ApiException::missing);
  if(!LeaveService.workday(date))throw ApiException.conflict("NOT_A_WORKDAY");
  if(date.isBefore(e.hireDate)||date.isAfter(today()))throw ApiException.invalid("date","입사일부터 오늘까지여야 합니다.");
  validateTime(r.checkIn(),date,"checkIn");if(r.checkOut()!=null){validateTime(r.checkOut(),date,"checkOut");if(!r.checkIn().toInstant().isBefore(r.checkOut().toInstant()))throw ApiException.invalid("checkOut","출근 시각보다 늦어야 합니다.");}
  var previous=day(id,date);Object before=previous.checkIn()==null?null:raw(previous);
  jdbc.update("INSERT INTO attendance(employee_id,work_date,check_in,check_out,corrected) VALUES(?,?,?,?,true) ON DUPLICATE KEY UPDATE check_in=VALUES(check_in),check_out=VALUES(check_out),corrected=true",
   id,date,Timestamp.from(r.checkIn().toInstant()),r.checkOut()==null?null:Timestamp.from(r.checkOut().toInstant()));
  var after=day(id,date);audit.record("ATTENDANCE_CORRECT","EMPLOYEE",id,e.name,before,raw(after),Map.of("date",date,"reason",r.reason()));
  notifications.send(id,"ATTENDANCE_CORRECTED",null,date);return after;
 }
 private Object raw(AttendanceDay d){Map<String,Object> result=new LinkedHashMap<>();result.put("checkIn",d.checkIn());result.put("checkOut",d.checkOut());result.put("corrected",d.corrected());return result;}
 private void validateTime(OffsetDateTime t,LocalDate date,String field){
  if(!t.atZoneSameInstant(ZoneId.of("Asia/Seoul")).toLocalDate().equals(date)||t.getNano()!=0||t.toInstant().isAfter(clock.instant()))throw ApiException.invalid(field,"해당 서울 날짜의 미래가 아닌 초 단위 시각이어야 합니다.");
 }
 @Transactional(readOnly=true)
 public LocalDate firstDate(long id){return jdbc.queryForObject("SELECT MIN(work_date) FROM attendance WHERE employee_id=?",LocalDate.class,id);}
 @Transactional(readOnly=true)
 public AttendanceMonth month(long id,String month){
  if(!employees.existsById(id))throw ApiException.missing();YearMonth ym;
  try{if(!month.matches("[0-9]{4}-[0-9]{2}"))throw new IllegalArgumentException();ym=YearMonth.parse(month);}catch(Exception e){throw ApiException.invalid("month","YYYY-MM 형식이어야 합니다.");}
  return new AttendanceMonth(id,month,ym.atDay(1).datesUntil(ym.plusMonths(1).atDay(1)).filter(LeaveService::workday).map(d->day(id,d)).toList());
 }
 @Transactional(readOnly=true)
 public AttendanceDay today(long id){return day(id,today());}
 AttendanceDay day(long id,LocalDate date){
  var rows=jdbc.query("SELECT * FROM attendance WHERE employee_id=? AND work_date=?",(r,n)->new Raw(LeaveService.time(r.getTimestamp("check_in")),LeaveService.time(r.getTimestamp("check_out")),r.getBoolean("corrected")),id,date);
  Raw r=rows.isEmpty()?new Raw(null,null,false):rows.get(0);
  var leaves=LeaveService.workday(date)?jdbc.query("SELECT id,type FROM leave_request WHERE employee_id=? AND status='APPROVED' AND start_date<=? AND end_date>=? ORDER BY id",(s,n)->new DayLeave(s.getLong(1),LeaveType.valueOf(s.getString(2))),id,date,date):List.<DayLeave>of();
  boolean am=leaves.stream().anyMatch(l->l.type()==LeaveType.HALF_AM),pm=leaves.stream().anyMatch(l->l.type()==LeaveType.HALF_PM);
  boolean full=am&&pm||leaves.stream().anyMatch(l->l.type()==LeaveType.ANNUAL||l.type()==LeaveType.SICK);
  LocalTime start=LocalTime.of(am?14:9,0),end=LocalTime.of(pm?14:18,0);
  boolean late=!full&&r.in!=null&&r.in.toLocalTime().isAfter(start),early=!full&&r.out!=null&&r.out.toLocalTime().isBefore(end);
  return new AttendanceDay(date,r.in,r.out,late,early,full?"LEAVE":r.in==null?"NO_RECORD":r.out==null?"INCOMPLETE":"COMPLETE",
   start.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")),end.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")),leaves,r.corrected);
 }
 record Raw(OffsetDateTime in,OffsetDateTime out,boolean corrected){}
}
