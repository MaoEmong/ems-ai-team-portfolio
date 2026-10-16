package com.portfolio.ems;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.Flow;
class ProviderHttpLlmClient implements LlmClient{
 private final AiSettings settings;private final HttpClient http;
 ProviderHttpLlmClient(AiSettings settings){this.settings=settings;http=HttpClient.newBuilder().connectTimeout(Duration.ofMillis(Math.max(1,Math.min(5000,settings.timeout)))).followRedirects(HttpClient.Redirect.NEVER).build();}
 public String complete(Request request){
  settings.requireConfigured();
  if(settings.mock())return MockLlm.complete(request);
  boolean claude=settings.provider.equals("anthropic");
  Map<String,Object> body=claude?Map.of("model",settings.model,"max_tokens",settings.maxTokens,"stream",false,"system",request.system(),"messages",List.of(Map.of("role","user","content",request.data().toString()))):
   Map.of("model",settings.model,"stream",false,"format","json","system",request.system(),"prompt",request.data().toString(),"options",Map.of("num_predict",settings.maxTokens));
  String url=settings.baseUrl.replaceAll("/+$","")+(claude?"/v1/messages":"/api/generate");
  var builder=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMillis(settings.timeout)).header("Content-Type","application/json");
  if(claude)builder.header("x-api-key",settings.key).header("anthropic-version","2023-06-01");
  var future=http.sendAsync(builder.POST(HttpRequest.BodyPublishers.ofString(AiJson.encode(body),StandardCharsets.UTF_8)).build(),info->new LimitedBody());
  try{
   var response=future.get(settings.timeout,TimeUnit.MILLISECONDS);int status=response.statusCode();
   if(status==429||status>=500)throw AiProblem.of(502,"AI_PROVIDER_ERROR",true);
   if(status<200||status>=300)throw AiProblem.of(502,"AI_PROVIDER_REJECTED",false);
   JsonNode envelope=AiJson.parse(new String(response.body(),StandardCharsets.UTF_8),131072,false);
   if(claude){
    var content=envelope.path("content");if(!content.isArray()||content.isEmpty())throw AiProblem.invalid();
    var result=new StringBuilder();
    for(var block:content){if(!"text".equals(block.path("type").asText())||!block.path("text").isTextual())throw AiProblem.invalid();result.append(block.path("text").asText());}
    if(result.toString().getBytes(StandardCharsets.UTF_8).length>65536)throw AiProblem.invalid();return result.toString();
   }
   if(!envelope.path("done").asBoolean(false)||!envelope.path("response").isTextual())throw AiProblem.invalid();
   String result=envelope.path("response").asText();if(result.getBytes(StandardCharsets.UTF_8).length>65536)throw AiProblem.invalid();return result;
  }catch(TimeoutException e){future.cancel(true);throw AiProblem.of(504,"AI_TIMEOUT",true);}
  catch(InterruptedException e){future.cancel(true);Thread.currentThread().interrupt();throw AiProblem.of(502,"AI_PROVIDER_ERROR",true);}
  catch(ExecutionException e){
   if(e.getCause() instanceof java.net.http.HttpTimeoutException)throw AiProblem.of(504,"AI_TIMEOUT",true);
   if(e.getCause() instanceof AiProblem p)throw p;
   throw AiProblem.of(502,"AI_PROVIDER_ERROR",true);
  }
 }
 static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]>{
  private final CompletableFuture<byte[]> result=new CompletableFuture<>();private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();private Flow.Subscription subscription;
  public CompletionStage<byte[]> getBody(){return result;}
  public void onSubscribe(Flow.Subscription s){subscription=s;s.request(1);}
  public void onNext(List<ByteBuffer> chunks){
   for(var chunk:chunks){if(bytes.size()+chunk.remaining()>131072){subscription.cancel();result.completeExceptionally(AiProblem.invalid());return;}byte[] data=new byte[chunk.remaining()];chunk.get(data);bytes.writeBytes(data);}
   subscription.request(1);
  }
  public void onError(Throwable t){result.completeExceptionally(t);}
  public void onComplete(){result.complete(bytes.toByteArray());}
 }
}
final class MockLlm{
 static String complete(LlmClient.Request r){
  return switch(r.feature()){
   case "AI-01"->{
    String q=r.data().path("question").asText();var filters=new LinkedHashMap<String,Object>();
    if(q.matches("(?s).*(직책|팀장|입사|급여|SQL|SELECT|프롬프트|무시|ignore|system).*"))yield AiJson.encode(Map.of("status","UNSUPPORTED","filters",Map.of(),"message","직책·입사일 범위 및 지원하지 않는 조건은 제안할 수 없습니다."));
    if(q.contains("휴직"))filters.put("status","ON_LEAVE");else if(q.contains("퇴사"))filters.put("status","RETIRED");else if(q.contains("재직")||q.contains("활성"))filters.put("status","ACTIVE");
    if(q.contains("이름"))filters.put("sort","name,asc");
    for(var d:r.data().path("departments"))if(q.contains(d.path("name").asText())){filters.put("departmentId",d.path("id").asLong());break;}
    yield AiJson.encode(Map.of("status",filters.isEmpty()?"AMBIGUOUS":"OK","filters",filters,"message",filters.isEmpty()?"지원하는 부서나 상태 조건을 구체적으로 입력해 주세요.":"제안된 조건을 확인한 뒤 적용하세요."));
   }
   case "AI-02"->AiJson.encode(Map.of("summary","합성 평가 코멘트를 확인하는 데 도움을 주는 고정 시연 요약입니다. 실제 추론 결과가 아니므로 원문을 확인하세요."));
   default->{
    String q=r.data().path("question").asText();
    JsonNode chosen=null;for(var section:r.data().path("policies"))if(q.contains("반차")&&section.path("sectionId").asText().equals("HALF_DAY"))chosen=section;
    if(chosen==null){var no=AiJson.JSON.createObjectNode();no.put("status","INSUFFICIENT_EVIDENCE");no.putNull("answer");no.putArray("citations");yield no.toString();}
    yield AiJson.encode(Map.of("status","ANSWERED","answer","데모 규정의 반차 기준을 확인하세요.","citations",List.of(Map.of("documentId",chosen.path("documentId").asText(),"version",chosen.path("version").asText(),"sectionId",chosen.path("sectionId").asText(),"excerpt","오전 반차일의 출근 기준은 14:00입니다."))));
   }
  };
 }
}

@Component
class HttpLlmClient implements LlmClient {
 private final LlmClient delegate;
 HttpLlmClient(AiSettings settings) { delegate=switch(settings.provider) {case "mock" -> new MockLlmClient(settings); case "anthropic" -> new AnthropicLlmClient(settings); case "ollama" -> new OllamaLlmClient(settings); default -> request -> {throw AiProblem.of(503,"AI_NOT_CONFIGURED",false);};}; }
 public String complete(Request request) {return delegate.complete(request);}
}
final class MockLlmClient implements LlmClient {
 private final AiSettings settings;
 MockLlmClient(AiSettings settings){this.settings=settings;}
 public String complete(Request request){settings.requireConfigured();return MockLlm.complete(request);}
}
final class AnthropicLlmClient implements LlmClient {
 private final ProviderHttpLlmClient transport;
 AnthropicLlmClient(AiSettings settings){transport=new ProviderHttpLlmClient(settings);}
 public String complete(Request request){return transport.complete(request);}
}
final class OllamaLlmClient implements LlmClient {
 private final ProviderHttpLlmClient transport;
 OllamaLlmClient(AiSettings settings){transport=new ProviderHttpLlmClient(settings);}
 public String complete(Request request){return transport.complete(request);}
}
