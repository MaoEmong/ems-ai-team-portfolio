package com.portfolio.ems;
import jakarta.validation.constraints.*;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;
enum LeaveType { ANNUAL, HALF_AM, HALF_PM, SICK }
enum LeaveStatus { PENDING, APPROVED, REJECTED, CANCELLED }
record LeaveInput(@NotNull LeaveType type,@NotNull LocalDate startDate,@NotNull LocalDate endDate,@NotBlank @Size(max=200) String reason) {}
record RejectInput(@NotBlank @Size(max=200) String reason) {}
record CorrectionInput(@NotNull OffsetDateTime checkIn,OffsetDateTime checkOut,@NotBlank @Size(max=200) String reason) {}
record ReadAllInput(@NotNull @PositiveOrZero Long upToId) {}
record LeaveEmployee(Long id,String employeeNo,String name) {}
record LeaveDecider(Long id,String name) {}
record LeaveView(Long id,LeaveEmployee employee,LeaveType type,LocalDate startDate,LocalDate endDate,
 BigDecimal days,String reason,LeaveStatus status,String rejectReason,LeaveDecider decidedBy,OffsetDateTime decidedAt,
 String cancelledBy,OffsetDateTime createdAt,List<String> allowedActions) {}
record BalanceView(LocalDate periodStart,LocalDate periodEnd,BigDecimal granted,BigDecimal used,BigDecimal reserved,BigDecimal available,boolean approverAvailable) {}
record DayLeave(Long id,LeaveType type) {}
record AttendanceDay(LocalDate date,OffsetDateTime checkIn,OffsetDateTime checkOut,boolean late,boolean earlyLeave,String status,
 String expectedStart,String expectedEnd,List<DayLeave> leaves,boolean corrected) {}
record AttendanceMonth(Long employeeId,String month,List<AttendanceDay> days) {}
record NotificationView(Long id,String type,String targetType,Long targetId,LocalDate targetDate,String message,boolean read,OffsetDateTime createdAt) {}
