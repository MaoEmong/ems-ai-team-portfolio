package com.portfolio.ems;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Tag("mysql") @Testcontainers
@SpringBootTest(properties={"ems.jwt-secret=test-integration-secret-at-least-32-bytes",
 "ems.seed.admin-login-id=TESTADMIN","ems.seed.admin-password=test-admin-password"})
@AutoConfigureMockMvc
class MySqlIntegrationTest {
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
  r.add("spring.datasource.url",mysql::getJdbcUrl); r.add("spring.datasource.username",mysql::getUsername);
  r.add("spring.datasource.password",mysql::getPassword);
 }
 @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired AccountRepository accounts;
 ResultActions call(MockHttpServletRequestBuilder request,String token,Object payload) throws Exception {
  if(token!=null) request.header("Authorization","Bearer "+token);
  if(payload!=null) request.contentType("application/json").content(json.writeValueAsString(payload));
  return mvc.perform(request);
 }
 JsonNode response(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsString()); }
 String login(String id,String password) throws Exception {
  return response(call(post("/api/v1/auth/login"),null,Map.of("loginId",id,"password",password))
   .andExpect(status().isOk()).andExpect(jsonPath("$.expiresIn").value(3600))).get("accessToken").asText();
 }
 @Test void fullLifecycleOnRealMySql() throws Exception {
  String admin=login("TESTADMIN","test-admin-password");
  assertThat(accounts.findByEmployeeEmployeeNo("TESTADMIN").orElseThrow().passwordHash).startsWith("$2");
  call(post("/api/v1/auth/login"),null,Map.of("loginId","TESTADMIN","password","wrong"))
   .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  call(get("/api/v1/employees"),admin,null).andExpect(status().isOk())
   .andExpect(jsonPath("$.totalElements").value(26)).andExpect(jsonPath("$.size").value(20));
  long d=response(call(post("/api/v1/departments"),admin,Map.of("name","통합가상부서","description","합성"))
   .andExpect(status().isCreated()).andExpect(header().exists("Location"))).get("id").asLong();
  long p=response(call(post("/api/v1/positions"),admin,Map.of("name","통합가상직급","level",9))
   .andExpect(status().isCreated())).get("id").asLong();
  call(put("/api/v1/departments/"+d),admin,Map.of("name","통합변경부서","description","합성"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("통합변경부서"));
  call(put("/api/v1/positions/"+p),admin,Map.of("name","통합변경직급","level",10))
   .andExpect(status().isOk()).andExpect(jsonPath("$.level").value(10));
  var create=Map.of("employeeNo","INTEGRATION","name","통합가상사원","email","integration@example.invalid","phone","000-0000-9999",
   "hireDate","2026-01-01","departmentId",d,"positionId",p,"role","EMPLOYEE","initialPassword","test-employee-password");
  long id=response(call(post("/api/v1/employees"),admin,create).andExpect(status().isCreated())
   .andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.department.name").value("통합변경부서"))).get("id").asLong();
  String employee=login("INTEGRATION","test-employee-password");
  call(get("/api/v1/auth/me"),employee,null).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
  call(get("/api/v1/employees/"+id),employee,null).andExpect(status().isOk());
  call(get("/api/v1/employees/1"),employee,null).andExpect(status().isForbidden());
  call(get("/api/v1/employees"),employee,null).andExpect(status().isForbidden());
  call(get("/api/v1/departments"),employee,null).andExpect(status().isOk());
  call(get("/api/v1/positions"),employee,null).andExpect(status().isOk());
  call(post("/api/v1/employees"),employee,create).andExpect(status().isForbidden());
  call(post("/api/v1/employees"),admin,create).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DUPLICATE_EMPLOYEE_NO"));
  var duplicateEmail=new java.util.HashMap<String,Object>(create); duplicateEmail.put("employeeNo","INTEGRATION2");
  call(post("/api/v1/employees"),admin,duplicateEmail).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DUPLICATE_EMAIL"));
  var update=Map.of("name","수정가상사원","email","integration@example.invalid","phone","000-0000-9999",
   "hireDate","2026-01-01","status","ON_LEAVE","departmentId",d,"positionId",p,"role","EMPLOYEE");
  call(put("/api/v1/employees/"+id),employee,update).andExpect(status().isForbidden());
  call(put("/api/v1/employees/"+id),admin,update).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ON_LEAVE"));
  call(get("/api/v1/employees").param("keyword","INTEGRATION").param("departmentId",""+d).param("positionId",""+p)
   .param("status","ON_LEAVE").param("sort","hireDate,desc"),admin,null)
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
  call(post("/api/v1/employees/"+id+"/retire"),admin,Map.of("retireDate","2025-01-01"))
   .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("retireDate"));
  call(post("/api/v1/employees/"+id+"/retire"),admin,Map.of("retireDate","2026-10-16"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RETIRED"));
  call(get("/api/v1/auth/me"),employee,null).andExpect(status().isUnauthorized());
  call(post("/api/v1/auth/login"),null,Map.of("loginId","INTEGRATION","password","test-employee-password")).andExpect(status().isUnauthorized());
  call(put("/api/v1/employees/"+id),admin,update).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMPLOYEE_RETIRED"));
  call(post("/api/v1/employees/"+id+"/retire"),admin,Map.of("retireDate","2026-10-16"))
   .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMPLOYEE_RETIRED"));
  call(delete("/api/v1/departments/"+d),admin,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DEPARTMENT_IN_USE"));
  call(delete("/api/v1/positions/"+p),admin,null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("POSITION_IN_USE"));
  call(get("/api/v1/employees").param("keyword","INTEGRATION"),admin,null).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
  call(get("/api/v1/employees").param("keyword","INTEGRATION").param("status","RETIRED"),admin,null)
   .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
  long emptyD=response(call(post("/api/v1/departments"),admin,Map.of("name","삭제용가상부서")).andExpect(status().isCreated())).get("id").asLong();
  call(delete("/api/v1/departments/"+emptyD),admin,null).andExpect(status().isNoContent());
  long emptyP=response(call(post("/api/v1/positions"),admin,Map.of("name","삭제용가상직급","level",99)).andExpect(status().isCreated())).get("id").asLong();
  call(delete("/api/v1/positions/"+emptyP),admin,null).andExpect(status().isNoContent());
 }
}
