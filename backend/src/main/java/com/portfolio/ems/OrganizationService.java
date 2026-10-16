package com.portfolio.ems;
import jakarta.validation.constraints.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.domain.Sort;
import java.util.*;
record JobTitleInput(@NotBlank @Size(max=100) String name,@Size(max=500) String description){}
record JobTitleView(Long id,String name,String description){}
record OrgDepartment(Long id,String name,Long parentId){}
record OrgEmployee(Long id,String employeeNo,String name,Dto.DepartmentRef department,Dto.PositionView position,Dto.JobTitleRef jobTitle,boolean onLeave){}
@Service @Transactional(isolation=Isolation.READ_COMMITTED)
class OrganizationService {
 private final JdbcTemplate jdbc;private final EmployeeRepository employees;private final DepartmentRepository departments;private final JobTitleRepository titles;private final AuditService audit;
 OrganizationService(JdbcTemplate jdbc,EmployeeRepository employees,DepartmentRepository departments,JobTitleRepository titles,AuditService audit){this.jdbc=jdbc;this.employees=employees;this.departments=departments;this.titles=titles;this.audit=audit;}
 public void lock(){jdbc.queryForObject("SELECT id FROM organization_lock WHERE id=1 FOR UPDATE",Integer.class);}
 public void validateParent(Long id,Long parent){
  Long cursor=parent;Set<Long> seen=new HashSet<>();
  while(cursor!=null){
   if(cursor.equals(id)||!seen.add(cursor))throw ApiException.conflict("DEPARTMENT_CYCLE");
   var rows=jdbc.query("SELECT parent_id FROM department WHERE id=?",(r,n)->r.getObject(1,Long.class),cursor);
   if(rows.isEmpty())throw ApiException.missing();cursor=rows.get(0);
  }
 }
 public boolean hasChildren(long id){return jdbc.queryForObject("SELECT COUNT(*) FROM department WHERE parent_id=?",Long.class,id)>0;}
 @Transactional(readOnly=true) public Map<String,Object> organization(){
  var ds=departments.findAll(Sort.by("name","id")).stream().map(d->new OrgDepartment(d.id,d.name,d.parent==null?null:d.parent.id)).toList();
  var es=employees.findAll(Sort.by("employeeNo","id")).stream().filter(e->e.status!=EmployeeStatus.RETIRED).map(e->new OrgEmployee(e.id,e.employeeNo,e.name,new Dto.DepartmentRef(e.department.id,e.department.name),Dto.position(e.position),e.jobTitle==null?null:new Dto.JobTitleRef(e.jobTitle.id,e.jobTitle.name),e.status==EmployeeStatus.ON_LEAVE)).toList();
  return Map.of("departments",ds,"employees",es);
 }
 @Transactional(readOnly=true) public List<JobTitleView> titles(){return titles.findAll(Sort.by("name","id")).stream().map(this::view).toList();}
 public JobTitleView save(Long id,JobTitleInput input){
  JobTitle t=id==null?new JobTitle():titles.lockById(id).orElseThrow(ApiException::missing);
  if(titles.existsByNameAndIdNot(input.name(),id==null?-1L:id))throw ApiException.conflict("DUPLICATE_NAME");
  var before=id==null?null:view(t);t.name=input.name();t.description=input.description();titles.saveAndFlush(t);
  var after=view(t);audit.record(id==null?"JOB_TITLE_CREATE":"JOB_TITLE_UPDATE","JOB_TITLE",t.id,t.name,before,after,Map.of());return after;
 }
 public void delete(Long id){
  var t=titles.lockById(id).orElseThrow(ApiException::missing);
  if(jdbc.queryForObject("SELECT COUNT(*) FROM employee WHERE job_title_id=?",Long.class,id)>0||jdbc.queryForObject("SELECT COUNT(*) FROM appointment WHERE from_job_title_id=? OR to_job_title_id=?",Long.class,id,id)>0)throw ApiException.conflict("JOB_TITLE_IN_USE");
  audit.record("JOB_TITLE_DELETE","JOB_TITLE",id,t.name,view(t),null,Map.of());titles.delete(t);titles.flush();
 }
 private JobTitleView view(JobTitle t){return new JobTitleView(t.id,t.name,t.description);}
}
