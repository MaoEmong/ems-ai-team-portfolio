package com.portfolio.ems;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.LocalDate;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Component @ConditionalOnProperty(name="ems.seed.enabled",havingValue="true",matchIfMissing=true)
class DemoSeeder implements ApplicationRunner {
 private final EmployeeRepository employees; private final DepartmentRepository departments;
 private final PositionRepository positions; private final PasswordEncoder passwords;
 private final String adminId; private final String adminPassword;
 DemoSeeder(EmployeeRepository e,DepartmentRepository d,PositionRepository p,PasswordEncoder passwords,
  @Value("${ems.seed.admin-login-id}") String adminId,@Value("${ems.seed.admin-password}") String adminPassword) {
  employees=e; departments=d; positions=p; this.passwords=passwords; this.adminId=adminId; this.adminPassword=adminPassword;
 }
 @Override @Transactional
 public void run(ApplicationArguments args) {
  if(adminId.isBlank()||adminId.length()>50||adminId.matches("DEMO[0-9]{3}")||adminPassword.isBlank()||adminPassword.getBytes(StandardCharsets.UTF_8).length>72)
   throw new IllegalArgumentException("Invalid seed admin configuration (DEMO### IDs are reserved)");
  if(employees.count()>0) return; // Do not recreate deleted demo data or reset credentials on restart.
  var ds=departments.findAll(); var ps=positions.findAll();
  seed(adminId,"가상관리자","admin@example.invalid",Role.ADMIN,passwords.encode(adminPassword),ds.get(0),ps.get(0),0);
  String unusableDemoHash=passwords.encode(UUID.randomUUID().toString());
  for(int i=1;i<=30;i++) seed("DEMO%03d".formatted(i),"가상사원%03d".formatted(i),
   "demo%03d@example.invalid".formatted(i),Role.EMPLOYEE,unusableDemoHash,ds.get((i-1)%ds.size()),ps.get((i-1)%ps.size()),i);
  employees.flush();
 }
 private void seed(String no,String name,String email,Role role,String hash,Department d,Position p,int index) {
  Employee e=new Employee(); e.employeeNo=no; e.name=name; e.email=email; e.phone="000-0000-%04d".formatted(index);
  e.hireDate=LocalDate.of(2026,1,1).plusDays(index); e.status=index%7==0&&index>0?EmployeeStatus.ON_LEAVE:EmployeeStatus.ACTIVE;
  e.department=d; e.position=p;
  Account a=new Account(); a.employee=e; a.role=role; a.enabled=true; a.passwordHash=hash; e.account=a;
  employees.save(e);
 }
}
