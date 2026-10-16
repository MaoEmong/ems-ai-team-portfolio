package com.portfolio.ems;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import java.util.*;
@RestController @RequestMapping("/api/v1")
class OrganizationController{
 private final OrganizationService service;
 OrganizationController(OrganizationService service){this.service=service;}
 @GetMapping("/organization") Map<String,Object> organization(){return service.organization();}
 @GetMapping("/job-titles") List<JobTitleView> titles(){return service.titles();}
 @PostMapping("/job-titles") @PreAuthorize("hasRole('ADMIN')") ResponseEntity<JobTitleView> create(@Valid @RequestBody JobTitleInput r){return ResponseEntity.status(201).body(service.save(null,r));}
 @PutMapping("/job-titles/{id}") @PreAuthorize("hasRole('ADMIN')") JobTitleView update(@PathVariable Long id,@Valid @RequestBody JobTitleInput r){return service.save(id,r);}
 @DeleteMapping("/job-titles/{id}") @PreAuthorize("hasRole('ADMIN')") ResponseEntity<Void> delete(@PathVariable Long id){service.delete(id);return ResponseEntity.noContent().build();}
}
