const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");

const { env } = require("../config/env");
const { istDateKey } = require("../utils/time");
const { roomKey } = require("../utils/keys");
const { safeSegment, clampInt } = require("../utils/sanitize");
const leaderboardService = require("../services/leaderboard.service");

function buildRoom(dateKey, region, mode) {
  return roomKey(dateKey, safeSegment(region, "all"), safeSegment(mode, "all"));
}

/**
 * Coalesce leaderboard pushes per room to reduce Redis load under high write rates.
 */
function createRoomBroadcaster(io) {
  const timers = new Map();

  return {
    schedulePushTop(room, region, mode) {
      if (timers.has(room)) return;

      timers.set(
        room,
        setTimeout(async () => {
          timers.delete(room);
          try {
            const payload = await leaderboardService.getTopPlayers({
              region,
              mode,
              limit: env.socketPushTopN,
            });
            io.to(room).emit("leaderboard:top", payload);
          } catch (e) {
            // swallow to avoid taking down socket loop
            console.error("[socket] push top error:", e?.message || e);
          }
        }, env.socketCoalesceMs)
      );
    },
  };
}

function setupSockets(httpServer, { pubClient, subClient }) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      credentials: true,
    },
  });

  // Scale Socket.io across multiple instances
  io.adapter(createAdapter(pubClient, subClient));

  const broadcaster = createRoomBroadcaster(io);

  io.on("connection", (socket) => {
    socket.emit("server:ready", { ok: true });

    /**
     * Subscribe client to a (region, mode) leaderboard stream.
     * Client receives:
     * - immediate "leaderboard:top"
     * - subsequent "leaderboard:scoreUpdated" (and coalesced "leaderboard:top")
     */
    socket.on("leaderboard:subscribe", async (msg = {}) => {
      const dateKey = istDateKey();
      const region = safeSegment(msg.region, "all");
      const mode = safeSegment(msg.mode, "all");
      const limit = clampInt(msg.limit || env.socketPushTopN, 1, env.maxTopN);

      const room = buildRoom(dateKey, region, mode);
      await socket.join(room);

      // store subscription info (client should re-subscribe after reset events)
      socket.data.lb = { region, mode, limit };

      const payload = await leaderboardService.getTopPlayers({
        region,
        mode,
        limit,
      });
      socket.emit("leaderboard:top", payload);
    });

    socket.on("leaderboard:unsubscribe", async () => {
      const dateKey = istDateKey();
      const sub = socket.data.lb;
      if (!sub) return;

      const room = buildRoom(dateKey, sub.region, sub.mode);
      await socket.leave(room);
      socket.data.lb = null;
    });
  });

  /**
   * Used by API layer to emit changes.
   */
  function emitScoreUpdate({ dateKey, region, mode, playerId, score, rank }) {
    const r = safeSegment(region, "all");
    const m = safeSegment(mode, "all");

    const rooms = [
      buildRoom(dateKey, r, m),
      buildRoom(dateKey, r, "all"),
      buildRoom(dateKey, "all", m),
      buildRoom(dateKey, "all", "all"),
    ];

    const evt = {
      dateKey,
      region: r,
      mode: m,
      playerId,
      score,
      rank,
    };

    for (const room of rooms) {
      io.to(room).emit("leaderboard:scoreUpdated", evt);
    }

    // coalesced top push for the exact segment + global rollups
    broadcaster.schedulePushTop(buildRoom(dateKey, r, m), r, m);
    broadcaster.schedulePushTop(buildRoom(dateKey, r, "all"), r, "all");
    broadcaster.schedulePushTop(buildRoom(dateKey, "all", m), "all", m);
    broadcaster.schedulePushTop(buildRoom(dateKey, "all", "all"), "all", "all");
  }

  return { io, emitScoreUpdate };
}

module.exports = { setupSockets };
