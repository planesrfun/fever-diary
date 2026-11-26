const assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs');
const webcrypto=require('node:crypto').webcrypto;global.crypto=webcrypto;
const c=require('../vault-crypto.js');
const fixture=[['test-id','2026-01-01T12:00',101,'Other','synthetic','not real']];
const password='synthetic test passphrase only';
const legacyKey='fever-diary:v1:private-browser-log',vaultKey='fever-diary:v2:encrypted';
function harness(storage={},hash=''){
 const nodes={};
 function el(){return {children:[],value:'',textContent:'',hidden:true,append(...xs){this.children.push(...xs)},replaceChildren(){this.children=[]},setAttribute(){},reset(){},scrollIntoView(){}}}
 const document={getElementById:id=>nodes[id]??=el(),createElement:el,createElementNS:el};
 for(const m of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))document.getElementById(m[1]);
 const location={hash,pathname:'/fever-diary/',search:'',origin:'https://example.invalid',reload(){}};
 const ctx={document,localStorage:{getItem:k=>storage[k]??null,setItem:(k,v)=>storage[k]=v,removeItem:k=>delete storage[k]},location,history:{replaceState(){location.hash=''}},TextDecoder,TextEncoder,atob,btoa,Intl,Date,crypto:webcrypto,window:{addEventListener(){}},navigator:{clipboard:{writeText:async()=>{}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('vault-crypto.js','utf8'),ctx);vm.runInContext(fs.readFileSync('diary-v2.js','utf8'),ctx);
 const wait=async()=>{for(let i=0;i<200;i++){if(!vm.runInContext('busy',ctx))return;await new Promise(r=>setTimeout(r,25))}throw Error('Timed out')};
 const unlock=async(pass)=>{nodes.pass.value=pass;nodes.confirm.value=pass;nodes.gateForm.onsubmit({preventDefault(){}});await wait()};
 return {nodes,ctx,unlock,wait,location};
}
(async()=>{
 const salt=c.random(16),key=await c.derive(password,salt),a=await c.seal(fixture,key,salt),b=await c.seal(fixture,key,salt);
 assert.notEqual(a.iv,b.iv);assert.notEqual(a.ct,b.ct);assert.deepEqual((await c.open(a,password)).rows,fixture);
 await assert.rejects(c.open(a,'wrong passphrase'),/Incorrect/);
 let bad={...a,ct:c.b64(Uint8Array.from(c.un64(a.ct),(x,i)=>i===0?x^1:x))};
 await assert.rejects(c.open(bad,password),/Incorrect/);
 assert.deepEqual(c.decode(c.encode(a)),a);
 let storage={[legacyKey]:JSON.stringify(fixture)}, h=harness(storage);
 await h.unlock('short');assert.equal(storage[legacyKey],JSON.stringify(fixture));assert.equal(storage[vaultKey],undefined);
 await h.unlock(password);assert.equal(h.nodes.diary.hidden,false);assert.equal(h.nodes.count.textContent,'1 entries · Temperature displayed in °F');assert.equal(storage[legacyKey],undefined);assert(!storage[vaultKey].includes('synthetic'));
 h.nodes.date.value='2026-01-01';h.nodes.time.value='13:00';h.nodes.temp.value='99.1';h.nodes.unit.value='°F';h.nodes.entry.onsubmit({preventDefault(){}});await h.wait();
 assert.equal((await c.open(JSON.parse(storage[vaultKey]),password)).rows.length,2);
 const persisted=storage[vaultKey], reload=harness(storage);await reload.unlock('wrong passphrase');assert.equal(reload.nodes.gate.hidden,true);assert.equal(vm.runInContext('unlocked',reload.ctx),false);assert.equal(storage[vaultKey],persisted);
 await reload.unlock(password);assert.equal(reload.nodes.latest.textContent,'99.1°F');
 await reload.nodes.share.onclick();assert(reload.nodes.shareText.value.includes('#enc='));
 const fragment=reload.nodes.shareText.value.split('#')[1], recipient=harness({},'#'+fragment);await recipient.unlock(password);assert.equal(recipient.nodes.count.textContent,'2 entries · Temperature displayed in °F');assert.equal(recipient.location.hash,'');
 const seed=harness({},'#log='+c.b64(new TextEncoder().encode(JSON.stringify(fixture))));await seed.unlock(password);assert.equal(seed.nodes.count.textContent,'1 entries · Temperature displayed in °F');assert.equal(seed.location.hash,'');
 console.log('PASS encryption roundtrip, wrong passphrase, tamper rejection, IV uniqueness, legacy migration, add, reload, protected link, recipient, original seed');
})().catch(e=>{console.error(e);process.exitCode=1});
