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
@WebMvcTest(controllers=ApiController.class,properties="ems.jwt-secret=test-only-secret-with-at-least-32-bytes")
@Import(SecurityConfig.class)
class ApiControllerTest {
 @Autowired MockMvc mvc;
 @MockitoBean AuthService auth; @MockitoBean EmployeeService employees;
 @MockitoBean CatalogService catalogs; @MockitoBean AccountRepository accounts;
 @MockitoBean AuditService audit;
 @Autowired org.springframework.security.oauth2.jwt.JwtEncoder encoder;
 private String token(java.time.Instant expiry) {
  var claims=org.springframework.security.oauth2.jwt.JwtClaimsSet.builder().issuer("ems").subject("1")
   .issuedAt(expiry.minusSeconds(3600)).expiresAt(expiry).build();
  return encoder.encode(org.springframework.security.oauth2.jwt.JwtEncoderParameters.from(
   org.springframework.security.oauth2.jwt.JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build(),claims)).getTokenValue();
 }
 @Test void expiredAndMalformedTokensAreUnauthorized() throws Exception {
  mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+token(java.time.Instant.now().minusSeconds(5))))
   .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer not-a-jwt"))
   .andExpect(status().isUnauthorized());
  verifyNoInteractions(accounts);
 }
 @Test void disabledAccountIsUnauthorizedWithValidToken() throws Exception {
  Account account=new Account(); account.enabled=false;
  when(accounts.findByEmployeeId(1L)).thenReturn(java.util.Optional.of(account));
  mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+token(java.time.Instant.now().plusSeconds(3600))))
   .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
 }
 private org.springframework.test.web.servlet.request.RequestPostProcessor user(Role role) {
  return authentication(UsernamePasswordAuthenticationToken.authenticated(new Dto.User(1L,"TEST","가상사원",role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role.name()))));
 }
 @Test void anonymousGetsJson401() throws Exception {
  mvc.perform(get("/api/v1/employees")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED")).andExpect(jsonPath("$.fieldErrors").isArray());
 }
 @Test void employeeCannotListEmployees() throws Exception {
  mvc.perform(get("/api/v1/employees").with(user(Role.EMPLOYEE))).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN")); verifyNoInteractions(employees);
 }
 @Test void employeeMayReadCatalogsButCannotWrite() throws Exception {
  when(catalogs.departments()).thenReturn(List.of());
  mvc.perform(get("/api/v1/departments").with(user(Role.EMPLOYEE))).andExpect(status().isOk()).andExpect(content().json("[]"));
  mvc.perform(post("/api/v1/departments").with(user(Role.EMPLOYEE)).contentType("application/json").content("{\"name\":\"가상부서\"}")).andExpect(status().isForbidden());
 }
 @Test void invalidCreateReturnsFieldErrors() throws Exception {
  mvc.perform(post("/api/v1/employees").with(user(Role.ADMIN)).contentType("application/json").content("{}"))
   .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR")).andExpect(jsonPath("$.fieldErrors").isNotEmpty()); verifyNoInteractions(employees);
 }
 @Test void invalidRetireDateNamesTheField() throws Exception {
  mvc.perform(post("/api/v1/employees/1/retire").with(user(Role.ADMIN)).contentType("application/json").content("{\"retireDate\":\"invalid\"}"))
   .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("retireDate"));
 }
 @Test void corsAllowsFrontendAuthorizationHeader() throws Exception {
  mvc.perform(options("/api/v1/employees").header("Origin","http://localhost:5173").header("Access-Control-Request-Method","GET").header("Access-Control-Request-Headers","authorization"))
   .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173"));
 }
}
