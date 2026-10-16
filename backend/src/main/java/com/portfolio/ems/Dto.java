package com.portfolio.ems;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;
final class Dto {
 record Login(@NotBlank @Size(max=50) String loginId,@NotBlank String password) {}
 record User(Long id,String employeeNo,String name,Role role) {}
 record LoginResult(String accessToken,String tokenType,long expiresIn,User user) {}
 record DepartmentView(Long id,String name,String description) {}
 record DepartmentRef(Long id,String name) {}
 record PositionView(Long id,String name,Integer level) {}
 record DepartmentInput(@NotBlank @Size(max=100) String name,@Size(max=500) String description) {}
 record PositionInput(@NotBlank @Size(max=100) String name,@NotNull Integer level) {}
 record CreateEmployee(@NotBlank @Size(max=50) String employeeNo,
  @NotBlank @Size(max=100) String name,@NotBlank @Email @Size(max=254) String email,
  @Size(max=30) String phone,@NotNull LocalDate hireDate,
  @NotNull @Positive Long departmentId,@NotNull @Positive Long positionId,
  @NotNull Role role,@NotBlank String initialPassword) {}
 record UpdateEmployee(@NotBlank @Size(max=100) String name,
  @NotBlank @Email @Size(max=254) String email,@Size(max=30) String phone,
  @NotNull LocalDate hireDate,@NotNull EmployeeStatus status,
  @Positive Long departmentId,@Positive Long positionId,@NotNull Role role) {}
 record Retire(@NotNull LocalDate retireDate) {}
 record EmployeeView(Long id,String employeeNo,String name,String email,String phone,
  LocalDate hireDate,EmployeeStatus status,LocalDate retireDate,DepartmentRef department,
  PositionView position,Role role) {}
 record PageView<T>(List<T> content,int page,int size,long totalElements,int totalPages) {}
 static User user(Account a) { return new User(a.employee.id,a.employee.employeeNo,a.employee.name,a.role); }
 static DepartmentView department(Department d) { return new DepartmentView(d.id,d.name,d.description); }
 static PositionView position(Position p) { return new PositionView(p.id,p.name,p.level); }
 static EmployeeView employee(Employee e) {
  return new EmployeeView(e.id,e.employeeNo,e.name,e.email,e.phone,e.hireDate,e.status,e.retireDate,
   new DepartmentRef(e.department.id,e.department.name),position(e.position),e.account.role);
 }
}
