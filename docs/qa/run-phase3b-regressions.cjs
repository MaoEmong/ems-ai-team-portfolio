// Reuse 34 + 13 assertions, preserving previous evidence paths.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const before=require('./phase3b-before.json'),after=require('./phase3b-after-start.json');
if(JSON.stringify(before.tables)!==JSON.stringify(after.tables))throw Error('Startup preservation differs');
const cases=[['phase3a-regression20.cjs','phase3b-regression20.cjs'],['phase3a-regression14.cjs','phase3b-regression14.cjs'],['run-phase3a-integration.cjs','phase3b-regression13.cjs']];
let failed=false;
for(const [source,target]of cases){let text=fs.readFileSync(path.join(__dirname,source),'utf8').replaceAll('phase3a-regression','phase3b-regression').replaceAll('phase3a-screenshots','phase3b-regression13-screenshots').replaceAll('phase3a-results.json','phase3b-regression13-results.json');fs.writeFileSync(path.join(__dirname,target),text);const r=spawnSync(process.execPath,[path.join(__dirname,target),...process.argv.slice(2)],{stdio:'inherit'});if(r.status!==0)failed=true;}
process.exitCode=failed?1:0;
