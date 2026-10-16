package com.portfolio.ems;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import java.util.*;
@RestController @RequestMapping("/api/v1")
class PayrollController{
 private final PayrollService service;
 PayrollController(PayrollService service){this.service=service;}
 @GetMapping("/employees/{id}/salary-setting") @PreAuthorize("hasRole('ADMIN')") Map<String,Object> setting(@PathVariable Long id){return service.setting(id);}
 @PutMapping("/employees/{id}/salary-setting") @PreAuthorize("hasRole('ADMIN')") Map<String,Object> setting(@PathVariable Long id,@Valid @RequestBody SalaryInput input){return service.saveSetting(id,input);}
 @GetMapping("/payrolls") @PreAuthorize("hasRole('ADMIN')") Dto.PageView<Map<String,Object>> list(@RequestParam(required=false) String month,@RequestParam(required=false) String status,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return service.list(month,status,page,size);}
 @PostMapping("/payrolls") @PreAuthorize("hasRole('ADMIN')") ResponseEntity<Map<String,Object>> generate(@Valid @RequestBody PayrollInput input,@AuthenticationPrincipal Dto.User user){return ResponseEntity.status(201).body(service.generate(input.month(),user));}
 @GetMapping("/payrolls/{month}") @PreAuthorize("hasRole('ADMIN')") Map<String,Object> detail(@PathVariable String month){return service.detail(month);}
 @PostMapping("/payrolls/{month}/recalculate") @PreAuthorize("hasRole('ADMIN')") Map<String,Object> recalculate(@PathVariable String month,@AuthenticationPrincipal Dto.User user){return service.recalculate(month,user);}
 @PostMapping("/payrolls/{month}/confirm") @PreAuthorize("hasRole('ADMIN')") Map<String,Object> confirm(@PathVariable String month,@AuthenticationPrincipal Dto.User user){return service.confirm(month,user);}
 @GetMapping("/payslips/me") Dto.PageView<Map<String,Object>> own(@AuthenticationPrincipal Dto.User user,@RequestParam(required=false) String month,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size){return service.own(user,month,page,size);}
 @GetMapping("/payslips/{id}") Map<String,Object> slip(@PathVariable Long id,@AuthenticationPrincipal Dto.User user){return service.slip(id,user);}
}
