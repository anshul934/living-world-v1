const SAMPLE_INTERVAL_MS = 100
const MIN_TREND_AGE_MS = 450
const MAX_TREND_AGE_MS = 900
const TARGET_TREND_AGE_MS = 600
const MAX_SPEED = 800
const DEFAULT_CELL_SIZE = 50
const BASE_SPREAD_PX = 35
const SPEED_SPREAD_FACTOR = 0.08
const FULL_SPEED_RISK_PX_S = 300
const MIN_SPEED_RISK_MULTIPLIER = 0.12
const FORECAST_SAMPLE_INTERVAL_MS = 500
const MAX_UNOBSERVED_GRACE_MS = 500
const MAX_RECORDED_ERRORS = 1000

export class VisitorHeatmapPredictor {
  constructor({ worldWidth, worldHeight, cellSize = DEFAULT_CELL_SIZE, horizonMs = 1500 }) {
    if (
      !Number.isFinite(worldWidth) || worldWidth <= 0 ||
      !Number.isFinite(worldHeight) || worldHeight <= 0 ||
      !Number.isFinite(cellSize) || cellSize <= 0 ||
      !Number.isFinite(horizonMs) || horizonMs <= 0
    ) {
      throw new RangeError("Heatmap dimensions, cell size, and horizon must be positive numbers")
    }

    this.worldWidth = worldWidth
    this.worldHeight = worldHeight
    this.cellSize = cellSize
    this.horizonMs = horizonMs
    this.history = []
    this.lastSampleAt = -Infinity
    this.lastForecastAt = -Infinity
    this.pendingForecasts = []
    this.forecastCount = 0
    this.evaluatedForecastCount = 0
    this.unobservedForecastCount = 0
    this.totalAbsoluteError = 0
    this.withinOneCellCount = 0
    this.errors = []
  }

  update({ visitorId, x, y }, now) {
    if (
      visitorId === null || visitorId === undefined ||
      !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(now)
    ) {
      return null
    }

    this.resolveForecasts(visitorId, x, y, now)
    if (now - this.lastSampleAt >= SAMPLE_INTERVAL_MS) {
      this.history.push({ visitorId, x, y, t: now })
      this.lastSampleAt = now
    }
    this.history = this.history.filter((sample) => now - sample.t <= MAX_TREND_AGE_MS)

    const velocity = this.estimateVelocity(visitorId, x, y, now)
    const predictedX = clamp(x + velocity.x * this.horizonMs / 1000, 0, this.worldWidth)
    const predictedY = clamp(y + velocity.y * this.horizonMs / 1000, 0, this.worldHeight)
    const spread = BASE_SPREAD_PX + velocity.speed * SPEED_SPREAD_FACTOR
    const cells = this.createHeatmap(predictedX, predictedY, spread)

    if (now - this.lastForecastAt >= FORECAST_SAMPLE_INTERVAL_MS) {
      this.pendingForecasts.push({ visitorId, issuedAt: now, predictedX, predictedY })
      this.lastForecastAt = now
      this.forecastCount++
    }

    return {
      visitorId,
      x,
      y,
      predictedX,
      predictedY,
      velocityX: velocity.x,
      velocityY: velocity.y,
      speed: velocity.speed,
      spread,
      horizonMs: this.horizonMs,
      cellSize: this.cellSize,
      columns: Math.ceil(this.worldWidth / this.cellSize),
      rows: Math.ceil(this.worldHeight / this.cellSize),
      cells
    }
  }

  expire(now) {
    this.resolveForecasts(null, null, null, now)
    this.pendingForecasts = this.pendingForecasts.filter((forecast) => {
      if (now - forecast.issuedAt > this.horizonMs + MAX_UNOBSERVED_GRACE_MS) {
        this.unobservedForecastCount++
        return false
      }
      return true
    })
  }

  end() {
    this.unobservedForecastCount += this.pendingForecasts.length
    this.pendingForecasts = []
    this.history = []
    this.lastSampleAt = -Infinity
    this.lastForecastAt = -Infinity
  }

