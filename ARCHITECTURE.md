# LIVING WORLD — V1

## Architecture Specification (current version)

---

# 1. Purpose

LIVING WORLD V1 is a browser prototype of a small forest whose creatures (butterflies and birds) react to one or more visitors. Visitors are controlled by mouse or by webcam hand tracking. Creature behavior is rule-based, extended with a short-horizon **disturbance prediction** layer that lets creatures react *before* a visitor actually frightens them.

Core principle:

> Input, interaction, behavior, prediction, movement, and rendering remain separate responsibilities.

---

# 2. Code Base

The active application is the 2D canvas demo, served from `demo2d.html` by the `npm run dev` script. The page loads `src/demo2d.js`, which owns the world state, creature behavior, prediction wiring, rendering, and animation loop. `VisitorInput` combines pointer and camera visitors; `CameraInput` provides MediaPipe hand tracking. Prediction algorithms and evaluation are separated into `src/ai/` modules.

The Three.js 3D prototype and the root `index.html` have been removed; use `demo2d.html` as the application entry point. The Three.js dependency remains listed in `package.json`, but the active 2D demo does not use it. The demo page provides the `#forest-canvas`, `#webcam-video`, and `#camera-status` elements expected by the runtime.

---

# 3. File Map

```text
src/
  demo2d.js                 2D world: creatures, environment, rendering, frame loop, prediction wiring
  demo2d.css                2D demo layout + camera preview styling
  CameraInput.js            MediaPipe hand tracking -> normalized visitors
  interaction/
    VisitorInput.js         Mouse + camera provider -> visitor list
  ai/
    PredictionEngine.js     V1 heuristic predictor (historical)
    PredictionEngineV2.js   V2 threat + fear predictor (baseline)
    PredictionEngineV3.js   V3 time-to-flee predictor (primary)
    PredictionTrend.js      Distance-trend closing-speed estimator
    VisitorHeatmap.js       Visitor position forecast (probability grid)
    PredictionEvaluator.js  Shadow evaluator: snapshots + flee episodes
    PredictionEngine.test.js, PredictionEngineV3.test.js
                              node:test suites for the prediction modules
    PredictionTrend.test.js, VisitorHeatmap.test.js,
    PredictionEvaluator.test.js
                              node:test suites for the supporting modules
```


---

# 4. High-Level Data Flow (2D demo)

```text
Mouse / Webcam hands
        |
VisitorInput (+ CameraInput provider)
        |  visitors[] {id, x, y, active, gesture, isClicked, lastMovedAt}
        v
frame() in demo2d.js
   |- Visitor heatmap forecasts (per visitor)
   |- Approach speeds / velocities
   |- Haven gesture tracking
   |- Click / pinch handling (trees, birds)
        |
        +--> ThreatProvider  (threat intensity + escape vector)
        |
        +--> Prediction layer (V3, V3Trend, V3Heatmap, V2)
        |        |-- Trend + Heatmap warnings -> predictive flee / bird escape
        |        |-- All predictors -> PredictionEvaluator (shadow metrics)
        v
Butterfly state machine  /  Bird state logic
        |
        v
Canvas 2D rendering
```

`frame()` order: input update -> heatmap forecasts -> approach speeds -> havens -> clicks -> butterflies -> environment/birds -> bird diagnostics -> evaluator resolve -> draw.

---

# 5. World

* World size: 1000 x 650 logical units, scaled to the canvas (DPR capped at 2).
* Entities: 2 butterflies, 8 flowers, 7 trees, 5 birds, ambient motes and grass.
* Grass leans away from visitors; tree canopies sway/rustle with visitor proximity and forest disturbance.

Key constants (`demo2d.js`):

```text
ALERT_DISTANCE 155     CLOSE_DISTANCE 76      TOUCH_DISTANCE 31     SAFE_DISTANCE 210
THREAT_RADIUS 260      flee threat >= 0.3  ->  flee radius ~182 px
GENTLE_APPROACH 185    RAPID_APPROACH 310 px/s
CURIOSITY_STILLNESS 2500 ms     HAVEN_STILLNESS 3500 ms
VISITOR_DISTURBANCE_DISTANCE 120
PREDICTIVE_FLEE_RECOVERY 1000 ms     PREDICTIVE_FLEE_REARM 850 ms
MIN_ENERGY 0.15
```

