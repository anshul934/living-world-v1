const HORIZON_MS = 1500
const RISK_THRESHOLD = 0.3
const FLEE_THREAT = 0.3 // matches the threatLevel >= .3 flee trigger in demo2d.js
const clamp01 = (x) => Math.max(0, Math.min(1, x))

export function predictDisturbance({ distance, fear = 0, threat = 0 }) {
  // No visitor on screen: nothing to predict.
  if (!Number.isFinite(distance)) {
    return { riskScore: 0, predictedDisturbance: false, horizonMs: HORIZON_MS }
  }
  const threatTerm = clamp01(threat / FLEE_THREAT)
  const fearTerm = clamp01((fear - 0.3) / 0.4)
  const risk = 1 - (1 - threatTerm) * (1 - 0.8 * fearTerm)
  const riskScore = Number(risk.toFixed(3))
  return {
    riskScore,
    predictedDisturbance: riskScore >= RISK_THRESHOLD,
    horizonMs: HORIZON_MS
  }
}