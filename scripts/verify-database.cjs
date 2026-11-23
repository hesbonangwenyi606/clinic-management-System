const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env')});

async function main(){
  if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required to provision an isolated test database.');
  const sourceUrl=new URL(process.env.DATABASE_URL);
  const sourceDatabase=decodeURIComponent(sourceUrl.pathname.slice(1));
  if(!/_test$/.test(sourceDatabase))throw Error('Refusing to create/drop databases through a non-test DATABASE_URL. Point DATABASE_URL at an existing disposable database ending in _test.');
  const admin=new PrismaClient();
  const name=`cms_verify_${randomBytes(6).toString('hex')}_test`;
  if(!/^cms_verify_[a-f0-9]{12}_test$/.test(name))throw Error('Invalid disposable database name.');
  let created=false;
  try{
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);created=true;
    const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
    const env={...process.env,DATABASE_URL:url.toString(),CMS_TEST_DATABASE:'true',JWT_SECRET:randomBytes(48).toString('hex'),NODE_ENV:'test'};
    for(const task of ['db:deploy','test:integration']){
      const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',task,'--workspace','@cms/api'],{env,stdio:'inherit',shell:process.platform==='win32',windowsHide:true,cwd:path.resolve(__dirname,'..')});
      if(result.status!==0)throw Error(`Isolated database check failed: ${task}`);
    }
    console.log('Isolated database verification passed.');
  }finally{
    if(created)await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
