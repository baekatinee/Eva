// Хранилище отметок: один Redis-хеш в Upstash. Подключается в Vercel → Storage → Upstash (Redis).
// Ищем переменные с любым префиксом, который Vercel мог поставить при подключении базы
const env = process.env;
const pick = suffixes => { for (const sfx of suffixes) for (const k of Object.keys(env)) if (k.endsWith(sfx) && env[k] && !k.includes("READ_ONLY")) return env[k]; return undefined; };
const URL_ = pick(["KV_REST_API_URL", "REDIS_REST_URL"]);
const TOKEN = pick(["KV_REST_API_TOKEN", "REDIS_REST_TOKEN"]);
const TCP_URL = pick(["REDIS_URL", "KV_URL"]);
const HASH = "eva-meds";

// Что уже было отмечено 03.11.2026
const SEED = {
  "log:2026-11-03": {doses:{"brevers-m":{at:"16:00"},"emicidin-m":{at:"16:00"},"vazosan-m":{at:"16:00"},"vero-m":{at:"16:00"},"otibiovet-m":{at:"17:00"}}, note:""},
  "config": {times:{m:"07:30", d:"13:00", e:"18:30"}, todos:{uzi:true}},
};

// Разово дописать то, что давали 03.11–08.11 (уже стоящие отметки не трогаются)
const MIGR = "migr:2026-11-09";
const BACKFILL = {"2026-11-03": ["emicidin-e"]};
for (const d of ["04","05","06","07","08"]) BACKFILL["2026-11-" + d] = ["brevers-m", "emicidin-m", "emicidin-e"];
for (const d of ["07","08"]) BACKFILL["2026-11-" + d].push("cardiosafe-m", "cardiosafe-e", "vero-m");

let tcp = null;
async function redis(cmd){
  if (!(URL_ && TOKEN) && TCP_URL){
    if (!tcp){ const {createClient} = require("redis"); tcp = createClient({url: TCP_URL}); tcp.on("error", () => {}); await tcp.connect(); }
    if (cmd[0] === "HGETALL"){ const o = await tcp.hGetAll(cmd[1]); return Object.entries(o).flat(); }
    return tcp.sendCommand(cmd.map(String));
  }
  const r = await fetch(URL_, {method:"POST", headers:{Authorization:"Bearer " + TOKEN, "Content-Type":"application/json"}, body: JSON.stringify(cmd)});
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!(URL_ && TOKEN) && !TCP_URL) return res.status(500).json({error:"База не подключена к этому проекту. Переменные окружения, которые видит сервер: " + (Object.keys(env).filter(k => /REDIS|KV|UPSTASH/.test(k)).join(", ") || "ни одной про Redis") + ". Подключите базу в Storage → Connect Project и сделайте Redeploy."});
  try{
    if (req.method === "GET"){
      let arr = await redis(["HGETALL", HASH]);
      const out = {};
      if (!arr || !arr.length){
        const cmd = ["HSET", HASH]; for (const k in SEED){ cmd.push(k, JSON.stringify(SEED[k])); out[k] = SEED[k]; }
        await redis(cmd);
      } else {
        for (let i = 0; i < arr.length; i += 2){ try{ out[arr[i]] = JSON.parse(arr[i+1]); }catch(e){} }
      }
      if (!out[MIGR]){
        const cmd = ["HSET", HASH, MIGR, JSON.stringify({at: new Date().toISOString()})];
        for (const date in BACKFILL){
          const key = "log:" + date, cur = out[key] || {doses:{}, note:""};
          const doses = Object.assign({}, cur.doses);
          for (const k of BACKFILL[date]) if (!doses[k]) doses[k] = {at: k.endsWith("-e") ? "18:30" : "07:30", back: true};
          out[key] = Object.assign({}, cur, {doses});
          cmd.push(key, JSON.stringify(out[key]));
        }
        await redis(cmd);
        out[MIGR] = true;
      }
      return res.status(200).json(out);
    }
    if (req.method === "POST"){
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const {key, value} = body;
      if (typeof key !== "string" || !/^(log:\d{4}-\d{2}-\d{2}|config)$/.test(key)) return res.status(400).json({error:"bad key"});
      const s = JSON.stringify(value);
      if (!value || typeof value !== "object" || s.length > 20000) return res.status(400).json({error:"bad value"});
      await redis(["HSET", HASH, key, s]);
      return res.status(200).json({ok:true});
    }
    res.status(405).end();
  }catch(e){
    res.status(500).json({error:String(e.message || e)});
  }
};
