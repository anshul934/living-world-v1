// Shadow-mode evaluator. It deliberately does not control creature behaviour.
// Views:
//  1) snapshots: sampled predictions checked against FLEE inside the horizon
//  2) episodes: whether a warning preceded a FLEE transition, and its lead time
//  3) auditable exclusions for known behaviour cycles / missing visitor inputs

const CALM_CURIOSITY_STILLNESS_MS = 2500
const EXPECTED_MOVEMENT_WINDOW_MS = 1500
const PREDICTION_HORIZON_MS = 1500
const WARNING_OFF_GRACE_MS = 500
const TRACE_WINDOW_MS = 6000
const TRACE_SAMPLE_EVERY = 6
const RAPID_REFLEE_WINDOW_MS = 2000
const BOUNDARY_DISTANCE_MIN = 160
const BOUNDARY_DISTANCE_MAX = 220
// Separates repeated flee transitions in the same nearby encounter from new candidates.
const CONTINUING_ENCOUNTER_GAP_MS = 2000
const CONTINUING_ENCOUNTER_MAX_DISTANCE = 260
// Input-quality diagnostics only: these never automatically exclude an episode.
const HIGH_VISITOR_SPEED_DIAGNOSTIC_PX_S = 1000
// A prediction that only appears in the flee-triggering frame is too late to count as advance warning.
const MIN_ADVANCE_LEAD_MS = 50

export class PredictionEvaluator {
  constructor({ minIntervalMs = 1500 } = {}) {
    this.minIntervalMs = minIntervalMs
    this.pending = []
    this.lastRecordAt = new Map()
    this.lastThreat = new Map()
    this.lastWarnAt = new Map()
    this.warnSince = new Map()
    this.lastObserved = new Map()
    this.lastCalmCuriosity = new Map()
    this.lastFleeStart = new Map()
    this.lastFleeEnd = new Map()
    this.lastFleeVisitorId = new Map()
    this.trace = new Map()
    this.activeFlee = new Map()
    this.fleeEpisodes = []
    this.counts = { TP: 0, FP: 0, FN: 0, TN: 0 }
    this.records = []
  }

  clearWarningClock(creatureId) {
    this.warnSince.delete(creatureId)
    this.lastWarnAt.delete(creatureId)
  }

