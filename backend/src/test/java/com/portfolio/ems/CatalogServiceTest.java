package com.portfolio.ems;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class CatalogServiceTest {
 @Test void departmentWithAnyEmployeeCannotBeDeleted() {
  var d=mock(DepartmentRepository.class); var p=mock(PositionRepository.class); var e=mock(EmployeeRepository.class);
  when(d.lockById(1L)).thenReturn(Optional.of(new Department())); when(e.existsByDepartmentId(1L)).thenReturn(true);
  assertThatThrownBy(()->new CatalogService(d,p,e,mock(AppointmentStore.class),mock(AuditService.class),mock(OrganizationService.class)).deleteDepartment(1L))
   .isInstanceOfSatisfying(ApiException.class,x->assertThat(x.code).isEqualTo("DEPARTMENT_IN_USE"));
  verify(d,never()).delete(any());
 }
 @Test void positionWithAnyEmployeeCannotBeDeleted() {
  var d=mock(DepartmentRepository.class); var p=mock(PositionRepository.class); var e=mock(EmployeeRepository.class);
  when(p.lockById(1L)).thenReturn(Optional.of(new Position())); when(e.existsByPositionId(1L)).thenReturn(true);
  assertThatThrownBy(()->new CatalogService(d,p,e,mock(AppointmentStore.class),mock(AuditService.class),mock(OrganizationService.class)).deletePosition(1L))
   .isInstanceOfSatisfying(ApiException.class,x->assertThat(x.code).isEqualTo("POSITION_IN_USE"));
  verify(p,never()).delete(any());
 }
}
