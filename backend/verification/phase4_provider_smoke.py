import os,json,datetime,urllib.request,urllib.error
from pathlib import Path
report={"checkedAt":datetime.datetime.now().astimezone().isoformat(),"command":"py -3 backend/verification/phase4_provider_smoke.py","executionScope":"Provider HTTP direct synthetic smoke; not full EMS E2E; no response text or key recorded","providers":{}}
def invoke(url,body,headers):
 request=urllib.request.Request(url,data=json.dumps(body).encode(),headers={"Content-Type":"application/json",**headers},method="POST")
 try:
  with urllib.request.urlopen(request,timeout=30) as r:
   raw=r.read(131073)
   if len(raw)>131072:return {"status":"FAILED","reason":"Response envelope limit exceeded"}
   data=json.loads(raw);return {"status":"PASS","httpStatus":r.status,"validJsonEnvelope":isinstance(data,dict)}
 except urllib.error.HTTPError as e:return {"status":"FAILED","reason":"HTTP provider error","httpStatus":e.code}
 except Exception:return {"status":"FAILED","reason":"Provider unavailable, timeout, or invalid response"}
key=os.environ.get("ANTHROPIC_API_KEY","")
if not key:report["providers"]["claude"]={"status":"NOT_RUN","reason":"ANTHROPIC_API_KEY absent from explicitly supplied process environment","model":"claude-sonnet-5-5"}
else:
 model=os.environ.get("EMS_AI_MODEL") or "claude-sonnet-5-5"
 value=invoke(os.environ.get("ANTHROPIC_BASE_URL","https://api.anthropic.com").rstrip("/")+"/v1/messages",{"model":model,"max_tokens":128,"stream":False,"system":"Return a JSON object with synthetic=true. No employee data is supplied.","messages":[{"role":"user","content":"Synthetic connectivity check only."}]},{"x-api-key":key,"anthropic-version":"2023-06-01"})
 value["model"]=model;report["providers"]["claude"]=value
base=os.environ.get("OLLAMA_BASE_URL","http://localhost:11434").rstrip("/")
try:
 with urllib.request.urlopen(base+"/api/tags",timeout=3) as r:
  raw=r.read(131073);assert len(raw)<=131072
  models=json.loads(raw).get("models",[])
except Exception:models=[]
if not models:report["providers"]["ollama"]={"status":"NOT_RUN","reason":"Host Ollama service unavailable or no existing model; no model download attempted"}
else:
 model=models[0].get("name")
 if not isinstance(model,str) or not model:report["providers"]["ollama"]={"status":"NOT_RUN","reason":"No usable existing model name"}
 else:
  value=invoke(base+"/api/generate",{"model":model,"stream":False,"format":"json","prompt":"Return JSON with synthetic=true. Synthetic connectivity check; no employee data.","options":{"num_predict":128}}, {})
  value["model"]=model;report["providers"]["ollama"]=value
path=Path("backend/verification/20261016-phase4-provider-runs.json")
path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,ensure_ascii=False))