  // Call EVERY frame per creature, before record().
  observe(creatureId, prediction, inputs, now) {
    const observed = { inputs: { ...inputs }, state: inputs.state ?? null, t: now }
    this.lastObserved.set(creatureId, observed)

    const buf = this.trace.get(creatureId) ?? []
    buf.push({
      t: now,
      d: inputs.distance,
      a: inputs.approachSpeed,
      trendClosingSpeed: inputs.trendClosingSpeed ?? 0,
      th: inputs.threat,
      calm: inputs.calmDurationMs ?? 0,
      visitorSpeed: inputs.visitorSpeed ?? 0,
      heatmapRiskScore: inputs.heatmapRiskScore ?? null,
      heatmapVisitorSpeed: inputs.heatmapVisitorSpeed ?? null,
      heatmapSpeedMultiplier: inputs.heatmapSpeedMultiplier ?? null,
      predictedVisitorX: inputs.predictedVisitorX ?? null,
      predictedVisitorY: inputs.predictedVisitorY ?? null,
      heatmapVisitorId: inputs.heatmapVisitorId ?? null,
      visitorId: inputs.visitorId ?? null,
      curiosityVisitorId: inputs.curiosityVisitorId ?? null,
      state: inputs.state ?? null,
      predicted: Boolean(prediction.predictedDisturbance),
      riskScore: Number.isFinite(prediction.riskScore) ? prediction.riskScore : null
    })
    while (buf.length && now - buf[0].t > TRACE_WINDOW_MS) buf.shift()
    this.trace.set(creatureId, buf)

    const previousCalmCuriosity = this.lastCalmCuriosity.get(creatureId)
    if (previousCalmCuriosity && now - previousCalmCuriosity.t > EXPECTED_MOVEMENT_WINDOW_MS) {
      this.lastCalmCuriosity.delete(creatureId)
    }

    // Remember actual visitor-directed curiosity during a long calm interval.
    // The marker is refreshed each frame, so it survives the first movement
    // frame even if changeState() enters FLEE before observe() runs again.
    const sameVisitorIsCuriosityTarget =
      inputs.visitorId !== undefined &&
      inputs.visitorId !== null &&
      inputs.curiosityVisitorId === inputs.visitorId
    if (
      inputs.state === "CURIOUS" &&
      Number.isFinite(inputs.calmDurationMs) &&
      inputs.calmDurationMs >= CALM_CURIOSITY_STILLNESS_MS &&
      inputs.visitorId !== undefined && inputs.visitorId !== null
    ) {
      this.lastCalmCuriosity.set(creatureId, {
        t: now,
        visitorId: inputs.visitorId,
        calmDurationMs: inputs.calmDurationMs,
        state: inputs.state
      })
    } else if (
      sameVisitorIsCuriosityTarget &&
      Number.isFinite(inputs.calmDurationMs) &&
      inputs.calmDurationMs >= CALM_CURIOSITY_STILLNESS_MS
    ) {
      // Supports frames around the CURIOUS transition, when the direct target
      // is already set but the state label has just changed.
      this.lastCalmCuriosity.set(creatureId, {
        t: now,
        visitorId: inputs.visitorId,
        calmDurationMs: inputs.calmDurationMs,
        state: inputs.state ?? null
      })
    }

    // Warning lead is measured only outside FLEE. A warning that continues
    // during a flee/return cycle must not count as advance notice for the next
    // flee. Some behavior branches skip observation while threat is high; the
    // explicit reset in noteFlee() handles that path as well.
    if (inputs.state === "FLEE") {
      this.clearWarningClock(creatureId)
    } else if (prediction.predictedDisturbance) {
      if (!this.warnSince.has(creatureId)) this.warnSince.set(creatureId, now)
      this.lastWarnAt.set(creatureId, now)
    } else {
      const lastWarn = this.lastWarnAt.get(creatureId)
      if (lastWarn === undefined || now - lastWarn > WARNING_OFF_GRACE_MS) {
        this.clearWarningClock(creatureId)
      }
    }
  }

  record(creatureId, state, inputs, prediction, now) {
    const last = this.lastRecordAt.get(creatureId) ?? -Infinity
    if (now - last < this.minIntervalMs) return
    // Already fleeing, or no finite visitor distance: try again next frame.
    if (state === "FLEE" || !Number.isFinite(inputs.distance)) return
    this.lastRecordAt.set(creatureId, now)

    const threat = Number.isFinite(inputs.threat) ? inputs.threat : 0
    const prev = this.lastThreat.get(creatureId)
    const elapsedSeconds = prev ? (now - prev.t) / 1000 : 0
    const trend = prev && elapsedSeconds > 0 ? (threat - prev.v) / elapsedSeconds : 0
    this.lastThreat.set(creatureId, { v: threat, t: now })

    this.pending.push({
      creatureId,
      state,
      now,
      inputs: { ...inputs, threatTrend: Number.isFinite(trend) ? Number(trend.toFixed(3)) : 0 },
      riskScore: prediction.riskScore,
      predicted: prediction.predictedDisturbance,
      horizonMs: prediction.horizonMs,
      fled: false
    })
  }

