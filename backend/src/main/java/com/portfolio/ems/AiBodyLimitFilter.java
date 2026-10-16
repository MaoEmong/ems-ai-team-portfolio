package com.portfolio.ems;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.core.annotation.Order;
import java.io.*;
@Component @Order(0)
class AiBodyLimitFilter extends OncePerRequestFilter{
 @Override protected boolean shouldNotFilter(HttpServletRequest request){return !request.getMethod().equals("POST")||!request.getRequestURI().startsWith("/api/v1/ai/");}
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
  byte[] bytes=request.getInputStream().readNBytes(16385);
  if(bytes.length>16384){response.setStatus(400);response.setContentType("application/json");response.getWriter().write("{\"code\":\"AI_INPUT_TOO_LARGE\",\"message\":\"AI request too large\",\"fieldErrors\":[],\"retryable\":false}");return;}
  chain.doFilter(new HttpServletRequestWrapper(request){
   @Override public ServletInputStream getInputStream(){
    var input=new ByteArrayInputStream(bytes);
    return new ServletInputStream(){public int read(){return input.read();}public boolean isFinished(){return input.available()==0;}public boolean isReady(){return true;}public void setReadListener(ReadListener listener){throw new UnsupportedOperationException();}};
   }
   @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),java.nio.charset.StandardCharsets.UTF_8));}
  },response);
 }
}
