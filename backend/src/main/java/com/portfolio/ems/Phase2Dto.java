package com.portfolio.ems;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.List;
record AppointmentInput(@NotNull LocalDate effectiveDate,@NotNull @Positive Long departmentId,
 @NotNull @Positive Long positionId,@NotBlank @Size(max=200) String reason,boolean changeJobTitle,@Positive Long jobTitleId) { AppointmentInput(LocalDate effectiveDate,Long departmentId,Long positionId,String reason){this(effectiveDate,departmentId,positionId,reason,false,null);} }
record Creator(Long id,String name) {}
record AppointmentView(Long id,Long employeeId,LocalDate effectiveDate,
 Dto.DepartmentRef fromDepartment,Dto.DepartmentRef toDepartment,
 Dto.PositionView fromPosition,Dto.PositionView toPosition,String reason,Creator createdBy,OffsetDateTime createdAt,Dto.JobTitleRef fromJobTitle,Dto.JobTitleRef toJobTitle) {}
record AuditActor(Long id,String employeeNo,String name) {}
record AuditView(Long id,OffsetDateTime occurredAt,AuditActor actor,String action,String targetType,
 Long targetId,String targetLabel,boolean success,Object before,Object after,Object metadata) {}
record ImportResult(int importedCount) {}
record ImportRowError(int row,String field,String reason) {}
class ImportProblem extends ApiException {
 final List<ImportRowError> rows;
 ImportProblem(int status,String code,List<ImportRowError> rows) {
  super(status,code,"전체 등록이 취소되었습니다."); this.rows=List.copyOf(rows);
 }
 static ImportProblem invalidFile() { return new ImportProblem(400,"IMPORT_INVALID_FILE",List.of()); }
 static ImportProblem tooLarge() { return new ImportProblem(413,"FILE_TOO_LARGE",List.of()); }
 static ImportProblem rows(List<ImportRowError> rows) { return new ImportProblem(400,"IMPORT_VALIDATION_ERROR",rows); }
 static ImportProblem conflict() { return new ImportProblem(409,"IMPORT_CONFLICT",List.of()); }
}
