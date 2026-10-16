package com.portfolio.ems;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import org.flywaydb.core.Flyway;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.sql.DriverManager;
import static org.assertj.core.api.Assertions.*;
@Tag("mysql") @Testcontainers
class MigrationUpgradeTest {
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 @Test void existingV1DataSurvivesV2AndNewTablesAreAvailable() throws Exception {
  var v1=Flyway.configure().dataSource(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword()).target("1").load();
  v1.migrate();
  try(var c=DriverManager.getConnection(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword());var s=c.createStatement()) {
   s.executeUpdate("INSERT INTO employee(employee_no,name,email,hire_date,status,department_id,position_id) VALUES('UPGRADE','합성업그레이드','upgrade@example.invalid','2026-01-01','ACTIVE',1,1)");
   s.executeUpdate("INSERT INTO user_account(employee_id,password_hash,role,enabled) VALUES(1,'test-only-hash','EMPLOYEE',true)");
  }
  var latest=Flyway.configure().dataSource(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword()).load();
  assertThat(latest.migrate().migrationsExecuted).isEqualTo(1);latest.validate();
  try(var c=DriverManager.getConnection(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword());var s=c.createStatement()) {
   try(var r=s.executeQuery("SELECT employee_no FROM employee WHERE id=1")){assertThat(r.next()).isTrue();assertThat(r.getString(1)).isEqualTo("UPGRADE");}
   try(var r=s.executeQuery("SELECT COUNT(*) FROM appointment")){r.next();assertThat(r.getLong(1)).isZero();}
   try(var r=s.executeQuery("SELECT COUNT(*) FROM audit_log")){r.next();assertThat(r.getLong(1)).isZero();}
   try(var r=s.executeQuery("SELECT COUNT(*) FROM user_account")){r.next();assertThat(r.getLong(1)).isEqualTo(1);}
  }
 }
}
