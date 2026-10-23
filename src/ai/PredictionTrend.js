const MIN_SAMPLE_AGE_MS = 450
const MAX_SAMPLE_AGE_MS = 900
const TARGET_SAMPLE_AGE_MS = 600
const MAX_CLOSING_SPEED = 800

export function estimateTrendClosingSpeed(history, { now, distance, visitorId }) {
  if (!visitorId || !Number.isFinite(now) || !Number.isFinite(distance)) return 0

  let best = null
  for (let i = history.length - 1; i >= 0; i--) {
    const sample = history[i]
    const age = now - sample.t
    if (age > MAX_SAMPLE_AGE_MS) break
    if (
      age >= MIN_SAMPLE_AGE_MS &&
      Number.isFinite(sample.distance) &&
      sample.visitorId === visitorId &&
      (!best || Math.abs(age - TARGET_SAMPLE_AGE_MS) <
        Math.abs(now - best.t - TARGET_SAMPLE_AGE_MS))
    ) {
      best = sample
    }
  }

  if (!best) return 0
  const closingSpeed = (best.distance - distance) / ((now - best.t) / 1000)
  return Math.abs(closingSpeed) > MAX_CLOSING_SPEED ? 0 : closingSpeed
}
