package com.portfolio.ems;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.*;
import java.util.Map;
@RestController @RequestMapping("/api/v1")
class Phase3Controller {
 private final AttendanceService attendance;private final LeaveService leaves;private final NotificationService notifications;
 Phase3Controller(AttendanceService attendance,LeaveService leaves,NotificationService notifications){this.attendance=attendance;this.leaves=leaves;this.notifications=notifications;}
 @PostMapping("/attendance/me/check-in") AttendanceDay in(@AuthenticationPrincipal Dto.User u){return attendance.check(u.id(),true);}
 @PostMapping("/attendance/me/check-out") AttendanceDay out(@AuthenticationPrincipal Dto.User u){return attendance.check(u.id(),false);}
 @GetMapping("/attendance/me/today") AttendanceDay today(@AuthenticationPrincipal Dto.User u){return attendance.today(u.id());}
 @GetMapping("/attendance/me") AttendanceMonth ownMonth(@AuthenticationPrincipal Dto.User u,@RequestParam String month){return attendance.month(u.id(),month);}
 @GetMapping("/attendance") @PreAuthorize("hasRole('ADMIN')") AttendanceMonth month(@RequestParam Long employeeId,@RequestParam String month){return attendance.month(employeeId,month);}
 @PutMapping("/attendance/{employeeId}/{date}") @PreAuthorize("hasRole('ADMIN')")
 AttendanceDay correct(@PathVariable Long employeeId,@PathVariable @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate date,@Valid @RequestBody CorrectionInput r){return attendance.correct(employeeId,date,r);}
 @PostMapping("/leaves") ResponseEntity<LeaveView> create(@AuthenticationPrincipal Dto.User u,@Valid @RequestBody LeaveInput r){return ResponseEntity.status(201).body(leaves.create(r,u));}
 @GetMapping("/leaves/me") Dto.PageView<LeaveView> mine(@AuthenticationPrincipal Dto.User u,@RequestParam(required=false) LeaveStatus status,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return leaves.list(u.id(),status,page,size,u);}
 @GetMapping("/leaves") @PreAuthorize("hasRole('ADMIN')")
 Dto.PageView<LeaveView> list(@AuthenticationPrincipal Dto.User u,@RequestParam(required=false) Long employeeId,@RequestParam(required=false) LeaveStatus status,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return leaves.list(employeeId,status,page,size,u);}
 @GetMapping("/leaves/{id}") LeaveView get(@PathVariable Long id,@AuthenticationPrincipal Dto.User u){return leaves.get(id,u);}
 @GetMapping("/leaves/me/balance") BalanceView balance(@AuthenticationPrincipal Dto.User u){return leaves.balance(u.id());}
 @GetMapping("/employees/{id}/leave-balance") @PreAuthorize("hasRole('ADMIN')") BalanceView balance(@PathVariable Long id){return leaves.balance(id);}
 @PostMapping("/leaves/{id}/approve") @PreAuthorize("hasRole('ADMIN')")
 LeaveView approve(@PathVariable Long id,@AuthenticationPrincipal Dto.User u){return leaves.process(id,"APPROVE",null,u);}
 @PostMapping("/leaves/{id}/reject") @PreAuthorize("hasRole('ADMIN')")
 LeaveView reject(@PathVariable Long id,@AuthenticationPrincipal Dto.User u,@Valid @RequestBody RejectInput r){return leaves.process(id,"REJECT",r.reason(),u);}
 @PostMapping("/leaves/{id}/cancel") LeaveView cancel(@PathVariable Long id,@AuthenticationPrincipal Dto.User u){return leaves.process(id,"CANCEL",null,u);}
 @GetMapping("/notifications/me") Dto.PageView<NotificationView> notifications(@AuthenticationPrincipal Dto.User u,@RequestParam(defaultValue="false") boolean unreadOnly,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return notifications.list(u.id(),unreadOnly,page,size);}
 @GetMapping("/notifications/me/unread-count") Map<String,Long> unread(@AuthenticationPrincipal Dto.User u){return Map.of("count",notifications.unread(u.id()));}
 @PostMapping("/notifications/{id}/read") ResponseEntity<Void> read(@PathVariable Long id,@AuthenticationPrincipal Dto.User u){notifications.read(id,u.id());return ResponseEntity.noContent().build();}
 @PostMapping("/notifications/me/read-all") Map<String,Integer> readAll(@AuthenticationPrincipal Dto.User u,@Valid @RequestBody ReadAllInput r){return Map.of("updatedCount",notifications.readAll(u.id(),r.upToId()));}
}
