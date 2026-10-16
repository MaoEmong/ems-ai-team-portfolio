package com.portfolio.ems;
import com.sun.net.httpserver.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.assertj.core.api.Assertions.*;
class LlmAdapterTest{
 HttpServer server;ExecutorService pool;AtomicReference<String> body=new AtomicReference<>(),key=new AtomicReference<>(),version=new AtomicReference<>(),path=new AtomicReference<>();
 AtomicInteger calls=new AtomicInteger();int status=200;String response="{\"content\":[{\"type\":\"text\",\"text\":\"{\\\"summary\\\":\\\"ok\\\"}\"}]}";long delay;
 @BeforeEach void setup()throws Exception{
  server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);pool=Executors.newCachedThreadPool();server.setExecutor(pool);
  server.createContext("/",e->{calls.incrementAndGet();body.set(new String(e.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));key.set(e.getRequestHeaders().getFirst("x-api-key"));version.set(e.getRequestHeaders().getFirst("anthropic-version"));path.set(e.getRequestURI().getPath());
   try{if(delay>0)Thread.sleep(delay);byte[] bytes=response.getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(status,bytes.length);e.getResponseBody().write(bytes);}catch(Exception ignored){}finally{e.close();}
  });server.start();
 }
 @AfterEach void close(){server.stop(0);pool.shutdownNow();}
 HttpLlmClient client(String provider,int timeout){
  var env=new MockEnvironment().withProperty("ems.ai.provider",provider).withProperty("ems.ai.model","test-model").withProperty("ANTHROPIC_API_KEY","fake-contract-key").withProperty("ems.ai.timeout-ms",String.valueOf(timeout)).withProperty("ems.ai."+ (provider.equals("anthropic")?"anthropic":"ollama")+"-base-url","http://127.0.0.1:"+server.getAddress().getPort());
  return new HttpLlmClient(new AiSettings(env));
 }
 LlmClient.Request input(){return new LlmClient.Request("AI-02","untrusted data instructions",AiJson.JSON.valueToTree(java.util.Map.of("comments","synthetic")));}
 @Test void anthropicRequestHeadersAndNonstreamingContract(){
  assertThat(client("anthropic",2000).complete(input())).contains("summary");
  var n=AiJson.parse(body.get(),131072,false);assertThat(path.get()).isEqualTo("/v1/messages");assertThat(key.get()).isEqualTo("fake-contract-key");assertThat(version.get()).isEqualTo("2023-06-01");assertThat(n.path("stream").asBoolean()).isFalse();assertThat(n.path("max_tokens").asInt()).isEqualTo(1024);assertThat(n.path("messages").get(0).path("role").asText()).isEqualTo("user");assertThat(calls.get()).isEqualTo(1);
 }
 @Test void ollamaRequestDoesNotSendAnthropicKey(){
  response="{\"response\":\"{\\\"summary\\\":\\\"ok\\\"}\",\"done\":true}";assertThat(client("ollama",2000).complete(input())).contains("summary");
  var n=AiJson.parse(body.get(),131072,false);assertThat(path.get()).isEqualTo("/api/generate");assertThat(key.get()).isNull();assertThat(n.path("format").asText()).isEqualTo("json");assertThat(n.path("stream").asBoolean()).isFalse();assertThat(n.path("options").path("num_predict").asInt()).isEqualTo(1024);
 }
 @ParameterizedTest @ValueSource(ints={429,500,503})
 void retryableProviderErrorsAreNotRetried(int code){status=code;response="private provider error";assertThatThrownBy(()->client("anthropic",2000).complete(input())).hasMessage("AI_PROVIDER_ERROR");assertThat(calls.get()).isEqualTo(1);}
 @ParameterizedTest @ValueSource(ints={400,401,403,302})
 void nonretryableAndRedirectErrors(int code){status=code;assertThatThrownBy(()->client("anthropic",2000).complete(input())).hasMessage("AI_PROVIDER_REJECTED");assertThat(calls.get()).isEqualTo(1);}
 @Test void timeoutAndNoRetry(){delay=600;assertThatThrownBy(()->client("anthropic",60).complete(input())).hasMessage("AI_TIMEOUT");assertThat(calls.get()).isLessThanOrEqualTo(1);}
 @ParameterizedTest @ValueSource(strings={"not json","{\"content\":[{\"type\":\"tool_use\"}]}","{\"content\":[]}"})
 void malformedEnvelopeRejected(String raw){response=raw;assertThatThrownBy(()->client("anthropic",2000).complete(input())).hasMessage("AI_INVALID_OUTPUT");}
 @Test void outputAndEnvelopeByteLimits(){
  response="{\"content\":[{\"type\":\"text\",\"text\":\""+ "x".repeat(65537)+"\"}]}";
  assertThatThrownBy(()->client("anthropic",2000).complete(input())).hasMessage("AI_INVALID_OUTPUT");
  response="x".repeat(131073);assertThatThrownBy(()->client("anthropic",2000).complete(input())).hasMessage("AI_INVALID_OUTPUT");
 }
}
