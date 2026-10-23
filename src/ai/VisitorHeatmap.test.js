import test from "node:test"
import assert from "node:assert/strict"
import {
  probabilityWithinRadius,
  scaleHeatmapRiskBySpeed,
  speedRiskMultiplier,
  VisitorHeatmapPredictor
} from "./VisitorHeatmap.js"

function predictor(options = {}) {
  return new VisitorHeatmapPredictor({
    worldWidth: 1000,
    worldHeight: 650,
    ...options
  })
}

test("stationary visitor heatmap is centered on current location", () => {
  const model = predictor()
  const forecast = model.update({ visitorId: "visitor-1", x: 300, y: 250 }, 1000)

  assert.equal(forecast.predictedX, 300)
  assert.equal(forecast.predictedY, 250)
  assert.equal(forecast.cells.length, 260)
  assert.ok(Math.abs(forecast.cells.reduce((sum, cell) => sum + cell.probability, 0) - 1) < 0.001)
})

test("recent movement shifts the heatmap forecast toward the visitor's direction", () => {
  const model = predictor()
  model.update({ visitorId: "visitor-1", x: 200, y: 200 }, 1000)
  model.update({ visitorId: "visitor-1", x: 260, y: 200 }, 1600)
  const forecast = model.update({ visitorId: "visitor-1", x: 280, y: 200 }, 1800)

  assert.ok(forecast.velocityX > 0)
  assert.equal(forecast.velocityY, 0)
  assert.ok(forecast.predictedX > forecast.x)
  assert.ok(forecast.cells.find((cell) => cell.x >= forecast.predictedX)?.probability > 0)
})

test("visitor heatmap is clipped to world bounds", () => {
  const model = predictor()
  model.update({ visitorId: "visitor-1", x: 900, y: 200 }, 1000)
  model.update({ visitorId: "visitor-1", x: 980, y: 200 }, 1600)
  const forecast = model.update({ visitorId: "visitor-1", x: 990, y: 200 }, 1800)

  assert.equal(forecast.predictedX, 1000)
  assert.ok(forecast.cells.every((cell) => cell.x >= 0 && cell.x <= 1000))
  assert.ok(forecast.cells.every((cell) => cell.y >= 0 && cell.y <= 650))
})

test("invalid observations do not create a heatmap", () => {
  const model = predictor()
  assert.equal(model.update({ visitorId: null, x: 200, y: 200 }, 1000), null)
  assert.equal(model.update({ visitorId: "visitor-1", x: NaN, y: 200 }, 1000), null)
})

test("probability within radius sums nearby forecast cells", () => {
  const model = predictor({ cellSize: 50 })
  const forecast = model.update({ visitorId: "visitor-1", x: 300, y: 250 }, 1000)
  const nearRisk = probabilityWithinRadius(forecast, 300, 250, 50)
  const farRisk = probabilityWithinRadius(forecast, 900, 550, 50)

  assert.ok(nearRisk > farRisk)
  assert.ok(nearRisk <= 1 && farRisk >= 0)
})

test("invalid radius inputs return no probability", () => {
  assert.equal(probabilityWithinRadius(null, 0, 0, 1), 0)
  assert.equal(probabilityWithinRadius({ cells: [] }, 0, 0, -1), 0)
})

test("higher visitor speed increases the heatmap risk multiplier", () => {
  assert.ok(speedRiskMultiplier(20) < speedRiskMultiplier(150))
  assert.ok(speedRiskMultiplier(150) < speedRiskMultiplier(400))
  assert.equal(speedRiskMultiplier(400), 1)
})

test("the same forecast proximity creates more heatmap risk at higher speed", () => {
  const slowRisk = scaleHeatmapRiskBySpeed(0.7, 20)
  const mediumRisk = scaleHeatmapRiskBySpeed(0.7, 150)
  const fastRisk = scaleHeatmapRiskBySpeed(0.7, 400)

  assert.ok(slowRisk < mediumRisk)
  assert.ok(mediumRisk < fastRisk)
})

test("forecast accuracy is measured against the visitor location at the horizon", () => {
  const model = predictor({ horizonMs: 600 })
  model.update({ visitorId: "visitor-1", x: 100, y: 100 }, 1000)
  model.update({ visitorId: "visitor-1", x: 160, y: 100 }, 1600)

  const accuracy = model.summary()
  assert.equal(accuracy.forecastsIssued, 2)
  assert.equal(accuracy.forecastsEvaluated, 1)
  assert.equal(accuracy.meanAbsoluteErrorPx, 60)
  assert.equal(accuracy.withinOneCellPercent, 0)
})

test("ending a visitor input excludes pending forecasts from accuracy scoring", () => {
  const model = predictor()
  model.update({ visitorId: "visitor-1", x: 100, y: 100 }, 1000)
  model.end()

  assert.equal(model.summary().forecastsWithoutOutcome, 1)
  assert.equal(model.summary().forecastsEvaluated, 0)
})

test("a different visitor cannot provide the outcome for another visitor's forecast", () => {
  const model = predictor({ horizonMs: 500 })
  model.update({ visitorId: "visitor-1", x: 100, y: 100 }, 1000)
  model.update({ visitorId: "visitor-2", x: 900, y: 500 }, 1600)

  assert.equal(model.summary().forecastsEvaluated, 0)
  assert.ok(model.summary().forecastsWithoutOutcome > 0)
})