---

# 6. Visitor Input

## 6.1 VisitorInput
Normalizes all sources into one visitor list. Mouse is the default; the camera provider is attached once `CameraInput.init()` succeeds. Consumers never care which source a visitor came from.

Visitor fields used downstream: `id`, `x`, `y`, `active`, `gesture`, `isClicked`, `clickX/clickY`, `lastMovedAt`.

## 6.2 CameraInput (MediaPipe)
* HandLandmarker, up to **4 hands**, GPU delegate with CPU fallback, video running mode.
* Camera: 480x360 ideal at up to 60 fps for low latency.
* The mirrored index fingertip is the pointer, blending toward the thumb/index midpoint as a pinch begins.
* **Smoothing and tracking**: a One Euro filter smooths normalized coordinates; implausible jumps must persist for 3 frames before being accepted. Hand matching uses position with a handedness preference; lost hands are retained for 250 ms.
* **Pinch**: thumb/index distance is normalized by palm size, with hysteresis (start < 0.30, release > 0.50) and 45 ms confirmation. Pinch start registers a click at the thumb/index midpoint.
* **Gestures**: `open-palm` and `fist`, confirmed after 140 ms stability.
* Hand IDs are `camera:hand-N`; visitors are returned sorted by ID.

---

# 7. ThreatProvider

Shared, exported threat model used by butterflies, birds, and prediction.

* `getThreatAt(x, y, ignoreCalmVisitors)` -> 0..1, `1 - distance / THREAT_RADIUS` for the strongest visitor.
* `getThreatVectorAt(...)` -> unit vector pointing away from the nearest relevant visitor.
* Calm visitors (still > 2.5 s) can be ignored; calm visitors cannot frighten creatures until they move again.

---

# 8. Butterfly Behavior (2D)

## 8.1 States

```text
REST    calm, stationary, recovers energy
EXPLORE wanders flower to flower
ALERT   visitor close or approaching; cautious, keeps distance
CURIOUS calm visitor present; slow orbit around the visitor
FLEE    escaping a threat (fast, high response)
RETURN  returns to nearest flower after danger
HAVEN   landed on a visitor holding an open palm
```

## 8.2 Transition priorities (per frame)
1. Haven (open-palm visitor, threat < 0.3) overrides normal logic.
2. FLEE if: visitor within touch distance, threat >= 0.3, a curiosity target is disturbed by another visitor, or a **prediction-triggered flee** fires.
3. Stay in FLEE while the visitor is threatening / prediction flee active; recover when safe or the visitor is calm and fear < 0.55.
4. Rapid approach inside alert range -> FLEE.
5. Calm visitor, no nearby threat, fear < 0.58 -> CURIOUS.
6. Close/approaching visitor -> ALERT; ALERT/FLEE -> RETURN when safe; REST -> EXPLORE after rest duration (3.75 s) if energy > 0.22.

## 8.3 Internal variables
* **Fear** (0..1): +0.15/s while a moving visitor approaches or is close; decays 0.045/s (0.075/s when visitor is calm).
* **Energy** (0.15..1): FLEE -0.16/s, ALERT -0.035/s, REST +0.025/s; scales explore speed.
* Per-creature id (`butterfly-1`, `butterfly-2`) used for prediction diagnostics.

## 8.4 Movement and orientation
* Target-based movement with exponential velocity blending (faster in FLEE).
* Escape target: samples 8 directions, picks lowest-threat direction (ties broken by alignment with the away vector); prediction-triggered flees may escape even at zero current threat.
* Mild-threat (0.1–0.3) **threat orientation**: butterfly turns toward the threat first (eased turn, movement paused during turn).
* Heading follows velocity; flutter speed increases when fleeing or when a prediction cue is active.

---

# 9. Bird Behavior

Birds perch in trees (one per tree) and are peeking/hidden by visitor distance.

