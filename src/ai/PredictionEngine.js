
/**
 * LIVING WORLD — V1
 * Predictive analysis baseline.
 *
 * This is a transparent heuristic, not a trained ML model.
 * It predicts short-term disturbance risk from visitor behaviour.
 * It does not control creature behaviour.
 */

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value))

export function predictDisturbance({
  distance,
  approachSpeed,
  fear,
  calmDurationMs = 0
}) {
  const safeDistance = Number.isFinite(distance)
    ? Math.max(0, distance)
    : Infinity

  const speed = Number.isFinite(approachSpeed)
    ? Math.max(0, approachSpeed)
    : 0

  const currentFear = Number.isFinite(fear)
    ? clamp(fear, 0, 1)
    : 0

  // Nearer visitors present greater immediate disturbance risk.
  const proximityRisk = Number.isFinite(safeDistance)
    ? 1 - clamp((safeDistance - 40) / 220, 0, 1)
    : 0

  // Faster approaches increase predicted risk.
  const movementRisk = clamp(speed / 400, 0, 1)

  // Existing fear represents accumulated sensitivity.
  const fearRisk = currentFear

  // Calm, sustained stillness reduces the prediction.
  const calmReduction =
    clamp(calmDurationMs / 3000, 0, 1) * 0.25

  const riskScore = clamp(
    proximityRisk * 0.45 +
    movementRisk * 0.35 +
    fearRisk * 0.20 -
    calmReduction,
    0,
    1
  )

  return {
    riskScore: Number(riskScore.toFixed(3)),
    predictedDisturbance: riskScore >= 0.65,
    horizonMs: 1500
  }
}
