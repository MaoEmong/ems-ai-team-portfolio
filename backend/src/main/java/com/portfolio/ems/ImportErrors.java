package com.portfolio.ems;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import java.util.List;
@RestControllerAdvice
@org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
class ImportErrors {
 private final AuditService audit;
 ImportErrors(AuditService audit) {this.audit=audit;}
 record RowErrorBody(String code,String message,List<FieldError> fieldErrors,List<ImportRowError> rowErrors) {}
 @ExceptionHandler(ImportProblem.class)
 ResponseEntity<?> problem(ImportProblem p) {
  if(p.code.equals("IMPORT_VALIDATION_ERROR"))return ResponseEntity.status(p.status).body(new RowErrorBody(p.code,p.getMessage(),p.fields,p.rows));
  return ResponseEntity.status(p.status).body(new ErrorBody(p.code,p.getMessage(),p.fields));
 }
 @ExceptionHandler(MaxUploadSizeExceededException.class)
 ResponseEntity<?> size(HttpServletRequest request) {return multipartProblem(ImportProblem.tooLarge(),request);}
 @ExceptionHandler(MissingServletRequestPartException.class)
 ResponseEntity<?> missing(HttpServletRequest request) {return multipartProblem(ImportProblem.invalidFile(),request);}
 private ResponseEntity<?> multipartProblem(ImportProblem p,HttpServletRequest request) {
  if(request.getAttribute("importFailureLogged")==null&&request.getRequestURI().equals("/api/v1/employees/import")&&AuditService.current()!=null&&AuditService.current().role()==Role.ADMIN) {
   audit.importFailure(p.code,1);request.setAttribute("importFailureLogged",true);
  }
  return problem(p);
 }
}
