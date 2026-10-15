package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.Sort;
import java.util.List;

@Service @Transactional
class CatalogService {
 private final DepartmentRepository departments; private final PositionRepository positions; private final EmployeeRepository employees;
 CatalogService(DepartmentRepository d,PositionRepository p,EmployeeRepository e) { departments=d; positions=p; employees=e; }
 @Transactional(readOnly=true)
 public List<Dto.DepartmentView> departments() { return departments.findAll(Sort.by("name","id")).stream().map(Dto::department).toList(); }
 @Transactional(readOnly=true)
 public List<Dto.PositionView> positions() { return positions.findAll(Sort.by("level","id")).stream().map(Dto::position).toList(); }
 public Dto.DepartmentView saveDepartment(Long id,Dto.DepartmentInput r) {
  Department d=id==null?new Department():departments.lockById(id).orElseThrow(ApiException::missing);
  if(departments.existsByNameAndIdNot(r.name(),id==null?-1L:id)) throw ApiException.conflict("DUPLICATE_NAME");
  d.name=r.name(); d.description=r.description(); return Dto.department(departments.saveAndFlush(d));
 }
 public Dto.PositionView savePosition(Long id,Dto.PositionInput r) {
  Position p=id==null?new Position():positions.lockById(id).orElseThrow(ApiException::missing);
  if(positions.existsByNameAndIdNot(r.name(),id==null?-1L:id)) throw ApiException.conflict("DUPLICATE_NAME");
  p.name=r.name(); p.level=r.level(); return Dto.position(positions.saveAndFlush(p));
 }
 public void deleteDepartment(Long id) {
  Department d=departments.lockById(id).orElseThrow(ApiException::missing);
  if(employees.existsByDepartmentId(id)) throw ApiException.conflict("DEPARTMENT_IN_USE");
  departments.delete(d); departments.flush();
 }
 public void deletePosition(Long id) {
  Position p=positions.lockById(id).orElseThrow(ApiException::missing);
  if(employees.existsByPositionId(id)) throw ApiException.conflict("POSITION_IN_USE");
  positions.delete(p); positions.flush();
 }
}
