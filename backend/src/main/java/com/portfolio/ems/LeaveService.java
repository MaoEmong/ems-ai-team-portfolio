package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.sql.*;
import java.math.BigDecimal;
import java.util.*;
@Service @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
class LeaveService {
 private final JdbcTemplate jdbc;private final EmployeeRepository employees;private final AuditService audit;private final NotificationService notifications;private final Clock clock;private final ObjectMapper json;
 LeaveService(JdbcTemplate jdbc,EmployeeRepository employees,AuditService audit,NotificationService notifications,Clock clock,ObjectMapper json){
  this.jdbc=jdbc;this.employees=employees;this.audit=audit;this.notifications=notifications;this.clock=clock;this.json=json;
 }
 LocalDate today(){return LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul")));}
 Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS));}
 static void active(Employee e,LocalDate day){if(e.status!=EmployeeStatus.ACTIVE||e.hireDate.isAfter(day))throw ApiException.conflict("EMPLOYEE_NOT_ACTIVE");}
 Employee lock(long id){return employees.lockById(id).orElseThrow(ApiException::missing);}
 // Consistent order across leave, retirement and correction: employee, balance, request.
 private BalanceView lockBalance(Employee e){
  var p=LeavePolicy.calculate(e.hireDate,today());
  jdbc.update("INSERT IGNORE INTO leave_balance(employee_id,period_start,period_end,granted) VALUES(?,?,?,?)",e.id,p.start(),p.end(),p.granted());
  jdbc.queryForObject("SELECT employee_id FROM leave_balance WHERE employee_id=? FOR UPDATE",Long.class,e.id);
  BigDecimal used=total(e.id,p.start(),"APPROVED"),reserved=total(e.id,p.start(),"PENDING");
  jdbc.update("UPDATE leave_balance SET period_start=?,period_end=?,granted=?,used=?,reserved=? WHERE employee_id=?",p.start(),p.end(),p.granted(),used,reserved,e.id);
  boolean approver=jdbc.queryForObject("SELECT COUNT(*) FROM user_account WHERE enabled=true AND role='ADMIN' AND employee_id<>?",Long.class,e.id)>0;
  return new BalanceView(p.start(),p.end(),p.granted(),used,reserved,p.granted().subtract(used).subtract(reserved),approver);
 }
 private BigDecimal total(long id,LocalDate start,String status){return jdbc.queryForObject("SELECT COALESCE(SUM(charged),0) FROM leave_request WHERE employee_id=? AND period_start=? AND status=?",BigDecimal.class,id,start,status);}
 public BalanceView balance(long id){return lockBalance(lock(id));}
 public boolean hasRecords(long id){return jdbc.queryForObject("SELECT COUNT(*) FROM leave_request WHERE employee_id=?",Long.class,id)>0;}
 public LeaveView create(LeaveInput input,Dto.User user){
  Employee e=lock(user.id());active(e,today());BalanceView b=lockBalance(e);
  if(input.startDate().isBefore(today()))throw ApiException.invalid("startDate","오늘 이전일 수 없습니다.");
  if(input.endDate().isBefore(input.startDate()))throw ApiException.invalid("endDate","시작일 이전일 수 없습니다.");
  if(input.startDate().isBefore(b.periodStart())||input.endDate().isAfter(b.periodEnd()))throw new ApiException(400,"LEAVE_PERIOD_BOUNDARY","현재 산정 기간 안에서 신청하세요.");
  boolean half=input.type()==LeaveType.HALF_AM||input.type()==LeaveType.HALF_PM;
  if(half&&!input.startDate().equals(input.endDate()))throw ApiException.invalid("endDate","반차는 하루만 신청할 수 있습니다.");
  long count=input.startDate().datesUntil(input.endDate().plusDays(1)).filter(LeaveService::workday).count();
  if(count==0)throw ApiException.invalid("startDate","근무일이 있어야 합니다.");
  var others=jdbc.query("SELECT type,start_date,end_date FROM leave_request WHERE employee_id=? AND status IN ('PENDING','APPROVED') AND start_date<=? AND end_date>=?",
   (r,n)->new Overlap(LeaveType.valueOf(r.getString(1)),r.getObject(2,LocalDate.class),r.getObject(3,LocalDate.class)),e.id,input.endDate(),input.startDate());
  for(var other:others){
   LocalDate start=input.startDate().isAfter(other.start)?input.startDate():other.start;
   LocalDate end=input.endDate().isBefore(other.end)?input.endDate():other.end;
   if((mask(input.type())&mask(other.type))!=0&&start.datesUntil(end.plusDays(1)).anyMatch(LeaveService::workday))throw ApiException.conflict("LEAVE_OVERLAP");
  }
  BigDecimal days=half?new BigDecimal("0.5"):BigDecimal.valueOf(count),charged=input.type()==LeaveType.SICK?BigDecimal.ZERO:days;
  if(charged.compareTo(b.available())>0)throw ApiException.conflict("INSUFFICIENT_LEAVE_BALANCE");
  org.springframework.jdbc.support.GeneratedKeyHolder key=new org.springframework.jdbc.support.GeneratedKeyHolder();
  jdbc.update(c->{var s=c.prepareStatement("INSERT INTO leave_request(employee_id,type,start_date,end_date,days,charged,period_start,reason,status,created_at) VALUES(?,?,?,?,?,?,?,?,'PENDING',?)",Statement.RETURN_GENERATED_KEYS);
   s.setLong(1,e.id);s.setString(2,input.type().name());s.setObject(3,input.startDate());s.setObject(4,input.endDate());s.setBigDecimal(5,days);s.setBigDecimal(6,charged);s.setObject(7,b.periodStart());s.setString(8,input.reason());s.setTimestamp(9,now());return s;},key);
  long id=key.getKey().longValue();lockBalance(e);var after=getInternal(id,user);
  audit.record("LEAVE_REQUEST","LEAVE",id,e.name,null,snapshot(after),Map.of());notifications.admins(e.id,"LEAVE_REQUESTED",id);return after;
 }
 record Overlap(LeaveType type,LocalDate start,LocalDate end){}
 static boolean workday(LocalDate d){return d.getDayOfWeek().getValue()<=5;}
 static int mask(LeaveType t){return t==LeaveType.HALF_AM?1:t==LeaveType.HALF_PM?2:3;}
 public LeaveView process(long id,String action,String reason,Dto.User user){
  long owner=owner(id);Employee e=lock(owner);lockBalance(e);
  var before=getInternal(id,user);boolean self=owner==user.id();
  if(action.equals("CANCEL")){if(!self)throw new ApiException(403,"FORBIDDEN","본인 신청만 취소할 수 있습니다.");}
  else if(user.role()!=Role.ADMIN||self)throw new ApiException(403,"FORBIDDEN","본인 결재는 허용되지 않습니다.");
  if(action.equals("CANCEL")){
   if(before.status()!=LeaveStatus.PENDING&&before.status()!=LeaveStatus.APPROVED)throw ApiException.conflict("LEAVE_ALREADY_PROCESSED");
   if(before.status()==LeaveStatus.APPROVED&&!before.startDate().isAfter(today()))throw ApiException.conflict("LEAVE_START_PASSED");
   jdbc.update("UPDATE leave_request SET status='CANCELLED',cancelled_by='SELF' WHERE id=?",id);
  } else {
   if(before.status()!=LeaveStatus.PENDING)throw ApiException.conflict("LEAVE_ALREADY_PROCESSED");
   if(action.equals("APPROVE")&&before.startDate().isBefore(today()))throw ApiException.conflict("LEAVE_START_PASSED");
   jdbc.update("UPDATE leave_request SET status=?,reject_reason=?,decided_by=?,decided_name=?,decided_at=? WHERE id=?",
    action.equals("APPROVE")?"APPROVED":"REJECTED",reason,user.id(),user.name(),now(),id);
  }
  lockBalance(e);var after=getInternal(id,user);
  audit.record("LEAVE_"+action,"LEAVE",id,e.name,snapshot(before),snapshot(after),Map.of());
  if(action.equals("CANCEL"))notifications.admins(owner,"LEAVE_CANCELLED",id);
  else notifications.send(owner,action.equals("APPROVE")?"LEAVE_APPROVED":"LEAVE_REJECTED",id,null);
  return after;
 }
 public void retire(Employee e){
  lockBalance(e);
  var ids=jdbc.queryForList("SELECT id FROM leave_request WHERE employee_id=? AND (status='PENDING' OR (status='APPROVED' AND start_date>?)) ORDER BY id",Long.class,e.id,today());
  for(long id:ids){var before=getInternal(id,AuditService.current());
   jdbc.update("UPDATE leave_request SET status='CANCELLED',cancelled_by='SYSTEM' WHERE id=?",id);
   var after=getInternal(id,AuditService.current());audit.record("LEAVE_CANCEL","LEAVE",id,e.name,snapshot(before),snapshot(after),Map.of("system",true));
   notifications.admins(e.id,"LEAVE_CANCELLED",id);
  }lockBalance(e);
 }
 private Object snapshot(LeaveView v){Map<String,Object> m=json.convertValue(v,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});m.remove("allowedActions");return m;}
 long owner(long id){var ids=jdbc.queryForList("SELECT employee_id FROM leave_request WHERE id=?",Long.class,id);if(ids.isEmpty())throw ApiException.missing();return ids.get(0);}
 @Transactional(readOnly=true)
 public LeaveView get(long id,Dto.User user){long owner=owner(id);if(user.role()!=Role.ADMIN&&owner!=user.id())throw new ApiException(403,"FORBIDDEN","본인 신청만 조회할 수 있습니다.");return getInternal(id,user);}
 @Transactional(readOnly=true)
 public Dto.PageView<LeaveView> list(Long employeeId,LeaveStatus status,int page,int size,Dto.User user){
  AppointmentStore.validatePage(page,size);String where=" WHERE 1=1";List<Object> params=new ArrayList<>();
  if(employeeId!=null){where+=" AND employee_id=?";params.add(employeeId);}if(status!=null){where+=" AND status=?";params.add(status.name());}
  long total=jdbc.queryForObject("SELECT COUNT(*) FROM leave_request"+where,Long.class,params.toArray());params.add(size);params.add((long)page*size);
  var ids=jdbc.queryForList("SELECT id FROM leave_request"+where+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",Long.class,params.toArray());
  return new Dto.PageView<>(ids.stream().map(id->getInternal(id,user)).toList(),page,size,total,(int)((total+size-1)/size));
 }
 LeaveView getInternal(long id,Dto.User user){
  return jdbc.queryForObject("SELECT l.*,e.employee_no,e.name FROM leave_request l JOIN employee e ON e.id=l.employee_id WHERE l.id=?",(r,n)->{
   long owner=r.getLong("employee_id");LeaveStatus status=LeaveStatus.valueOf(r.getString("status"));LocalDate start=r.getObject("start_date",LocalDate.class);
   List<String> actions=new ArrayList<>();
   if(user!=null){boolean self=owner==user.id();
    if(status==LeaveStatus.PENDING){if(self)actions.add("CANCEL");else if(!self&&user.role()==Role.ADMIN){if(!start.isBefore(today()))actions.add("APPROVE");actions.add("REJECT");}}
    else if(status==LeaveStatus.APPROVED&&self&&start.isAfter(today()))actions.add("CANCEL");
   }
   Long decider=r.getObject("decided_by",Long.class);
   return new LeaveView(id,new LeaveEmployee(owner,r.getString("employee_no"),r.getString("name")),LeaveType.valueOf(r.getString("type")),start,r.getObject("end_date",LocalDate.class),
    r.getBigDecimal("days"),r.getString("reason"),status,r.getString("reject_reason"),decider==null?null:new LeaveDecider(decider,r.getString("decided_name")),
    time(r.getTimestamp("decided_at")),r.getString("cancelled_by"),time(r.getTimestamp("created_at")),actions);
  },id);
 }
 static OffsetDateTime time(Timestamp t){return t==null?null:t.toInstant().atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime();}
}
