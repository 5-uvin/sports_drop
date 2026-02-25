require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
const path       = require("path");
const { createClient } = require("@supabase/supabase-js");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Supabase (server-side, uses service role key) ──────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Security middleware ────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());
app.use(helmet({
  contentSecurityPolicy:{
    directives:{
      defaultSrc:["'self'"],
      scriptSrc:[
        "'self'","'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com",
        "https://pagead2.googlesyndication.com",
        "https://www.googletagservices.com",
        "https://adservice.google.com",
        "https://ko-fi.com",
      ],
      styleSrc: ["'self'","'unsafe-inline'","https://fonts.googleapis.com"],
      fontSrc:  ["'self'","https://fonts.gstatic.com"],
      imgSrc:   ["'self'","data:","https:","blob:"],
      connectSrc:["'self'", process.env.SUPABASE_URL||"",
                  "https://pagead2.googlesyndication.com",
                  "https://ko-fi.com"],
      frameSrc: ["https://googleads.g.doubleclick.net","https://ko-fi.com"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiting ──────────────────────────────────────
app.use("/api/", rateLimit({ windowMs:15*60*1000, max:300 }));
app.use("/api/scores", rateLimit({ windowMs:60*1000, max:5 }));

// ── Static files ───────────────────────────────────────
app.use(express.static(path.join(__dirname,"public"),{
  maxAge:"1d", etag:true,
  setHeaders(res, filePath){
    // PWA files must not be cached too aggressively
    if(filePath.endsWith("manifest.json") || filePath.endsWith("sw.js")){
      res.setHeader("Cache-Control","no-cache");
    }
  }
}));

// ── GET /api/config ────────────────────────────────────
// Safely exposes only the anon key to the browser
app.get("/api/config",(req,res)=>{
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    return res.status(503).json({error:"Server not configured"});
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY,
  });
});

// ── GET /api/scores ─────────────────────────────────────
app.get("/api/scores", async(req,res)=>{
  try{
    const {data,error} = await supabase
      .from("leaderboard")
      .select("id,name,score,created_at")
      .order("score",{ascending:false})
      .limit(20);
    if(error) throw error;
    res.json({scores:data});
  }catch(err){
    console.error("GET /api/scores:",err.message);
    res.status(500).json({error:"Could not fetch scores"});
  }
});

// ── POST /api/scores ────────────────────────────────────
app.post("/api/scores", async(req,res)=>{
  const {name,score} = req.body;
  if(!name||typeof name!=="string"||name.trim().length<1||name.trim().length>20)
    return res.status(400).json({error:"Name must be 1–20 characters"});
  if(typeof score!=="number"||!Number.isInteger(score)||score<0||score>999999)
    return res.status(400).json({error:"Invalid score"});
  const cleanName = name.trim().replace(/[<>]/g,"");
  try{
    const {data,error} = await supabase
      .from("leaderboard")
      .insert({name:cleanName,score})
      .select("id,name,score,created_at")
      .single();
    if(error) throw error;
    res.status(201).json({success:true,entry:data});
  }catch(err){
    console.error("POST /api/scores:",err.message);
    res.status(500).json({error:"Could not save score"});
  }
});

// ── GET /api/stats ──────────────────────────────────────
app.get("/api/stats", async(req,res)=>{
  try{
    const {count} = await supabase
      .from("leaderboard").select("*",{count:"exact",head:true});
    const {data:top} = await supabase
      .from("leaderboard").select("score,name").order("score",{ascending:false}).limit(1).single();
    res.json({totalGames:count||0, allTimeHigh:top||null});
  }catch{ res.status(500).json({error:"Stats unavailable"}); }
});

// ── Health check ────────────────────────────────────────
app.get("/health",(req,res)=>{
  res.json({status:"ok", ts:new Date().toISOString(), env:{
    supabase: !!process.env.SUPABASE_URL,
    anonKey:  !!process.env.SUPABASE_ANON_KEY,
    svcKey:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  }});
});

// ── SPA catch-all ───────────────────────────────────────
app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT,()=>{
  console.log(`\n🐱 Sports Drop server → http://localhost:${PORT}`);
  console.log(`   SUPABASE_URL  : ${process.env.SUPABASE_URL ? "✅" : "❌ MISSING — set in .env"}`);
  console.log(`   ANON KEY      : ${process.env.SUPABASE_ANON_KEY ? "✅" : "❌ MISSING"}`);
  console.log(`   SERVICE KEY   : ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅" : "❌ MISSING"}`);
  console.log(`   ALLOWED_ORIGIN: ${process.env.ALLOWED_ORIGIN || "* (open)"}\n`);
});

module.exports = app;
