const {spawnSync}=require('node:child_process');
for(const task of ['db:deploy','db:seed']) {
 const result=spawnSync('npm',['run',task,'--workspace','@cms/api'],{stdio:'inherit',shell:process.platform==='win32'});
 if(result.status!==0) process.exit(result.status??1);
}
