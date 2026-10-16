// Preserve phase2 evidence; adapt only output paths, not the 34 assertions.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const cases=[['run-phase2-regression.cjs','phase3a-regression20.cjs'],['run-phase2.cjs','phase3a-regression14.cjs']];
const ready=spawnSync(process.execPath,['-e',`(async()=>{for(let n=0;n<30;n++){try{const r=await fetch('http://localhost:8080/api/v1/auth/me');if(r.status===401)return;}catch{}await new Promise(r=>setTimeout(r,1000));}process.exitCode=1;})()`],{stdio:'inherit'});
if(ready.status!==0){console.error('Backend not ready');process.exit(1);}
let failed=false;
for(const [source,target] of cases){
 const text=fs.readFileSync(path.join(__dirname,source),'utf8')
  .replaceAll('phase2-screenshots','phase3a-regression-screenshots')
  .replaceAll('phase2-regression-results.json','phase3a-regression20-results.json')
  .replaceAll('phase2-results.json','phase3a-regression14-results.json');
 fs.writeFileSync(path.join(__dirname,target),text);
 const result=spawnSync(process.execPath,[path.join(__dirname,target),...process.argv.slice(2)],{stdio:'inherit'});
 if(result.status!==0)failed=true;
}
process.exitCode=failed?1:0;
