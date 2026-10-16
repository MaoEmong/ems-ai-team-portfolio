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
@WebMvcTest(controllers={PayrollController.class,OrganizationController.class},properties="ems.jwt-secret=test-only-secret-with-at-least-32-bytes")
@Import(SecurityConfig.class)
class OrganizationPayrollControllerTest{
 @Autowired MockMvc mvc;@MockitoBean PayrollService payroll;@MockitoBean OrganizationService organization;@MockitoBean AuditService audit;@MockitoBean AccountRepository accounts;
 private org.springframework.test.web.servlet.request.RequestPostProcessor user(Role role){return authentication(UsernamePasswordAuthenticationToken.authenticated(new Dto.User(1L,"TEST","합성",role),null,List.of(new SimpleGrantedAuthority("ROLE_"+role.name()))));}
 @Test void employeeCannotChangeOrganizationOrSalaryOrPayroll()throws Exception{
  mvc.perform(post("/api/v1/job-titles").with(user(Role.EMPLOYEE)).contentType("application/json").content("{\"name\":\"합성\"}")).andExpect(status().isForbidden());
  mvc.perform(put("/api/v1/employees/1/salary-setting").with(user(Role.EMPLOYEE)).contentType("application/json").content("{\"baseSalary\":100,\"allowance\":1}")).andExpect(status().isForbidden());
  mvc.perform(get("/api/v1/payrolls").with(user(Role.EMPLOYEE))).andExpect(status().isForbidden());verifyNoInteractions(payroll,organization);
 }
 @Test void salaryRejectsFractionsStringsNegativeAndOverflow()throws Exception{
  for(String amount:List.of("100.5","\"100\"","-1","1000000001","9223372036854775808")){
   mvc.perform(put("/api/v1/employees/1/salary-setting").with(user(Role.ADMIN)).contentType("application/json").content("{\"baseSalary\":"+amount+",\"allowance\":0}"))
    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }verifyNoInteractions(payroll);
 }
 @Test void salaryAcceptsIntegerZeroWithoutCoercion()throws Exception{
  mvc.perform(put("/api/v1/employees/1/salary-setting").with(user(Role.ADMIN)).contentType("application/json").content("{\"baseSalary\":0,\"allowance\":0}")).andExpect(status().isOk());
  verify(payroll).saveSetting(1,new SalaryInput(0L,0L));
 }
 @Test void privatePayslipKeeps404AndAnonymousOrganizationIs401()throws Exception{
  when(payroll.slip(eq(5L),any())).thenThrow(ApiException.missing());
  mvc.perform(get("/api/v1/payslips/5").with(user(Role.EMPLOYEE))).andExpect(status().isNotFound());
  mvc.perform(get("/api/v1/organization")).andExpect(status().isUnauthorized());verifyNoInteractions(organization);
 }
}
