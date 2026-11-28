const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {MpesaService} = require('../dist/mpesa/mpesa.module');

function attemptStore(current) {
  const find = async () => ({ ...current() });
  return {
    findUnique: find,
    findUniqueOrThrow: find,
    updateMany: async ({where, data}) => {
      const attempt = current();
      const statuses = typeof where.status === 'string' ? [where.status] : where.status?.in;
      if (statuses && !statuses.includes(attempt.status)) return {count: 0};
      if ('callbackReceipt' in where && (attempt.callbackReceipt ?? null) !== where.callbackReceipt) return {count: 0};
      Object.assign(attempt, data);
      return {count: 1};
    },
  };
}

test('registration is created only after verified payment', async () => {
  const saved={...process.env}, originalFetch=global.fetch;
  Object.assign(process.env,{MPESA_ENVIRONMENT:'sandbox',MPESA_CONSUMER_KEY:'key',MPESA_CONSUMER_SECRET:'secret',MPESA_SHORTCODE:'174379',MPESA_PASSKEY:'passkey',MPESA_CALLBACK_URL:'https://example.test/api/v1/mpesa/callback'});
  let attempt, patients=0, payments=0, token;
  const tx={mpesaAttempt:{updateMany:async()=>{if(attempt.status!=='PENDING')return {count:0};attempt.status='CONFIRMED';return {count:1};},update:async({data})=>Object.assign(attempt,data)},patient:{create:async()=>{patients++;return {id:'p'};}},visit:{create:async()=>({id:'v'})},invoice:{create:async()=>({id:'i'}),findUniqueOrThrow:async()=>({amountCents:10000,payments:[]})},payment:{create:async()=>{payments++;}},auditLog:{create:async()=>{}}};
  const db={mpesaAttempt:{...attemptStore(()=>attempt),create:async({data})=>(attempt={id:'a',...data}),update:async({data})=>Object.assign(attempt,data)},$transaction:async fn=>fn(tx)};
  global.fetch=async (url,options)=>({ok:true,json:async()=>{if(String(url).includes('/oauth/'))return {access_token:'token'};if(String(url).includes('processrequest')){token=JSON.parse(options.body).CallBackURL.split('/').pop();return {ResponseCode:'0',CheckoutRequestID:'checkout'};}return {ResponseCode:'0',ResultCode:'0',CheckoutRequestID:'checkout'};}});
  const body={Body:{stkCallback:{CheckoutRequestID:'checkout',ResultCode:0,CallbackMetadata:{Item:[{Name:'Amount',Value:100},{Name:'PhoneNumber',Value:254712345678},{Name:'MpesaReceiptNumber',Value:'TEST12345'}]}}}};
  try {const service=new MpesaService(db);await service.start({patient:{firstName:'Jane',lastName:'Doe'},phone:'0712345678',amount:100},{sub:'u'});assert.equal(patients,0);await service.callback(token,body);await service.callback(token,body);assert.equal(patients,1);assert.equal(payments,1);}
  finally {global.fetch=originalFetch;for(const key of ['MPESA_ENVIRONMENT','MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_URL']) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('STK requests fail closed when sandbox configuration is missing', async () => {
  const saved=process.env.MPESA_ENVIRONMENT;
  process.env.MPESA_ENVIRONMENT='disabled';
  try { await assert.rejects(new MpesaService({}).start({patientId:'p',phone:'0712345678',amount:100},{sub:'u'}),{status:503}); }
  finally { if(saved===undefined)delete process.env.MPESA_ENVIRONMENT;else process.env.MPESA_ENVIRONMENT=saved; }
});

test('callback does not record a payment when amount or phone does not match', async () => {
  const token='a'.repeat(64);let transactions=0;
  const db={mpesaAttempt:{findUnique:async ({where})=>{assert.equal(where.tokenHash,createHash('sha256').update(token).digest('hex'));return {id:'a',status:'PENDING',checkoutId:'checkout',amount:100,phone:'254712345678'};}},$transaction:async()=>{transactions++;}};
  const callback={Body:{stkCallback:{CheckoutRequestID:'checkout',ResultCode:0,CallbackMetadata:{Item:[{Name:'Amount',Value:10},{Name:'PhoneNumber',Value:254712345678},{Name:'MpesaReceiptNumber',Value:'TEST12345'}]}}}};
  await assert.rejects(new MpesaService(db).callback(token,callback),{status:503});
  assert.equal(transactions,0);
});

test('unrecognized callbacks do not mutate records',async()=>{
  let calls=0;const service=new MpesaService({mpesaAttempt:{findUnique:async()=>{calls++;return null;}}});
  await service.callback('not-a-token',{});assert.equal(calls,0);
  await service.callback('a'.repeat(64),{});assert.equal(calls,1);
});

test('verified customer cancellation marks the attempt cancelled without creating records', async () => {
  const saved={...process.env}, originalFetch=global.fetch;
  Object.assign(process.env,{MPESA_ENVIRONMENT:'sandbox',MPESA_CONSUMER_KEY:'key',MPESA_CONSUMER_SECRET:'secret',MPESA_SHORTCODE:'174379',MPESA_PASSKEY:'passkey',MPESA_CALLBACK_URL:'https://example.test/api/v1/mpesa/callback'});
  let transactions=0;
  const attempt={id:'a',status:'PENDING',checkoutId:'checkout',amount:100,phone:'254712345678'};
  const db={mpesaAttempt:attemptStore(()=>attempt),$transaction:async()=>{transactions++;}};
  global.fetch=async url=>({ok:true,json:async()=>String(url).includes('/oauth/')?{access_token:'token'}:{ResponseCode:'0',ResultCode:'1032',CheckoutRequestID:'checkout'}});
  try {await new MpesaService(db).callback('d'.repeat(64),{Body:{stkCallback:{CheckoutRequestID:'checkout',ResultCode:1032}}});assert.equal(attempt.status,'CANCELLED');assert.equal(transactions,0);}
  finally {global.fetch=originalFetch;for(const key of ['MPESA_ENVIRONMENT','MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_URL']) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('a verified successful callback records payment once', async () => {
  const token='b'.repeat(64), originalFetch=global.fetch, saved={...process.env};
  Object.assign(process.env,{MPESA_ENVIRONMENT:'sandbox',MPESA_CONSUMER_KEY:'key',MPESA_CONSUMER_SECRET:'secret',MPESA_SHORTCODE:'174379',MPESA_PASSKEY:'passkey',MPESA_CALLBACK_URL:'https://example.test/api/v1/mpesa/callback'});
  let payments=0;
  const attempt={id:'a',invoiceId:'i',createdById:'u',status:'PENDING',checkoutId:'checkout',amount:100,phone:'254712345678'};
  const db={mpesaAttempt:attemptStore(()=>attempt),$transaction:async fn=>fn(tx)};
  const tx={mpesaAttempt:db.mpesaAttempt,invoice:{findUniqueOrThrow:async()=>({amountCents:10000,payments:[]})},payment:{create:async({data})=>{payments++;assert.equal(data.amountCents,10000);assert.equal(data.reference,'TEST12345');}},auditLog:{create:async()=>{}}};
  global.fetch=async url=>({ok:true,json:async()=>String(url).includes('/oauth/')?{access_token:'token'}:{ResponseCode:'0',ResultCode:'0',CheckoutRequestID:'checkout'}});
  const body={Body:{stkCallback:{CheckoutRequestID:'checkout',ResultCode:0,CallbackMetadata:{Item:[{Name:'Amount',Value:100},{Name:'PhoneNumber',Value:254712345678},{Name:'MpesaReceiptNumber',Value:'TEST12345'}]}}}};
  try {const service=new MpesaService(db);await service.callback(token,body);await service.callback(token,body);assert.equal(attempt.status,'CONFIRMED');assert.equal(payments,1);}
  finally {global.fetch=originalFetch;for(const key of ['MPESA_ENVIRONMENT','MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_URL']) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});

test('a result that M-Pesa does not verify never records payment', async () => {
  const token='c'.repeat(64), originalFetch=global.fetch, saved={...process.env};
  Object.assign(process.env,{MPESA_ENVIRONMENT:'sandbox',MPESA_CONSUMER_KEY:'key',MPESA_CONSUMER_SECRET:'secret',MPESA_SHORTCODE:'174379',MPESA_PASSKEY:'passkey',MPESA_CALLBACK_URL:'https://example.test/api/v1/mpesa/callback'});
  let transactions=0;
  const attempt={id:'a',status:'PENDING',checkoutId:'checkout',amount:100,phone:'254712345678'};
  const db={mpesaAttempt:attemptStore(()=>attempt),$transaction:async()=>{transactions++;}};
  global.fetch=async url=>({ok:true,json:async()=>String(url).includes('/oauth/')?{access_token:'token'}:{ResponseCode:'0',ResultCode:'1',CheckoutRequestID:'checkout'}});
  const body={Body:{stkCallback:{CheckoutRequestID:'checkout',ResultCode:0,CallbackMetadata:{Item:[{Name:'Amount',Value:100},{Name:'PhoneNumber',Value:254712345678},{Name:'MpesaReceiptNumber',Value:'TEST12345'}]}}}};
  try {
    await new MpesaService(db).callback(token,body);
    assert.equal(attempt.callbackReceipt,'TEST12345');
    assert.equal(attempt.status,'PENDING');
    assert.equal(transactions,0);
  }
  finally {global.fetch=originalFetch;for(const key of ['MPESA_ENVIRONMENT','MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_URL']) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
