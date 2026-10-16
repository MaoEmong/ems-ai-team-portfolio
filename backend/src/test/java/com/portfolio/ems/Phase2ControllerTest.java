package com.portfolio.ems;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.time.Clock;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest(controllers=Phase2Controller.class,properties="ems.jwt-secret=test-only-secret-with-at-least-32-bytes")
@Import(SecurityConfig.class)
class Phase2ControllerTest {
 @Autowired MockMvc mvc;
 @MockitoBean AppointmentService appointments;@MockitoBean DashboardService dashboard;
 @MockitoBean FileService files;@MockitoBean AuditService audit;@MockitoBean Clock clock;@MockitoBean AccountRepository accounts;
 private org.springframework.test.web.servlet.request.RequestPostProcessor user(Role role) {
  return authentication(UsernamePasswordAuthenticationToken.authenticated(new Dto.User(1L,"TEST","합성",role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role.name()))));
 }
 @Test void allAdminReadApisDenyEmployee() throws Exception {
  for(String p:List.of("/dashboard","/employees/export?format=csv","/employees/import-template","/audit-logs"))
   mvc.perform(get("/api/v1"+p).with(user(Role.EMPLOYEE))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
  verifyNoInteractions(files,dashboard,audit);
 }
 @Test void missingReasonReturnsValidationError() throws Exception {
  mvc.perform(post("/api/v1/employees/1/appointments").with(user(Role.ADMIN)).contentType("application/json")
   .content("{\"effectiveDate\":\"2026-10-01\",\"departmentId\":2,\"positionId\":2}"))
   .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  verifyNoInteractions(appointments);
 }
 @Test void importRowsAreReturnedWithoutChangingBaseErrorShape() throws Exception {
  when(files.importFile(any())).thenThrow(ImportProblem.rows(List.of(new ImportRowError(3,"employeeNo","문자열 서식 필요"))));
  mvc.perform(multipart("/api/v1/employees/import").file("file",new byte[]{1}).with(user(Role.ADMIN)))
   .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IMPORT_VALIDATION_ERROR"))
   .andExpect(jsonPath("$.fieldErrors").isArray()).andExpect(jsonPath("$.rowErrors[0].row").value(3));
 }
}
