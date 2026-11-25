const dotenv = require('dotenv');
const path = require('node:path');
dotenv.config({path:path.resolve(__dirname,'../../../.env'),quiet:true});
async function main(){
  const {MPESA_ENVIRONMENT,MPESA_CONSUMER_KEY,MPESA_CONSUMER_SECRET}=process.env;
  if(MPESA_ENVIRONMENT!=='sandbox'||!MPESA_CONSUMER_KEY||!MPESA_CONSUMER_SECRET) throw new Error('Sandbox credentials are not configured.');
  const response=await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',{headers:{Authorization:`Basic ${Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64')}`},signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(!response.ok||!body.access_token) throw new Error(`Sandbox authentication failed (HTTP ${response.status}).`);
  process.stdout.write('Sandbox authentication succeeded.\n');
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
