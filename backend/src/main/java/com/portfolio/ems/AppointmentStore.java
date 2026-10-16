package com.portfolio.ems;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.*;
import org.springframework.stereotype.Repository;
import java.sql.*;
import java.time.*;
import java.util.*;
@Repository
class AppointmentStore {
 private final JdbcTemplate jdbc;
 AppointmentStore(JdbcTemplate jdbc) { this.jdbc=jdbc; }
 LocalDate firstDate(Long id) { return jdbc.queryForObject("SELECT MIN(effective_date) FROM appointment WHERE employee_id=?",LocalDate.class,id); }
 LocalDate lastDate(Long id) { return jdbc.queryForObject("SELECT MAX(effective_date) FROM appointment WHERE employee_id=?",LocalDate.class,id); }
 boolean departmentInUse(Long id) { return jdbc.queryForObject("SELECT COUNT(*) FROM appointment WHERE from_department_id=? OR to_department_id=?",Long.class,id,id)>0; }
 boolean positionInUse(Long id) { return jdbc.queryForObject("SELECT COUNT(*) FROM appointment WHERE from_position_id=? OR to_position_id=?",Long.class,id,id)>0; }
 long insert(Employee e,Department toDepartment,Position toPosition,JobTitle toTitle,AppointmentInput input,Dto.User user,Instant now) {
  KeyHolder key=new GeneratedKeyHolder();
  jdbc.update(connection->{
   var s=connection.prepareStatement("INSERT INTO appointment(employee_id,effective_date,from_department_id,from_department_name,to_department_id,to_department_name,from_position_id,from_position_name,from_position_level,to_position_id,to_position_name,to_position_level,reason,created_by_id,created_by_name,created_at,from_job_title_id,from_job_title_name,to_job_title_id,to_job_title_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",Statement.RETURN_GENERATED_KEYS);
   Object[] values={e.id,input.effectiveDate(),e.department.id,e.department.name,toDepartment.id,toDepartment.name,
    e.position.id,e.position.name,e.position.level,toPosition.id,toPosition.name,toPosition.level,input.reason(),user.id(),user.name(),Timestamp.from(now),e.jobTitle==null?null:e.jobTitle.id,e.jobTitle==null?null:e.jobTitle.name,toTitle==null?null:toTitle.id,toTitle==null?null:toTitle.name};
   for(int i=0;i<values.length;i++)s.setObject(i+1,values[i]);return s;
  },key);
  return key.getKey().longValue();
 }
 AppointmentView get(long id) { return jdbc.queryForObject("SELECT * FROM appointment WHERE id=?",this::map,id); }
 Dto.PageView<AppointmentView> list(Long id,int page,int size) {
  validatePage(page,size);
  long total=jdbc.queryForObject("SELECT COUNT(*) FROM appointment WHERE employee_id=?",Long.class,id);
  var rows=jdbc.query("SELECT * FROM appointment WHERE employee_id=? ORDER BY effective_date DESC,id DESC LIMIT ? OFFSET ?",this::map,id,size,(long)page*size);
  return new Dto.PageView<>(rows,page,size,total,(int)((total+size-1)/size));
 }
 static void validatePage(int page,int size) {
  if(page<0)throw ApiException.invalid("page","0 이상이어야 합니다.");
  if(size<1||size>100)throw ApiException.invalid("size","1~100이어야 합니다.");
 }
 private AppointmentView map(ResultSet r,int n) throws SQLException {
  return new AppointmentView(r.getLong("id"),r.getLong("employee_id"),r.getObject("effective_date",LocalDate.class),
   new Dto.DepartmentRef(r.getLong("from_department_id"),r.getString("from_department_name")),
   new Dto.DepartmentRef(r.getLong("to_department_id"),r.getString("to_department_name")),
   new Dto.PositionView(r.getLong("from_position_id"),r.getString("from_position_name"),r.getInt("from_position_level")),
   new Dto.PositionView(r.getLong("to_position_id"),r.getString("to_position_name"),r.getInt("to_position_level")),
   r.getString("reason"),new Creator(r.getLong("created_by_id"),r.getString("created_by_name")),
   r.getTimestamp("created_at").toInstant().atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime(),r.getObject("from_job_title_id",Long.class)==null?null:new Dto.JobTitleRef(r.getLong("from_job_title_id"),r.getString("from_job_title_name")),r.getObject("to_job_title_id",Long.class)==null?null:new Dto.JobTitleRef(r.getLong("to_job_title_id"),r.getString("to_job_title_name")));
 }
}
