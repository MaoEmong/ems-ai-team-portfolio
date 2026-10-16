package com.portfolio.ems;

import jakarta.validation.Validator;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.zip.*;

@Component
class SheetCodec {
 public record Row(int row, Dto.CreateEmployee employee) {}
 private static final String[] INPUT = {"employeeNo","name","email","phone","hireDate","departmentId","positionId","role","initialPassword"};
 private static final String[] OUTPUT = {"employeeNo","name","email","phone","hireDate","status","retireDate","departmentName","positionName","role"};
 private static final long MIB = 1024L * 1024;
 private final Validator validator;
 public SheetCodec(Validator validator) { this.validator = validator; }

 public List<Row> read(byte[] bytes, String filename) {
  if (bytes != null && bytes.length > 5 * MIB) throw ImportProblem.tooLarge();
  if (bytes == null || filename == null || !filename.toLowerCase(Locale.ROOT).endsWith(".xlsx")) throw ImportProblem.invalidFile();
  checkZip(bytes);
  try (var book = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
   var sheet = book.getSheet("employees");
   if (sheet == null) throw ImportProblem.invalidFile();
   var header = sheet.getRow(0);
   if (header == null || header.getLastCellNum() != INPUT.length) throw ImportProblem.invalidFile();
   for (int i = 0; i < INPUT.length; i++) {
    var cell = header.getCell(i);
    if (cell == null || cell.getCellType() != CellType.STRING || !INPUT[i].equals(cell.getStringCellValue())) throw ImportProblem.invalidFile();
   }
   var result = new ArrayList<Row>();
   var errors = new ArrayList<ImportRowError>();
   int count = 0;
   for (var source : sheet) {
    if (source.getRowNum() == 0 || empty(source)) continue;
    if (++count > 1000) throw ImportProblem.invalidFile();
    int number = source.getRowNum() + 1;
    var rowErrors = new LinkedHashMap<String,String>();
    String[] values = new String[INPUT.length];
    for (var cell : source) {
     if (cell.getColumnIndex() >= INPUT.length && cell.getCellType() == CellType.FORMULA) rowErrors.put("row", "수식은 사용할 수 없습니다.");
    }
    for (int i = 0; i < INPUT.length; i++) {
     var cell = source.getCell(i);
     if (cell == null || cell.getCellType() == CellType.BLANK) continue;
     if (cell.getCellType() == CellType.FORMULA) rowErrors.put(INPUT[i], "수식은 사용할 수 없습니다.");
     else if (cell.getCellType() == CellType.STRING) values[i] = cell.getStringCellValue();
     else if ((i == 5 || i == 6) && cell.getCellType() == CellType.NUMERIC) {
      try { values[i] = BigDecimal.valueOf(cell.getNumericCellValue()).toBigIntegerExact().toString(); }
      catch (ArithmeticException | NumberFormatException e) { rowErrors.put(INPUT[i], "양의 정수가 필요합니다."); }
     } else rowErrors.put(INPUT[i], "문자열 서식 필요");
    }
    LocalDate date = null;
    if (values[4] != null) {
     try {
      if (!values[4].matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
      date = LocalDate.parse(values[4]);
      if (date.getYear() < 1) throw new IllegalArgumentException();
     } catch (RuntimeException e) { rowErrors.putIfAbsent("hireDate", "유효한 YYYY-MM-DD 날짜가 필요합니다."); }
    }
    Long department = id(values[5], "departmentId", rowErrors);
    Long position = id(values[6], "positionId", rowErrors);
    Role role = null;
    if (values[7] != null) {
     try { role = Role.valueOf(values[7]); }
     catch (IllegalArgumentException e) { rowErrors.putIfAbsent("role", "유효한 권한이 필요합니다."); }
    }
    var employee = new Dto.CreateEmployee(values[0],values[1],values[2],values[3],date,department,position,role,values[8]);
    validator.validate(employee).forEach(v -> rowErrors.putIfAbsent(v.getPropertyPath().toString(), "필수값 또는 입력 형식을 확인해 주세요."));
    if (values[8] != null && values[8].getBytes(StandardCharsets.UTF_8).length > 72) rowErrors.putIfAbsent("initialPassword", "UTF-8 기준 72바이트 이하여야 합니다.");
    rowErrors.forEach((field,reason) -> errors.add(new ImportRowError(number,field,reason)));
    result.add(new Row(number,employee));
   }
   if (count == 0) throw ImportProblem.invalidFile();
   if (!errors.isEmpty()) throw ImportProblem.rows(List.copyOf(errors));
   return List.copyOf(result);
  } catch (ApiException e) { throw e; }
  catch (IOException | RuntimeException e) { throw ImportProblem.invalidFile(); }
 }

 private static Long id(String value, String field, Map<String,String> errors) {
  if (value == null) return null;
  try {
   if (!value.matches("[0-9]+")) throw new IllegalArgumentException();
   long parsed = Long.parseLong(value);
   if (parsed <= 0) throw new IllegalArgumentException();
   return parsed;
  } catch (IllegalArgumentException e) { errors.putIfAbsent(field,"양의 정수가 필요합니다."); return null; }
 }

 private static boolean empty(org.apache.poi.ss.usermodel.Row row) {
  for (var cell : row) {
   if (cell.getCellType() != CellType.BLANK && !(cell.getCellType() == CellType.STRING && cell.getStringCellValue().isEmpty())) return false;
  }
  return true;
 }

 private static void checkZip(byte[] bytes) {
  if (bytes.length < 4 || bytes[0] != 'P' || bytes[1] != 'K' || bytes[2] != 3 || bytes[3] != 4) throw ImportProblem.invalidFile();
  long total = 0;
  var names = new HashSet<String>();
  try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
   ZipEntry entry;
   byte[] buffer = new byte[8192];
   while ((entry = zip.getNextEntry()) != null) {
    if (!names.add(entry.getName()) || names.size() > 10000) throw ImportProblem.invalidFile();
    long size = 0;
    int n;
    while ((n = zip.read(buffer)) != -1) {
     size += n; total += n;
     if (size > 10 * MIB || total > 20 * MIB) throw ImportProblem.invalidFile();
    }
    if (size > 100000 && entry.getCompressedSize() >= 0 && size > entry.getCompressedSize() * 100L) throw ImportProblem.invalidFile();
    zip.closeEntry();
   }
   if (!names.contains("[Content_Types].xml") || !names.contains("xl/workbook.xml")) throw ImportProblem.invalidFile();
  } catch (IOException | IllegalArgumentException e) { throw ImportProblem.invalidFile(); }
 }

