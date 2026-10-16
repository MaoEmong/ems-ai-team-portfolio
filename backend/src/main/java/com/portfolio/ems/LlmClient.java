package com.portfolio.ems;
import com.fasterxml.jackson.databind.JsonNode;
interface LlmClient {
 String complete(Request request);
 record Request(String feature,String system,JsonNode data) {}
}
