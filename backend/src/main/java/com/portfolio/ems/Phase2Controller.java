package com.portfolio.ems;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.*;
import java.util.Map;
import java.net.URI;
@RestController @RequestMapping("/api/v1")
class Phase2Controller {
 private final AppointmentService appointments;private final DashboardService dashboard;private final FileService files;private final AuditService audit;private final Clock clock;
 Phase2Controller(AppointmentService appointments,DashboardService dashboard,FileService files,AuditService audit,Clock clock) {
  this.appointments=appointments;this.dashboard=dashboard;this.files=files;this.audit=audit;this.clock=clock;
 }
 @GetMapping("/dashboard") @PreAuthorize("hasRole('ADMIN')")
 Map<String,Object> dashboard() {return dashboard.get();}
 @PostMapping("/employees/{id}/appointments") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<AppointmentView> create(@PathVariable Long id,@Valid @RequestBody AppointmentInput body) {
  var result=appointments.create(id,body);
  return ResponseEntity.status(201).body(result);
 }
 @GetMapping("/employees/{id}/appointments")
 Dto.PageView<AppointmentView> list(@PathVariable Long id,@AuthenticationPrincipal Dto.User user,
  @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
  return appointments.list(id,user,page,size);
 }
 @GetMapping("/employees/export") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<byte[]> export(@RequestParam(required=false) String format,@RequestParam(required=false) String keyword,
  @RequestParam(required=false) Long departmentId,@RequestParam(required=false) Long positionId,
  @RequestParam(required=false) EmployeeStatus status,@RequestParam(defaultValue="employeeNo,asc") String sort) {
  byte[] bytes=files.export(format,keyword,departmentId,positionId,status,sort);
  String name="ems-employees-"+LocalDate.now(clock).format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)+"."+format;
  return download(bytes,name,format.equals("csv")?"text/csv;charset=UTF-8":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 }
 @GetMapping("/employees/import-template") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<byte[]> template() {
  return download(files.template(),"ems-employees-import-template.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 }
 @PostMapping(value="/employees/import",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<ImportResult> upload(@RequestParam("file") MultipartFile file) {return ResponseEntity.status(201).body(files.importFile(file));}
 @GetMapping("/audit-logs") @PreAuthorize("hasRole('ADMIN')")
 Dto.PageView<AuditView> audit(@RequestParam(required=false) Long actorId,@RequestParam(required=false) String targetType,
  @RequestParam(required=false) Long targetId,@RequestParam(required=false) String action,@RequestParam(required=false) Boolean success,
  @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
  @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
  @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
  return audit.list(actorId,targetType,targetId,action,success,from,to,page,size);
 }
 private ResponseEntity<byte[]> download(byte[] bytes,String filename,String type) {
  return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename*=UTF-8''"+filename)
   .contentType(MediaType.parseMediaType(type)).body(bytes);
 }
}
