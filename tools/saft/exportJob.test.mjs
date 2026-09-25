import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExportWorker, loadWithDeadline } from '../../src/lib/saft/exportJob.ts';
class FakeWorker {
 sent=[]; terminated=false;
 postMessage(value) { this.sent.push(value); }
 terminate() { this.terminated=true; }
 reply(data) { this.onmessage({data}); }
}
const request={data:{},start:'2026-01-01',end:'2026-12-31'};
const limits={starting:15,generating:15,initializing:15,validating:15};
test('does not send data until worker confirms readiness; reports stages and completes', async () => {
 const worker=new FakeWorker(), stages=[];
 const job=runExportWorker(worker,request,new AbortController().signal,s=>stages.push(s));
 assert.deepEqual(worker.sent,[]);
 worker.reply({type:'ready'});
 worker.reply({type:'ready'});
 assert.deepEqual(worker.sent,[request]);
 worker.reply({type:'progress',stage:'initializing'});
 worker.reply({type:'progress',stage:'validating'});
 worker.reply({type:'complete',xml:'<validated/>'});
 assert.equal(await job,'<validated/>');
 assert.equal(worker.terminated,true);
 assert.deepEqual(stages,['starting','generating','initializing','validating']);
});
test('reports stalled startup and stalled WASM initialization, then terminates worker', async () => {
 for(const stage of ['starting','generating','initializing','validating']) {
  const worker=new FakeWorker();
  const job=runExportWorker(worker,request,new AbortController().signal,()=>{},limits);
  if(stage!=='starting') {worker.reply({type:'ready'});worker.reply({type:'progress',stage});}
  await assert.rejects(job,/tok for lang tid/);
  assert.equal(worker.terminated,true);
 }
});
test('worker failures and data validation errors reject instead of leaving busy state pending', async () => {
 for(const fail of [w=>w.onerror({preventDefault(){},message:'failed import'}),w=>w.onmessageerror(),w=>w.reply({type:'error',issues:['Missing company']})]) {
  const worker=new FakeWorker();
  const job=runExportWorker(worker,request,new AbortController().signal,()=>{});
  fail(worker); await assert.rejects(job);assert.equal(worker.terminated,true);
 }
});
test('cancellation terminates busy worker and prevents later completion', async () => {
 const worker=new FakeWorker(), controller=new AbortController();
 const job=runExportWorker(worker,request,controller.signal,()=>{});
 worker.reply({type:'ready'});controller.abort();
 worker.reply({type:'complete',xml:'must not download'});
 await assert.rejects(job,/avbrutt/);assert.equal(worker.terminated,true);
});
test('database/auth wait has a deadline even when the request ignores abort', async () => {
 let requestSignal;
 await assert.rejects(loadWithDeadline(signal=>{requestSignal=signal;return new Promise(()=>{});},new AbortController().signal,10),/Henting av regnskapsdata tok for lang tid/);
 assert.equal(requestSignal.aborted,true);
});
test('database fetch supports success, failure and cancellation', async () => {
 assert.equal(await loadWithDeadline(()=>Promise.resolve('data'),new AbortController().signal),'data');
 await assert.rejects(loadWithDeadline(()=>Promise.reject(new Error('network')),new AbortController().signal),/network/);
 const controller=new AbortController();
 const job=loadWithDeadline(()=>new Promise(()=>{}),controller.signal);
 controller.abort();await assert.rejects(job,/avbrutt/);
});
