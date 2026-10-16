package com.portfolio.ems;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Tag;
import org.flywaydb.core.Flyway;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.sql.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
@Tag("mysql") @Testcontainers
class MigrationUpgradeTest{
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 Flyway version(String target){var config=Flyway.configure().dataSource(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword());if(target!=null)config.target(target);return config.load();}
 @Test void existingV1V2V3RowsSurviveV4WithoutReseed()throws Exception{
  version("1").migrate();
  try(var c=connection();var s=c.createStatement()){
   s.executeUpdate("INSERT INTO employee(employee_no,name,email,hire_date,status,department_id,position_id) VALUES('UPGRADE','합성업그레이드','upgrade@example.invalid','2026-01-01','ACTIVE',1,1)");
   s.executeUpdate("INSERT INTO user_account(employee_id,password_hash,role,enabled) VALUES(1,'test-only-hash','EMPLOYEE',true)");
  }
  assertThat(version("2").migrate().migrationsExecuted).isEqualTo(1);
  try(var c=connection();var s=c.createStatement()){
   s.executeUpdate("INSERT INTO appointment(employee_id,effective_date,from_department_id,from_department_name,to_department_id,to_department_name,from_position_id,from_position_name,from_position_level,to_position_id,to_position_name,to_position_level,reason,created_by_id,created_by_name,created_at) VALUES(1,'2026-01-02',1,'가상',1,'가상',1,'직급',1,1,'직급',1,'합성',1,'합성','2026-01-02 09:00:00')");
   s.executeUpdate("INSERT INTO audit_log(occurred_at,action,target_type,target_id,success,metadata_json) VALUES('2026-01-02 09:00:00','APPOINTMENT_CREATE','EMPLOYEE',1,true,'{}')");
  }
  assertThat(version("3").migrate().migrationsExecuted).isEqualTo(1);
  try(var c=connection();var s=c.createStatement()){
   s.executeUpdate("INSERT INTO attendance(employee_id,work_date,check_in) VALUES(1,'2026-01-02','2026-01-02 09:00:00')");
   s.executeUpdate("INSERT INTO leave_balance(employee_id,period_start,period_end,granted,used,reserved) VALUES(1,'2026-01-01','2026-12-31',5,0,1)");
   s.executeUpdate("INSERT INTO leave_request(employee_id,type,start_date,end_date,days,charged,period_start,reason,status,created_at) VALUES(1,'ANNUAL','2026-10-19','2026-10-19',1,1,'2026-01-01','합성','PENDING','2026-10-16 09:00:00')");
   s.executeUpdate("INSERT INTO notification(recipient_id,type,target_type,target_id,message,created_at) VALUES(1,'LEAVE_APPROVED','LEAVE',1,'합성알림','2026-10-16 09:00:00')");
   s.executeUpdate("INSERT INTO demo_seed_marker(id,seeded_at) VALUES(1,'2026-01-01 09:00:00')");
  }
  var tables=List.of("department","job_position","employee","user_account","appointment","audit_log","attendance","leave_balance","leave_request","notification","demo_seed_marker");
  Map<String,List<String>> columns=new LinkedHashMap<>();Map<String,Object> before=new LinkedHashMap<>();
  for(String table:tables){columns.put(table,columns(table));before.put(table,snapshot(table,columns.get(table)));}
  var latest=version(null);assertThat(latest.migrate().migrationsExecuted).isEqualTo(1);latest.validate();
  for(String table:tables)assertThat(snapshot(table,columns.get(table))).as(table+" V3 columns and IDs preserved").isEqualTo(before.get(table));
  try(var c=connection();var s=c.createStatement()){
   for(String table:List.of("job_title","salary_setting","payroll_month","payslip","evaluation_cycle","evaluation_form"))try(var r=s.executeQuery("SELECT COUNT(*) FROM "+table)){r.next();assertThat(r.getLong(1)).as(table+" no automatic seed").isZero();}
  }
 }
 Connection connection()throws SQLException{return DriverManager.getConnection(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword());}
 List<String> columns(String table)throws SQLException{
  try(var c=connection();var s=c.createStatement();var r=s.executeQuery("SELECT * FROM "+table+" LIMIT 0")){
   var md=r.getMetaData();var names=new ArrayList<String>();for(int n=1;n<=md.getColumnCount();n++)names.add(md.getColumnName(n));return names;
  }
 }
 List<List<String>> snapshot(String table,List<String> columns)throws SQLException{
  String select=columns.stream().map(n->"\u0060"+n+"\u0060").collect(java.util.stream.Collectors.joining(","));
  try(var c=connection();var s=c.createStatement();var r=s.executeQuery("SELECT "+select+" FROM "+table+" ORDER BY 1,2")){
   List<List<String>> rows=new ArrayList<>();while(r.next()){var row=new ArrayList<String>();for(int n=1;n<=columns.size();n++)row.add(r.getString(n));rows.add(row);}return rows;
  }
 }
}
