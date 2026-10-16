# Run from repository root, after Compose starts but before QA business writes.
param([string]$Project='ems-backend-smoke',[string]$EnvFile='backend/build/compose-smoke.env')
$ErrorActionPreference='Stop'
function Read-QaSnapshot {
 $qaSnapshot=docker compose --project-name $Project --env-file $EnvFile exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" -BN -e "SELECT (SELECT COUNT(*) FROM employee),(SELECT COUNT(*) FROM user_account),(SELECT COUNT(*) FROM appointment),(SELECT COUNT(*) FROM demo_seed_marker); CHECKSUM TABLE employee,user_account,appointment;"'
 if($LASTEXITCODE -ne 0){throw 'Snapshot query failed'}
 return $qaSnapshot
}
$qaBefore=Read-QaSnapshot
docker compose --project-name $Project --env-file $EnvFile restart backend
if($LASTEXITCODE -ne 0){throw 'Backend restart failed'}
$qaAfter=Read-QaSnapshot
if(($qaBefore -join "`n") -ne ($qaAfter -join "`n")){throw 'Restart data changed'}
@{executedAt=(Get-Date).ToString('o');project=$Project;versionAlready3=$true;before=$qaBefore;after=$qaAfter;preserved=$true;source='QA direct SQL and backend restart'}|ConvertTo-Json -Depth 5|Set-Content docs/qa/phase3a-preservation.json -Encoding utf8
