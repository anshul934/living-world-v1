/**
 * LIVING WORLD — V1
 * Disturbance predictor V3. The base predictor remains shadow-only; the
 * trend-enabled candidate is evaluated separately and can trigger early flight.
 *
 * Idea: in demo2d.js a butterfly flees when threat >= FLEE_THREAT, where
 *   threat = 1 - distanceToNearestNonCalmVisitor / THREAT_RADIUS.
 * So "will it flee within the horizon?" is a time-to-threshold question:
 *   timeToFlee = (distance - FLEE_DISTANCE) / closingSpeed
 * V2 used fear as an independent risk source, but fear does not cause fleeing
 * and decays slowly, which produced false positives with a distant visitor.
 * V3 therefore ignores fear (the argument is accepted for API compatibility).
 *
 * Keep these constants in sync with demo2d.js.
 */

const THREAT_RADIUS = 260
const FLEE_THREAT = 0.3
const FLEE_DISTANCE = THREAT_RADIUS * (1 - FLEE_THREAT) // 182 px

const HORIZON_MS = 1500
const WARN_RISK = 0.5            // risk >= 0.5  <=>  predicted time-to-flee <= horizon
const CALM_MS = 2500             // same stillness rule as calmOptionsFor() in demo2d.js
const LATERAL_WEIGHT = 0.25      // fraction of sideways visitor speed treated as possible approach
const VISITOR_SPEED_CAP = 600    // px/s; faster readings are tracker glitches and are ignored
const PROXIMITY_BAND = 60        // px beyond the flee radius where closeness alone adds risk
const PROXIMITY_MAX = 0.45       // closeness alone can never reach WARN_RISK

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const finiteOr = (v, fallback) => (Number.isFinite(v) ? v : fallback)

export function predictDisturbance({
  distance,
  approachSpeed = 0,
  visitorSpeed = 0,
  trendClosingSpeed = 0,
  threat = 0,
  calmDurationMs = 0
  // fear is intentionally unused
}) {
  const result = (risk) => {
    const riskScore = Number(clamp01(risk).toFixed(3))
    return {
      riskScore,
      predictedDisturbance: riskScore >= WARN_RISK,
      horizonMs: HORIZON_MS
    }
  }

  // No visitor on screen.
  if (!Number.isFinite(distance)) return result(0)

  const safeThreat = clamp01(finiteOr(threat, 0))

  // Threat is 0 while a visitor is inside the threat radius only when the
  // engine is ignoring that visitor as calm. Calm visitors cannot cause a flee
  // until they move (and moving resets calmDurationMs), so nothing to predict.
  if (safeThreat === 0 && distance < THREAT_RADIUS) return result(0)

  // Prefer the distance the engine itself uses; fall back to raw distance.
  const effectiveDistance = safeThreat > 0
    ? THREAT_RADIUS * (1 - safeThreat)
    : distance
  const distanceToFlee = effectiveDistance - FLEE_DISTANCE

  // Already inside the flee radius: the flee fires this frame.
  if (distanceToFlee <= 0) return result(1)

  const approach = Math.max(0, finiteOr(approachSpeed, 0))
  const rawSpeed = Math.max(0, finiteOr(visitorSpeed, 0))
  const speed = rawSpeed > VISITOR_SPEED_CAP ? 0 : rawSpeed
  const trend = Math.max(0, finiteOr(trendClosingSpeed, 0))
  const closingSpeed = Math.max(approach, trend, LATERAL_WEIGHT * speed)

  // risk 1 at timeToFlee = 0, 0.5 at the horizon, 0 at twice the horizon.
  const horizonSec = HORIZON_MS / 1000
  const timeToFleeSec = closingSpeed > 0 ? distanceToFlee / closingSpeed : Infinity
  const timeRisk = Number.isFinite(timeToFleeSec)
    ? clamp01(1 - timeToFleeSec / (2 * horizonSec))
    : 0

  // Being close to the flee radius adds a little risk, less if the visitor has
  // been still for a while.
  const stillness = clamp01(finiteOr(calmDurationMs, 0) / CALM_MS)
  const proximityRisk = PROXIMITY_MAX *
    clamp01(1 - distanceToFlee / PROXIMITY_BAND) * (1 - stillness)

  // Noisy-or: either signal can raise the score, neither alone is certain.
  return result(1 - (1 - timeRisk) * (1 - proximityRisk))
}