  // Call from changeState() when a creature ENTERS "FLEE".
  noteFlee(
    creatureId,
    now,
    { predictionTriggered = false, predictionSource = null } = {}
  ) {
    for (const sample of this.pending) {
      if (sample.creatureId === creatureId && now - sample.now <= sample.horizonMs + 150) {
        sample.fled = true
      }
    }

    const lastWarn = this.lastWarnAt.get(creatureId)
    const since = this.warnSince.get(creatureId)
    // A recent warning is the latest uninterrupted warning streak, allowing a
    // 500 ms off-grace for frame jitter. No stale warning from FLEE counts.
    const warningRecent = lastWarn !== undefined && now - lastWarn <= WARNING_OFF_GRACE_MS
    const measuredLeadMs = warningRecent && since !== undefined
      ? Math.max(0, Math.round(now - since))
      : null
    // Only count a warning as advance notice if it preceded the flee by a useful
    // interval. Keep the unfiltered measurement for diagnosis, but do not let a
    // same-frame threshold crossing inflate warned-episode recall.
    const warned = measuredLeadMs !== null && measuredLeadMs >= MIN_ADVANCE_LEAD_MS
    const leadMs = warned ? measuredLeadMs : null

    const obs = this.lastObserved.get(creatureId)
    const entryInputs = obs?.inputs ?? null
    const calmCuriosity = this.lastCalmCuriosity.get(creatureId)
    const markerRecent = Boolean(
      calmCuriosity && now - calmCuriosity.t >= 0 &&
      now - calmCuriosity.t <= EXPECTED_MOVEMENT_WINDOW_MS
    )
    // Don't require the entry state to still be CURIOUS: movement can cause
    // the state transition before this hook is reached. Require the same visitor.
    const expectedCalmToMovement = Boolean(
      markerRecent && entryInputs?.visitorId === calmCuriosity.visitorId
    )
    if (calmCuriosity) this.lastCalmCuriosity.delete(creatureId)

    const r = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null
    const rawTrace = this.trace.get(creatureId) ?? []
    const trace = rawTrace
      .filter((_, index) => index % TRACE_SAMPLE_EVERY === 0)
      .map((p) => [
        Math.round(p.t - now),
        r(p.d) === null ? null : Math.round(p.d),
        r(p.a) === null ? null : Math.round(p.a),
        Number((p.th ?? 0).toFixed(2)),
        Math.round(p.calm ?? 0),
        Math.round(p.visitorSpeed ?? 0),
        p.state ?? null,
        p.visitorId ?? null,
        Boolean(p.predicted),
        p.riskScore,
        p.curiosityVisitorId ?? null,
        r(p.trendClosingSpeed) === null ? 0 : Math.round(p.trendClosingSpeed),
        r(p.heatmapRiskScore),
        r(p.heatmapVisitorSpeed),
        r(p.heatmapSpeedMultiplier),
        r(p.predictedVisitorX),
        r(p.predictedVisitorY),
        p.heatmapVisitorId ?? null
      ])

    const entryDistance = r(entryInputs?.distance)
    const entryVisitorId = entryInputs?.visitorId ?? null
    const noActiveVisitorAtEntry = !entryInputs || entryVisitorId === null || entryDistance === null
    // These are diagnostic evidence fields, not automatic exclusions. They show
    // whether the test actually reached the stillness/curiosity conditions.
    const evidenceVisitorId = entryVisitorId ?? calmCuriosity?.visitorId ??
      [...rawTrace].reverse().find((point) => point.visitorId !== null)?.visitorId ?? null
    const visitorTrace = evidenceVisitorId === null
      ? []
      : rawTrace.filter((point) => point.visitorId === evidenceVisitorId)
    const maxCalmDurationMsBeforeFlee = Math.round(visitorTrace.reduce(
      (maximum, point) => Math.max(maximum, Number.isFinite(point.calm) ? point.calm : 0), 0
    ))
    const visitorStillnessThresholdReachedInTrace = visitorTrace.some(
      (point) => Number.isFinite(point.calm) && point.calm >= CALM_CURIOSITY_STILLNESS_MS
    )
    const curiosityObservedInTrace = visitorTrace.some((point) => point.state === "CURIOUS")
    const curiosityTargetMatchedInTrace = evidenceVisitorId !== null && visitorTrace.some(
      (point) => point.curiosityVisitorId === evidenceVisitorId
    )
    const previousStart = this.lastFleeStart.get(creatureId)
    const intervalSincePreviousFleeMs = previousStart === undefined ? null : Math.round(now - previousStart)
    const rapidBoundaryReflee = Boolean(
      intervalSincePreviousFleeMs !== null &&
      intervalSincePreviousFleeMs >= 0 &&
      intervalSincePreviousFleeMs < RAPID_REFLEE_WINDOW_MS &&
      entryDistance !== null &&
      entryDistance >= BOUNDARY_DISTANCE_MIN && entryDistance <= BOUNDARY_DISTANCE_MAX
    )
    this.lastFleeStart.set(creatureId, now)

    // Start-to-start timing misses long flee episodes that end just before the
    // next flee starts. Also require the same visitor ID and a nearby visitor.
    const previousFleeEnd = this.lastFleeEnd.get(creatureId)
    const intervalSincePreviousFleeEndMs = previousFleeEnd === undefined
      ? null
      : Math.round(now - previousFleeEnd)
    const previousFleeVisitorId = this.lastFleeVisitorId.get(creatureId) ?? null
    const sameVisitorAsPreviousFlee = Boolean(
      entryVisitorId !== null && previousFleeVisitorId !== null &&
      entryVisitorId === previousFleeVisitorId
    )
    const continuingEncounterReflee = Boolean(
      sameVisitorAsPreviousFlee &&
      intervalSincePreviousFleeEndMs !== null &&
      intervalSincePreviousFleeEndMs >= 0 &&
      intervalSincePreviousFleeEndMs <= CONTINUING_ENCOUNTER_GAP_MS &&
      entryDistance !== null && entryDistance <= CONTINUING_ENCOUNTER_MAX_DISTANCE
    )

    // Detect possible tracker interruptions/coordinate jumps near the event.
    // High speed may be genuine motion, and missing samples do not prove the
    // visitor left the physical scene, so this is diagnostic only.
    const recentTrace = rawTrace.filter((point) => {
      const age = now - point.t
      return age >= 0 && age <= PREDICTION_HORIZON_MS
    })
    const recentVisitorSamples = recentTrace.filter((point) =>
      entryVisitorId !== null && point.visitorId === entryVisitorId
    )
    const maxVisitorSpeedBeforeFlee = recentVisitorSamples.reduce(
      (maximum, point) => Math.max(maximum, Number.isFinite(point.visitorSpeed) ? point.visitorSpeed : 0),
      0
    )
    const highVisitorSpeedSamplesNearFlee = recentVisitorSamples.filter(
      (point) => Number.isFinite(point.visitorSpeed) &&
        point.visitorSpeed >= HIGH_VISITOR_SPEED_DIAGNOSTIC_PX_S
    ).length
    const visitorAbsenceSamplesNearFlee = recentTrace.filter(
      (point) => point.visitorId === null || point.visitorId === undefined
    ).length
    const differentVisitorIdSamplesNearFlee = recentTrace.filter(
      (point) => point.visitorId !== null && point.visitorId !== undefined &&
        entryVisitorId !== null && point.visitorId !== entryVisitorId
    ).length
    const inputContinuityConcern = highVisitorSpeedSamplesNearFlee > 0 ||
      visitorAbsenceSamplesNearFlee > 0 || differentVisitorIdSamplesNearFlee > 0

    // NEW_DISTURBANCE_CANDIDATE is provisional: inspect its inputs/trace before
    // concluding that an observable signal was actually sufficient to forecast it.
    const eventGroup = noActiveVisitorAtEntry
      ? "NO_ACTIVE_VISITOR"
      : expectedCalmToMovement
        ? "UNANTICIPATED_CALM_TO_MOVEMENT"
        : continuingEncounterReflee
          ? "CONTINUING_ENCOUNTER"
          : "NEW_DISTURBANCE_CANDIDATE"

    this.activeFlee.set(creatureId, {
      start: now,
      predictionTriggered,
      predictionSource,
      leadMs,
      measuredLeadMs,
      warned,
      expectedCalmToMovement,
      expectedVisitorId: expectedCalmToMovement ? calmCuriosity.visitorId : null,
      expectedCalmStillnessMs: expectedCalmToMovement ? Math.round(calmCuriosity.calmDurationMs) : null,
      noActiveVisitorAtEntry,
      rapidBoundaryReflee,
      intervalSincePreviousFleeMs,
      intervalSincePreviousFleeEndMs,
      sameVisitorAsPreviousFlee,
      continuingEncounterReflee,
      eventGroup,
      inputContinuityConcern,
      maxVisitorSpeedBeforeFlee: Math.round(maxVisitorSpeedBeforeFlee),
      highVisitorSpeedSamplesNearFlee,
      visitorAbsenceSamplesNearFlee,
      differentVisitorIdSamplesNearFlee,
      maxCalmDurationMsBeforeFlee,
      visitorStillnessThresholdReachedInTrace,
      curiosityObservedInTrace,
      curiosityTargetMatchedInTrace,
      trace,
      entry: obs ? {
        state: obs.state,
        visitorId: entryVisitorId,
        distance: entryDistance,
        approachSpeed: r(entryInputs.approachSpeed),
        visitorSpeed: r(entryInputs.visitorSpeed),
        heatmapVisitorSpeed: r(entryInputs.heatmapVisitorSpeed),
        heatmapSpeedMultiplier: r(entryInputs.heatmapSpeedMultiplier),
        heatmapRiskScore: r(entryInputs.heatmapRiskScore),
        curiosityVisitorId: entryInputs.curiosityVisitorId ?? null,
        calmDurationMs: r(entryInputs.calmDurationMs),
        fear: r(entryInputs.fear),
        threat: r(entryInputs.threat)
      } : null
    })

    // The next flee gets its own warning clock. Do not let the warning that
    // persisted through the current FLEE state leak into the next episode.
    this.clearWarningClock(creatureId)
  }

