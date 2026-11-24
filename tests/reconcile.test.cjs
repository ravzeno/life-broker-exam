const test = require('node:test');
const assert = require('node:assert/strict');
const model = import('../src/reconcile.js');

test('cloud selection stays adopted after later sync fails', async () => {
  const {reconcile} = await model;
  const old = {id:'one',started:1,finished:false,answers:{1:0}};
  const cloud = {...old,answers:{1:1}};
  let current = old, saved, discarded = false;
  const history = {pendingAttempts:()=>[{id:'one',snapshot:old}],getAttempt:async()=>({snapshot:cloud}),discardPending:()=>{discarded=true;},syncPending:async()=>{throw Error('network');}};
  await assert.rejects(reconcile({history,current,isCurrent:()=>true,confirmCloud:()=>true,saveLocal:value=>{saved=value;},normalize:value=>value,onSelected:value=>{current=value;}}));
  assert.deepEqual(current, cloud);
  assert.deepEqual(saved, cloud);
  assert.equal(discarded,true);
});
test('account change while waiting does not apply cloud or discard pending', async () => {
  const {reconcile} = await model;
  let active = true, resolve, changed = false;
  const history = {pendingAttempts:()=>[{id:'one',snapshot:{id:'one',value:1}}],getAttempt:()=>new Promise(r=>{resolve=r;}),discardPending:()=>{changed=true;},syncPending:async()=>{changed=true;}};
  const work=reconcile({history,current:{id:'one',value:1},isCurrent:()=>active,confirmCloud:()=>true,saveLocal:()=>{changed=true;},normalize:v=>v,onSelected:()=>{changed=true;}});
  active=false;resolve({snapshot:{id:'one',value:2}});
  await assert.rejects(work,/account changed/);assert.equal(changed,false);
});
