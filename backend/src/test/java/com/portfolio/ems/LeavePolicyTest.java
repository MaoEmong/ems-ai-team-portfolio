package com.portfolio.ems;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.assertj.core.api.Assertions.assertThat;

class LeavePolicyTest {
 @ParameterizedTest
 @CsvSource({
  "2026-01-15,2026-01-15,2026-01-15,2027-01-14,0",
  "2026-01-15,2026-01-14,2026-01-15,2027-01-14,0",
  "2028-02-29,2026-10-16,2028-02-29,2029-02-27,0",
  "2026-01-15,2027-01-14,2026-01-15,2027-01-14,11",
  "2026-01-15,2027-01-15,2027-01-15,2028-01-14,15",
  "2026-01-15,2028-01-14,2027-01-15,2028-01-14,15",
  "2026-01-15,2028-01-15,2028-01-15,2029-01-14,15",
  "2026-01-15,2029-01-15,2029-01-15,2030-01-14,16",
  "2026-01-15,2030-01-15,2030-01-15,2031-01-14,16",
  "2026-01-15,2031-01-15,2031-01-15,2032-01-14,17",
  "2026-01-15,2046-01-15,2046-01-15,2047-01-14,24",
  "2026-01-15,2047-01-14,2046-01-15,2047-01-14,24",
  "2026-01-15,2047-01-15,2047-01-15,2048-01-14,25",
  "2026-01-15,2048-01-15,2048-01-15,2049-01-14,25",
  "2026-01-15,2086-01-15,2086-01-15,2087-01-14,25"
 })
 void calculatesAnniversaryPeriodAndGrant(String hire, String today, String start, String end, String granted) {
  assertPeriod(hire, today, start, end, granted);
 }

 @ParameterizedTest
 @CsvSource({
  "2024-02-29,2025-02-27,2024-02-29,2025-02-27,11",
  "2024-02-29,2025-02-28,2025-02-28,2026-02-27,15",
  "2024-02-29,2026-02-28,2026-02-28,2027-02-27,15",
  "2024-02-29,2027-02-28,2027-02-28,2028-02-28,16",
  "2024-02-29,2028-02-28,2027-02-28,2028-02-28,16",
  "2024-02-29,2028-02-29,2028-02-29,2029-02-27,16",
  "2024-02-29,2029-02-28,2029-02-28,2030-02-27,17",
  "2024-02-29,2032-02-29,2032-02-29,2033-02-27,18",
  "2024-02-28,2028-02-28,2028-02-28,2029-02-27,16"
 })
 void restoresOriginalLeapDayRatherThanChainingAdjustedAnniversaries(String hire, String today, String start, String end, String granted) {
  assertPeriod(hire, today, start, end, granted);
 }

 @ParameterizedTest
 @CsvSource({
  "2025-01-31,2025-02-27,0",
  "2025-01-31,2025-02-28,1",
  "2025-01-31,2025-03-28,1",
  "2025-01-31,2025-03-30,1",
  "2025-01-31,2025-03-31,2",
  "2025-01-31,2025-04-29,2",
  "2025-01-31,2025-04-30,3",
  "2024-01-31,2024-02-28,0",
  "2024-01-31,2024-02-29,1",
  "2025-08-31,2025-09-30,1",
  "2025-08-31,2025-10-30,1",
  "2025-08-31,2025-10-31,2",
  "2025-08-31,2026-02-28,6",
  "2024-02-29,2024-03-28,0",
  "2024-02-29,2024-03-29,1"
 })
 void countsMonthsFromOriginalHireDateAtMonthEnds(String hire, String today, String granted) {
  LocalDate hireDate = LocalDate.parse(hire);
  var period = LeavePolicy.calculate(hireDate, LocalDate.parse(today));
  assertThat(period.start()).isEqualTo(hireDate);
  assertThat(period.end()).isEqualTo(hireDate.plusYears(1).minusDays(1));
  assertThat(period.granted()).isEqualByComparingTo(granted);
 }

 @Test void grantsOneDayOnEachOfTheElevenMonthlyBoundaries() {
  LocalDate hire = LocalDate.of(2026,1,15);
  for (int month = 1; month <= 11; month++) {
   LocalDate boundary = hire.plusMonths(month);
   assertThat(LeavePolicy.calculate(hire,boundary.minusDays(1)).granted())
    .as("before monthly boundary %s", month).isEqualByComparingTo(Integer.toString(month-1));
   assertThat(LeavePolicy.calculate(hire,boundary).granted())
    .as("on monthly boundary %s", month).isEqualByComparingTo(Integer.toString(month));
   assertThat(LeavePolicy.calculate(hire,boundary.plusDays(1)).granted())
    .as("after monthly boundary %s", month).isEqualByComparingTo(Integer.toString(month));
  }
  assertThat(LeavePolicy.calculate(hire,LocalDate.of(2027,1,14)).granted()).isEqualByComparingTo("11");
  assertThat(LeavePolicy.calculate(hire,LocalDate.of(2027,1,15)).granted()).isEqualByComparingTo("15");
 }

 private static void assertPeriod(String hire, String today, String start, String end, String granted) {
  var period = LeavePolicy.calculate(LocalDate.parse(hire), LocalDate.parse(today));
  assertThat(period.start()).isEqualTo(LocalDate.parse(start));
  assertThat(period.end()).isEqualTo(LocalDate.parse(end));
  assertThat(period.granted()).isEqualByComparingTo(granted);
 }
}
