package com.portfolio.ems;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;
class AiProblem extends RuntimeException{
 final int status;final String code;final boolean retryable;
 private AiProblem(int status,String code,boolean retryable){super(code);this.status=status;this.code=code;this.retryable=retryable;}
 static AiProblem of(int status,String code,boolean retryable){return new AiProblem(status,code,retryable);}
 static AiProblem invalid(){return of(502,"AI_INVALID_OUTPUT",true);}
}
@RestControllerAdvice(assignableTypes=AiController.class)
@org.springframework.core.annotation.Order(-10)
class AiErrors{
 @ExceptionHandler(AiProblem.class) ResponseEntity<?> problem(AiProblem p){
  String message=switch(p.code){case "AI_TIMEOUT"->"AI 응답 시간이 초과되었습니다.";case "AI_NOT_CONFIGURED"->"AI 제공자 설정을 확인해 주세요.";case "AI_BUSY","AI_RATE_LIMITED"->"잠시 후 다시 시도해 주세요.";default->"AI 요청을 처리할 수 없습니다.";};
  return ResponseEntity.status(p.status).body(Map.of("code",p.code,"message",message,"fieldErrors",List.of(),"retryable",p.retryable));
 }
}
