'use strict';
const $=id=>document.getElementById(id);
let entries=[], editing=null, newest=true;
const notice=s=>$('notice').textContent=s;
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
function normalize(r){if(!Array.isArray(r)||r.length!==6)throw Error('Invalid row');let [id,dt,t,m,d,n]=r;if(typeof id!=='string'||id.length>100||typeof dt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(dt)||!Number.isFinite(Date.parse(dt+'Z'))||!(t===null||typeof t==='number'&&Number.isFinite(t)&&t>=80&&t<=115)||![m,d,n].every(v=>typeof v==='string'&&v.length<=500))throw Error('Invalid entry');return [id,dt,t,m,d,n]}
function merge(data){if(!Array.isArray(data)||data.length>5000)throw Error('Invalid diary');const incoming=data.map(normalize), map=new Map(entries.map(r=>[r[0],r]));for(const r of incoming)if(!map.has(r[0]))map.set(r[0],r);entries=[...map.values()]}
// App state is locked until encryption is established or verified.
const legacyKey='fever-diary:v1:private-browser-log',vaultKey='fever-diary:v2:encrypted';
let activeKey=null,activeSalt=null,stored=null,pending=null,legacy=null,legacyLink=null,busy=false,unlocked=false,storageBaseline=null;
function gateMessage(s){$('gateMessage').textContent=s}
function parseLegacy(s){if(!s)return [];const rows=JSON.parse(s);if(!Array.isArray(rows)||rows.length>5000)throw Error('Invalid legacy diary');return rows.map(normalize)}
function initGate(){
 try{
  if(!crypto.subtle)throw Error('Secure browser encryption is unavailable. Open the HTTPS website in a modern browser.');
  storageBaseline=localStorage.getItem(vaultKey);
  if(storageBaseline){stored=JSON.parse(storageBaseline);vaultCrypto.parse(stored)}
  legacy=localStorage.getItem(legacyKey);
  if(location.hash.startsWith('#enc=')){pending=vaultCrypto.decode(location.hash.slice(5));vaultCrypto.parse(pending)}
  else if(location.hash.startsWith('#log=')){legacyLink=vaultCrypto.decode(location.hash.slice(5));if(!Array.isArray(legacyLink)||legacyLink.length>5000)throw Error('Invalid original diary link');legacyLink=legacyLink.map(normalize)}
  const setup=!stored&&!pending;
  $('gateTitle').textContent=setup?'Choose a diary passphrase':'Unlock your diary';
  $('confirmWrap').hidden=!setup;
  $('confirm').required=setup;
  $('pass').autocomplete=setup?'new-password':'current-password';
  $('unlock').textContent=setup?'Create protected diary':'Unlock diary';
  $('gateInfo').textContent=setup?'Use a strong passphrase (at least 12 characters, preferably 4–6 random words). Existing entries on this browser or original link will be encrypted. There is no password recovery.':pending?'Enter the passphrase from the person who sent the encrypted log. If this browser already has a diary, both must use the same passphrase.':'Enter your passphrase. Your saved readings stay encrypted until unlocked.';
 }catch(e){gateMessage(e.message);$('unlock').disabled=true}
}
async function persist(){
 if(!activeKey)throw Error('Diary is locked');
 const envelope=await vaultCrypto.seal(entries,activeKey,activeSalt);
 if(localStorage.getItem(vaultKey)!==storageBaseline)throw Error('Another tab changed this diary. Reload before saving.');
 const raw=JSON.stringify(envelope);
 localStorage.setItem(vaultKey,raw);
 storageBaseline=raw;stored=envelope;
 return envelope
}
async function exclusive(fn){if(busy)return;busy=true;try{await fn()}finally{busy=false}}
$('gateForm').onsubmit=e=>{e.preventDefault();exclusive(async()=>{
 const password=$('pass').value;
 $('unlock').disabled=true;gateMessage('Unlocking…');
 try{
  if(!stored&&!pending&&(password.length<12||password!==$('confirm').value))throw Error('Use at least 12 characters and enter the same passphrase twice.');
  entries=[];
  if(stored){const o=await vaultCrypto.open(stored,password);merge(o.rows);activeKey=o.key;activeSalt=o.salt}
  if(pending){const o=await vaultCrypto.open(pending,password);merge(o.rows);if(!activeKey){activeKey=o.key;activeSalt=o.salt}}
  if(legacy)merge(parseLegacy(legacy));
  if(legacyLink)merge(legacyLink);
  if(!activeKey){activeSalt=vaultCrypto.random(16);activeKey=await vaultCrypto.derive(password,activeSalt)}
  await persist(); // encrypted write must succeed before deleting the old plaintext key
  if(legacy!==null)localStorage.removeItem(legacyKey);
  history.replaceState(null,'',location.pathname+location.search);
  legacy=null;legacyLink=null;pending=null;$('pass').value='';$('confirm').value='';
  unlocked=true;$('gate').hidden=true;$('diary').hidden=false;
  now();render();notice('Diary unlocked. Saved entries are encrypted.');
 }catch(e){entries=[];activeKey=null;activeSalt=null;gateMessage(e.message)}
 finally{$('unlock').disabled=false}
})};
function lock(){if(busy){notice('Please finish the current operation before locking.');return}location.reload()}
$('lock').onclick=lock;
window.addEventListener('storage',e=>{if(e.key===vaultKey&&unlocked&&e.newValue!==storageBaseline){location.reload()}});
function shareEnvelope(){if(!stored||!unlocked)throw Error('Unlock diary first');return location.origin+location.pathname+'#enc='+vaultCrypto.encode(stored)}

