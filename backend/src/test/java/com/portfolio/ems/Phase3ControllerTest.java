package com.portfolio.ems;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest(controllers=Phase3Controller.class,properties="ems.jwt-secret=test-only-secret-with-at-least-32-bytes")
@Import(SecurityConfig.class)
class Phase3ControllerTest {
 @Autowired MockMvc mvc;
 @MockitoBean AuditService audit;@MockitoBean AttendanceService attendance;@MockitoBean LeaveService leaves;@MockitoBean NotificationService notifications;@MockitoBean AccountRepository accounts;
 private org.springframework.test.web.servlet.request.RequestPostProcessor user(Role role){
  return authentication(UsernamePasswordAuthenticationToken.authenticated(new Dto.User(1L,"TEST","합성",role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role.name()))));
 }
 @Test void anonymousCannotReadPersonalData()throws Exception{
  mvc.perform(get("/api/v1/notifications/me")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/attendance/me/today")).andExpect(status().isUnauthorized());verifyNoInteractions(attendance,notifications);
 }
 @Test void employeeCannotReadAdminListsOrDecide()throws Exception{
  mvc.perform(get("/api/v1/attendance?employeeId=2&month=2026-10").with(user(Role.EMPLOYEE))).andExpect(status().isForbidden());
  mvc.perform(get("/api/v1/leaves").with(user(Role.EMPLOYEE))).andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/leaves/2/approve").with(user(Role.EMPLOYEE))).andExpect(status().isForbidden());verifyNoInteractions(attendance,leaves);
 }
 @Test void requiredReasonsAndReadAllBoundaryAreValidated()throws Exception{
  mvc.perform(post("/api/v1/leaves").with(user(Role.EMPLOYEE)).contentType("application/json").content("{\"type\":\"ANNUAL\",\"startDate\":\"2026-10-19\",\"endDate\":\"2026-10-19\"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  mvc.perform(post("/api/v1/leaves/1/reject").with(user(Role.ADMIN)).contentType("application/json").content("{\"reason\":\" \"}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/v1/notifications/me/read-all").with(user(Role.ADMIN)).contentType("application/json").content("{\"upToId\":-1}")).andExpect(status().isBadRequest());verifyNoInteractions(leaves,notifications);
 }
 @Test void readNotificationReturns204WithAuthenticatedOwner()throws Exception{
  mvc.perform(post("/api/v1/notifications/7/read").with(user(Role.EMPLOYEE))).andExpect(status().isNoContent());verify(notifications).read(7,1);
 }
}