 public byte[] template(List<Dto.DepartmentView> departments, List<Dto.PositionView> positions) {
  try (var book = new XSSFWorkbook()) {
   var employees = book.createSheet("employees");
   write(employees,0,INPUT);
   var style = book.createCellStyle();
   style.setDataFormat(book.createDataFormat().getFormat("@"));
   for (int col : new int[]{0,4,8}) employees.setDefaultColumnStyle(col,style);
   var ds = book.createSheet("departments"); write(ds,0,new String[]{"id","name"});
   for (var d : departments) write(ds,ds.getLastRowNum()+1,new String[]{text(d.id()),text(d.name())});
   var ps = book.createSheet("positions"); write(ps,0,new String[]{"id","name","level"});
   for (var p : positions) write(ps,ps.getLastRowNum()+1,new String[]{text(p.id()),text(p.name()),text(p.level())});
   return bytes(book);
  } catch (IOException e) { throw new IllegalStateException("양식 파일 생성 실패",e); }
 }

 public byte[] export(List<Dto.EmployeeView> rows, String format) {
  if ("csv".equals(format)) {
   var csv = new StringBuilder("\uFEFF");
   csvRow(csv,OUTPUT);
   rows.forEach(row -> csvRow(csv,values(row)));
   return csv.toString().getBytes(StandardCharsets.UTF_8);
  }
  if (!"xlsx".equals(format)) throw new IllegalArgumentException("지원하지 않는 파일 형식");
  try (var book = new XSSFWorkbook()) {
   var sheet = book.createSheet("employees"); write(sheet,0,OUTPUT);
   for (var row : rows) write(sheet,sheet.getLastRowNum()+1,values(row));
   return bytes(book);
  } catch (IOException e) { throw new IllegalStateException("내보내기 파일 생성 실패",e); }
 }

 private static String[] values(Dto.EmployeeView e) {
  return new String[]{text(e.employeeNo()),text(e.name()),text(e.email()),text(e.phone()),text(e.hireDate()),text(e.status()),text(e.retireDate()),e.department()==null?"":text(e.department().name()),e.position()==null?"":text(e.position().name()),text(e.role())};
 }
 private static String text(Object value) { return value == null ? "" : value.toString(); }
 private static void write(Sheet sheet, int index, String[] values) {
  var row = sheet.createRow(index);
  for (int i=0;i<values.length;i++) row.createCell(i,CellType.STRING).setCellValue(values[i]);
 }
 private static byte[] bytes(Workbook book) throws IOException {
  var out = new ByteArrayOutputStream(); book.write(out); return out.toByteArray();
 }
 private static void csvRow(StringBuilder csv, String[] values) {
  for (int i=0;i<values.length;i++) {
   if (i>0) csv.append(',');
   String value = values[i];
   if (!value.isEmpty() && "=+-@\t\r".indexOf(value.charAt(0))>=0) value = "'"+value;
   if (value.indexOf(',')>=0 || value.indexOf('"')>=0 || value.indexOf('\r')>=0 || value.indexOf('\n')>=0) csv.append('"').append(value.replace("\"","\"\"")).append('"');
   else csv.append(value);
  }
  csv.append("\r\n");
 }
}
