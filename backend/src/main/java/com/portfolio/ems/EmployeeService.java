package com.portfolio.ems;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import jakarta.persistence.criteria.Predicate;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service @Transactional
class EmployeeService {
 private final EmployeeRepository employees; private final DepartmentRepository departments;
 private final PositionRepository positions; private final PasswordEncoder passwords;
 private final AppointmentStore appointments; private final AuditService audit; private final LeaveService leaves;private final AttendanceService attendance;
 EmployeeService(EmployeeRepository e,DepartmentRepository d,PositionRepository p,PasswordEncoder passwords,AppointmentStore appointments,AuditService audit,LeaveService leaves,AttendanceService attendance) {
  employees=e; departments=d; positions=p; this.passwords=passwords; this.appointments=appointments;this.audit=audit;this.leaves=leaves;this.attendance=attendance;
 }
 @Transactional(readOnly=true)
 public Dto.PageView<Dto.EmployeeView> list(String keyword,Long departmentId,Long positionId,EmployeeStatus status,int page,int size,String sort) {
  if(page<0) throw ApiException.invalid("page","0 이상이어야 합니다.");
  if(size<1||size>100) throw ApiException.invalid("size","1~100이어야 합니다.");
  String[] parts=sort.split(",",-1);
  if(parts.length!=2||!Set.of("employeeNo","name","hireDate").contains(parts[0])||!Set.of("asc","desc").contains(parts[1]))
   throw ApiException.invalid("sort","employeeNo/name/hireDate,asc/desc 형식이어야 합니다.");
  Specification<Employee> spec=(root,q,cb)->{
   List<Predicate> predicates=new ArrayList<>();
   predicates.add(status==null?cb.notEqual(root.get("status"),EmployeeStatus.RETIRED):cb.equal(root.get("status"),status));
   if(departmentId!=null) predicates.add(cb.equal(root.get("department").get("id"),departmentId));
   if(positionId!=null) predicates.add(cb.equal(root.get("position").get("id"),positionId));
   if(keyword!=null&&!keyword.isBlank()) {
    String like="%"+keyword.toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
    predicates.add(cb.or(cb.like(cb.lower(root.get("employeeNo")),like,'\\'),cb.like(cb.lower(root.get("name")),like,'\\'),cb.like(cb.lower(root.get("email")),like,'\\')));
   }
   return cb.and(predicates.toArray(Predicate[]::new));
  };
  Page<Employee> result=employees.findAll(spec,PageRequest.of(page,size,Sort.by(Sort.Direction.fromString(parts[1]),parts[0]).and(Sort.by("id"))));
  return new Dto.PageView<>(result.getContent().stream().map(Dto::employee).toList(),page,size,result.getTotalElements(),result.getTotalPages());
 }
 @Transactional(readOnly=true)
 public Dto.EmployeeView get(Long id,Dto.User user) {
  if(user.role()!=Role.ADMIN&&!id.equals(user.id())) throw new ApiException(403,"FORBIDDEN","본인 정보만 조회할 수 있습니다.");
  return Dto.employee(employees.findById(id).orElseThrow(ApiException::missing));
 }
 public Dto.EmployeeView create(Dto.CreateEmployee r) {
  return createInternal(r,Map.of());
 }
 public Dto.EmployeeView createImported(Dto.CreateEmployee r) {
  return createInternal(r,Map.of("source","IMPORT"));
 }
 private Dto.EmployeeView createInternal(Dto.CreateEmployee r,Map<String,String> metadata) {
  if(employees.existsByEmployeeNo(r.employeeNo())) throw ApiException.conflict("DUPLICATE_EMPLOYEE_NO");
  duplicateEmail(r.email(),-1L);
  if(r.initialPassword().getBytes(StandardCharsets.UTF_8).length>72) throw ApiException.invalid("initialPassword","UTF-8 72바이트 이하여야 합니다.");
  Employee e=new Employee(); e.employeeNo=r.employeeNo(); e.name=r.name(); e.email=r.email(); e.phone=r.phone();
  e.hireDate=r.hireDate(); e.status=EmployeeStatus.ACTIVE;
  e.department=departments.lockById(r.departmentId()).orElseThrow(ApiException::missing);
  e.position=positions.lockById(r.positionId()).orElseThrow(ApiException::missing);
  Account a=new Account(); a.employee=e; a.role=r.role(); a.enabled=true; a.passwordHash=passwords.encode(r.initialPassword()); e.account=a;
  Dto.EmployeeView result=Dto.employee(employees.saveAndFlush(e));
  audit.record("EMPLOYEE_CREATE","EMPLOYEE",e.id,e.name,null,result,metadata);
  return result;
 }
 public Dto.EmployeeView update(Long id,Dto.UpdateEmployee r) {
  Employee e=employees.lockById(id).orElseThrow(ApiException::missing); requireActive(e);
  if(r.jobTitleId()!=null&&(e.jobTitle==null||!r.jobTitleId().equals(e.jobTitle.id)))throw ApiException.conflict("APPOINTMENT_REQUIRED");
  if(r.status()==EmployeeStatus.RETIRED) throw ApiException.invalid("status","퇴사 처리 API를 사용하세요.");
  if((r.departmentId()!=null&&!r.departmentId().equals(e.department.id))||(r.positionId()!=null&&!r.positionId().equals(e.position.id)))
   throw ApiException.conflict("APPOINTMENT_REQUIRED");
  if(!e.hireDate.equals(r.hireDate())&&leaves.hasRecords(id))throw ApiException.conflict("LEAVE_RECORDS_EXIST");
  var firstAttendance=attendance.firstDate(id);
  if(firstAttendance!=null&&r.hireDate().isAfter(firstAttendance))throw ApiException.invalid("hireDate","첫 근태 기록 이후일 수 없습니다.");
  var first=appointments.firstDate(id);
  if(first!=null&&r.hireDate().isAfter(first))throw ApiException.invalid("hireDate","최초 발령일 이후일 수 없습니다.");
  var before=Dto.employee(e);
  duplicateEmail(r.email(),id);
  e.name=r.name(); e.email=r.email(); e.phone=r.phone(); e.hireDate=r.hireDate(); e.status=r.status();
  e.account.role=r.role();
  employees.flush();
  var result=Dto.employee(e);audit.record("EMPLOYEE_UPDATE","EMPLOYEE",e.id,e.name,before,result,Map.of());return result;
 }
 public Dto.EmployeeView retire(Long id,Dto.Retire r) {
  Employee e=employees.lockById(id).orElseThrow(ApiException::missing); requireActive(e);
  if(r.retireDate().isBefore(e.hireDate)) throw ApiException.invalid("retireDate","입사일 이전일 수 없습니다.");
  var last=appointments.lastDate(id);
  if(last!=null&&r.retireDate().isBefore(last))throw ApiException.invalid("retireDate","마지막 발령일 이전일 수 없습니다.");
  var before=Dto.employee(e);
  leaves.retire(e);
  e.status=EmployeeStatus.RETIRED; e.retireDate=r.retireDate(); e.account.enabled=false;e.jobTitle=null;
  employees.flush();var result=Dto.employee(e);
  audit.record("EMPLOYEE_RETIRE","EMPLOYEE",e.id,e.name,before,result,Map.of());return result;
 }
 private void duplicateEmail(String email,Long id) {
  if(employees.existsByEmailAndIdNot(email,id)) throw ApiException.conflict("DUPLICATE_EMAIL");
 }
 private void requireActive(Employee e) {
  if(e.status==EmployeeStatus.RETIRED) throw ApiException.conflict("EMPLOYEE_RETIRED");
 }
}
