const { z } = require("zod");
const leaderboardService = require("../services/leaderboard.service");

const updateSchema = z
  .object({
    playerId: z.union([z.string().min(1), z.number()]).transform(String),
    name: z.string().min(1).optional(),
    region: z.string().min(1),
    mode: z.string().min(1),
    scoreDelta: z.number().optional(),
    scoreSet: z.number().optional(),
  })
  .refine((v) => v.scoreDelta !== undefined || v.scoreSet !== undefined, {
    message: "Provide scoreDelta or scoreSet",
  });

async function postUpdateScore(req, res, next) {
  try {
    const body = updateSchema.parse(req.body);

    const updated = await leaderboardService.updateScore({
      playerId: body.playerId,
      name: body.name,
      region: body.region,
      mode: body.mode,
      scoreDelta: body.scoreDelta,
      scoreSet: body.scoreSet,
    });

    // socket broadcast (available from server.js)
    const emitScoreUpdate = req.app.locals.emitScoreUpdate;
    if (typeof emitScoreUpdate === "function") {
      emitScoreUpdate({
        dateKey: updated.dateKey,
        region: updated.region,
        mode: updated.mode,
        playerId: updated.playerId,
        score: updated.score,
        rank: updated.rank,
      });
    }

    res.json({ ok: true, ...updated });
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
}

const topSchema = z.object({
  region: z.string().optional(),
  mode: z.string().optional(),
  limit: z.coerce.number().optional(),
});

async function getTop(req, res, next) {
  try {
    const q = topSchema.parse(req.query);
    const data = await leaderboardService.getTopPlayers({
      region: q.region || "all",
      mode: q.mode || "all",
      limit: q.limit,
    });
    res.json(data);
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
}

module.exports = { postUpdateScore, getTop };
