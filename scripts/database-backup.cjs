// Credentials are passed through environment variables, never command-line arguments.
const {spawnSync}=require('node:child_process');
const {mkdirSync,existsSync}=require('node:fs');
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});
const [action,file,confirmation]=process.argv.slice(2);
if(!['backup','verify','restore-test'].includes(action))throw Error('Usage: node scripts/database-backup.cjs backup [file] | verify <file> | restore-test <file> <database_name_test>');
const url=new URL(process.env.DATABASE_URL);
if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('PostgreSQL DATABASE_URL is required.');
const database=decodeURIComponent(url.pathname.slice(1));
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:database,...(url.searchParams.has('sslmode')?{PGSSLMODE:url.searchParams.get('sslmode')}:{})};
const output=path.resolve(file||path.join(__dirname,'../.backups',`clinic-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`));
let tool,args;
if(action==='backup'){
  if(existsSync(output))throw Error('Backup file already exists. Choose a new path.');
  mkdirSync(path.dirname(output),{recursive:true});tool=process.env.CMS_PG_DUMP||'pg_dump';args=['--format=custom','--no-owner','--no-acl','--file',output];
}else{
  if(!file||!existsSync(output))throw Error('An existing backup file is required.');
  tool=process.env.CMS_PG_RESTORE||'pg_restore';
  if(action==='verify')args=['--list',output];
  else{
    if(!database.endsWith('_test')||confirmation!==database)throw Error('Restore drills require DATABASE_URL pointing to a disposable _test database and its exact name as confirmation.');
    args=['--clean','--if-exists','--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',database,output];
  }
}
const result=spawnSync(tool,args,{env,stdio:action==='verify'?['ignore','ignore','inherit']:'inherit',windowsHide:true});
if(result.error)throw Error(`Unable to run ${tool}. Install PostgreSQL client tools or configure CMS_PG_DUMP / CMS_PG_RESTORE.`);
if(result.status!==0)process.exit(result.status??1);
console.log(action==='backup'?`Backup created: ${output}`:action==='verify'?'Archive is readable. A restore drill is still required.':'Test database restored. Run application checks against it.');
