package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.sql.*;
import java.util.*;
@Service @Transactional
class NotificationService {
 private final JdbcTemplate jdbc; private final Clock clock;
 NotificationService(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
 @Transactional(propagation=Propagation.MANDATORY)
 public void send(long recipient,String type,Long targetId,LocalDate date) {
  String message=switch(type){case "LEAVE_REQUESTED"->"휴가 신청이 도착했습니다.";case "LEAVE_APPROVED"->"휴가가 승인되었습니다.";
   case "LEAVE_REJECTED"->"휴가가 반려되었습니다.";case "LEAVE_CANCELLED"->"휴가가 취소되었습니다.";default->"근태 기록이 정정되었습니다.";};
  jdbc.update("INSERT INTO notification(recipient_id,type,target_type,target_id,target_date,message,created_at) VALUES(?,?,?,?,?,?,?)",
   recipient,type,date==null?"LEAVE":"ATTENDANCE",targetId,date,message,Timestamp.from(clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS)));
 }
 @Transactional(propagation=Propagation.MANDATORY)
 public void admins(long applicant,String type,long leaveId) {
  jdbc.queryForList("SELECT employee_id FROM user_account WHERE enabled=true AND role='ADMIN' AND employee_id<>?",Long.class,applicant)
   .forEach(id->send(id,type,leaveId,null));
 }
 @Transactional(readOnly=true)
 public long unread(long user){return jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE recipient_id=? AND is_read=false",Long.class,user);}
 @Transactional(readOnly=true)
 public Dto.PageView<NotificationView> list(long user,boolean unread,int page,int size) {
  AppointmentStore.validatePage(page,size);String where=" WHERE recipient_id=?"+(unread?" AND is_read=false":"");
  long total=jdbc.queryForObject("SELECT COUNT(*) FROM notification"+where,Long.class,user);
  var rows=jdbc.query("SELECT * FROM notification"+where+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",(r,n)->new NotificationView(
   r.getLong("id"),r.getString("type"),r.getString("target_type"),r.getObject("target_id",Long.class),
   r.getObject("target_date",LocalDate.class),r.getString("message"),r.getBoolean("is_read"),
   r.getTimestamp("created_at").toInstant().atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime()),user,size,(long)page*size);
  return new Dto.PageView<>(rows,page,size,total,(int)((total+size-1)/size));
 }
 public void read(long id,long user) {
  if(jdbc.queryForObject("SELECT COUNT(*) FROM notification WHERE id=? AND recipient_id=?",Long.class,id,user)==0)throw ApiException.missing();
  jdbc.update("UPDATE notification SET is_read=true WHERE id=? AND recipient_id=?",id,user);
 }
 public int readAll(long user,long upToId){return jdbc.update("UPDATE notification SET is_read=true WHERE recipient_id=? AND id<=? AND is_read=false",user,upToId);}
}
