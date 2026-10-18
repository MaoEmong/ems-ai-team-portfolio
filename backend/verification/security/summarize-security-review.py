"""Run from repository root after Gradle; never copies raw test logs or credentials."""
import datetime
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path.cwd()
OUT = ROOT / 'backend/verification'
def suites(task):
    rows = []
    for path in sorted((ROOT / f'backend/build/test-results/{task}').glob('TEST-*.xml')):
        node = ET.parse(path).getroot()
        rows.append({key: int(node.get(key, '0')) for key in ('tests','failures','errors','skipped')} | {
            'suite': node.get('name'), 'timestampUtc': node.get('timestamp'),
            'cases': [case.get('name') for case in node.findall('testcase')]})
    return rows
unit, integration = suites('test'), suites('integrationTest')
totals = {key: sum(row[key] for row in unit) for key in ('tests','failures','errors','skipped')}
assert totals == {'tests':147,'failures':0,'errors':0,'skipped':0}, totals
report = {
 'collectedAt': datetime.datetime.now().astimezone().isoformat(),
 'sourceBaseline':'9bc7afb',
 'finalCommand':'.\\gradlew.bat test bootJar',
 'workingDirectory':'backend', 'result':'BUILD SUCCESSFUL', 'durationSecondsObserved':18,
 'unitTotals':totals, 'unitSuites':unit,
 'fullAttempts': {'command':'.\\gradlew.bat test integrationTest bootJar', 'attempts':2,
   'result':'BUILD FAILED - Docker engine unavailable',
   'observedDurationSeconds':[30,24],
   'integrationStatus':'NOT_EXECUTED_ENVIRONMENT',
   'initializationFailureClasses':8, 'businessTestsPassed':None,
   'reason':'Docker Desktop Linux engine named pipe unavailable; approved hidden start attempted once without success',
   'lastAttemptSuites':integration,
   'note':'XML failure entries are initializationError placeholders, not executed MySQL business tests'},
 'newTests':{'SecurityReviewWebTest':{'executed':6,'passed':6,'method':'MockMvc actual security filter; mocked account repository'},
   'SecurityReviewMySqlTest':{'written':6,'compiled':True,'executed':False}},
 'limitations':['No shared host ports 3306/8080/5173 used','No Compose execution','No actual provider inference','No penetration test'],
 'migrationChanges':[]
}
(OUT/'20261018-backend-security-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
paths = [ROOT/'backend/src/main/java/com/portfolio/ems/SecurityConfig.java',
 ROOT/'backend/src/test/java/com/portfolio/ems/SecurityReviewWebTest.java',
 ROOT/'backend/src/test/java/com/portfolio/ems/SecurityReviewMySqlTest.java']
manifest = {'baseline':'9bc7afb','files':[{'path':str(p.relative_to(ROOT)).replace('\\','/'),
 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]}
(OUT/'20261018-backend-security-source.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
patterns = [r'sk-ant-[A-Za-z0-9_-]{20,}',r'AKIA[0-9A-Z]{16}',
 r'eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}',r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
targets = list(OUT.glob('20261018-backend-*.json')) + list((OUT/'security').glob('*')) + [
 ROOT/'docs/security/backend-security-review.md',ROOT/'docs/security/backend-dependency-triage.md',
 ROOT/'docs/adr/0114-security-header-vendor-workaround.md',ROOT/'docs/devlog/20261018-backend-security-review.md',
 ROOT/'backend/docs/portfolio-local-runbook.md',ROOT/'backend/README.md'] + paths
findings = []
for path in targets:
    if not path.is_file(): continue
    content = path.read_text(encoding='utf-8')
    for i,pattern in enumerate(patterns):
        if re.search(pattern,content): findings.append({'path':str(path.relative_to(ROOT)),'patternIndex':i})
print(json.dumps({'unitTotals':totals,'integrationInitializationFailures':len(integration),
 'checkedFiles':len(targets),'secretPatternMatches':len(findings),'findings':findings}))
assert not findings, 'Secret pattern detection requires review; values intentionally not printed'
