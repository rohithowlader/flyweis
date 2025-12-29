function safeSegment(input, fallback = "all") {
  const s = String(input ?? "").trim();
  if (!s) return fallback;

  // allow: letters, digits, underscore, hyphen
  const cleaned = s.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned || fallback;
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

module.exports = { safeSegment, clampInt };
