package com.portfolio.ems;
import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
final class AiJson{
 static final ObjectMapper JSON=new ObjectMapper(JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build());
 static JsonNode parse(String input,int max,boolean request){
  if(input==null||input.getBytes(StandardCharsets.UTF_8).length>max)throw request?AiProblem.of(400,"AI_INPUT_TOO_LARGE",false):AiProblem.invalid();
  try(var parser=JSON.createParser(input)){
   JsonNode n=JSON.readTree(parser);if(n==null||!n.isObject()||parser.nextToken()!=null)throw new IllegalArgumentException();return n;
  }catch(Exception e){throw request?AiProblem.of(400,"VALIDATION_ERROR",false):AiProblem.invalid();}
 }
 static void keys(JsonNode node,Set<String> allowed,Set<String> required){
  if(!node.isObject())throw AiProblem.invalid();
  var actual=new HashSet<String>();node.fieldNames().forEachRemaining(actual::add);
  if(!allowed.containsAll(actual)||!actual.containsAll(required))throw AiProblem.invalid();
 }
 static String text(JsonNode n,int max){
  if(n==null||!n.isTextual()||n.asText().isBlank()||n.asText().length()>max)throw AiProblem.invalid();return n.asText();
 }
 static long id(JsonNode n){
  if(n==null||!n.isIntegralNumber()||!n.canConvertToLong()||n.longValue()<=0)throw AiProblem.invalid();return n.longValue();
 }
 static String encode(Object data){try{return JSON.writeValueAsString(data);}catch(Exception e){throw AiProblem.invalid();}}
}
