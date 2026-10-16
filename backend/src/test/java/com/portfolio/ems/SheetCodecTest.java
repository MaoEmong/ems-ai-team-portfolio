package com.portfolio.ems;

import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Consumer;
import java.util.zip.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SheetCodecTest {
 static ValidatorFactory factory;
 SheetCodec codec;
 @BeforeAll static void start() { factory = Validation.buildDefaultValidatorFactory(); }
 @AfterAll static void stop() { factory.close(); }
 @BeforeEach void setup() { codec = new SheetCodec(factory.getValidator()); }

 @Test void preservesLeadingZeroWhitespaceAndActualRowNumber() throws Exception {
  byte[] file = file(book -> {
   var sheet = book.getSheet("employees");
   sheet.removeRow(sheet.getRow(1));
   validRow(sheet,4);
   sheet.getRow(4).getCell(1).setCellValue(" 가상사원 ");
   sheet.getRow(4).getCell(8).setCellValue(" test-password ");
   sheet.getRow(4).getCell(5).setCellValue(2);
  });
  var rows = codec.read(file,"employees.xlsx");
  assertThat(rows).hasSize(1);
  assertThat(rows.get(0).row()).isEqualTo(5);
  assertThat(rows.get(0).employee().employeeNo()).isEqualTo("000101");
  assertThat(rows.get(0).employee().name()).isEqualTo(" 가상사원 ");
  assertThat(rows.get(0).employee().initialPassword()).isEqualTo(" test-password ");
  assertThat(rows.get(0).employee().departmentId()).isEqualTo(2L);
  assertThat(rows.get(0).employee().hireDate()).isEqualTo(LocalDate.of(2026,10,16));
 }

 @ParameterizedTest @ValueSource(ints={0,4,8})
 void rejectsNumericIdentityDateAndPassword(int column) throws Exception {
  byte[] input = file(book -> book.getSheet("employees").getRow(1).getCell(column).setCellValue(12345));
  String field = switch(column) { case 0 -> "employeeNo"; case 4 -> "hireDate"; default -> "initialPassword"; };
  try(var problems = mockStatic(ImportProblem.class,CALLS_REAL_METHODS)) {
   rejects(input,"IMPORT_VALIDATION_ERROR");
   problems.verify(() -> ImportProblem.rows(argThat(errors -> errors.contains(new ImportRowError(2,field,"문자열 서식 필요")))));
  }
 }
 @Test void rejectsExcelDateEvenWithDateDisplayFormat() throws Exception {
  rejects(file(book -> {
   var cell = book.getSheet("employees").getRow(1).getCell(4);
   cell.setCellValue(LocalDate.of(2026,10,16));
   var style = book.createCellStyle(); style.setDataFormat(book.createDataFormat().getFormat("yyyy-mm-dd")); cell.setCellStyle(style);
  }),"IMPORT_VALIDATION_ERROR");
 }
 @ParameterizedTest @ValueSource(ints={0,5,8,10})
 void rejectsFormulaIncludingExtraColumn(int column) throws Exception {
  rejects(file(book -> book.getSheet("employees").getRow(1).createCell(column).setCellFormula("1+1")),"IMPORT_VALIDATION_ERROR");
 }
 @ParameterizedTest @ValueSource(strings={"2026-02-30","2026-1-01","2026-10-16 ","0000-01-01"})
 void rejectsInvalidDate(String value) throws Exception {
  rejects(file(book -> book.getSheet("employees").getRow(1).getCell(4).setCellValue(value)),"IMPORT_VALIDATION_ERROR");
 }
 @ParameterizedTest @ValueSource(strings={"0","-1","1.5"," 1","9223372036854775808"})
 void rejectsInvalidId(String value) throws Exception {
  rejects(file(book -> book.getSheet("employees").getRow(1).getCell(5).setCellValue(value)),"IMPORT_VALIDATION_ERROR");
 }
 @Test void validatesBeanConstraintsAndUtf8PasswordLimit() throws Exception {
  rejects(file(book -> book.getSheet("employees").getRow(1).getCell(2).setCellValue("invalid-email")),"IMPORT_VALIDATION_ERROR");
  rejects(file(book -> book.getSheet("employees").getRow(1).getCell(8).setCellValue("가".repeat(25))),"IMPORT_VALIDATION_ERROR");
  assertThat(codec.read(file(book -> book.getSheet("employees").getRow(1).getCell(8).setCellValue("가".repeat(24))),"ok.xlsx")).hasSize(1);
 }
 @Test void requiresExactHeadersAndSheet() throws Exception {
  rejects(file(book -> book.getSheet("employees").getRow(0).getCell(0).setCellValue("employeeNo ")),"IMPORT_INVALID_FILE");
  rejects(file(book -> book.getSheet("employees").getRow(0).createCell(9).setCellValue("extra")),"IMPORT_INVALID_FILE");
  rejects(file(book -> book.setSheetName(0,"wrong")),"IMPORT_INVALID_FILE");
 }
 @Test void rejectsEmptyAndTooManyRowsButAllows1000() throws Exception {
  rejects(codec.template(List.of(),List.of()),"IMPORT_INVALID_FILE");
  rejects(file(book -> { for (int i=2;i<=1001;i++) validRow(book.getSheet("employees"),i); }),"IMPORT_INVALID_FILE");
  assertThat(codec.read(file(book -> { for(int i=2;i<=1000;i++) validRow(book.getSheet("employees"),i); }),"ok.xlsx")).hasSize(1000);
 }
 @Test void rejectsWrongExtensionCorruptionAndFileSize() throws Exception {
  byte[] valid = file(book -> {});
  assertThatThrownBy(() -> codec.read(valid,"file.xls")).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.code).isEqualTo("IMPORT_INVALID_FILE"));
  rejects(new byte[]{1,2,3},"IMPORT_INVALID_FILE");
  rejects(Arrays.copyOf(valid,valid.length/2),"IMPORT_INVALID_FILE");
  rejects(new byte[5*1024*1024+1],"FILE_TOO_LARGE");
 }
 @Test void rejectsActualEntrySizeAndExcessiveCompression() throws Exception {
  assertThat(codec.read(zip(1,1024,true),"ok.xlsx")).hasSize(1);
  rejects(zip(1,10*1024*1024+1,false),"IMPORT_INVALID_FILE");
  rejects(zip(1,1024*1024,false),"IMPORT_INVALID_FILE");
 }
 @Test void rejectsTotalInflatedSizeBelowUploadSizeLimit() throws Exception {
  byte[] archive = zip(3,7*1024*1024+1,true);
  assertThat(archive.length).isLessThan(5*1024*1024);
  rejects(archive,"IMPORT_INVALID_FILE");
 }
 @Test void templateContainsReferencesAndTextColumnStylesWithoutDataRows() throws Exception {
  try(var book = new XSSFWorkbook(new ByteArrayInputStream(codec.template(List.of(new Dto.DepartmentView(2L,"개발",null)),List.of(new Dto.PositionView(3L,"사원",1)))))) {
   var employees = book.getSheet("employees");
   assertThat(employees.getPhysicalNumberOfRows()).isEqualTo(1);
   assertThat(employees.getRow(0).getLastCellNum()).isEqualTo((short)9);
   for(int i : new int[]{0,4,8}) assertThat(employees.getColumnStyle(i).getDataFormatString()).isEqualTo("@");
   assertThat(book.getSheet("departments").getRow(1).getCell(1).getStringCellValue()).isEqualTo("개발");
   assertThat(book.getSheet("positions").getRow(0).getCell(2).getStringCellValue()).isEqualTo("level");
  }
 }
 @Test void csvUsesBomQuotesAndEscapesFormulaPrefixes() {
  String csv = new String(codec.export(List.of(employee("=1+1","가상,\"사원\"\n다음","\rphone")),"csv"),StandardCharsets.UTF_8);
  assertThat(csv).startsWith("\uFEFFemployeeNo,name,email,phone,hireDate,status,retireDate,departmentName,positionName,role\r\n");
  assertThat(csv).contains("'=1+1","\"가상,\"\"사원\"\"\n다음\"","\"'\rphone\"").endsWith("EMPLOYEE\r\n");
  for(String prefix : List.of("=","+","-","@","\t","\r")) {
   String value = new String(codec.export(List.of(employee(prefix+"value","name","")),"csv"),StandardCharsets.UTF_8);
   assertThat(value).contains("'"+prefix+"value");
  }
 }
 @Test void xlsxExportsOnlyTenStringColumnsEvenForFormulaLikeInput() throws Exception {
  try(var book = new XSSFWorkbook(new ByteArrayInputStream(codec.export(List.of(employee("000101","=1+1",null)),"xlsx")))) {
   for(var row : book.getSheetAt(0)) {
    assertThat(row.getLastCellNum()).isEqualTo((short)10);
    for(var cell : row) assertThat(cell.getCellType()).isEqualTo(CellType.STRING);
   }
   assertThat(book.getSheetAt(0).getRow(1).getCell(1).getStringCellValue()).isEqualTo("=1+1");
   assertThat(book.getSheetAt(0).getRow(1).getCell(6).getStringCellValue()).isEmpty();
  }
 }

 private byte[] file(Consumer<XSSFWorkbook> change) throws Exception {
  try(var book = new XSSFWorkbook(new ByteArrayInputStream(codec.template(List.of(),List.of())))) {
   validRow(book.getSheet("employees"),1); change.accept(book);
   var out = new ByteArrayOutputStream(); book.write(out); return out.toByteArray();
  }
 }
 private static void validRow(Sheet sheet,int index) {
  var row = sheet.createRow(index);
  String[] values = {"000101","가상사원","test@example.invalid","010-0000-0000","2026-10-16","1","1","EMPLOYEE","test-password"};
  for(int i=0;i<values.length;i++) row.createCell(i).setCellValue(values[i]);
 }
 private void rejects(byte[] file,String code) {
  assertThatThrownBy(() -> codec.read(file,"employees.xlsx")).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.code).isEqualTo(code));
 }
 private byte[] zip(int entries,int size,boolean mixed) throws Exception {
  byte[] content = new byte[size];
  if(mixed) { var random = new Random(1234); for(int i=0;i<size;i++) content[i]=(byte)random.nextInt(2); }
  var out = new ByteArrayOutputStream();
  try(var zip = new ZipOutputStream(out)) {
   try(var input = new ZipInputStream(new ByteArrayInputStream(file(book -> {})))) {
    ZipEntry entry;
    while((entry=input.getNextEntry())!=null) {
     zip.putNextEntry(new ZipEntry(entry.getName()));
     if ("[Content_Types].xml".equals(entry.getName())) {
      // Extra ZIP entries must also be valid OPC parts for the small-file control.
      String types = new String(input.readAllBytes(),StandardCharsets.UTF_8);
      types = types.replace("</Types>","<Default Extension=\"bin\" ContentType=\"application/octet-stream\"/></Types>");
      zip.write(types.getBytes(StandardCharsets.UTF_8));
     } else input.transferTo(zip);
     zip.closeEntry();
    }
   }
   for(int i=0;i<entries;i++) { zip.putNextEntry(new ZipEntry("entry"+i+".bin")); zip.write(content); zip.closeEntry(); }
  }
  return out.toByteArray();
 }
 private static Dto.EmployeeView employee(String number,String name,String phone) {
  return new Dto.EmployeeView(1L,number,name,"test@example.invalid",phone,LocalDate.of(2026,10,16),EmployeeStatus.ACTIVE,null,new Dto.DepartmentRef(1L,"개발"),new Dto.PositionView(1L,"사원",1),Role.EMPLOYEE);
 }
}
