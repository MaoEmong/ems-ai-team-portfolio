package com.portfolio.ems;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class FileServiceTest {
 final SheetCodec codec=mock(SheetCodec.class);
 final EmployeeService employees=mock(EmployeeService.class);
 final AuditService audit=mock(AuditService.class);
 final FileService service=new FileService(codec,employees,mock(EmployeeRepository.class),mock(DepartmentRepository.class),
  mock(PositionRepository.class),audit,mock(PlatformTransactionManager.class),mock(JdbcTemplate.class),new ObjectMapper());
 @Test void exportOverLimitDoesNotGeneratePartialFileOrSuccessAudit() {
  when(employees.list(null,null,null,null,0,100,"employeeNo,asc")).thenReturn(new Dto.PageView<>(List.of(),0,100,10001,101));
  assertThatThrownBy(()->service.export("xlsx",null,null,null,null,"employeeNo,asc"))
   .isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("EXPORT_LIMIT_EXCEEDED"));
  verifyNoInteractions(codec,audit);
 }
 @Test void exportRecordsOnlyTruncatedSearchAndNoExtraMetadata() {
  String keyword="x".repeat(101);
  when(employees.list(keyword,null,null,null,0,100,"employeeNo,asc")).thenReturn(new Dto.PageView<>(List.of(),0,100,0,0));
  when(codec.export(List.of(),"csv")).thenReturn(new byte[]{1});
  assertThat(service.export("csv",keyword,null,null,null,"employeeNo,asc")).containsExactly((byte)1);
  @SuppressWarnings("unchecked") ArgumentCaptor<Map<String,Object>> captor=ArgumentCaptor.forClass(Map.class);
  verify(audit).record(eq("EMPLOYEE_EXPORT"),eq("EMPLOYEE"),isNull(),isNull(),isNull(),isNull(),captor.capture());
  assertThat(captor.getValue().keySet()).containsExactlyInAnyOrder("format","rowCount","filters");
  assertThat(((Map<?,?>)captor.getValue().get("filters")).get("keyword")).isEqualTo("x".repeat(100));
 }
 @Test void missingFormatFailsBeforeLoadingEmployees() {
  assertThatThrownBy(()->service.export(null,null,null,null,null,"employeeNo,asc"))
   .isInstanceOfSatisfying(ApiException.class,e->assertThat(e.code).isEqualTo("VALIDATION_ERROR"));
  verifyNoInteractions(employees);
 }
}