* **Readiness flutter**: perch threat 0.3–0.6, or forecast risk >= 0.25.
* **Predictive escape**: when forecast says a visitor will reach the perch, the bird flies to the tree farthest from the predicted visitor position (1.1 s flight); a per-visitor latch prevents repeating until re-armed (visitor far + low risk for 850 ms).
* **Curiosity**: a single shared owner at a time; a random bird investigates a calm, undisturbed visitor, orbiting it. Ends on timer, visitor movement/disturbance, or target loss, then returns to a tree.
* **Haven** (fist gesture): a bird flies to and stays near the visitor until the gesture ends.
* **Clicks**: clicking/pinching a tree rustles it and relocates its bird to a free tree. Hovering rustles trees slightly.
* **Safety**: `birdVisitorPosition()` validates visitor coordinates and falls back to the bird's last known/tree position, preventing flights to (0,0) when a visitor disappears.

---

# 10. Safe Havens (Gestures)

* Open palm -> butterfly haven; fist -> bird haven.
* Gesture must be held **still for 3.5 s**; progress is drawn as a charging ring around the visitor.
* One visitor per haven type at a time (reservation). Others receive a cue message ("The birds need a safe haven too", etc.).
* Moving, changing gesture, or a threat >= 0.3 ends the haven.

---

# 11. Prediction Layer

## 11.1 Goal
Predict, with a **1500 ms horizon**, whether a creature will enter FLEE, so it can react earlier.

## 11.2 Predictors

| Module | Idea | Role |
|---|---|---|
| `PredictionEngine.js` (V1) | Weighted proximity / approach / fear heuristic | Historical baseline |
| `PredictionEngineV2.js` | Threat term + fear term | Baseline comparison (same events) |
| `PredictionEngineV3.js` | **Time-to-flee**: `(distance - 182) / closingSpeed`; fear ignored | Primary predictor |
| V3 + `PredictionTrend.js` | V3 with `trendClosingSpeed` from distance history (450–900 ms window) | **Behavior-driving candidate** |
| `VisitorHeatmap.js` | Per-visitor motion forecast as a 50 px probability grid | **Behavior-driving candidate** |

**V3 details**: risk is 1 inside the flee radius; time risk = `1 - timeToFlee / (2 * horizon)`; closing speed = max(approach, trend, 0.25 * visitor speed); speeds above 600 px/s are treated as tracker glitches; a capped proximity term (max 0.45) fades with stillness; terms are combined with noisy-or; warning at risk >= 0.5. Calm visitors inside the threat radius produce zero risk. Constants must stay in sync with `demo2d.js`.

**Trend estimator**: closing speed from a same-visitor sample 450–900 ms old (target 600 ms); speeds above 800 px/s are discarded.

**Heatmap predictor**: velocity from recent history, forecast point = position + velocity * horizon (clamped to world), gaussian spread = 35 px + 0.08 * speed, probabilities normalized over a 20 x 13 grid. Risk = probability within the flee distance of the creature, scaled by a speed multiplier (0.12 at rest up to 1.0 at 300+ px/s); multiple visitors combine as independent risks; warning at risk >= 0.5. Forecast accuracy (MAE, within-one-cell %) is tracked per visitor.

## 11.3 How predictions affect behavior
* **Butterflies** flee early when the Trend or Heatmap warning fires (source logged as `V3Trend`, `V3Heatmap`, or both), threat is still < 0.3, and that visitor has not already triggered a predictive flee. After the flee, a re-arm period (visitor distant, risk < 0.25, closing speed <= 0) allows the next one.
* **Birds** use the heatmap forecast for readiness and predictive tree escape (Section 9).
* **V3 (primary) and V2** remain shadow-only: evaluated on the same events, never used for control.
* Visual cues: orange ring + "PREDICTED" (butterfly) / "FORECAST" (bird); optional heatmap overlay.

## 11.4 Ordering rule
Prediction is observed **before** the FLEE state change within a frame, so the evaluator sees the true pre-flee inputs. Snapshot recording happens after the behavior decision; frames that cause FLEE are skipped as snapshots to avoid labelling an already-occurring flee as a prospective success.

---

# 12. PredictionEvaluator (Shadow Evaluation)

One evaluator per predictor (V3, V2, V3Trend, V3Heatmap). It never controls behavior.

