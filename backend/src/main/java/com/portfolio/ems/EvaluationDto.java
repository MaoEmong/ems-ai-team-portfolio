package com.portfolio.ems;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;

final class EvaluationDto {
 private EvaluationDto() {}
 record ItemInput(@NotBlank @Size(max=100) String name,
  @NotNull @Min(0) @Max(10000) @JsonDeserialize(using=StrictInteger.class) Integer sortOrder) {}
 record Assignment(@NotNull @Positive Long employeeId, @NotNull @Positive Long reviewerId) {}
 record CycleInput(@NotBlank @Size(max=100) String name, @NotNull LocalDate startDate,
  @NotNull LocalDate endDate, @NotNull @Size(min=1,max=20) List<@NotNull @Valid ItemInput> items,
  @NotEmpty List<@NotNull @Valid Assignment> assignments) {}
 record Item(long id, String name, int sortOrder) {}
 record Answer(@NotNull @Positive Long itemId,
  @Min(1) @Max(5) @JsonDeserialize(using=StrictInteger.class) Integer score,
  @Size(max=1000) String comment) {}
 record Answers(@NotNull List<@NotNull @Valid Answer> answers) {}
 record ReviewerInput(@NotNull @Positive Long reviewerId) {}

 /** Reject fractional and textual values instead of Jackson's default integer coercion. */
 public static final class StrictInteger extends JsonDeserializer<Integer> {
  @Override public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
   if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
    return (Integer) context.handleUnexpectedToken(Integer.class,parser);
   }
   return parser.getIntValue();
  }
 }
}
