package com.portfolio.ems;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.security.core.context.SecurityContextHolder;
import java.sql.*;
import java.time.*;
import java.util.*;

@Service
class AuditService {
 static final Set<String> ACTIONS=Set.of("LOGIN_SUCCESS","LOGIN_FAILURE","EMPLOYEE_CREATE","EMPLOYEE_UPDATE","EMPLOYEE_RETIRE",
  "APPOINTMENT_CREATE","DEPARTMENT_CREATE","DEPARTMENT_UPDATE","DEPARTMENT_DELETE","POSITION_CREATE","POSITION_UPDATE","POSITION_DELETE",
  "EMPLOYEE_IMPORT","EMPLOYEE_EXPORT","ATTENDANCE_CORRECT","LEAVE_REQUEST","LEAVE_APPROVE","LEAVE_REJECT","LEAVE_CANCEL");
 private final JdbcTemplate jdbc; private final ObjectMapper json; private final Clock clock;
 AuditService(JdbcTemplate jdbc,ObjectMapper json,Clock clock) { this.jdbc=jdbc;this.json=json;this.clock=clock; }
 static Dto.User current() {
  var auth=SecurityContextHolder.getContext().getAuthentication();
  return auth!=null&&auth.getPrincipal() instanceof Dto.User u?u:null;
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public void record(String action,String type,Long id,String label,Object before,Object after,Map<String,?> metadata) {
  write(current(),action,type,id,label,true,before,after,metadata);
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public void loginSuccess(Dto.User user) { write(user,"LOGIN_SUCCESS",null,null,null,true,null,null,Map.of()); }
 @Transactional(propagation=Propagation.REQUIRES_NEW)
 public void loginFailure(Dto.User user,String reason) {
  write(user,"LOGIN_FAILURE",null,null,null,false,null,null,Map.of("reason",reason));
 }
 @Transactional(propagation=Propagation.REQUIRES_NEW)
 public void importFailure(String code,int count) {
  write(current(),"EMPLOYEE_IMPORT","EMPLOYEE",null,null,false,null,null,Map.of("code",code,"errorCount",count));
 }
 private void write(Dto.User user,String action,String type,Long id,String label,boolean success,Object before,Object after,Map<String,?> metadata) {
  if(!ACTIONS.contains(action)) throw new IllegalArgumentException("Unknown audit action");
  Set<String> allowed=switch(action) {
   case "ATTENDANCE_CORRECT" -> Set.of("date","reason");
   case "LEAVE_CANCEL" -> Set.of("system");
   case "LOGIN_FAILURE" -> Set.of("reason");
   case "EMPLOYEE_CREATE" -> Set.of("source");
   case "APPOINTMENT_CREATE" -> Set.of("appointmentId");
   case "EMPLOYEE_IMPORT" -> Set.of("importedCount","code","errorCount");
   case "EMPLOYEE_EXPORT" -> Set.of("format","rowCount","filters");
   default -> Set.of();
  };
  if(!allowed.containsAll(metadata.keySet())) throw new IllegalArgumentException("Unexpected audit metadata");
  AuditActor actor=user==null?null:new AuditActor(user.id(),user.employeeNo(),user.name());
  jdbc.update("INSERT INTO audit_log(occurred_at,actor_id,actor_snapshot,action,target_type,target_id,target_label,success,before_json,after_json,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
   Timestamp.from(clock.instant()),user==null?null:user.id(),encode(actor),action,type,id,label,success,encode(before),encode(after),encode(metadata));
 }
 private String encode(Object o) {
  if(o==null) return null;
  try { return json.writeValueAsString(o); } catch(Exception e) { throw new IllegalStateException("Audit serialization failed"); }
 }
 private <T>T decode(String value,Class<T> type) {
  if(value==null) return null;
  try { return json.readValue(value,type); } catch(Exception e) { throw new IllegalStateException("Audit data invalid"); }
 }
 @Transactional(readOnly=true)
 public Dto.PageView<AuditView> list(Long actorId,String targetType,Long targetId,String action,Boolean success,
  OffsetDateTime from,OffsetDateTime to,int page,int size) {
  AppointmentStore.validatePage(page,size);
  if(from!=null&&to!=null&&from.isAfter(to)) throw ApiException.invalid("from","종료 시각 이후일 수 없습니다.");
  if(action!=null&&!ACTIONS.contains(action)) throw ApiException.invalid("action","지원하지 않는 행위입니다.");
  if(targetType!=null&&!Set.of("EMPLOYEE","DEPARTMENT","POSITION","LEAVE").contains(targetType)) throw ApiException.invalid("targetType","지원하지 않는 대상입니다.");
  StringBuilder where=new StringBuilder(" WHERE 1=1"); List<Object> params=new ArrayList<>();
  append(where,params,"actor_id",actorId); append(where,params,"target_type",targetType); append(where,params,"target_id",targetId);
  append(where,params,"action",action); append(where,params,"success",success);
  if(from!=null) { where.append(" AND occurred_at>=?");params.add(Timestamp.from(from.toInstant())); }
  if(to!=null) { where.append(" AND occurred_at<?");params.add(Timestamp.from(to.toInstant())); }
  long total=jdbc.queryForObject("SELECT COUNT(*) FROM audit_log"+where,Long.class,params.toArray());
  params.add(size);params.add((long)page*size);
  var rows=jdbc.query("SELECT * FROM audit_log"+where+" ORDER BY occurred_at DESC,id DESC LIMIT ? OFFSET ?",(r,n)->new AuditView(
   r.getLong("id"),r.getTimestamp("occurred_at").toInstant().atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime(),
   decode(r.getString("actor_snapshot"),AuditActor.class),r.getString("action"),r.getString("target_type"),
   r.getObject("target_id",Long.class),r.getString("target_label"),r.getBoolean("success"),
   decode(r.getString("before_json"),Object.class),decode(r.getString("after_json"),Object.class),
   decode(r.getString("metadata_json"),Object.class)),params.toArray());
  return new Dto.PageView<>(rows,page,size,total,(int)((total+size-1)/size));
 }
 private void append(StringBuilder where,List<Object> params,String field,Object value) {
  if(value!=null) { where.append(" AND ").append(field).append("=?");params.add(value); }
 }
}
