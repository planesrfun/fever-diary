'use strict';
// Browser-only encryption. No secrets or plaintext are sent to a server.
const vaultCrypto=(()=>{
 const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true}), rounds=600000;
 const b64=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
 const un64=s=>{if(typeof s!=='string'||s.length>8000000||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid encrypted data');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))};
 const random=n=>crypto.getRandomValues(new Uint8Array(n));
 const parse=e=>{if(!e||e.v!==2||e.kdf!=='PBKDF2-SHA256'||e.rounds!==rounds||e.alg!=='AES-256-GCM')throw Error('Unsupported encrypted diary');const salt=un64(e.salt),iv=un64(e.iv),ct=un64(e.ct);if(salt.length!==16||iv.length!==12||ct.length<16)throw Error('Invalid encrypted diary');return {salt,iv,ct}};
 async function derive(password,salt){const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:rounds,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
 async function seal(rows,key,salt){const iv=random(12),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('fever-diary-v2')},key,enc.encode(JSON.stringify(rows))));return {v:2,kdf:'PBKDF2-SHA256',rounds,alg:'AES-256-GCM',salt:b64(salt),iv:b64(iv),ct:b64(ct)}}
 async function open(e,password){const {salt,iv,ct}=parse(e),key=await derive(password,salt);let raw;try{raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode('fever-diary-v2')},key,ct)}catch{throw Error('Incorrect passphrase or damaged encrypted diary.')}return {rows:JSON.parse(dec.decode(raw)),key,salt}}
 return {b64,un64,random,derive,seal,open,parse,encode:e=>b64(enc.encode(JSON.stringify(e))),decode:s=>JSON.parse(dec.decode(un64(s)))};
})();
if(typeof module!=='undefined')module.exports=vaultCrypto;