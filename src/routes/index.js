const express = require("express");
const router = express.Router();

const leaderboardRoutes = require("./leaderboard.routes");

router.get("/health", (req, res) => {
  res.json({ ok: true });
});

router.use("/leaderboard", leaderboardRoutes);

module.exports = router;
