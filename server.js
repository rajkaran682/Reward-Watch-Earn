require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEMO_MODE = String(process.env.DEMO_MODE || "true").toLowerCase() === "true";
const MIN_WITHDRAWAL = Math.max(1, Number(process.env.MIN_WITHDRAWAL_RUPEES || 100));
const db = new Database(process.env.DB_PATH || path.join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, balance_paise INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, task_key TEXT NOT NULL,
 reward_paise INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'demo',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id, task_key), FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS withdrawals (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount_paise INTEGER NOT NULL,
 upi_or_bank TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(session({
 secret: process.env.SESSION_SECRET || "CHANGE_THIS_IN_ENVIRONMENT_NOW",
 resave: false, saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const qUser = db.prepare("SELECT id,name,email,balance_paise,created_at FROM users WHERE id=?");
function currentUser(req) { return req.session.userId ? qUser.get(req.session.userId) : null; }
function auth(req,res,next) { if (!currentUser(req)) return res.status(401).json({error:"पहले लॉगिन करें।"}); next(); }
function adminAuth(req,res,next) {
 const key = req.get("x-admin-key") || req.body.adminKey;
 if (!process.env.ADMIN_KEY || !key || key !== process.env.ADMIN_KEY) return res.status(401).json({error:"Admin key गलत है।"});
 next();
}
function validText(s, max=160) { return typeof s === "string" && s.trim().length > 0 && s.trim().length <= max; }

app.get("/api/config", (req,res)=>res.json({demoMode:DEMO_MODE, minWithdrawalRupees:MIN_WITHDRAWAL}));
app.get("/api/me", (req,res)=> { const u=currentUser(req); if(!u) return res.json({user:null}); res.json({user:u}); });

app.post("/api/register", async (req,res)=>{
 const name=String(req.body.name||"").trim(), email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
 if(!validText(name,80) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || password.length>200)
   return res.status(400).json({error:"नाम, सही ईमेल और कम से कम 8 अक्षर का पासवर्ड दें।"});
 try {
  const hash=await bcrypt.hash(password,12);
  const result=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name,email,hash);
  req.session.userId=Number(result.lastInsertRowid);
  res.json({ok:true,user:qUser.get(req.session.userId)});
 } catch(e) { res.status(409).json({error:"यह ईमेल पहले से रजिस्टर है या खाता नहीं बन पाया।"}); }
});
app.post("/api/login", async (req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
 const row=db.prepare("SELECT * FROM users WHERE email=?").get(email);
 if(!row || !(await bcrypt.compare(password,row.password_hash))) return res.status(401).json({error:"ईमेल या पासवर्ड सही नहीं है।"});
 req.session.userId=row.id; res.json({ok:true,user:qUser.get(row.id)});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/dashboard",auth,(req,res)=>{
 const u=currentUser(req);
 const tasks=db.prepare("SELECT id,task_key,reward_paise,status,created_at FROM tasks WHERE user_id=? ORDER BY id DESC LIMIT 30").all(u.id);
 const withdrawals=db.prepare("SELECT id,amount_paise,upi_or_bank,status,created_at FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 30").all(u.id);
 res.json({user:u,tasks,withdrawals,demoMode:DEMO_MODE,minWithdrawalRupees:MIN_WITHDRAWAL});
});

// Explicitly simulated test reward. Never use this route as proof of a real ad view.
app.post("/api/demo-task",auth,(req,res)=>{
 if(!DEMO_MODE) return res.status(403).json({error:"डेमो टास्क बंद है। असली रिवॉर्ड के लिए अनुमोदित प्रदाता का सर्वर-साइड सत्यापन जोड़ना होगा।"});
 const user=currentUser(req), taskKey="demo-"+new Date().toISOString().slice(0,10);
 const reward=100; // ₹1 demo credit; not withdrawable real money
 try {
  const tx=db.transaction(()=>{
   db.prepare("INSERT INTO tasks(user_id,task_key,reward_paise,status) VALUES(?,?,?,'demo')").run(user.id,taskKey,reward);
   db.prepare("UPDATE users SET balance_paise=balance_paise+? WHERE id=?").run(reward,user.id);
  }); tx();
  res.json({ok:true,message:"डेमो में ₹1 जोड़ा गया। यह असली कमाई या बैंक में निकाली जा सकने वाली राशि नहीं है।"});
 } catch(e) { res.status(409).json({error:"आज का डेमो टास्क पहले ही इस्तेमाल किया जा चुका है।"}); }
});

app.post("/api/withdraw",auth,(req,res)=>{
 const amount=Math.round(Number(req.body.amount)*100);
 const destination=String(req.body.destination||"").trim();
 if(!Number.isFinite(amount) || amount<MIN_WITHDRAWAL*100) return res.status(400).json({error:`न्यूनतम निकासी ₹${MIN_WITHDRAWAL} है।`});
 if(!validText(destination,180)) return res.status(400).json({error:"बैंक/UPI विवरण भरें।"});
 const u=currentUser(req);
 if(amount>u.balance_paise) return res.status(400).json({error:"आपका बैलेंस इस राशि के लिए पर्याप्त नहीं है।"});
 const tx=db.transaction(()=>{
  db.prepare("UPDATE users SET balance_paise=balance_paise-? WHERE id=?").run(amount,u.id);
  db.prepare("INSERT INTO withdrawals(user_id,amount_paise,upi_or_bank) VALUES(?,?,?)").run(u.id,amount,destination);
 }); tx();
 res.json({ok:true,message:"निकासी अनुरोध समीक्षा के लिए भेजा गया। यह ऐप अपने आप पैसे ट्रांसफर नहीं करता।"});
});

app.get("/api/admin/withdrawals",adminAuth,(req,res)=>{
 const rows=db.prepare(`SELECT w.id,w.user_id,u.name,u.email,w.amount_paise,w.upi_or_bank,w.status,w.created_at
 FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT 200`).all();
 res.json({withdrawals:rows});
});
app.get("/api/admin/users",adminAuth,(req,res)=>{
 res.json({users:db.prepare("SELECT id,name,email,balance_paise,created_at FROM users ORDER BY id DESC LIMIT 200").all()});
});
app.post("/api/admin/withdrawals/:id/status",adminAuth,(req,res)=>{
 const status=String(req.body.status||"");
 if(!["approved","paid","rejected"].includes(status)) return res.status(400).json({error:"अमान्य स्थिति।"});
 const id=Number(req.params.id);
 const w=db.prepare("SELECT * FROM withdrawals WHERE id=?").get(id);
 if(!w) return res.status(404).json({error:"अनुरोध नहीं मिला।"});
 if(w.status==="paid" && status!=="paid") return res.status(400).json({error:"भुगतान किए गए अनुरोध को बदला नहीं जा सकता।"});
 const tx=db.transaction(()=>{
  db.prepare("UPDATE withdrawals SET status=? WHERE id=?").run(status,id);
  if(status==="rejected" && w.status!=="rejected") db.prepare("UPDATE users SET balance_paise=balance_paise+? WHERE id=?").run(w.amount_paise,w.user_id);
 });
 tx(); res.json({ok:true,message:status==="paid"?"स्थिति अपडेट हुई। केवल वास्तविक बैंक ट्रांसफर के बाद ही Paid चुनें।":"स्थिति अपडेट हुई।"});
});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Reward Watch & Earn listening on ${PORT}; demo mode=${DEMO_MODE}`));
