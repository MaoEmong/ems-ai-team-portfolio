package com.portfolio.ems;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.List;

@RestController @RequestMapping("/api/v1")
class ApiController {
 private final AuthService auth; private final EmployeeService employees; private final CatalogService catalogs;
 ApiController(AuthService a,EmployeeService e,CatalogService c) { auth=a; employees=e; catalogs=c; }
 @PostMapping("/auth/login") Dto.LoginResult login(@Valid @RequestBody Dto.Login r) { return auth.login(r); }
 @GetMapping("/auth/me") Dto.User me(@AuthenticationPrincipal Dto.User u) { return u; }
 @GetMapping("/employees") @PreAuthorize("hasRole('ADMIN')")
 Dto.PageView<Dto.EmployeeView> employees(@RequestParam(required=false) String keyword,
  @RequestParam(required=false) Long departmentId,@RequestParam(required=false) Long positionId,
  @RequestParam(required=false) EmployeeStatus status,@RequestParam(defaultValue="0") int page,
  @RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="employeeNo,asc") String sort) {
  return employees.list(keyword,departmentId,positionId,status,page,size,sort);
 }
 @GetMapping("/employees/{id}") Dto.EmployeeView employee(@PathVariable Long id,@AuthenticationPrincipal Dto.User u) { return employees.get(id,u); }
 @PostMapping("/employees") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<Dto.EmployeeView> create(@Valid @RequestBody Dto.CreateEmployee r) {
  var result=employees.create(r); return ResponseEntity.created(URI.create("/api/v1/employees/"+result.id())).body(result);
 }
 @PutMapping("/employees/{id}") @PreAuthorize("hasRole('ADMIN')")
 Dto.EmployeeView update(@PathVariable Long id,@Valid @RequestBody Dto.UpdateEmployee r) { return employees.update(id,r); }
 @PostMapping("/employees/{id}/retire") @PreAuthorize("hasRole('ADMIN')")
 Dto.EmployeeView retire(@PathVariable Long id,@Valid @RequestBody Dto.Retire r) { return employees.retire(id,r); }
 @GetMapping("/departments") List<Dto.DepartmentView> departments() { return catalogs.departments(); }
 @PostMapping("/departments") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<Dto.DepartmentView> department(@Valid @RequestBody Dto.DepartmentInput r) {
  var result=catalogs.saveDepartment(null,r); return ResponseEntity.created(URI.create("/api/v1/departments/"+result.id())).body(result);
 }
 @PutMapping("/departments/{id}") @PreAuthorize("hasRole('ADMIN')")
 Dto.DepartmentView department(@PathVariable Long id,@Valid @RequestBody Dto.DepartmentInput r) { return catalogs.saveDepartment(id,r); }
 @DeleteMapping("/departments/{id}") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<Void> deleteDepartment(@PathVariable Long id) { catalogs.deleteDepartment(id); return ResponseEntity.noContent().build(); }
 @GetMapping("/positions") List<Dto.PositionView> positions() { return catalogs.positions(); }
 @PostMapping("/positions") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<Dto.PositionView> position(@Valid @RequestBody Dto.PositionInput r) {
  var result=catalogs.savePosition(null,r); return ResponseEntity.created(URI.create("/api/v1/positions/"+result.id())).body(result);
 }
 @PutMapping("/positions/{id}") @PreAuthorize("hasRole('ADMIN')")
 Dto.PositionView position(@PathVariable Long id,@Valid @RequestBody Dto.PositionInput r) { return catalogs.savePosition(id,r); }
 @DeleteMapping("/positions/{id}") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<Void> deletePosition(@PathVariable Long id) { catalogs.deletePosition(id); return ResponseEntity.noContent().build(); }
}
