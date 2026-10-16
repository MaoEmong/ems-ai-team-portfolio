package com.portfolio.ems;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.util.*;
@Component
class Phase3bDemoSeeder{
 private final EmployeeRepository employees;private final DepartmentRepository departments;private final JobTitleRepository titles;private final PayrollService payroll;private final EvaluationDemoSeeder evaluations;private final Clock clock;
 Phase3bDemoSeeder(EmployeeRepository employees,DepartmentRepository departments,JobTitleRepository titles,PayrollService payroll,EvaluationDemoSeeder evaluations,Clock clock){this.employees=employees;this.departments=departments;this.titles=titles;this.payroll=payroll;this.evaluations=evaluations;this.clock=clock;}
 @Transactional(propagation=Propagation.MANDATORY)
 public void seed(){
  var ds=departments.findAll();if(ds.size()>1)ds.get(1).parent=ds.get(0);
  JobTitle team=new JobTitle();team.name="가상팀장";team.description="빈 DB 합성 직책";titles.save(team);
  JobTitle part=new JobTitle();part.name="가상파트장";part.description="빈 DB 합성 직책";titles.saveAndFlush(part);
  for(String no:List.of("DEMO001","DEMO002","DEMO003"))employees.findByEmployeeNo(no).ifPresent(e->e.jobTitle=no.equals("DEMO003")?part:team);
  employees.flush();
  var people=employees.findAll();
  for(var e:people)payroll.saveSetting(e.id,new SalaryInput(3000000L+(e.id%5)*100000,100000L));
  var admin=people.stream().filter(e->e.account.role==Role.ADMIN&&e.account.enabled&&e.status==EmployeeStatus.ACTIVE).min(java.util.Comparator.comparing(e->e.id)).orElseThrow();
  String month=YearMonth.now(clock).minusMonths(1).toString();var user=Dto.user(admin.account);
  payroll.generate(month,user);payroll.confirm(month,user);evaluations.seed();
 }
}
