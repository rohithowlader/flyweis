const http = require("http");
const { createApp } = require("./app");
const { env } = require("./config/env");
const { connectRedis } = require("./config/redis");
const { setupSockets } = require("./sockets");
const {
  nowIst,
  nextIstMidnightEpochSeconds,
  istDateKey,
} = require("./utils/time");

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  const { client, pubClient, subClient } = await connectRedis();
  const { io, emitScoreUpdate } = setupSockets(server, {
    pubClient,
    subClient,
  });

  // Make socket emitter available to routes via app locals
  app.locals.emitScoreUpdate = emitScoreUpdate;

  // Schedule a midnight IST notification (clients should re-subscribe)
  function scheduleMidnightReset() {
    const now = nowIst();
    const nextMidnightEpoch = nextIstMidnightEpochSeconds(now);
    const delayMs = Math.max(1000, nextMidnightEpoch * 1000 - Date.now());

    setTimeout(() => {
      const newDateKey = istDateKey();
      io.emit("leaderboard:reset", { dateKey: newDateKey, tz: env.tz });

      // reschedule
      scheduleMidnightReset();
    }, delayMs);
  }
  scheduleMidnightReset();

  server.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port}`);
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[server] shutting down...");
    try {
      await client.quit();
      await pubClient.quit();
      await subClient.quit();
      server.close(() => process.exit(0));
    } catch {
      process.exit(1);
    }
  });
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
