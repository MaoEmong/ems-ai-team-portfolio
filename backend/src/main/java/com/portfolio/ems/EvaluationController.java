package com.portfolio.ems;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
class EvaluationController {
 private final EvaluationService service;
 EvaluationController(EvaluationService service) { this.service=service; }

 @GetMapping("/evaluation-cycles") @PreAuthorize("hasRole('ADMIN')")
 Dto.PageView<Map<String,Object>> cycles(@AuthenticationPrincipal Dto.User user,
  @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
  return service.cycles(page,size,user);
 }
 @PostMapping("/evaluation-cycles") @PreAuthorize("hasRole('ADMIN')")
 ResponseEntity<Map<String,Object>> create(@Valid @RequestBody EvaluationDto.CycleInput input,@AuthenticationPrincipal Dto.User user) {
  return ResponseEntity.status(201).body(service.create(input,user));
 }
 @GetMapping("/evaluation-cycles/{id}") @PreAuthorize("hasRole('ADMIN')")
 Map<String,Object> cycle(@PathVariable long id,@AuthenticationPrincipal Dto.User user) { return service.cycle(id,user); }
 @PutMapping("/evaluation-cycles/{id}") @PreAuthorize("hasRole('ADMIN')")
 Map<String,Object> update(@PathVariable long id,@Valid @RequestBody EvaluationDto.CycleInput input,@AuthenticationPrincipal Dto.User user) {
  return service.update(id,input,user);
 }
 @PostMapping("/evaluation-cycles/{id}/open") @PreAuthorize("hasRole('ADMIN')")
 Map<String,Object> open(@PathVariable long id,@AuthenticationPrincipal Dto.User user) { return service.transition(id,true,user); }
 @PostMapping("/evaluation-cycles/{id}/close") @PreAuthorize("hasRole('ADMIN')")
 Map<String,Object> close(@PathVariable long id,@AuthenticationPrincipal Dto.User user) { return service.transition(id,false,user); }

 @GetMapping("/evaluations/me")
 Dto.PageView<Map<String,Object>> mine(@AuthenticationPrincipal Dto.User user,@RequestParam(required=false) Long cycleId,
  @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
  return service.forms(false,cycleId,page,size,user);
 }
 @GetMapping("/evaluations/assigned")
 Dto.PageView<Map<String,Object>> assigned(@AuthenticationPrincipal Dto.User user,@RequestParam(required=false) Long cycleId,
  @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
  return service.forms(true,cycleId,page,size,user);
 }
 @GetMapping("/evaluations/{id}")
 Map<String,Object> form(@PathVariable long id,@AuthenticationPrincipal Dto.User user) { return service.get(id,user); }
 @PutMapping("/evaluations/{id}/self")
 Map<String,Object> saveSelf(@PathVariable long id,@Valid @RequestBody EvaluationDto.Answers input,@AuthenticationPrincipal Dto.User user) {
  return service.write(id,false,false,input,user);
 }
 @PostMapping("/evaluations/{id}/self/submit")
 Map<String,Object> submitSelf(@PathVariable long id,@Valid @RequestBody EvaluationDto.Answers input,@AuthenticationPrincipal Dto.User user) {
  return service.write(id,false,true,input,user);
 }
 @PutMapping("/evaluations/{id}/manager")
 Map<String,Object> saveManager(@PathVariable long id,@Valid @RequestBody EvaluationDto.Answers input,@AuthenticationPrincipal Dto.User user) {
  return service.write(id,true,false,input,user);
 }
 @PostMapping("/evaluations/{id}/manager/submit")
 Map<String,Object> submitManager(@PathVariable long id,@Valid @RequestBody EvaluationDto.Answers input,@AuthenticationPrincipal Dto.User user) {
  return service.write(id,true,true,input,user);
 }
 @PutMapping("/evaluations/{id}/reviewer") @PreAuthorize("hasRole('ADMIN')")
 Map<String,Object> reviewer(@PathVariable long id,@Valid @RequestBody EvaluationDto.ReviewerInput input,@AuthenticationPrincipal Dto.User user) {
  return service.reassign(id,input.reviewerId(),user);
 }
}