  summary() {
    const sortedErrors = [...this.errors].sort((a, b) => a - b)
    const middle = Math.floor(sortedErrors.length / 2)
    const medianAbsoluteErrorPx = sortedErrors.length === 0
      ? null
      : sortedErrors.length % 2
        ? sortedErrors[middle]
        : (sortedErrors[middle - 1] + sortedErrors[middle]) / 2
    return {
      forecastsIssued: this.forecastCount,
      forecastsEvaluated: this.evaluatedForecastCount,
      forecastsWithoutOutcome: this.unobservedForecastCount,
      meanAbsoluteErrorPx: this.evaluatedForecastCount
        ? Number((this.totalAbsoluteError / this.evaluatedForecastCount).toFixed(1))
        : null,
      medianRecentAbsoluteErrorPx: medianAbsoluteErrorPx === null
        ? null
        : Number(medianAbsoluteErrorPx.toFixed(1)),
      withinOneCellPercent: this.evaluatedForecastCount
        ? Number((100 * this.withinOneCellCount / this.evaluatedForecastCount).toFixed(1))
        : null
    }
  }

  resolveForecasts(visitorId, x, y, now) {
    this.pendingForecasts = this.pendingForecasts.filter((forecast) => {
      if (visitorId !== forecast.visitorId) {
        this.unobservedForecastCount++
        return false
      }
      if (now - forecast.issuedAt < this.horizonMs) return true
      if (!Number.isFinite(x) || !Number.isFinite(y)) return true

      const error = Math.hypot(x - forecast.predictedX, y - forecast.predictedY)
      this.evaluatedForecastCount++
      this.totalAbsoluteError += error
      if (error <= this.cellSize) this.withinOneCellCount++
      this.errors.push(error)
      if (this.errors.length > MAX_RECORDED_ERRORS) this.errors.shift()
      return false
    })
  }

  estimateVelocity(visitorId, x, y, now) {
    let best = null
    for (let i = this.history.length - 1; i >= 0; i--) {
      const sample = this.history[i]
      const age = now - sample.t
      if (age > MAX_TREND_AGE_MS) break
      if (
        age >= MIN_TREND_AGE_MS &&
        sample.visitorId === visitorId &&
        (!best || Math.abs(age - TARGET_TREND_AGE_MS) <
          Math.abs(now - best.t - TARGET_TREND_AGE_MS))
      ) {
        best = sample
      }
    }

    if (!best) return { x: 0, y: 0, speed: 0 }

    const elapsedSeconds = (now - best.t) / 1000
    let velocityX = (x - best.x) / elapsedSeconds
    let velocityY = (y - best.y) / elapsedSeconds
    let speed = Math.hypot(velocityX, velocityY)
    if (speed > MAX_SPEED) return { x: 0, y: 0, speed: 0 }
    if (!Number.isFinite(speed)) return { x: 0, y: 0, speed: 0 }
    return { x: velocityX, y: velocityY, speed }
  }

  createHeatmap(predictedX, predictedY, spread) {
    const columns = Math.ceil(this.worldWidth / this.cellSize)
    const rows = Math.ceil(this.worldHeight / this.cellSize)
    const varianceScale = 2 * spread * spread
    const cells = []
    let totalWeight = 0

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = Math.min((column + 0.5) * this.cellSize, this.worldWidth)
        const y = Math.min((row + 0.5) * this.cellSize, this.worldHeight)
        const dx = x - predictedX
        const dy = y - predictedY
        const weight = Math.exp(-(dx * dx + dy * dy) / varianceScale)
        cells.push({ column, row, x, y, weight })
        totalWeight += weight
      }
    }

    for (const cell of cells) {
      cell.probability = Number((cell.weight / totalWeight).toFixed(6))
      delete cell.weight
    }
    return cells
  }
}

export function probabilityWithinRadius(heatmap, x, y, radius) {
  if (
    !heatmap || !Number.isFinite(x) || !Number.isFinite(y) ||
    !Number.isFinite(radius) || radius < 0
  ) {
    return 0
  }

  const radiusSquared = radius * radius
  const probability = heatmap.cells.reduce((total, cell) => {
    const dx = cell.x - x
    const dy = cell.y - y
    return dx * dx + dy * dy <= radiusSquared ? total + cell.probability : total
  }, 0)
  return Number(Math.max(0, Math.min(1, probability)).toFixed(3))
}

export function speedRiskMultiplier(speed) {
  if (!Number.isFinite(speed) || speed <= 0) return MIN_SPEED_RISK_MULTIPLIER
  const speedConfidence = clamp(speed / FULL_SPEED_RISK_PX_S, 0, 1)
  return Number((
    MIN_SPEED_RISK_MULTIPLIER +
    (1 - MIN_SPEED_RISK_MULTIPLIER) * speedConfidence
  ).toFixed(3))
}

export function scaleHeatmapRiskBySpeed(proximityProbability, speed) {
  if (!Number.isFinite(proximityProbability)) return 0
  return Number((
    clamp(proximityProbability, 0, 1) * speedRiskMultiplier(speed)
  ).toFixed(3))
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
