package com.portfolio.ems;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.LocalDate;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
@ExtendWith(MockitoExtension.class)
class EmployeeServiceTest {
 @Mock EmployeeRepository employees; @Mock DepartmentRepository departments;
 @Mock PositionRepository positions; @Mock PasswordEncoder passwords;
 @InjectMocks EmployeeService service;
 Employee employee;
 @BeforeEach void setup() {
  employee=new Employee(); employee.id=1L; employee.employeeNo="TEST"; employee.name="가상사원";
  employee.hireDate=LocalDate.of(2026,1,1); employee.status=EmployeeStatus.ACTIVE;
  employee.department=new Department(); employee.department.id=1L;
  employee.position=new Position(); employee.position.id=1L;
  employee.account=new Account(); employee.account.role=Role.EMPLOYEE; employee.account.enabled=true;
 }
 @Test void retirementDisablesAccountAndPreservesIdentity() {
  when(employees.lockById(1L)).thenReturn(Optional.of(employee));
  var result=service.retire(1L,new Dto.Retire(LocalDate.of(2026,10,16)));
  assertThat(result.status()).isEqualTo(EmployeeStatus.RETIRED);
  assertThat(employee.account.enabled).isFalse(); assertThat(result.employeeNo()).isEqualTo("TEST");
  verify(employees).flush(); verify(employees,never()).delete(any(Employee.class));
 }
 @Test void retirementBeforeHireFailsWithoutChangingAccount() {
  when(employees.lockById(1L)).thenReturn(Optional.of(employee));
  assertThatThrownBy(()->service.retire(1L,new Dto.Retire(LocalDate.of(2025,1,1))))
   .isInstanceOfSatisfying(ApiException.class,e->{assertThat(e.status).isEqualTo(400);assertThat(e.fields.get(0).field()).isEqualTo("retireDate");});
  assertThat(employee.account.enabled).isTrue(); verify(employees,never()).flush();
 }
 @Test void repeatedRetirementIsStateConflict() {
  employee.status=EmployeeStatus.RETIRED; when(employees.lockById(1L)).thenReturn(Optional.of(employee));
  assertThatThrownBy(()->service.retire(1L,new Dto.Retire(LocalDate.now())))
   .isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("EMPLOYEE_RETIRED"));
 }
 @Test void otherEmployeeIsDeniedBeforeLookup() {
  assertThatThrownBy(()->service.get(2L,new Dto.User(1L,"TEST","가상사원",Role.EMPLOYEE)))
   .isInstanceOfSatisfying(ApiException.class,e->assertThat(e.status).isEqualTo(403));
  verifyNoInteractions(employees);
 }
 @Test void unsupportedSortIsRejected() {
  assertThatThrownBy(()->service.list(null,null,null,null,0,20,"passwordHash,asc"))
   .isInstanceOfSatisfying(ApiException.class,e->assertThat(e.status).isEqualTo(400));
  verifyNoInteractions(employees);
 }
 @Test void duplicateEmployeeNumberFailsBeforePasswordHashing() {
  when(employees.existsByEmployeeNo("TEST")).thenReturn(true);
  assertThatThrownBy(()->service.create(new Dto.CreateEmployee("TEST","가상","x@example.invalid",null,LocalDate.now(),1L,1L,Role.EMPLOYEE,"test-password")))
   .isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("DUPLICATE_EMPLOYEE_NO"));
  verifyNoInteractions(passwords);
 }
}