  // Call from changeState() when a creature LEAVES "FLEE".
  noteFleeEnd(creatureId, now) {
    const ep = this.activeFlee.get(creatureId)
    if (!ep) return
    this.activeFlee.delete(creatureId)
    this.clearWarningClock(creatureId)
    this.fleeEpisodes.push({
      creatureId,
      startMs: Math.round(ep.start),
      durationMs: Math.round(now - ep.start),
      predictionTriggered: ep.predictionTriggered,
      predictionSource: ep.predictionSource,
      warned: ep.warned,
      leadMs: ep.leadMs,
      measuredLeadMs: ep.measuredLeadMs,
      expectedCalmToMovement: ep.expectedCalmToMovement,
      expectedVisitorId: ep.expectedVisitorId,
      expectedCalmStillnessMs: ep.expectedCalmStillnessMs,
      noActiveVisitorAtEntry: ep.noActiveVisitorAtEntry,
      rapidBoundaryReflee: ep.rapidBoundaryReflee,
      intervalSincePreviousFleeMs: ep.intervalSincePreviousFleeMs,
      intervalSincePreviousFleeEndMs: ep.intervalSincePreviousFleeEndMs,
      sameVisitorAsPreviousFlee: ep.sameVisitorAsPreviousFlee,
      continuingEncounterReflee: ep.continuingEncounterReflee,
      eventGroup: ep.eventGroup,
      inputContinuityConcern: ep.inputContinuityConcern,
      maxVisitorSpeedBeforeFlee: ep.maxVisitorSpeedBeforeFlee,
      highVisitorSpeedSamplesNearFlee: ep.highVisitorSpeedSamplesNearFlee,
      visitorAbsenceSamplesNearFlee: ep.visitorAbsenceSamplesNearFlee,
      differentVisitorIdSamplesNearFlee: ep.differentVisitorIdSamplesNearFlee,
      maxCalmDurationMsBeforeFlee: ep.maxCalmDurationMsBeforeFlee,
      visitorStillnessThresholdReachedInTrace: ep.visitorStillnessThresholdReachedInTrace,
      curiosityObservedInTrace: ep.curiosityObservedInTrace,
      curiosityTargetMatchedInTrace: ep.curiosityTargetMatchedInTrace,
      entry: ep.entry,
      trace: ep.trace
    })
    this.lastFleeEnd.set(creatureId, now)
    this.lastFleeVisitorId.set(creatureId, ep.entry?.visitorId ?? null)
  }

