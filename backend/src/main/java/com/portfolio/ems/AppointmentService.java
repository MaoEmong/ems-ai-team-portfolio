package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.Map;
@Service @Transactional
class AppointmentService {
 private final JobTitleRepository titles;
 private final EmployeeRepository employees; private final DepartmentRepository departments;private final PositionRepository positions;
 private final AppointmentStore store;private final AuditService audit;private final Clock clock;
 AppointmentService(EmployeeRepository e,DepartmentRepository d,PositionRepository p,AppointmentStore store,AuditService audit,Clock clock,JobTitleRepository titles) {this.titles=titles;
  employees=e;departments=d;positions=p;this.store=store;this.audit=audit;this.clock=clock;
 }
 public AppointmentView create(Long id,AppointmentInput input) {
  Employee e=employees.lockById(id).orElseThrow(ApiException::missing);
  if(e.status==EmployeeStatus.RETIRED)throw ApiException.conflict("EMPLOYEE_RETIRED");
  LocalDate last=store.lastDate(id);
  if(input.effectiveDate().isBefore(e.hireDate)||input.effectiveDate().isAfter(LocalDate.now(clock))||(last!=null&&input.effectiveDate().isBefore(last)))
   throw ApiException.invalid("effectiveDate","입사일·마지막 발령일 이상이고 오늘 이하여야 합니다.");
  JobTitle title=input.changeJobTitle()?(input.jobTitleId()==null?null:titles.lockById(input.jobTitleId()).orElseThrow(ApiException::missing)):e.jobTitle;
  if(e.department.id.equals(input.departmentId())&&e.position.id.equals(input.positionId())&&java.util.Objects.equals(e.jobTitle==null?null:e.jobTitle.id,title==null?null:title.id))
   throw ApiException.invalid("departmentId","부서 또는 직급을 변경해야 합니다.");
  Department d=departments.lockById(input.departmentId()).orElseThrow(ApiException::missing);
  Position p=positions.lockById(input.positionId()).orElseThrow(ApiException::missing);
  Dto.EmployeeView before=Dto.employee(e);
  long appointmentId=store.insert(e,d,p,title,input,AuditService.current(),clock.instant());
  e.department=d;e.position=p;e.jobTitle=title;employees.flush();
  audit.record("APPOINTMENT_CREATE","EMPLOYEE",id,e.name,before,Dto.employee(e),Map.of("appointmentId",appointmentId));
  return store.get(appointmentId);
 }
 @Transactional(readOnly=true)
 public Dto.PageView<AppointmentView> list(Long id,Dto.User user,int page,int size) {
  if(user.role()!=Role.ADMIN&&!user.id().equals(id))throw new ApiException(403,"FORBIDDEN","본인 이력만 조회할 수 있습니다.");
  if(!employees.existsById(id))throw ApiException.missing();
  return store.list(id,page,size);
 }
}
