import json,subprocess,time,urllib.request,urllib.error,datetime,hashlib,os,sys
from pathlib import Path
from phase4_http_smoke import run_http
root=Path("backend/verification");root.mkdir(exist_ok=True)
backend_only="--backend-only" in sys.argv
envfile="backend/build/compose-smoke.env"
legacy="ems-backend-smoke";fresh="ems-backend-ai-fresh-"+datetime.datetime.now().strftime("%Y%m%d%H%M%S")
override="backend/build/phase4-images.json"
Path(override).write_text(json.dumps({"services":{"backend":{"image":"ems-backend-smoke-backend:latest","environment":{"EMS_AI_PROVIDER":"mock","EMS_AI_MODEL":"deterministic-v1"}},"frontend":{"image":"ems-backend-smoke-frontend:latest"}}}),encoding="utf-8")
env=os.environ.copy();env["EMS_AI_PROVIDER"]="mock";env["EMS_AI_MODEL"]="deterministic-v1"
def compose(project,*args,capture=False):
 cmd=["docker","compose","--project-name",project,"--env-file",envfile,"-f","docker-compose.yml","-f",override,*args]
 result=subprocess.run(cmd,capture_output=capture,text=True,encoding="utf-8",env=env)
 if result.returncode:raise RuntimeError("Compose command failed: "+str(args))
 return result.stdout.strip() if capture else None
def query(project,sql):return compose(project,"exec","-T","mysql","sh","-c",'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" --batch --skip-column-names -e "$1"',"sh",sql,capture=True)
def ready():
 for _ in range(100):
  try:
   try:urllib.request.urlopen("http://localhost:8080/api/v1/auth/me",timeout=2)
   except urllib.error.HTTPError as e:
    if e.code==401:return
  except OSError:pass
  time.sleep(1)
 raise RuntimeError("Backend readiness timeout")
def checksum(project):
 names=query(project,"SHOW TABLES").splitlines()
 return query(project,"CHECKSUM TABLE "+",".join("&#96;"+x+"&#96;" for x in names).replace("&#96;","\u0060"))
report={"command":"py -3 backend/verification/phase4_compose_verify.py"+(" --backend-only" if backend_only else ""),"startedAt":datetime.datetime.now().astimezone().isoformat(),"sourceManifest":"20261016-phase4-source-manifest.json","databasePaths":{"legacy":{"project":legacy,"volume":legacy+"_mysql_data"},"fresh":{"project":fresh,"volume":fresh+"_mysql_data"}}}
try:
 compose(legacy,"up","-d","mysql")
 for _ in range(60):
  try:before=checksum(legacy);break
  except RuntimeError:time.sleep(1)
 else:raise RuntimeError("MySQL unavailable")
 version=query(legacy,"SELECT MAX(version) FROM flyway_schema_history WHERE success=1");assert version=="4"
 compose(legacy,"build",*( ["backend"] if backend_only else []));compose(legacy,"up","-d",*( ["mysql","backend"] if backend_only else []));ready()
 assert checksum(legacy)==before
 report["legacy"]={"fromVersion":"4","toVersion":query(legacy,"SELECT MAX(version) FROM flyway_schema_history WHERE success=1"),"allTablesPreservedBeforeHttp":True,"schemaChange":False}
 report["legacyHttp"]=run_http(lambda sql:query(legacy,sql))
 compose(legacy,"down")
 compose(fresh,"up","-d",*( ["mysql","backend"] if backend_only else []));ready()
 seed=query(fresh,"SELECT (SELECT COUNT(*) FROM employee),(SELECT COUNT(*) FROM user_account),(SELECT COUNT(*) FROM employee WHERE status='RETIRED'),(SELECT COUNT(*) FROM salary_setting)")
 assert seed=="31\t31\t5\t31"
 report["freshSeed"]={"employees":31,"accounts":31,"retired":5,"defaultEmployees":26,"salarySettings":31}
 report["freshHttp"]=run_http(lambda sql:query(fresh,sql))
 before=checksum(fresh);compose(fresh,"restart","backend");ready();assert checksum(fresh)==before
 report["restartPreserved"]=True
 if not backend_only:assert urllib.request.urlopen("http://localhost:5173",timeout=5).status==200
 request=urllib.request.Request("http://localhost:8080/api/v1/ai/employee-search",method="OPTIONS",headers={"Origin":"http://localhost:5173","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,content-type"})
 response=urllib.request.urlopen(request,timeout=5);assert response.status==200 and response.headers.get("Access-Control-Allow-Origin")=="http://localhost:5173"
 report["cors200"]=True;report["frontend200"]="NOT_RUN: backend-only scope" if backend_only else True
 for service in ["backend","frontend"]:
  tag="ems-backend-smoke-"+service+":latest"
  image=subprocess.run(["docker","image","inspect","--format","{{.Id}}",tag],capture_output=True,text=True,check=True).stdout.strip()
  report.setdefault("images",{})[service]={"tag":tag,"id":image}
finally:
 compose(legacy,"down");compose(fresh,"down")
report["finishedAt"]=datetime.datetime.now().astimezone().isoformat();report["downVolumesPreserved"]=True
(root/"20261016-phase4-compose-result.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,ensure_ascii=False),flush=True)
