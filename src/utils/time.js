const { DateTime } = require("luxon");
const { env } = require("../config/env");

function nowIst() {
  return DateTime.now().setZone(env.tz);
}

/** e.g. 20251229 */
function istDateKey(dt = nowIst()) {
  return dt.toFormat("yyyyLLdd");
}

/** Unix epoch seconds for the next IST midnight */
function nextIstMidnightEpochSeconds(dt = nowIst()) {
  const nextMidnight = dt.plus({ days: 1 }).startOf("day");
  return Math.floor(nextMidnight.toSeconds());
}

module.exports = {
  nowIst,
  istDateKey,
  nextIstMidnightEpochSeconds,
};
