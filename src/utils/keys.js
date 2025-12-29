const { safeSegment } = require("./sanitize");

function lbKey(dateKey, region, mode) {
  const r = safeSegment(region, "all");
  const m = safeSegment(mode, "all");
  return `lb:${dateKey}:r:${r}:m:${m}`;
}

function verKey(dateKey, region, mode) {
  const r = safeSegment(region, "all");
  const m = safeSegment(mode, "all");
  return `lb:ver:${dateKey}:r:${r}:m:${m}`;
}

function cacheTopKey(dateKey, region, mode, limit, version) {
  const r = safeSegment(region, "all");
  const m = safeSegment(mode, "all");
  return `cache:top:${dateKey}:r:${r}:m:${m}:n:${limit}:v:${version}`;
}

function roomKey(dateKey, region, mode) {
  const r = safeSegment(region, "all");
  const m = safeSegment(mode, "all");
  return `room:${dateKey}:r:${r}:m:${m}`;
}

const META_HASH_KEY = "players:meta";

module.exports = {
  lbKey,
  verKey,
  cacheTopKey,
  roomKey,
  META_HASH_KEY,
};
