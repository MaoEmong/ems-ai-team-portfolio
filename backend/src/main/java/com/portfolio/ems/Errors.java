package com.portfolio.ems;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import java.util.List;
record FieldError(String field,String reason) {}
record ErrorBody(String code,String message,List<FieldError> fieldErrors) {}
class ApiException extends RuntimeException {
 final int status; final String code; final List<FieldError> fields;
 ApiException(int status,String code,String message) { this(status,code,message,List.of()); }
 ApiException(int status,String code,String message,List<FieldError> fields) {
  super(message); this.status=status; this.code=code; this.fields=fields;
 }
 static ApiException missing() { return new ApiException(404,"NOT_FOUND","리소스를 찾을 수 없습니다."); }
 static ApiException conflict(String code) { return new ApiException(409,code,"요청이 현재 데이터와 충돌합니다."); }
 static ApiException invalid(String field,String reason) {
  return new ApiException(400,"VALIDATION_ERROR","입력값을 확인해 주세요.",List.of(new FieldError(field,reason)));
 }
}
@RestControllerAdvice
class Errors {
 @ExceptionHandler(ApiException.class)
 ResponseEntity<ErrorBody> api(ApiException e) {
  return ResponseEntity.status(e.status).body(new ErrorBody(e.code,e.getMessage(),e.fields));
 }
 @ExceptionHandler(MethodArgumentNotValidException.class)
 ResponseEntity<ErrorBody> validation(MethodArgumentNotValidException e) {
  return ResponseEntity.badRequest().body(new ErrorBody("VALIDATION_ERROR","입력값을 확인해 주세요.",
   e.getBindingResult().getFieldErrors().stream().map(f->new FieldError(f.getField(),f.getDefaultMessage())).toList()));
 }
 @ExceptionHandler(HttpMessageNotReadableException.class)
 ResponseEntity<ErrorBody> malformed(HttpMessageNotReadableException e) {
  String field="body";
  if(e.getCause() instanceof com.fasterxml.jackson.databind.JsonMappingException m && !m.getPath().isEmpty())
   field=m.getPath().get(0).getFieldName();
  return api(ApiException.invalid(field,"JSON 형식 또는 값이 올바르지 않습니다."));
 }
 @ExceptionHandler(org.springframework.web.bind.MissingServletRequestParameterException.class)
 ResponseEntity<ErrorBody> missingParameter(org.springframework.web.bind.MissingServletRequestParameterException e) {return api(ApiException.invalid(e.getParameterName(),"필수 파라미터입니다."));}
 @ExceptionHandler(MethodArgumentTypeMismatchException.class)
 ResponseEntity<ErrorBody> type(MethodArgumentTypeMismatchException e) {
  return api(ApiException.invalid(e.getName(),"형식이 올바르지 않습니다."));
 }
 @ExceptionHandler(AccessDeniedException.class)
 ResponseEntity<ErrorBody> forbidden() { return api(new ApiException(403,"FORBIDDEN","접근 권한이 없습니다.")); }
 @ExceptionHandler(DataIntegrityViolationException.class)
 ResponseEntity<ErrorBody> integrity(DataIntegrityViolationException e) {
  String msg=String.valueOf(e.getMostSpecificCause().getMessage()).toLowerCase();
  String code;
  if(msg.contains("uk_employee_no")) code="DUPLICATE_EMPLOYEE_NO";
  else if(msg.contains("uk_employee_email")) code="DUPLICATE_EMAIL";
  else if(msg.contains("uk_department_name")||msg.contains("uk_position_name")) code="DUPLICATE_NAME";
  else if(msg.contains("fk_employee_department")) code="DEPARTMENT_IN_USE";
  else if(msg.contains("fk_employee_position")) code="POSITION_IN_USE";
  else return ResponseEntity.internalServerError().body(new ErrorBody("INTERNAL_ERROR","서버 오류가 발생했습니다.",List.of()));
  return api(ApiException.conflict(code));
 }
}
