const { env } = require("../config/env");
const { getRedis } = require("../config/redis");
const {
  istDateKey,
  nextIstMidnightEpochSeconds,
  nowIst,
} = require("../utils/time");
const { lbKey, verKey, cacheTopKey, META_HASH_KEY } = require("../utils/keys");
const { safeSegment, clampInt } = require("../utils/sanitize");

/**
 * Lua: atomic score update + TTL + version bump
 *
 * KEYS:
 * 1 META_HASH_KEY
 * 2 primary LB key (region+mode)
 * 3 region-only LB key (region+all)
 * 4 mode-only LB key (all+mode)
 * 5 global LB key (all+all)
 * 6 ver primary
 * 7 ver region-only
 * 8 ver mode-only
 * 9 ver global
 *
 * ARGV:
 * 1 playerId
 * 2 metaJson
 * 3 scoreDelta (string number, can be 0)
 * 4 scoreSet (string number or empty string)
 * 5 expireAt (unix seconds)
 * 6 updatedAtIso
 */
const LUA_UPDATE = `
local playerId = ARGV[1]
local metaJson = ARGV[2]
local delta = tonumber(ARGV[3]) or 0
local setScoreRaw = ARGV[4]
local expireAt = tonumber(ARGV[5])
local updatedAtIso = ARGV[6]

-- current score from primary LB
local current = redis.call("ZSCORE", KEYS[2], playerId)
local currentNum = 0
if current then
  currentNum = tonumber(current) or 0
end

local newScore = 0
local isSet = false
if setScoreRaw ~= nil and setScoreRaw ~= "" then
  newScore = tonumber(setScoreRaw) or 0
  isSet = true
else
  newScore = currentNum + delta
end

-- update all four LB indexes
for i = 2, 5 do
  if isSet then
    redis.call("ZADD", KEYS[i], newScore, playerId)
  else
    redis.call("ZINCRBY", KEYS[i], delta, playerId)
  end
  if expireAt and expireAt > 0 then
    redis.call("EXPIREAT", KEYS[i], expireAt)
  end
end

-- meta upsert
-- store meta JSON (name/region/etc.) + updatedAt
redis.call("HSET", KEYS[1], playerId, metaJson)

-- bump versions (cache bust) + align TTL to midnight
for i = 6, 9 do
  redis.call("INCR", KEYS[i])
  if expireAt and expireAt > 0 then
    redis.call("EXPIREAT", KEYS[i], expireAt)
  end
end

-- rank in primary key
local rank = redis.call("ZREVRANK", KEYS[2], playerId)
if not rank then rank = -1 end

return { tostring(newScore), tostring(rank) }
`;

let luaLoaded = false;
let luaSha = null;

async function ensureLuaLoaded(redis) {
  if (luaLoaded && luaSha) return luaSha;
  luaSha = await redis.scriptLoad(LUA_UPDATE);
  luaLoaded = true;
  return luaSha;
}

function buildIndexes(dateKey, region, mode) {
  const r = safeSegment(region, "all");
  const m = safeSegment(mode, "all");

  const primary = lbKey(dateKey, r, m);
  const regionOnly = lbKey(dateKey, r, "all");
  const modeOnly = lbKey(dateKey, "all", m);
  const global = lbKey(dateKey, "all", "all");

  const vPrimary = verKey(dateKey, r, m);
  const vRegionOnly = verKey(dateKey, r, "all");
  const vModeOnly = verKey(dateKey, "all", m);
  const vGlobal = verKey(dateKey, "all", "all");

  return {
    primary,
    regionOnly,
    modeOnly,
    global,
    vPrimary,
    vRegionOnly,
    vModeOnly,
    vGlobal,
  };
}

async function updateScore({
  playerId,
  name,
  region,
  mode,
  scoreDelta,
  scoreSet,
}) {
  const redis = getRedis();
  await ensureLuaLoaded(redis);

  const dateKey = istDateKey();
  const expireAt = nextIstMidnightEpochSeconds();
  const updatedAtIso = nowIst().toISO();

  const idx = buildIndexes(dateKey, region, mode);

  const meta = {
    playerId: String(playerId),
    name: String(name || playerId),
    region: safeSegment(region, "unknown"),
    // mode is a leaderboard dimension; players can appear in multiple modes.
    updatedAtIst: updatedAtIso,
  };
  const metaJson = JSON.stringify(meta);

  const keys = [
    META_HASH_KEY,
    idx.primary,
    idx.regionOnly,
    idx.modeOnly,
    idx.global,
    idx.vPrimary,
    idx.vRegionOnly,
    idx.vModeOnly,
    idx.vGlobal,
  ];

  const args = [
    String(playerId),
    metaJson,
    String(Number(scoreDelta || 0)),
    scoreSet === undefined || scoreSet === null ? "" : String(Number(scoreSet)),
    String(expireAt),
    updatedAtIso,
  ];

  let result;
  try {
    result = await redis.evalSha(luaSha, { keys, arguments: args });
  } catch (e) {
    // script cache may be evicted; retry with EVAL
    result = await redis.eval(LUA_UPDATE, { keys, arguments: args });
  }

  const newScore = Number(result[0]);
  const rank0 = Number(result[1]); // 0-based
  const rank = rank0 >= 0 ? rank0 + 1 : null;

  return {
    dateKey,
    expireAtEpochSeconds: expireAt,
    playerId: String(playerId),
    region: safeSegment(region, "all"),
    mode: safeSegment(mode, "all"),
    score: newScore,
    rank,
  };
}

async function getTopPlayers({ region, mode, limit }) {
  const redis = getRedis();

  const dateKey = istDateKey();
  const r = safeSegment(region, "all");
  const m = safeSegment(mode, "all");
  const n = clampInt(limit ?? env.defaultTopN, 1, env.maxTopN);

  const key = lbKey(dateKey, r, m);
  const vKey = verKey(dateKey, r, m);

  const version = (await redis.get(vKey)) || "0";
  const cKey = cacheTopKey(dateKey, r, m, n, version);

  const cached = await redis.get(cKey);
  if (cached) return JSON.parse(cached);

  // Fetch top N with scores
  const rows = await redis.zRangeWithScores(key, 0, n - 1, { REV: true });
  const ids = rows.map((x) => x.value);

  let metas = [];
  if (ids.length > 0) {
    const metaJsonArr = await redis.hmGet(META_HASH_KEY, ids);
    metas = metaJsonArr.map((s) => {
      if (!s) return null;
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    });
  }

  const result = rows.map((row, i) => {
    const meta = metas[i] || {};
    return {
      rank: i + 1,
      playerId: row.value,
      score: Number(row.score),
      name: meta.name || row.value,
      region: meta.region || null,
    };
  });

  const payload = {
    dateKey, // IST date partition
    region: r,
    mode: m,
    limit: n,
    version: Number(version),
    players: result,
  };

  // short TTL cache; version changes on updates
  await redis.setEx(cKey, env.topCacheTtlSeconds, JSON.stringify(payload));

  return payload;
}

module.exports = {
  updateScore,
  getTopPlayers,
};
