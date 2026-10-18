package com.portfolio.ems;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.*;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.*;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.List;

@Configuration @EnableMethodSecurity
class SecurityConfig {
 @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
 @Bean SecretKeySpec jwtKey(@Value("${ems.jwt-secret}") String secret) {
  byte[] bytes=secret.getBytes(StandardCharsets.UTF_8);
  if(bytes.length<32) throw new IllegalArgumentException("JWT_SECRET must be at least 32 UTF-8 bytes");
  return new SecretKeySpec(bytes,"HmacSHA256");
 }
 @Bean JwtEncoder jwtEncoder(SecretKeySpec key) { return new NimbusJwtEncoder(new ImmutableSecret<>(key)); }
 @Bean JwtDecoder jwtDecoder(SecretKeySpec key) {
  NimbusJwtDecoder decoder=NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
  JwtTimestampValidator timestamp=new JwtTimestampValidator(Duration.ZERO);
  decoder.setJwtValidator(new org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator<>(
   timestamp,new JwtIssuerValidator("ems")));
  return decoder;
 }
 @Bean SecurityFilterChain security(HttpSecurity http,AccountRepository accounts,ObjectMapper mapper) throws Exception {
  http.csrf(c->c.disable()).cors(c->{}).sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
  // Official mitigation for CVE-2026-22732: write security/cache headers before the chain.
  http.headers(headers->headers.addObjectPostProcessor(new org.springframework.security.config.ObjectPostProcessor<org.springframework.security.web.header.HeaderWriterFilter>() {
   @Override public <O extends org.springframework.security.web.header.HeaderWriterFilter> O postProcess(O filter) {
    filter.setShouldWriteHeadersEagerly(true); return filter;
   }
  }));
  http.authorizeHttpRequests(a->a
   .requestMatchers(HttpMethod.OPTIONS,"/**").permitAll()
   .requestMatchers(HttpMethod.POST,"/api/v1/auth/login").permitAll()
   .requestMatchers(HttpMethod.GET,"/api/v1/dashboard","/api/v1/audit-logs","/api/v1/employees/export","/api/v1/employees/import-template").hasRole("ADMIN")
   .requestMatchers(HttpMethod.POST,"/api/v1/employees/import","/api/v1/employees/*/appointments").hasRole("ADMIN")
   .requestMatchers("/api/v1/**").authenticated().anyRequest().denyAll());
  http.exceptionHandling(e->e
   .authenticationEntryPoint((q,r,x)->error(r,mapper,401,"UNAUTHORIZED"))
   .accessDeniedHandler((q,r,x)->error(r,mapper,403,"FORBIDDEN")));
  http.oauth2ResourceServer(o->o
   .authenticationEntryPoint((q,r,x)->error(r,mapper,401,"UNAUTHORIZED"))
   .accessDeniedHandler((q,r,x)->error(r,mapper,403,"FORBIDDEN"))
   .jwt(j->j.jwtAuthenticationConverter(jwt->{
    Long id;
    try { id=Long.valueOf(jwt.getSubject()); }
    catch(RuntimeException e) { throw new BadCredentialsException("Invalid subject"); }
    Account account=accounts.findByEmployeeId(id).filter(a->a.enabled).orElseThrow(()->new BadCredentialsException("Inactive account"));
    return UsernamePasswordAuthenticationToken.authenticated(
     new Dto.User(id,account.employee.employeeNo,account.employee.name,account.role),null,
     List.of(new SimpleGrantedAuthority("ROLE_"+account.role.name())));
   })));
  return http.build();
 }
 private static void error(HttpServletResponse response,ObjectMapper mapper,int status,String code) throws java.io.IOException {
  response.setStatus(status); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
  mapper.writeValue(response.getWriter(),new ErrorBody(code,status==401?"인증이 필요합니다.":"접근 권한이 없습니다.",List.of()));
 }
 @Bean CorsConfigurationSource corsConfigurationSource() {
  CorsConfiguration c=new CorsConfiguration();
  c.setAllowedOrigins(List.of("http://localhost:5173"));
  c.setAllowedMethods(List.of("GET","POST","PUT","DELETE","OPTIONS"));
  c.setAllowedHeaders(List.of("Authorization","Content-Type")); c.setExposedHeaders(List.of("Location","Content-Disposition"));
  UrlBasedCorsConfigurationSource source=new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/api/**",c);
  return source;
 }
}
