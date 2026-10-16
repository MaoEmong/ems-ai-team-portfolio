package com.portfolio.ems;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.util.*;
@Component
class AiSettings {
 static final String VERSION="ems-ai-v1";
 final String provider,model,key,baseUrl; final int timeout,maxTokens; final Map<String,Boolean> enabled;
 AiSettings(Environment env){
  provider=env.getProperty("ems.ai.provider","mock").toLowerCase(Locale.ROOT);
  String fallback=switch(provider){case "mock"->"deterministic-v1";case "anthropic"->"claude-sonnet-5-5";default->"";};
  String configured=env.getProperty("ems.ai.model","");model=configured.isBlank()?fallback:configured;
  key=env.getProperty("ANTHROPIC_API_KEY","");
  baseUrl=env.getProperty(provider.equals("anthropic")?"ems.ai.anthropic-base-url":"ems.ai.ollama-base-url",provider.equals("anthropic")?"https://api.anthropic.com":"http://host.docker.internal:11434");
  timeout=env.getProperty("ems.ai.timeout-ms",Integer.class,30000);maxTokens=env.getProperty("ems.ai.max-tokens",Integer.class,1024);
  enabled=Map.of("employeeSearch",env.getProperty("ems.ai.employee-search-enabled",Boolean.class,true),"evaluationSummary",env.getProperty("ems.ai.evaluation-summary-enabled",Boolean.class,true),"policyQa",env.getProperty("ems.ai.policy-qa-enabled",Boolean.class,true));
 }
 boolean mock(){return provider.equals("mock");}
 Map<String,Object> config(){return Map.of("provider",provider,"model",model,"mock",mock(),"externalTransfer",!mock(),"enabled",enabled,"promptVersion",VERSION);}
 void requireConfigured(){
  if(!Set.of("mock","anthropic","ollama").contains(provider)||model.isBlank()||model.length()>150||timeout<1||timeout>30000||maxTokens<1||maxTokens>8192)
   throw AiProblem.of(503,"AI_NOT_CONFIGURED",false);
  if(provider.equals("anthropic")&&key.isBlank())throw AiProblem.of(503,"AI_NOT_CONFIGURED",false);
  if(!mock())try {URI u=URI.create(baseUrl);if(!Set.of("http","https").contains(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null)throw new IllegalArgumentException();}
  catch(IllegalArgumentException e){throw AiProblem.of(503,"AI_NOT_CONFIGURED",false);}
 }
}
