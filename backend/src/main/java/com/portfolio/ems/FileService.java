package com.portfolio.ems;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;
import java.io.IOException;

@Service
class FileService {
 private final SheetCodec codec;private final EmployeeService employees;private final EmployeeRepository repository;
 private final DepartmentRepository departments;private final PositionRepository positions;
 private final AuditService audit;private final TransactionTemplate transaction;private final JdbcTemplate jdbc;private final ObjectMapper json;
 FileService(SheetCodec codec,EmployeeService employees,EmployeeRepository repository,DepartmentRepository departments,
  PositionRepository positions,AuditService audit,PlatformTransactionManager manager,JdbcTemplate jdbc,ObjectMapper json) {
  this.codec=codec;this.employees=employees;this.repository=repository;this.departments=departments;this.positions=positions;
  this.audit=audit;transaction=new TransactionTemplate(manager);this.jdbc=jdbc;this.json=json;
 }
 @Transactional(readOnly=true)
 public byte[] template() {
  return codec.template(departments.findAll(org.springframework.data.domain.Sort.by("id")).stream().map(Dto::department).toList(),
   positions.findAll(org.springframework.data.domain.Sort.by("level","id")).stream().map(Dto::position).toList());
 }
 @Transactional
 public byte[] export(String format,String keyword,Long departmentId,Long positionId,EmployeeStatus status,String sort) {
  if(format==null||!Set.of("xlsx","csv").contains(format))throw ApiException.invalid("format","xlsx 또는 csv를 지정하세요.");
  var first=employees.list(keyword,departmentId,positionId,status,0,100,sort);
  if(first.totalElements()>10000)throw new ApiException(400,"EXPORT_LIMIT_EXCEEDED","내보내기는 최대 10000행입니다.");
  List<Dto.EmployeeView> rows=new ArrayList<>(first.content());
  for(int page=1;page<first.totalPages();page++)rows.addAll(employees.list(keyword,departmentId,positionId,status,page,100,sort).content());
  byte[] data=codec.export(rows,format);
  Map<String,Object> filters=new LinkedHashMap<>();
  filters.put("keyword",keyword==null?null:keyword.substring(0,keyword.offsetByCodePoints(0,Math.min(100,keyword.codePointCount(0,keyword.length())))));
  filters.put("departmentId",departmentId);filters.put("positionId",positionId);filters.put("status",status);filters.put("sort",sort);
  audit.record("EMPLOYEE_EXPORT","EMPLOYEE",null,null,null,null,Map.of("format",format,"rowCount",rows.size(),"filters",filters));
  return data;
 }
 public ImportResult importFile(MultipartFile file) {
  try {
   if(file.getSize()>5242880)throw ImportProblem.tooLarge();
   var rows=codec.read(file.getBytes(),file.getOriginalFilename());
   return transaction.execute(tx->{
    validateDatabase(rows);
    for(var row:rows)employees.createImported(row.employee());
    audit.record("EMPLOYEE_IMPORT","EMPLOYEE",null,null,null,null,Map.of("importedCount",rows.size()));
    return new ImportResult(rows.size());
   });
  } catch(ImportProblem p) {
   audit.importFailure(p.code,p.rows.isEmpty()?1:p.rows.size());throw p;
  } catch(DataIntegrityViolationException|CannotAcquireLockException ex) {
   audit.importFailure("IMPORT_CONFLICT",1);throw ImportProblem.conflict();
  } catch(ApiException ex) {
   // A referenced row or unique value changed after the validation phase.
   audit.importFailure("IMPORT_CONFLICT",1);throw ImportProblem.conflict();
  } catch(IOException ex) {
   audit.importFailure("IMPORT_INVALID_FILE",1);throw ImportProblem.invalidFile();
  }
 }
 private void validateDatabase(List<SheetCodec.Row> rows) {
  List<ImportRowError> errors=new ArrayList<>();
  Set<Integer> noDuplicates=duplicates(rows,"employee_no"),emailDuplicates=duplicates(rows,"email");
  for(var row:rows) {
   var e=row.employee();int n=row.row();
   if(noDuplicates.contains(n)||repository.existsByEmployeeNo(e.employeeNo()))errors.add(new ImportRowError(n,"employeeNo","중복된 사번입니다."));
   if(emailDuplicates.contains(n)||repository.existsByEmailAndIdNot(e.email(),-1L))errors.add(new ImportRowError(n,"email","중복된 이메일입니다."));
   if(!departments.existsById(e.departmentId()))errors.add(new ImportRowError(n,"departmentId","부서를 찾을 수 없습니다."));
   if(!positions.existsById(e.positionId()))errors.add(new ImportRowError(n,"positionId","직급을 찾을 수 없습니다."));
  }
  if(!errors.isEmpty())throw ImportProblem.rows(errors);
 }
 private Set<Integer> duplicates(List<SheetCodec.Row> rows,String column) {
  // Read the column's actual charset/collation, including PAD/NO PAD behavior.
  var info=jdbc.queryForMap("SELECT CHARACTER_SET_NAME cs,COLLATION_NAME coll FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employee' AND COLUMN_NAME=?",column);
  String charset=String.valueOf(info.get("cs")),collation=String.valueOf(info.get("coll"));
  if(!charset.matches("[A-Za-z0-9_]+")||!collation.matches("[A-Za-z0-9_]+"))throw new IllegalStateException("Invalid schema collation");
  var values=rows.stream().map(r->Map.of("row",r.row(),"value",column.equals("employee_no")?r.employee().employeeNo():r.employee().email())).toList();
  String payload;
  try {payload=json.writeValueAsString(values);}catch(Exception ex){throw new IllegalStateException("Duplicate comparison failed");}
  String sql="SELECT rownum FROM (SELECT j.rownum,COUNT(*) OVER(PARTITION BY CONVERT(j.val USING "+charset+") COLLATE "+collation+") AS n "+
   "FROM JSON_TABLE(?, '$[*]' COLUMNS(rownum INT PATH '$.row',val VARCHAR(254) PATH '$.value')) j) grouped_values WHERE n>1";
  return new HashSet<>(jdbc.queryForList(sql,Integer.class,payload));
 }
}