* **Snapshots**: sampled every 1500 ms; each prediction is resolved after the horizon as TP/FP/FN/TN -> precision, recall, false-positive rate.
* **Flee episodes**: each FLEE entry/exit is recorded with entry inputs, a downsampled 6 s trace, warning lead time, and whether the flee was prediction-triggered.
* **Advance warning**: a warning counts only if it began >= 50 ms before the flee and persisted (500 ms off-grace); the warning clock resets per flee and ignores time spent in FLEE.
* **Event groups**: `NO_ACTIVE_VISITOR`, `UNANTICIPATED_CALM_TO_MOVEMENT` (calm curiosity followed by sudden movement), `CONTINUING_ENCOUNTER` (same visitor re-fleeing within 2 s), `NEW_DISTURBANCE_CANDIDATE`.
* **Diagnostics (non-excluding)**: rapid boundary re-flee, high visitor speed, visitor absence, changed visitor ID, high-fear/zero-threat false positives, stillness/curiosity evidence.
* **Metrics**: raw, evaluable (excludes verified calm-to-movement and no-visitor episodes), and boundary-adjusted recall and median lead time; new-disturbance-candidate recall.

---

# 13. Diagnostics and Console Tools

Logs:
* `[PredictionDiag]` — per-creature, at most 1/s: inputs, risks, warnings.
* `[Butterfly] State: A -> B (source prediction)` — state changes.
* `[BirdDiag]`, `[BirdCuriosityDiag]`, `[BirdPrediction]` — bird state, curiosity sessions, forecast escapes.

Console functions:
* `comparePredictors()` — side-by-side V3 / V3Trend / V3Heatmap / V2 metrics.
* `predictionReport()` — summaries and flee-episode table.
* `downloadPredictions()` — JSON export of all records, episodes, heatmaps, accuracy.
* `visitorHeatmapReport()` — current forecasts and accuracy per visitor.
* `toggleVisitorHeatmap()` — show/hide forecast overlay.

---

---

# 14. Design Rules

1. Rendering never decides behavior.
2. Input sources are interchangeable; creatures see only normalized visitors.
3. Shared threat logic lives in `ThreatProvider`.
4. Predictors are pure functions/classes with no knowledge of creatures; `demo2d.js` wires them in.
5. New predictors are added in **shadow mode first**, evaluated against the same events, and only promoted to behavior after evaluation.
6. Constants shared between `demo2d.js` and predictors must be kept in sync.
7. Runtime errors inside the frame loop are treated as serious; invalid or missing visitor data must degrade safely.

---

# 15. Testing

* Unit tests (`node:test`): PredictionEngine (V1), V3, PredictionTrend, VisitorHeatmap, PredictionEvaluator.
* Manual scenarios: still visitor (calm/curious), steady approach, fast approach, approach-and-retreat, multiple hands, haven gestures, tree clicks, visitor disappearing during bird investigation.
* Evaluation: use `comparePredictors()` / `predictionReport()` after controlled runs; check false positives, recall, and lead time before promoting any predictor.
* Regression baseline: existing bird and butterfly behaviors validated before predictive changes.

---

# 16. Current Status

```text
Visitor input (mouse + multi-hand camera)  COMPLETE / REFINING
ThreatProvider                              COMPLETE
Butterfly state machine (+fear, energy)     COMPLETE
Curiosity and safe havens                   COMPLETE
Bird system                                 COMPLETE / REFINING
V3 predictor, trend, heatmap                IN EVALUATION (trend + heatmap drive behavior)
PredictionEvaluator                         COMPLETE / EXTENDING
Audio                                       NOT IMPLEMENTED
ML behavior model                           FUTURE
AI Director                                 FUTURE
```

## Known open items
* Validate predictive flee against false positives across more controlled scenarios.
* Tune heatmap/trend thresholds using exported records.
* Complete bird return-flight validation after visitor disappearance.
* Audio, persistent world state, and ML/AI-director layers remain future work.

---

# 17. Future Direction

* ML behavior model trained by imitation of the rule-based policy, using compact features (distance, speeds, fear, energy, state, time since disturbance); predictors' outputs are natural additional features.
* An AI director operating at a coarse timescale on compact world summaries; it must never control per-frame movement.
* Frame-by-frame LLM control remains explicitly rejected (latency, cost, instability).
