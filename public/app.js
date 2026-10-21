const $=s=>document.querySelector(s);
let minWithdrawal=100;
function show(message,error=false){const n=$("#notice");n.textContent=message;n.classList.remove("hidden","error");if(error)n.classList.add("error");}
async function api(url,opts={}){const r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(opts.headers||{})},...opts});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"अनुरोध पूरा नहीं हुआ।");return d}
function rupees(p){return "₹"+(Number(p||0)/100).toFixed(2)}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
async function refresh(){const d=await api("/api/dashboard");$("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#logout").classList.remove("hidden");$("#balance").textContent=rupees(d.user.balance_paise);$("#minimum").textContent="₹"+d.minWithdrawalRupees;$("#username").textContent=d.user.name;minWithdrawal=d.minWithdrawalRupees;$("#demoBanner").classList.toggle("hidden",!d.demoMode);$("#demoTask").disabled=!d.demoMode;
 $("#tasks").innerHTML=d.tasks.length?d.tasks.map(t=>`<div class="history-item">${safe(t.task_key)} <b>${rupees(t.reward_paise)}</b><span class="pill">${safe(t.status)}</span><br>${safe(t.created_at)}</div>`).join(""):"अभी कोई टास्क नहीं।";
 $("#withdrawals").innerHTML=d.withdrawals.length?d.withdrawals.map(w=>`<div class="history-item"><b>${rupees(w.amount_paise)}</b><span class="pill">${safe(w.status)}</span><br>${safe(w.upi_or_bank)}<br>${safe(w.created_at)}</div>`).join(""):"अभी कोई अनुरोध नहीं।";}
function safe(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function init(){try{const d=await api("/api/me");if(d.user)await refresh()}catch(e){show(e.message,true)}}
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify(formData(e.target))});show("लॉगिन सफल।");await refresh()}catch(x){show(x.message,true)}});
$("#registerForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/register",{method:"POST",body:JSON.stringify(formData(e.target))});show("खाता बन गया।");await refresh()}catch(x){show(x.message,true)}});
$("#logout").addEventListener("click",async()=>{await api("/api/logout",{method:"POST"});location.reload()});
$("#demoTask").addEventListener("click",async()=>{try{const d=await api("/api/demo-task",{method:"POST",body:"{}"});show(d.message);await refresh()}catch(e){show(e.message,true)}});
$("#withdrawForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/api/withdraw",{method:"POST",body:JSON.stringify(formData(e.target))});show(d.message);e.target.reset();await refresh()}catch(x){show(x.message,true)}});
init();