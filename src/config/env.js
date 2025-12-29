const dotenv = require("dotenv");
dotenv.config();

function mustGet(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 8080),
  corsOrigin: process.env.CORS_ORIGIN || "*",

  redisUrl: mustGet("REDIS_URL"),

  defaultTopN: Number(process.env.DEFAULT_TOP_N || 10),
  maxTopN: Number(process.env.MAX_TOP_N || 100),
  topCacheTtlSeconds: Number(process.env.TOP_CACHE_TTL_SECONDS || 5),

  socketPushTopN: Number(process.env.SOCKET_PUSH_TOP_N || 10),
  socketCoalesceMs: Number(process.env.SOCKET_COALESCE_MS || 150),

  tz: process.env.TZ || "Asia/Kolkata",
};

module.exports = { env };
