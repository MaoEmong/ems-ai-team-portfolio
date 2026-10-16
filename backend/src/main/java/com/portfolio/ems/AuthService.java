package com.portfolio.ems;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import java.time.Instant;
import java.nio.charset.StandardCharsets;

@Service
class AuthService {
 private final AccountRepository accounts; private final PasswordEncoder passwords; private final JwtEncoder encoder;
 private final AuditService audit;
 AuthService(AccountRepository accounts,PasswordEncoder passwords,JwtEncoder encoder,AuditService audit) {
  this.accounts=accounts; this.passwords=passwords; this.encoder=encoder;this.audit=audit;
 }
 @Transactional
 public Dto.LoginResult login(Dto.Login request) {
  Account a=accounts.findByEmployeeEmployeeNo(request.loginId()).orElse(null);
  if(a==null||!a.enabled||request.password().getBytes(StandardCharsets.UTF_8).length>72||!passwords.matches(request.password(),a.passwordHash)) {
   audit.loginFailure(a==null?null:Dto.user(a),a!=null&&!a.enabled?"DISABLED":"BAD_CREDENTIALS");throw unauthorized();
  }
  Instant now=Instant.now();
  JwtClaimsSet claims=JwtClaimsSet.builder().issuer("ems").subject(a.employee.id.toString())
   .issuedAt(now).expiresAt(now.plusSeconds(3600)).build();
  String token=encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
  audit.loginSuccess(Dto.user(a));
  return new Dto.LoginResult(token,"Bearer",3600,Dto.user(a));
 }
 private static ApiException unauthorized() { return new ApiException(401,"UNAUTHORIZED","인증 정보를 확인해 주세요."); }
}
