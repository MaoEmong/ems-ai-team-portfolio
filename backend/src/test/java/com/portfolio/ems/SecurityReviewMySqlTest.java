package com.portfolio.ems;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@Tag("mysql") @Testcontainers
@SpringBootTest(properties={"ems.jwt-secret=security-review-test-secret-at-least-32-bytes","ems.seed.admin-login-id=SECADMIN","ems.seed.admin-password=synthetic-review-password","ems.ai.provider=mock"})
@AutoConfigureMockMvc
class SecurityReviewMySqlTest{
 @Container static MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
 @DynamicPropertySource static void database(DynamicPropertyRegistry r){r.add("spring.datasource.url",mysql::getJdbcUrl);r.add("spring.datasource.username",mysql::getUsername);r.add("spring.datasource.password",mysql::getPassword);}
 @Autowired MockMvc mvc;@Autowired JdbcTemplate jdbc;@Autowired JwtEncoder encoder;@Autowired ObjectMapper json;@Autowired SecurityFilterChain chain;
 long adminId(){return jdbc.queryForObject("SELECT id FROM employee WHERE employee_no='SECADMIN'",Long.class);}
 String token(long id,String issuer,Instant expiry){return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),JwtClaimsSet.builder().issuer(issuer).subject(Long.toString(id)).issuedAt(expiry.minusSeconds(3600)).expiresAt(expiry).build())).getTokenValue();}
 String valid(){return token(adminId(),"ems",Instant.now().plusSeconds(3600));}
 ResultActions call(MockHttpServletRequestBuilder r,String value)throws Exception{if(value!=null)r.header("Authorization","Bearer "+value);return mvc.perform(r);}
 void headers(ResultActions r)throws Exception{r.andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(header().string("X-Frame-Options","DENY")).andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store")));}
 @Test void securityHeadersAreEagerAndPresentForSensitiveSuccessUnauthorizedAndForbidden()throws Exception{
  var filter=chain.getFilters().stream().filter(f->f instanceof HeaderWriterFilter).findFirst().orElseThrow();
  assertThat(ReflectionTestUtils.getField(filter,"shouldWriteHeadersEagerly")).isEqualTo(true);
  headers(call(get("/api/v1/auth/me"),valid()).andExpect(status().isOk()));
  headers(call(get("/api/v1/auth/me"),null).andExpect(status().isUnauthorized()));
  long id=jdbc.queryForObject("SELECT employee_id FROM user_account WHERE role='EMPLOYEE' AND enabled=1 LIMIT 1",Long.class);
  headers(call(get("/api/v1/employees"),token(id,"ems",Instant.now().plusSeconds(3600))).andExpect(status().isForbidden()));
 }
 @Test void expiredWrongIssuerAndMalformedJwtAreRejectedWithoutLeakingToken()throws Exception{
  for(String value:List.of(token(adminId(),"ems",Instant.now().minusSeconds(1)),token(adminId(),"other-issuer",Instant.now().plusSeconds(3600)),"not-a-valid-jwt")){
   var response=call(get("/api/v1/auth/me"),value).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
   assertThat(response).doesNotContain(value,"secret","password");
  }
 }
 @Test void currentRoleAndEnabledAreCheckedOnEveryRequest()throws Exception{
  long id=adminId();String old=valid();
  try{
   jdbc.update("UPDATE user_account SET role='EMPLOYEE' WHERE employee_id=?",id);
   call(get("/api/v1/employees"),old).andExpect(status().isForbidden());
   call(get("/api/v1/auth/me"),old).andExpect(jsonPath("$.role").value("EMPLOYEE"));
   jdbc.update("UPDATE user_account SET enabled=false WHERE employee_id=?",id);
   call(get("/api/v1/auth/me"),old).andExpect(status().isUnauthorized());
  }finally{jdbc.update("UPDATE user_account SET role='ADMIN',enabled=true WHERE employee_id=?",id);}
 }
 @Test void corsAllowsOnlyConfiguredLocalOriginAndNoCredentials()throws Exception{
  call(options("/api/v1/ai/employee-search").header("Origin","http://localhost:5173").header("Access-Control-Request-Method","POST").header("Access-Control-Request-Headers","authorization,content-type"),null)
   .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173")).andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
  call(options("/api/v1/ai/employee-search").header("Origin","https://untrusted.example.invalid").header("Access-Control-Request-Method","POST"),null)
   .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
 }
 @Test void bcryptPasswordAndLoginTokenDurationAreNotExposedInUserJson()throws Exception{
  String hash=jdbc.queryForObject("SELECT password_hash FROM user_account WHERE employee_id=?",String.class,adminId());assertThat(hash).startsWith("$2").doesNotContain("synthetic-review-password");
  var raw=mvc.perform(post("/api/v1/auth/login").contentType("application/json").content(json.writeValueAsString(Map.of("loginId","SECADMIN","password","synthetic-review-password")))).andExpect(status().isOk()).andExpect(jsonPath("$.expiresIn").value(3600)).andReturn().getResponse().getContentAsString();
  assertThat(raw).doesNotContain(hash,"passwordHash","synthetic-review-password");
 }
 @Test void missingAndDisabledAccountsHaveSamePublicFailureBody()throws Exception{
  var missing=mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{\"loginId\":\"MISSING-REVIEW\",\"password\":\"synthetic\"}")).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
  try{
   jdbc.update("UPDATE user_account SET enabled=false WHERE employee_id=?",adminId());
   var disabled=mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{\"loginId\":\"SECADMIN\",\"password\":\"synthetic\"}")).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
   assertThat(disabled).isEqualTo(missing);
  }finally{jdbc.update("UPDATE user_account SET enabled=true WHERE employee_id=?",adminId());}
 }
}
