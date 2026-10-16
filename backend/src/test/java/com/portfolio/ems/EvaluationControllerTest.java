package com.portfolio.ems;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers=EvaluationController.class,properties="ems.jwt-secret=evaluation-test-secret-with-at-least-32-bytes")
@Import(SecurityConfig.class)
class EvaluationControllerTest {
 @Autowired MockMvc mvc;
 @MockitoBean EvaluationService service;
 @MockitoBean AccountRepository accounts;
 @MockitoBean AuditService audit;
 private static Dto.User identity(Role role) {return new Dto.User(7L,"SYNTHETIC","합성 테스트 사원",role);}
 private static RequestPostProcessor user(Role role) {
  return authentication(UsernamePasswordAuthenticationToken.authenticated(identity(role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role.name()))));
 }
 @Test void anonymousAndEmployeeCannotManageCyclesOrReassign() throws Exception {
  mvc.perform(get("/api/v1/evaluation-cycles")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/v1/evaluation-cycles").with(user(Role.EMPLOYEE))).andExpect(status().isForbidden());
  mvc.perform(put("/api/v1/evaluations/3/reviewer").with(user(Role.EMPLOYEE)).contentType("application/json").content("{\"reviewerId\":2}"))
   .andExpect(status().isForbidden());
  verifyNoInteractions(service);
 }
 @Test void createValidatesNestedInputAndReturns201() throws Exception {
  mvc.perform(post("/api/v1/evaluation-cycles").with(user(Role.ADMIN)).contentType("application/json").content("{}"))
   .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  verifyNoInteractions(service);
  when(service.create(any(),eq(identity(Role.ADMIN)))).thenReturn(Map.of("id",3,"status","DRAFT","allowedActions",List.of("EDIT","OPEN")));
  mvc.perform(post("/api/v1/evaluation-cycles").with(user(Role.ADMIN)).contentType("application/json").content("""
   {"name":"합성 테스트","startDate":"2026-01-01","endDate":"2026-12-31","items":[{"name":"합성 항목","sortOrder":1}],"assignments":[{"employeeId":2,"reviewerId":1}]}
   """
  )).andExpect(status().isCreated()).andExpect(jsonPath("$.allowedActions[0]").value("EDIT"));
 }
 @Test void rejectsFractionalTextualOutOfRangeScoresAndLongComments() throws Exception {
  for(String score:List.of("1.5","\"4\"","0","6")) {
   mvc.perform(put("/api/v1/evaluations/3/self").with(user(Role.EMPLOYEE)).contentType("application/json")
    .content("{\"answers\":[{\"itemId\":1,\"score\":"+score+"}]}"))
    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }
  mvc.perform(put("/api/v1/evaluations/3/self").with(user(Role.EMPLOYEE)).contentType("application/json")
   .content("{\"answers\":[{\"itemId\":1,\"comment\":\""+"가".repeat(1001)+"\"}]}"))
   .andExpect(status().isBadRequest());
  verifyNoInteractions(service);
 }
 @Test void routesDraftAndSubmitSeparatelyAndPassesAuthenticatedIdentity() throws Exception {
  when(service.write(eq(3L),eq(false),eq(false),any(),eq(identity(Role.EMPLOYEE)))).thenReturn(Map.of("state","SELF_DRAFT"));
  mvc.perform(put("/api/v1/evaluations/3/self").with(user(Role.EMPLOYEE)).contentType("application/json").content("{\"answers\":[{\"itemId\":1,\"score\":null}]}"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("SELF_DRAFT"));
  when(service.write(eq(3L),eq(true),eq(true),any(),eq(identity(Role.ADMIN)))).thenReturn(Map.of("state","FINALIZED","grade","S"));
  mvc.perform(post("/api/v1/evaluations/3/manager/submit").with(user(Role.ADMIN)).contentType("application/json").content("{\"answers\":[{\"itemId\":1,\"score\":5}]}"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("FINALIZED"));
  verify(service).write(eq(3L),eq(false),eq(false),any(),eq(identity(Role.EMPLOYEE)));
  verify(service).write(eq(3L),eq(true),eq(true),any(),eq(identity(Role.ADMIN)));
 }
 @Test void privateAndUnrelatedDetailsPreserveServiceErrors() throws Exception {
  when(service.get(3L,identity(Role.ADMIN))).thenThrow(ApiException.missing());
  mvc.perform(get("/api/v1/evaluations/3").with(user(Role.ADMIN))).andExpect(status().isNotFound());
  when(service.get(3L,identity(Role.EMPLOYEE))).thenReturn(Map.of("id",3,"state","MANAGER_DRAFT","items",List.of(),"selfAnswers",List.of()));
  mvc.perform(get("/api/v1/evaluations/3").with(user(Role.EMPLOYEE))).andExpect(status().isOk())
   .andExpect(jsonPath("$.managerAnswers").doesNotExist()).andExpect(jsonPath("$.finalScore").doesNotExist()).andExpect(jsonPath("$.grade").doesNotExist());
 }
 @Test void cycleAndListRoutesUseDeclaredPagingDefaults() throws Exception {
  when(service.cycles(0,20,identity(Role.ADMIN))).thenReturn(new Dto.PageView<>(List.of(),0,20,0,0));
  mvc.perform(get("/api/v1/evaluation-cycles").with(user(Role.ADMIN))).andExpect(status().isOk()).andExpect(jsonPath("$.size").value(20));
  when(service.forms(true,5L,0,20,identity(Role.ADMIN))).thenReturn(new Dto.PageView<>(List.of(),0,20,0,0));
  mvc.perform(get("/api/v1/evaluations/assigned").param("cycleId","5").with(user(Role.ADMIN))).andExpect(status().isOk());
  verify(service).forms(true,5L,0,20,identity(Role.ADMIN));
 }
}
