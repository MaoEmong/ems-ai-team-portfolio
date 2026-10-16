package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.*;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.*;
import java.sql.*;
import java.math.*;
import java.util.*;
import jakarta.validation.constraints.*;
record SalaryInput(@NotNull @Min(0) @Max(1000000000) @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StrictMoney.class) Long baseSalary,@NotNull @Min(0) @Max(1000000000) @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using=StrictMoney.class) Long allowance){}
record PayrollInput(@NotBlank String month){}
final class PayrollFormula{
 static final String VERSION="DEMO_V1",NOTICE="포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님";
 static final List<Integer> RATES=List.of(450,350,300);
 static Map<String,Object> calculate(long base,long allowance){
  if(base<0||allowance<0||base>1000000000L||allowance>1000000000L)throw ApiException.invalid("baseSalary","급여 범위를 확인하세요.");
  long gross=base+allowance,total=0;List<Map<String,Object>> deductions=new ArrayList<>();
  for(int i=0;i<RATES.size();i++){int rate=RATES.get(i);long amount=BigDecimal.valueOf(gross).multiply(BigDecimal.valueOf(rate)).divide(BigDecimal.valueOf(10000),0,RoundingMode.HALF_UP).longValueExact();total+=amount;
   deductions.add(Map.of("name","데모 공제 "+(i+1),"rateBps",rate,"amount",amount));}
  return Map.of("baseSalary",base,"allowance",allowance,"grossPay",gross,"deductions",deductions,"totalDeductions",total,"netPay",gross-total,"formulaVersion",VERSION,"demoNotice",NOTICE);
 }
}
@Service @Transactional(isolation=Isolation.READ_COMMITTED)
class PayrollService{
 private final JdbcTemplate jdbc;private final ObjectMapper json;private final Clock clock;private final AuditService audit;private final EmployeeRepository employees;
 PayrollService(JdbcTemplate jdbc,ObjectMapper json,Clock clock,AuditService audit,EmployeeRepository employees){this.jdbc=jdbc;this.json=json;this.clock=clock;this.audit=audit;this.employees=employees;}
 private YearMonth month(String value){
  try{if(value==null||!value.matches("[0-9]{4}-[0-9]{2}"))throw new IllegalArgumentException();var m=YearMonth.parse(value);if(m.isBefore(YearMonth.of(1900,1))||m.isAfter(YearMonth.now(clock)))throw new IllegalArgumentException();return m;}
  catch(Exception e){throw ApiException.invalid("month","1900-01부터 현재 월까지 YYYY-MM 형식이어야 합니다.");}
 }
 private Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS));}
 private Object person(Dto.User user){return Map.of("id",user.id(),"name",user.name());}
 private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Payroll serialization failed");}}
 private Map<String,Object> decode(String value){try{return json.readValue(value,new TypeReference<LinkedHashMap<String,Object>>(){});}catch(Exception e){throw new IllegalStateException("Payroll snapshot invalid");}}
 private void lock(String month){
  String key=jdbc.queryForObject("SELECT CONCAT(DATABASE(),':ems-payroll:',?)",String.class,month);
  Integer acquired=jdbc.queryForObject("SELECT GET_LOCK(?,0)",Integer.class,key);
  if(!Integer.valueOf(1).equals(acquired))throw ApiException.conflict("PAYROLL_BUSY");
  Connection connection=jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Connection>)c->c);
  TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
   @Override public void afterCompletion(int status){try(var s=connection.prepareStatement("SELECT RELEASE_LOCK(?)")){s.setString(1,key);s.execute();}catch(SQLException e){try{connection.abort(Runnable::run);}catch(SQLException ignored){}}}
  });
  jdbc.queryForList("SELECT id FROM payroll_month WHERE pay_month=? FOR UPDATE",Long.class,month);
 }
 public Map<String,Object> setting(long id){
  if(!employees.existsById(id))throw ApiException.missing();
  var rows=jdbc.query("SELECT * FROM salary_setting WHERE employee_id=?",(r,n)->Map.<String,Object>of("employeeId",id,"baseSalary",r.getLong("base_salary"),"allowance",r.getLong("allowance"),"formulaVersion",r.getString("formula_version"),"deductionRates",List.of(r.getInt("rate1"),r.getInt("rate2"),r.getInt("rate3"))),id);
  if(rows.isEmpty())throw ApiException.missing();return rows.get(0);
 }
 public Map<String,Object> saveSetting(long id,SalaryInput input){
  employees.lockById(id).orElseThrow(ApiException::missing);
  PayrollFormula.calculate(input.baseSalary(),input.allowance());
  jdbc.update("INSERT INTO salary_setting(employee_id,base_salary,allowance,formula_version,rate1,rate2,rate3) VALUES(?,?,?,'DEMO_V1',450,350,300) ON DUPLICATE KEY UPDATE base_salary=VALUES(base_salary),allowance=VALUES(allowance)",id,input.baseSalary(),input.allowance());
  audit.record("SALARY_SETTING_UPDATE","SALARY_SETTING",id,null,null,null,Map.of("employeeId",id));return setting(id);
 }
 public Map<String,Object> generate(String value,Dto.User user){
  var m=month(value);lock(value);
  if(jdbc.queryForObject("SELECT COUNT(*) FROM payroll_month WHERE pay_month=?",Long.class,value)>0)throw ApiException.conflict("PAYROLL_ALREADY_EXISTS");
  var targets=targets(m);
  jdbc.update("INSERT INTO payroll_month(pay_month,status,generated_at,generated_by) VALUES(?,'DRAFT',?,?)",value,now(),encode(person(user)));
  long id=jdbc.queryForObject("SELECT id FROM payroll_month WHERE pay_month=?",Long.class,value);
  writeSlips(id,targets);audit.record("PAYROLL_GENERATE","PAYROLL",id,value,null,Map.of("status","DRAFT"),Map.of("month",value,"count",targets.size()));
  return view(value);
 }
 public Map<String,Object> recalculate(String value,Dto.User user){
  var m=month(value);lock(value);var before=view(value);
  if(before.get("status").equals("CONFIRMED"))throw ApiException.conflict("PAYROLL_CONFIRMED");
  var targets=targets(m);long id=id(value);
  jdbc.update("DELETE FROM payslip WHERE payroll_id=?",id);
  jdbc.update("UPDATE payroll_month SET generated_at=?,generated_by=? WHERE id=?",now(),encode(person(user)),id);
  writeSlips(id,targets);audit.record("PAYROLL_RECALCULATE","PAYROLL",id,value,Map.of("status","DRAFT"),Map.of("status","DRAFT"),Map.of("month",value,"count",targets.size()));return view(value);
 }
 public Map<String,Object> confirm(String value,Dto.User user){
  month(value);lock(value);var before=view(value);
  if(before.get("status").equals("CONFIRMED"))throw ApiException.conflict("PAYROLL_CONFIRMED");
  long id=id(value);jdbc.update("UPDATE payroll_month SET status='CONFIRMED',confirmed_at=?,confirmed_by=? WHERE id=?",now(),encode(person(user)),id);
  audit.record("PAYROLL_CONFIRM","PAYROLL",id,value,Map.of("status","DRAFT"),Map.of("status","CONFIRMED"),Map.of("month",value,"count",before.get("count")));return view(value);
 }
 private long id(String value){var ids=jdbc.queryForList("SELECT id FROM payroll_month WHERE pay_month=?",Long.class,value);if(ids.isEmpty())throw ApiException.missing();return ids.get(0);}
 private List<Map<String,Object>> targets(YearMonth month){
  var ids=jdbc.queryForList("SELECT id FROM employee WHERE hire_date<=? AND (retire_date IS NULL OR retire_date>=?) ORDER BY employee_no,id",Long.class,month.atEndOfMonth(),month.atDay(1));
  if(ids.isEmpty())throw ApiException.invalid("month","대상 사원이 없습니다.");
  List<Map<String,Object>> result=new ArrayList<>();
  for(long id:ids){
   var e=employees.findById(id).orElseThrow(ApiException::missing);
   Map<String,Object> salary;
   try{salary=setting(id);}catch(ApiException error){if(error.status==404)throw ApiException.conflict("SALARY_SETTING_MISSING");throw error;}
   var snapshot=new LinkedHashMap<String,Object>(PayrollFormula.calculate(((Number)salary.get("baseSalary")).longValue(),((Number)salary.get("allowance")).longValue()));
   snapshot.put("employee",Map.of("id",id,"employeeNo",e.employeeNo,"name",e.name));snapshot.put("department",new Dto.DepartmentRef(e.department.id,e.department.name));snapshot.put("position",Dto.position(e.position));snapshot.put("jobTitle",e.jobTitle==null?null:new Dto.JobTitleRef(e.jobTitle.id,e.jobTitle.name));result.add(snapshot);
  }return result;
 }
 private void writeSlips(long payrollId,List<Map<String,Object>> values){
  for(var v:values){@SuppressWarnings("unchecked") var employee=(Map<String,Object>)v.get("employee");jdbc.update("INSERT INTO payslip(payroll_id,employee_id,employee_no,snapshot_json) VALUES(?,?,?,?)",payrollId,employee.get("id"),employee.get("employeeNo"),encode(v));}
 }
 @Transactional(readOnly=true) public Map<String,Object> view(String value){
  month(value);var rows=jdbc.query("SELECT p.*,(SELECT COUNT(*) FROM payslip s WHERE s.payroll_id=p.id) cnt FROM payroll_month p WHERE pay_month=?",(r,n)->{
   Map<String,Object> v=new LinkedHashMap<>();v.put("month",value);String status=r.getString("status");v.put("status",status);v.put("count",r.getLong("cnt"));v.put("generatedAt",LeaveService.time(r.getTimestamp("generated_at")));v.put("generatedBy",decode(r.getString("generated_by")));v.put("confirmedAt",LeaveService.time(r.getTimestamp("confirmed_at")));v.put("confirmedBy",r.getString("confirmed_by")==null?null:decode(r.getString("confirmed_by")));v.put("allowedActions",status.equals("DRAFT")?List.of("RECALCULATE","CONFIRM"):List.of());return v;},value);
  if(rows.isEmpty())throw ApiException.missing();return rows.get(0);
 }
 @Transactional(readOnly=true) public Map<String,Object> detail(String value){
  var payroll=view(value);var ids=jdbc.queryForList("SELECT id FROM payslip WHERE payroll_id=? ORDER BY employee_no,id",Long.class,id(value));
  return Map.of("payroll",payroll,"payslips",ids.stream().map(i->slip(i,null)).toList());
 }
 @Transactional(readOnly=true) public Map<String,Object> slip(long id,Dto.User user){
  var rows=jdbc.query("SELECT s.*,p.pay_month,p.status,p.generated_at,p.generated_by,p.confirmed_at,p.confirmed_by FROM payslip s JOIN payroll_month p ON p.id=s.payroll_id WHERE s.id=?",(r,n)->{
   if(user!=null&&user.role()!=Role.ADMIN&&(user.id()!=r.getLong("employee_id")||!r.getString("status").equals("CONFIRMED")))throw ApiException.missing();
   var v=decode(r.getString("snapshot_json"));v.put("id",id);v.put("month",r.getString("pay_month"));v.put("status",r.getString("status"));v.put("generatedAt",LeaveService.time(r.getTimestamp("generated_at")));v.put("generatedBy",decode(r.getString("generated_by")));v.put("confirmedAt",LeaveService.time(r.getTimestamp("confirmed_at")));v.put("confirmedBy",r.getString("confirmed_by")==null?null:decode(r.getString("confirmed_by")));return v;},id);
  if(rows.isEmpty())throw ApiException.missing();return rows.get(0);
 }
 @Transactional(readOnly=true) public Dto.PageView<Map<String,Object>> list(String value,String status,int page,int size){
  AppointmentStore.validatePage(page,size);if(value!=null)month(value);if(status!=null&&!Set.of("DRAFT","CONFIRMED").contains(status))throw ApiException.invalid("status","지원하지 않는 상태입니다.");
  String where=" WHERE 1=1";List<Object> params=new ArrayList<>();if(value!=null){where+=" AND pay_month=?";params.add(value);}if(status!=null){where+=" AND status=?";params.add(status);}
  long count=jdbc.queryForObject("SELECT COUNT(*) FROM payroll_month"+where,Long.class,params.toArray());params.add(size);params.add((long)page*size);
  var months=jdbc.queryForList("SELECT pay_month FROM payroll_month"+where+" ORDER BY pay_month DESC,id DESC LIMIT ? OFFSET ?",String.class,params.toArray());
  return new Dto.PageView<>(months.stream().map(this::view).toList(),page,size,count,(int)((count+size-1)/size));
 }
 @Transactional(readOnly=true) public Dto.PageView<Map<String,Object>> own(Dto.User user,String value,int page,int size){
  AppointmentStore.validatePage(page,size);if(value!=null)month(value);
  String where=" WHERE s.employee_id=? AND p.status='CONFIRMED'";List<Object> params=new ArrayList<>();params.add(user.id());if(value!=null){where+=" AND p.pay_month=?";params.add(value);}
  long count=jdbc.queryForObject("SELECT COUNT(*) FROM payslip s JOIN payroll_month p ON p.id=s.payroll_id"+where,Long.class,params.toArray());params.add(size);params.add((long)page*size);
  var ids=jdbc.queryForList("SELECT s.id FROM payslip s JOIN payroll_month p ON p.id=s.payroll_id"+where+" ORDER BY p.pay_month DESC,s.id DESC LIMIT ? OFFSET ?",Long.class,params.toArray());
  return new Dto.PageView<>(ids.stream().map(id->slip(id,user)).toList(),page,size,count,(int)((count+size-1)/size));
 }
}