  // Call once per frame.
  resolve(now) {
    this.pending = this.pending.filter((sample) => {
      if (now - sample.now < sample.horizonMs) return true
      const outcome = sample.predicted
        ? (sample.fled ? "TP" : "FP")
        : (sample.fled ? "FN" : "TN")
      this.counts[outcome]++
      this.records.push({ ...sample, outcome })
      return false
    })
  }

  summary() {
    const { TP, FP, FN, TN } = this.counts
    const div = (a, b) => b ? +(a / b).toFixed(3) : null
    const median = (values) => {
      const sorted = [...values].sort((a, b) => a - b)
      if (!sorted.length) return null
      const middle = Math.floor(sorted.length / 2)
      return sorted.length % 2
        ? sorted[middle]
        : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    }

    const episodes = this.fleeEpisodes
    const warnedEpisodes = episodes.filter((episode) => episode.warned)
    const rawLeads = warnedEpisodes.map((episode) => episode.leadMs).filter(Number.isFinite)
    const measuredLeads = episodes.map((episode) => episode.measuredLeadMs).filter(Number.isFinite)
    const expectedEpisodes = episodes.filter((episode) => episode.expectedCalmToMovement)
    const predictionTriggeredEpisodes = episodes.filter((episode) => episode.predictionTriggered)
    const noVisitorEpisodes = episodes.filter((episode) => episode.noActiveVisitorAtEntry)
    const rapidBoundaryRefleeEpisodes = episodes.filter((episode) => episode.rapidBoundaryReflee)
    const stillnessThresholdEpisodes = episodes.filter((episode) => episode.visitorStillnessThresholdReachedInTrace)
    const curiosityObservedEpisodes = episodes.filter((episode) => episode.curiosityObservedInTrace)
    const curiosityTargetMatchedEpisodes = episodes.filter((episode) => episode.curiosityTargetMatchedInTrace)
    const newDisturbanceCandidates = episodes.filter((episode) => episode.eventGroup === "NEW_DISTURBANCE_CANDIDATE")
    const newDisturbanceCandidatesWarned = newDisturbanceCandidates.filter((episode) => episode.warned)
    const continuingEncounterEpisodes = episodes.filter((episode) => episode.eventGroup === "CONTINUING_ENCOUNTER")
    const continuingEncounterWarned = continuingEncounterEpisodes.filter((episode) => episode.warned)
    const inputContinuityConcernEpisodes = episodes.filter((episode) => episode.inputContinuityConcern)
    const highVisitorSpeedEpisodes = episodes.filter((episode) => episode.highVisitorSpeedSamplesNearFlee > 0)
    const visitorAbsenceEpisodes = episodes.filter((episode) => episode.visitorAbsenceSamplesNearFlee > 0)
    const differentVisitorIdEpisodes = episodes.filter((episode) => episode.differentVisitorIdSamplesNearFlee > 0)
    const highVisitorSpeedSnapshotRecords = this.records.filter((record) =>
      Number.isFinite(record.inputs?.visitorSpeed) &&
      record.inputs.visitorSpeed >= HIGH_VISITOR_SPEED_DIAGNOSTIC_PX_S
    )
    const zeroThreatHighFearFalsePositives = this.records.filter((record) =>
      record.outcome === "FP" &&
      Number.isFinite(record.inputs?.fear) && record.inputs.fear >= 0.7 &&
      Number.isFinite(record.inputs?.threat) && record.inputs.threat === 0
    )
    const maxRecordedVisitorSpeed = this.records.reduce((maximum, record) =>
      Math.max(maximum, Number.isFinite(record.inputs?.visitorSpeed) ? record.inputs.visitorSpeed : 0), 0)
    // Main evaluable set excludes only a verified intentional calm-to-movement
    // response or a flee with no observable visitor input. Keep rapid boundary
    // reflees visible in raw/evaluable counts and provide a second conservative
    // metric which excludes the heuristic re-flee flags as well.
    const evaluableEpisodes = episodes.filter((episode) =>
      !episode.expectedCalmToMovement && !episode.noActiveVisitorAtEntry
    )
    const evaluableWarned = evaluableEpisodes.filter((episode) => episode.warned)
    const evaluableLeads = evaluableWarned.map((episode) => episode.leadMs).filter(Number.isFinite)
    const boundaryAdjustedEpisodes = evaluableEpisodes.filter((episode) => !episode.rapidBoundaryReflee)
    const boundaryAdjustedWarned = boundaryAdjustedEpisodes.filter((episode) => episode.warned)
    const boundaryAdjustedLeads = boundaryAdjustedWarned.map((episode) => episode.leadMs).filter(Number.isFinite)

    return {
      ...this.counts,
      precision: div(TP, TP + FP),
      recall: div(TP, TP + FN),
      falsePositiveRate: div(FP, FP + TN),
      samples: TP + FP + FN + TN,
      fleeEpisodes: episodes.length,
      fleeEpisodesWarned: warnedEpisodes.length,
      rawEpisodeRecall: div(warnedEpisodes.length, episodes.length),
      medianLeadMs: median(rawLeads),
      // Includes late warnings (< MIN_ADVANCE_LEAD_MS) for diagnosis; medianLeadMs does not.
      medianMeasuredLeadMs: median(measuredLeads),
      minAdvanceLeadMs: MIN_ADVANCE_LEAD_MS,
      expectedCalmMovementEpisodes: expectedEpisodes.length,
      predictionTriggeredFleeEpisodes: predictionTriggeredEpisodes.length,
      noVisitorFleeEpisodes: noVisitorEpisodes.length,
      rapidBoundaryRefleeEpisodes: rapidBoundaryRefleeEpisodes.length,
      // Additional cohorts preserve the raw metrics while separating fresh candidates
      // from repeated transitions during the same nearby encounter.
      newDisturbanceCandidateEpisodes: newDisturbanceCandidates.length,
      newDisturbanceCandidateEpisodesWarned: newDisturbanceCandidatesWarned.length,
      newDisturbanceCandidateEpisodeRecall: div(newDisturbanceCandidatesWarned.length, newDisturbanceCandidates.length),
      newDisturbanceCandidateMedianLeadMs: median(newDisturbanceCandidatesWarned.map((episode) => episode.leadMs).filter(Number.isFinite)),
      continuingEncounterEpisodes: continuingEncounterEpisodes.length,
      continuingEncounterEpisodesWarned: continuingEncounterWarned.length,
      continuingEncounterWarningRate: div(continuingEncounterWarned.length, continuingEncounterEpisodes.length),
      episodesWithInputContinuityConcern: inputContinuityConcernEpisodes.length,
      episodesWithHighVisitorSpeedNearFlee: highVisitorSpeedEpisodes.length,
      episodesWithVisitorAbsenceNearFlee: visitorAbsenceEpisodes.length,
      episodesWithDifferentVisitorIdsNearFlee: differentVisitorIdEpisodes.length,
      snapshotRecordsWithHighVisitorSpeed: highVisitorSpeedSnapshotRecords.length,
      maxRecordedVisitorSpeed: Math.round(maxRecordedVisitorSpeed),
      falsePositiveRecordsWithHighFearAndZeroThreat: zeroThreatHighFearFalsePositives.length,
      // Expose the actual evidence so a zero expected-event count is explainable.
      episodesWithStillnessThresholdReached: stillnessThresholdEpisodes.length,
      episodesWithCuriosityObserved: curiosityObservedEpisodes.length,
      episodesWithCuriosityTargetMatched: curiosityTargetMatchedEpisodes.length,
      evaluableFleeEpisodes: evaluableEpisodes.length,
      evaluableFleeEpisodesWarned: evaluableWarned.length,
      evaluableEpisodeRecall: div(evaluableWarned.length, evaluableEpisodes.length),
      evaluableMedianLeadMs: median(evaluableLeads),
      boundaryAdjustedFleeEpisodes: boundaryAdjustedEpisodes.length,
      boundaryAdjustedFleeEpisodesWarned: boundaryAdjustedWarned.length,
      boundaryAdjustedEpisodeRecall: div(boundaryAdjustedWarned.length, boundaryAdjustedEpisodes.length),
      boundaryAdjustedMedianLeadMs: median(boundaryAdjustedLeads)
    }
  }
}
