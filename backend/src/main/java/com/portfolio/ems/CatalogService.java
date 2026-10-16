package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Sort;
import java.util.List;

@Service @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
class CatalogService {
 private final OrganizationService organization;
 private final DepartmentRepository departments; private final PositionRepository positions; private final EmployeeRepository employees;
 private final AppointmentStore appointments;private final AuditService audit;
 CatalogService(DepartmentRepository d,PositionRepository p,EmployeeRepository e,AppointmentStore appointments,AuditService audit,OrganizationService organization) {this.organization=organization; departments=d; positions=p; employees=e;this.appointments=appointments;this.audit=audit; }
 @Transactional(readOnly=true)
 public List<Dto.DepartmentView> departments() { return departments.findAll(Sort.by("name","id")).stream().map(Dto::department).toList(); }
 @Transactional(readOnly=true)
 public List<Dto.PositionView> positions() { return positions.findAll(Sort.by("level","id")).stream().map(Dto::position).toList(); }
 public Dto.DepartmentView saveDepartment(Long id,Dto.DepartmentInput r) {
  organization.lock();organization.validateParent(id,r.parentId());
  Department d=id==null?new Department():departments.lockById(id).orElseThrow(ApiException::missing);
  if(departments.existsByNameAndIdNot(r.name(),id==null?-1L:id)) throw ApiException.conflict("DUPLICATE_NAME");
  var before=id==null?null:Dto.department(d);
  d.name=r.name(); d.description=r.description();d.parent=r.parentId()==null?null:departments.findById(r.parentId()).orElseThrow(ApiException::missing); var result=Dto.department(departments.saveAndFlush(d));
  audit.record(id==null?"DEPARTMENT_CREATE":"DEPARTMENT_UPDATE","DEPARTMENT",d.id,d.name,before,result,java.util.Map.of());return result;
 }
 public Dto.PositionView savePosition(Long id,Dto.PositionInput r) {
  Position p=id==null?new Position():positions.lockById(id).orElseThrow(ApiException::missing);
  if(positions.existsByNameAndIdNot(r.name(),id==null?-1L:id)) throw ApiException.conflict("DUPLICATE_NAME");
  var before=id==null?null:Dto.position(p);
  p.name=r.name(); p.level=r.level(); var result=Dto.position(positions.saveAndFlush(p));
  audit.record(id==null?"POSITION_CREATE":"POSITION_UPDATE","POSITION",p.id,p.name,before,result,java.util.Map.of());return result;
 }
 public void deleteDepartment(Long id) {
  organization.lock();if(organization.hasChildren(id))throw ApiException.conflict("DEPARTMENT_HAS_CHILDREN");
  Department d=departments.lockById(id).orElseThrow(ApiException::missing);
  if(employees.existsByDepartmentId(id)||appointments.departmentInUse(id)) throw ApiException.conflict("DEPARTMENT_IN_USE");
  audit.record("DEPARTMENT_DELETE","DEPARTMENT",id,d.name,Dto.department(d),null,java.util.Map.of());
  departments.delete(d); departments.flush();
 }
 public void deletePosition(Long id) {
  Position p=positions.lockById(id).orElseThrow(ApiException::missing);
  if(employees.existsByPositionId(id)||appointments.positionInUse(id)) throw ApiException.conflict("POSITION_IN_USE");
  audit.record("POSITION_DELETE","POSITION",id,p.name,Dto.position(p),null,java.util.Map.of());
  positions.delete(p); positions.flush();
 }
}
