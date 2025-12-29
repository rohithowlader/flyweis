const express = require("express");
const router = express.Router();

const controller = require("../controllers/leaderboard.controller");

// Create player if missing + update score
router.post("/score", controller.postUpdateScore);

// Top N (filterable)
router.get("/top", controller.getTop);

module.exports = router;
