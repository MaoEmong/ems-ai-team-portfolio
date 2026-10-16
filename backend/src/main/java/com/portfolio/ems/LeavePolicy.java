package com.portfolio.ems;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

/** Anniversary-based leave entitlement; dates and the clock are supplied by the caller. */
public final class LeavePolicy {
 private LeavePolicy() {}

 public record Period(LocalDate start, LocalDate end, BigDecimal granted) {}

 public static Period calculate(LocalDate hireDate, LocalDate today) {
  Objects.requireNonNull(hireDate, "hireDate");
  Objects.requireNonNull(today, "today");
  if (today.isBefore(hireDate)) {
   return new Period(hireDate, hireDate.plusYears(1).minusDays(1), BigDecimal.ZERO);
  }

  int years = today.getYear() - hireDate.getYear();
  if (hireDate.plusYears(years).isAfter(today)) years--;
  // Always use the original hire date so February 29 returns in leap years.
  LocalDate start = hireDate.plusYears(years);
  LocalDate end = hireDate.plusYears((long) years + 1).minusDays(1);
  int days;
  if (years == 0) {
   days = 0;
   for (int month = 1; month <= 11; month++) {
    if (!hireDate.plusMonths(month).isAfter(today)) days++;
   }
  } else {
   days = Math.min(25, 15 + (years - 1) / 2);
  }
  return new Period(start, end, BigDecimal.valueOf(days));
 }
}
