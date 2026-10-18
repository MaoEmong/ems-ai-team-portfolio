from pathlib import Path
import json,urllib.request,datetime,concurrent.futures
base=Path('backend/build/security')
inventory=json.loads((base/'runtime-inventory.json').read_text(encoding='utf-8'))
queries=[{'version':a['version'],'package':{'name':a['group']+':'+a['name'],'ecosystem':'Maven'}} for a in inventory['artifacts']]
report={'tool':'OSV API querybatch + advisory details','command':'py -3 backend/build/security/osv-audit.py','startedAt':datetime.datetime.now().astimezone().isoformat(),'configuration':'runtimeClasspath','components':len(queries),'inventory':'runtime-inventory.json','findings':[],'scope':'Version matching only; reachability requires manual application review; excludes JDK/container OS/Gradle plugins/test classpath'}
try:
 req=urllib.request.Request('https://api.osv.dev/v1/querybatch',data=json.dumps({'queries':queries}).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=40) as r:results=json.load(r)['results']
 ids=sorted({v['id'] for item in results for v in item.get('vulns',[])})
 def fetch(id):
  try:
   with urllib.request.urlopen('https://api.osv.dev/v1/vulns/'+id,timeout=30) as r:return id,json.load(r)
  except Exception:return id,{'id':id,'detailsUnavailable':True}
 details=dict(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(fetch,ids))
 for component,result in zip(inventory['artifacts'],results):
  for vuln in result.get('vulns',[]):
   d=details[vuln['id']]
   affected=[a for a in d.get('affected',[]) if a.get('package',{}).get('name')==component['group']+':'+component['name']]
   report['findings'].append({'component':component['group']+':'+component['name'],'version':component['version'],'id':d['id'],'aliases':d.get('aliases',[]),'summary':d.get('summary',''),'severity':d.get('database_specific',{}).get('severity','UNKNOWN'),'cvss':d.get('severity',[]),'affected':affected,'references':d.get('references',[]),'detailsUnavailable':d.get('detailsUnavailable',False)})
 report['status']='COMPLETED';report['uniqueAdvisories']=len(ids)
except Exception as error:
 report['status']='NOT_COMPLETED';report['failureType']=type(error).__name__
report['finishedAt']=datetime.datetime.now().astimezone().isoformat()
(base/'osv-runtime-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':report['status'],'components':len(queries),'uniqueAdvisories':report.get('uniqueAdvisories'),'findings':[{'component':f['component'],'version':f['version'],'id':f['id'],'severity':f['severity'],'summary':f['summary']} for f in report['findings']]},ensure_ascii=True))
