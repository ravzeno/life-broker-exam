const test=require('node:test');
const assert=require('node:assert/strict');
const model=import('../src/exam-model.js');
test('React exam samples the correct distribution and retains snapshot order',async()=>{
 const m=await model,a=m.newAttempt('test');
 assert.equal(a.order.length,100);assert.equal(new Set(a.order).size,100);
 assert.deepEqual(m.SUBJECTS.map(s=>a.order.filter(i=>m.question(a,i).subject===s.name).length),[10,50,20,20]);
 assert.deepEqual(m.normalize(JSON.parse(JSON.stringify(a))).order,a.order);
});
test('React result uses saved questions and frozen pass rules',async()=>{
 const m=await model,a=m.newAttempt('test');
 for(const i of a.order)a.answers[i]=a.bank[i].answer;
 let r=m.result(a);assert.equal(r.correct,100);assert.equal(r.pass,true);
 a.bank[a.order[0]].answer=null;r=m.result(a);assert.equal(r.verified,99);assert.equal(r.pass,null);
});
test('legacy saved 200-question attempts remain compatible',async()=>{
 const m=await model,a=m.normalize({started:Date.now(),answers:{1:2}});
 assert.equal(a.order.length,200);assert.equal(a.answers[1],2);assert.equal(m.result(a).standard,false);
});
