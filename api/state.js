// Хранилище отметок: один Redis-хеш в Upstash. Подключается в Vercel → Storage → Upstash (Redis).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HASH = "eva-meds";

// Что уже было отмечено 03.11.2026
const SEED = {
  "log:2026-11-03": {doses:{"brevers-m":{at:"16:00"},"emicidin-m":{at:"16:00"},"vazosan-m":{at:"16:00"},"vero-m":{at:"16:00"},"otibiovet-m":{at:"17:00"}}, note:""},
  "config": {times:{m:"07:30", d:"13:00", e:"18:30"}, todos:{uzi:true}},
};

async function redis(cmd){
  const r = await fetch(URL_, {method:"POST", headers:{Authorization:"Bearer " + TOKEN, "Content-Type":"application/json"}, body: JSON.stringify(cmd)});
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(500).json({error:"Upstash не подключён"});
  try{
    if (req.method === "GET"){
      let arr = await redis(["HGETALL", HASH]);
      if (!arr || !arr.length){
        const cmd = ["HSET", HASH]; for (const k in SEED) cmd.push(k, JSON.stringify(SEED[k]));
        await redis(cmd);
        return res.status(200).json(SEED);
      }
      const out = {};
      for (let i = 0; i < arr.length; i += 2){ try{ out[arr[i]] = JSON.parse(arr[i+1]); }catch(e){} }
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
