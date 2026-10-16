package com.portfolio.ems;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
@RestController
@RequestMapping("/api/v1/ai")
class AiController{
 private final AiService service;
 AiController(AiService service){this.service=service;}
 @GetMapping("/config") Object config(){return service.config();}
 @PostMapping(value="/employee-search",consumes="application/json") @PreAuthorize("hasRole('ADMIN')")
 Object search(@AuthenticationPrincipal Dto.User user,@RequestBody byte[] body){return service.search(user,service.request(body,"question"));}
 @PostMapping(value="/evaluation-summary",consumes="application/json")
 Object summary(@AuthenticationPrincipal Dto.User user,@RequestBody byte[] body){return service.summary(user,service.request(body,"evaluationId"));}
 @PostMapping(value="/policy-qa",consumes="application/json")
 Object policy(@AuthenticationPrincipal Dto.User user,@RequestBody byte[] body){return service.policy(user,service.request(body,"question"));}
}