function now(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());let p=Object.fromEntries(parts.map(x=>[x.type,x.value]));$('date').value=p.year+'-'+p.month+'-'+p.day;$('time').value=p.hour+':'+p.minute}
function fmt(dt){return dt.slice(8,10)+'/'+dt.slice(5,7)+'/'+dt.slice(0,4)+' '+dt.slice(11)}
function temp(t){return t===null?'—':t.toFixed(1)+'°F'}
function chart(rows){const svg=$('chart'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();const add=(tag,attrs,txt)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(txt!==undefined)el.textContent=txt;svg.append(el)};if(!rows.length){add('text',{x:170,y:80,'text-anchor':'middle',fill:'#546b69','font-size':12},'No temperature readings yet');return}const vals=rows.map(r=>r[2]), times=rows.map(r=>Date.parse(r[1]+'Z')),lo=Math.floor(Math.min(97,...vals)),hi=Math.ceil(Math.max(104,...vals)),a=times[0],b=times.at(-1),x=t=>40+(b===a?.5:(t-a)/(b-a))*288,y=t=>139-(t-lo)/(hi-lo)*122;for(const v of [lo,100.4,hi].filter((v,i,l)=>v>=lo&&v<=hi&&l.indexOf(v)===i)){add('line',{x1:40,x2:328,y1:y(v),y2:y(v),stroke:v===100.4?'#c87962':'#dce7e5','stroke-dasharray':v===100.4?'4 3':'0'});add('text',{x:35,y:y(v)+4,'text-anchor':'end','font-size':10,fill:'#546b69'},v+'°')}add('polyline',{points:rows.map((r,i)=>x(times[i])+','+y(r[2])).join(' '),fill:'none',stroke:'#17685e','stroke-width':2});rows.forEach((r,i)=>{add('circle',{cx:x(times[i]),cy:y(r[2]),r:3.2,fill:r[2]>=100.4?'#b5422c':'#17685e'})});add('text',{x:40,y:158,'font-size':9,fill:'#546b69'},fmt(rows[0][1]).slice(0,5)+' '+rows[0][1].slice(11));add('text',{x:328,y:158,'text-anchor':'end','font-size':9,fill:'#546b69'},fmt(rows.at(-1)[1]).slice(0,5)+' '+rows.at(-1)[1].slice(11))}
function render(){const asc=[...entries].sort((a,b)=>a[1].localeCompare(b[1])),temps=asc.filter(r=>r[2]!==null),last=temps.at(-1),peak=temps.reduce((a,b)=>!a||b[2]>a[2]?b:a,null),med=asc.filter(r=>r[3]).at(-1);$('latest').textContent=last?temp(last[2]):'—';$('latestTime').textContent=last?fmt(last[1]):'';$('peak').textContent=peak?temp(peak[2]):'—';$('peakTime').textContent=peak?fmt(peak[1]):'';$('lastMed').textContent=med?med[3]:'—';$('medTime').textContent=med?fmt(med[1])+(med[4]?' · '+med[4]:''):'';const tbody=$('rows');tbody.replaceChildren();for(const r of newest?[...asc].reverse():asc){let tr=document.createElement('tr');for(const s of [fmt(r[1]),temp(r[2]),[r[3],r[4],r[5]].filter(Boolean).join(' · ')||'—']){let td=document.createElement('td');td.textContent=s;tr.append(td)}if(r[2]!==null&&r[2]>=100.4)tr.children[1].className='fever';let td=document.createElement('td'),btn=document.createElement('button');btn.textContent='Edit';btn.className='secondary rowedit';btn.onclick=()=>edit(r);td.append(btn);tr.append(td);tbody.append(tr)}$('count').textContent=entries.length+' entries · Temperature displayed in °F';chart(temps)}
function edit(r){editing=r[0];$('date').value=r[1].slice(0,10);$('time').value=r[1].slice(11);$('unit').value='°F';$('temp').value=r[2]??'';$('med').value=r[3];$('dose').value=r[4];$('notes').value=r[5];$('cancel').hidden=false;$('entry').scrollIntoView({behavior:'smooth'})}
function reset(){editing=null;$('entry').reset();$('cancel').hidden=true;now()}
$('entry').onsubmit=e=>{e.preventDefault();exclusive(async()=>{if(!unlocked)return;const before=entries.slice();try{let raw=$('temp').value,t=raw===''?null:Number(raw);if(t!==null&&$('unit').value==='°C')t=Math.round((t*9/5+32)*10)/10;let r=normalize([editing||uid(),$('date').value+'T'+$('time').value,t,$('med').value,$('dose').value.trim(),$('notes').value.trim()]);if(t===null&&!r[3]&&!r[4]&&!r[5])throw Error('Add a temperature, medication or note.');if(editing)entries=entries.map(x=>x[0]===editing?r:x);else entries.push(r);await persist();notice('Entry saved securely.');reset();render()}catch(e){entries=before;notice(e.message)}})};
$('cancel').onclick=reset;$('sort').onclick=()=>{newest=!newest;$('sort').textContent=newest?'Newest first':'Oldest first';render()};
function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));let a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('export').onclick=()=>download('fever-diary-encrypted.json',JSON.stringify(stored,null,2),'application/json');$('csv').onclick=()=>{if(!confirm('CSV is NOT encrypted. Export readable medical records?'))return;const cell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';download('fever-diary.csv',['Date/time (UK),Temperature F,Medication,Dose,Notes',...entries.slice().sort((a,b)=>a[1].localeCompare(b[1])).map(r=>r.slice(1).map(cell).join(','))].join('\r\n'),'text/csv')};
$('import').onchange=e=>{exclusive(async()=>{const before=entries.slice();try{const f=e.target.files[0];if(!f||f.size>6000000)throw Error('Invalid file size');let data=JSON.parse(await f.text());if(!Array.isArray(data)){const pass=$('importPass').value;if(!pass)throw Error('Enter the backup passphrase before selecting the file.');data=(await vaultCrypto.open(data,pass)).rows}merge(data);await persist();notice('Backup imported and encrypted. Existing versions of matching entries kept.');render()}catch(e){entries=before;notice('Import failed: '+e.message)}finally{e.target.value='';$('importPass').value=''}})};
$('share').onclick=async()=>{try{const link=shareEnvelope();if(link.length>24000)throw Error('Diary is too large for a link. Export encrypted backup instead.');$('shareWrap').hidden=false;$('shareText').value=link;try{await navigator.clipboard.writeText(link);notice('Protected link copied. Send the passphrase separately.')}catch{notice('Copy the protected link manually below.')}}catch(e){notice(e.message)}};
initGate();
