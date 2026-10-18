package com.portfolio.ems;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest(ApiController.class) @Import({SecurityConfig.class,Errors.class})
@TestPropertySource(properties="ems.jwt-secret=security-review-slice-synthetic-key-at-least-32-bytes")
class SecurityReviewWebTest{
 @Autowired MockMvc mvc;@Autowired JwtEncoder encoder;@Autowired SecurityFilterChain chain;@Autowired PasswordEncoder passwords;
 @MockitoBean AccountRepository accounts;@MockitoBean AuthService auth;@MockitoBean EmployeeService employees;@MockitoBean CatalogService catalogs;@MockitoBean AuditService audit;
 Account account;
 @BeforeEach void setup(){
  Employee e=new Employee();e.id=11L;e.employeeNo="SYNTHETIC";e.name="합성테스트";
  account=new Account();account.employee=e;account.enabled=true;account.role=Role.ADMIN;
  when(accounts.findByEmployeeId(11L)).thenReturn(Optional.of(account));
 }
 String token(String issuer,Instant expiry){return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),JwtClaimsSet.builder().issuer(issuer).subject("11").issuedAt(expiry.minusSeconds(3600)).expiresAt(expiry).build())).getTokenValue();}
 String valid(){return token("ems",Instant.now().plusSeconds(3600));}
 ResultActions call(MockHttpServletRequestBuilder request,String token)throws Exception{if(token!=null)request.header("Authorization","Bearer "+token);return mvc.perform(request);}
 void secureHeaders(ResultActions response)throws Exception{
  response.andExpect(header().string("X-Content-Type-Options","nosniff")).andExpect(header().string("X-Frame-Options","DENY")).andExpect(header().string("Cache-Control",org.hamcrest.Matchers.containsString("no-store")));
 }
 @Test void eagerSecurityHeadersCoverSensitiveSuccess401And403()throws Exception{
  var filter=chain.getFilters().stream().filter(f->f instanceof HeaderWriterFilter).findFirst().orElseThrow();
  assertThat(ReflectionTestUtils.getField(filter,"shouldWriteHeadersEagerly")).isEqualTo(true);
  String bearer=valid();
  secureHeaders(call(get("/api/v1/auth/me"),bearer).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(11)));
  secureHeaders(call(get("/api/v1/auth/me"),null).andExpect(status().isUnauthorized()));
  account.role=Role.EMPLOYEE;
  secureHeaders(call(get("/api/v1/employees"),bearer).andExpect(status().isForbidden()));
 }
 @Test void expiredWrongIssuerAndTamperedSignatureRejectBeforeAccountLookup()throws Exception{
  String original=valid();int sig=original.lastIndexOf('.')+1;String altered=original.substring(0,sig)+(original.charAt(sig)=='A'?"B":"A")+original.substring(sig+1);
  for(String value:List.of(token("ems",Instant.now().minusSeconds(1)),token("wrong-issuer",Instant.now().plusSeconds(3600)),altered,"malformed")){
   String raw=call(get("/api/v1/auth/me"),value).andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
   assertThat(raw).doesNotContain(value,"secret","password");
  }
  verifyNoInteractions(accounts);
 }
 @Test void currentAccountRoleAndEnabledOverrideOldJwtOnEveryRequest()throws Exception{
  String bearer=valid();call(get("/api/v1/auth/me"),bearer).andExpect(jsonPath("$.role").value("ADMIN"));
  account.role=Role.EMPLOYEE;call(get("/api/v1/employees"),bearer).andExpect(status().isForbidden());
  call(get("/api/v1/auth/me"),bearer).andExpect(jsonPath("$.role").value("EMPLOYEE"));
  account.enabled=false;call(get("/api/v1/auth/me"),bearer).andExpect(status().isUnauthorized());
  verify(accounts,times(4)).findByEmployeeId(11L);
 }
 @Test void corsIsExactLocalOriginWithoutCredentialCookies()throws Exception{
  call(options("/api/v1/employees").header("Origin","http://localhost:5173").header("Access-Control-Request-Method","GET"),null).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173")).andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
  call(options("/api/v1/employees").header("Origin","https://untrusted.example.invalid").header("Access-Control-Request-Method","GET"),null).andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
  verifyNoInteractions(accounts);
 }
 @Test void bcryptHasUniqueSaltAndShortJwtSecretFailsClosed(){
  String first=passwords.encode("synthetic-password"),second=passwords.encode("synthetic-password");
  assertThat(first).startsWith("$2").isNotEqualTo(second).doesNotContain("synthetic-password");
  assertThat(passwords.matches("synthetic-password",first)).isTrue();assertThat(passwords.matches("wrong",first)).isFalse();
  assertThatThrownBy(()->new SecurityConfig().jwtKey("short")).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void nonApiActuatorAndUnknownRoutesAreDenied()throws Exception{
  for(String route:List.of("/actuator/env","/private-files/test"))call(get(route),valid()).andExpect(status().isForbidden());
 }
}
