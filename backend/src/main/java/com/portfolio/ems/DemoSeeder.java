package com.portfolio.ems;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
@Component @ConditionalOnProperty(name="ems.seed.enabled",havingValue="true",matchIfMissing=true)
class DemoSeeder implements ApplicationRunner {
 private final EmployeeRepository employees;private final DepartmentRepository departments;private final PositionRepository positions;private final PasswordEncoder passwords;
 private final Phase3bDemoSeeder phase3b;
 private final String adminId,adminPassword,demoPassword;private final Clock clock;private final JdbcTemplate jdbc;
 DemoSeeder(EmployeeRepository e,DepartmentRepository d,PositionRepository p,PasswordEncoder passwords,
 @Value("${ems.seed.admin-login-id}") String adminId,@Value("${ems.seed.admin-password}") String adminPassword,
 @Value("${ems.seed.demo-admin-password:}") String demoPassword,Clock clock,JdbcTemplate jdbc,Phase3bDemoSeeder phase3b){this.phase3b=phase3b;
 employees=e;departments=d;positions=p;this.passwords=passwords;this.adminId=adminId;this.adminPassword=adminPassword;this.demoPassword=demoPassword;this.clock=clock;this.jdbc=jdbc;
 }
 @Override @Transactional public void run(ApplicationArguments args){
  if(adminId.isBlank()||adminId.length()>50||adminId.matches("DEMO[0-9]{3}")||adminPassword.isBlank()||adminPassword.getBytes(StandardCharsets.UTF_8).length>72
   ||demoPassword.getBytes(StandardCharsets.UTF_8).length>72||(!demoPassword.isEmpty()&&demoPassword.isBlank()))throw new IllegalArgumentException("Invalid seed configuration");
  // Persistent marker and employee count prevent reseeding an existing workspace.
  int inserted=jdbc.update("INSERT IGNORE INTO demo_seed_marker(id,seeded_at) VALUES(1,?)",java.sql.Timestamp.from(clock.instant()));
  if(inserted==0||employees.count()>0)return;
  var ds=departments.findAll();var ps=positions.findAll();LocalDate today=LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul")));
  seed(adminId,"가상관리자","admin@example.invalid",Role.ADMIN,passwords.encode(adminPassword),ds.get(0),ps.get(0),0,today);
  String randomHash=passwords.encode(UUID.randomUUID().toString());
  for(int i=1;i<=30;i++)seed("DEMO%03d".formatted(i),"가상사원%03d".formatted(i),"demo%03d@example.invalid".formatted(i),
   i==1?Role.ADMIN:Role.EMPLOYEE,i==1&&!demoPassword.isEmpty()?passwords.encode(demoPassword):randomHash,
   ds.get((i-1)%ds.size()),ps.get((i-1)%ps.size()),i,today);
  employees.flush();phase3b.seed();
 }
 private void seed(String no,String name,String email,Role role,String hash,Department d,Position p,int i,LocalDate today){
  Employee e=new Employee();e.employeeNo=no;e.name=name;e.email=email;e.phone="000-0000-%04d".formatted(i);
  e.hireDate=i<=3?today.minusYears(i==0?3:i):i>=26?today.minusYears(3):today.withDayOfMonth(1).minusMonths((i-4)%12);
  e.status=i>=26?EmployeeStatus.RETIRED:i>0&&i%7==0?EmployeeStatus.ON_LEAVE:EmployeeStatus.ACTIVE;
  if(i>=26)e.retireDate=today.withDayOfMonth(1).minusMonths(i-26);
  e.department=d;e.position=p;Account a=new Account();a.employee=e;a.role=role;a.enabled=e.status!=EmployeeStatus.RETIRED;a.passwordHash=hash;e.account=a;employees.save(e);
 }
}
