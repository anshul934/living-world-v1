# LIVING WORLD — V1

## Changelog

All significant features, fixes, and refactors, in order. Each entry is an update.

---

## Update 1 — Project Foundation
* Created the Vite project and installed Three.js.
* Built the initial scene: perspective camera, WebGL renderer, ambient light, directional sunlight, visible sun, ground plane, procedural trees, grass patches, fullscreen CSS.
* Result: a basic 3D forest rendering locally in Chrome.

## Update 2 — Butterfly and Visitor Input
* Added `Butterfly.js` (mesh, position, velocity, continuous movement, world-boundary clamping).
* Added `VisitorInput.js` (mouse tracking, raycasting against a ground plane) and `InteractionEngine.js` (distance, danger detection, escape direction).
* Separated input from behavior: `Mouse -> VisitorInput -> InteractionEngine -> Butterfly`.

## Update 3 — Mouse-to-World Fixes
* **Coordinate bug:** the approximate screen-to-world conversion was inaccurate. Replaced with proper raycasting (NDC -> camera ray -> ground intersection).
* **False visitor detection:** the butterfly reacted to the default visitor position. Added a `hasInput` guard so interaction is ignored until real mouse input arrives.
* **Viewport mismatch:** mouse normalization used the window size. It now uses `renderer.domElement.getBoundingClientRect()`, so it stays correct if the canvas is resized or embedded.

## Update 4 — Behavior Engine
* Added `BehaviorEngine.js` with the state machine REST, EXPLORE, ALERT, FLEE, RETURN.
* **Fixed runtime error:** a missing `handleStateChange()` stopped the butterfly. Replaced with an explicit `changeState()`.
* **Vector consistency:** behavior now returns `THREE.Vector3` velocity, matching `Butterfly.js`.
* **REST timer:** added a rest duration so the butterfly does not rest forever.
* **Exploration fix:** replaced the fixed explore direction (which pinned the butterfly to a corner) with random targets inside the world, re-picked on arrival or timeout.

## Update 5 — Documentation System
* Created `CHANGELOG.md`, `ARCHITECTURE.md`, and `DEVELOPMENT_LOG.md`, each with a separate role (changes, architecture/contracts, detailed reasoning).

## Update 6 — Richer Behavior Model
* Added fear and energy (0–1) with per-second rates, touch/maintain distances, and gentle vs. rapid approach-speed responses.
* RETURN now navigates to the nearest flower; exploration targets real flower positions.
* Added escape targets for FLEE, fear/energy-scaled explore speed, and throttled status logging.
* Added 8 target flowers to the 3D scene and a `THREE.Timer` for frame time.

## Update 7 — 2D Demo (`demo2d.js`)
* Built a 2D canvas version of the forest (1000x650 world) as the main demo: two butterflies, flowers, trees, birds, grass, and ambient effects, with DPR-aware scaling and a polished UI (`demo2d.css`).
* Added the shared `ThreatProvider` (threat intensity and away-vector) used by all creatures.
* Added CURIOUS (orbiting a calm visitor), threat orientation (butterfly turns toward a mild threat), safer-direction escape sampling, and smooth heading/flutter.
* Added birds: peeking perched birds, readiness flutter, shared-owner curiosity flights, and tree clicks/hover that rustle trees and relocate birds.
* The 3D version is kept as the early baseline.

## Update 8 — Camera Input (MediaPipe)
* Added `CameraInput.js` with MediaPipe HandLandmarker: up to 4 hands, index finger as pointer, pinch-to-click with hysteresis, multi-visitor support, and a camera preview panel.
* Added gestures: open palm and fist.
* Added **safe havens**: holding a gesture still for 3.5 s makes butterflies (open palm) or birds (fist) gather at the visitor. Reservation logic allows one visitor per haven type, with cue messages for others. Havens end on movement, gesture change, or threat.
* Visitors now carry stable IDs, enabling per-visitor behavior.

## Update 9 — Behavior Validation Baseline
* Validated six creature behaviors: birds investigating a motionless visitor, tree-click relocation, butterfly threat orientation, and safer-direction escape.
* This version became the regression baseline before adding prediction.

## Update 10 — Camera Tracking Stability
* Reduced the camera resolution to 480x360 at up to 60 fps to cut processing latency.
* Replaced fixed-rate smoothing with **velocity-adaptive smoothing** (heavy when still, minimal when fast), with a small dead zone.
* Raised the hand-matching distance to 0.55 so fast motion does not reassign hand IDs; added a 140 ms tracking grace period and 140 ms gesture confirmation.
* Result: better responsiveness and fewer tracking dropouts.

## Update 11 — Prediction Baseline (V1)
* Added `PredictionEngine.js`, a transparent heuristic using distance, approach speed, and fear.
* Added prediction diagnostics (risk score, predicted disturbance, visitor info, horizon) and kept it in shadow mode.
* Fixed butterfly diagnostics reporting `creatureId: undefined` by giving each butterfly a stable id.

## Update 12 — Bird Visitor-Tracking Fix
* `birdVisitorPosition()` now validates the visitor and its coordinates; a missing visitor falls back to the bird's last known position, then its tree.
* Fixed a TypeError and a bird flying to the top-left corner when a visitor disappeared mid-investigation.
* Bird last-known positions are now recorded every frame.

## Update 13 — Prediction Evaluation Framework
* Added `PredictionEvaluator.js`: snapshots scored as TP/FP/FN/TN, plus per-flee episodes with entry inputs, a 6 s trace, and warning lead time.
* Added a strict advance-warning rule (>= 50 ms lead, 500 ms off-grace, clock reset for each flee and ignoring time inside FLEE).
* Added event grouping: no active visitor, calm-to-movement, continuing encounter, new disturbance candidate.
* Added non-excluding input diagnostics: rapid boundary re-flee, high visitor speed, visitor absence, changed visitor ID, high-fear zero-threat false positives.
* Added summary metrics (raw, evaluable, boundary-adjusted recall and median lead).
* Prediction is now observed before the FLEE transition so flee entries use correct pre-flee inputs; frames that cause FLEE are skipped as snapshots.
* Added tests (`PredictionEvaluator.test.js`) and console tools: `predictionReport()`, `downloadPredictions()`.

## Update 14 — Predictor V2 and V3
* **V2** (`PredictionEngineV2.js`): threat term plus fear term. Fear caused false positives with distant visitors, so it became the baseline.
* **V3** (`PredictionEngineV3.js`): time-to-flee model, `(distance - 182) / closingSpeed`, ignoring fear. Includes a speed-glitch cap (600 px/s), lateral speed weighting, a capped proximity term reduced by stillness, noisy-or risk combination, and zero risk for calm visitors.
* V3 is the primary predictor; V2 is evaluated on the same events for comparison (`comparePredictors()`).
* Added V3 tests.

## Update 15 — Distance-Trend Predictor
* Added `PredictionTrend.js`, estimating closing speed from a same-visitor distance sample 450–900 ms old and discarding implausible spikes.
* Added the `V3Trend` candidate and its own evaluator; it warns even when instantaneous visitor motion is zero.
* Added tests.

## Update 16 — Visitor Heatmap Predictor
* Added `VisitorHeatmap.js`: a per-visitor probability grid (50 px cells) centered on the position forecast at the 1.5 s horizon, with speed-scaled spread, world clipping, and radius-probability risk.
* Added speed-based risk scaling so slow or hovering visitors raise less risk.
* Added forecast accuracy tracking (mean/median error, within-one-cell %).
* Added the `V3Heatmap` candidate and evaluator, a toggleable overlay, and `visitorHeatmapReport()` / `toggleVisitorHeatmap()`.
* Heatmap diagnostics are appended to flee traces. Added tests.

## Update 17 — Predictions Drive Behavior
* **Butterflies:** Trend or Heatmap warnings now trigger an early FLEE while threat is still below 0.3, with the source recorded (`V3Trend`, `V3Heatmap`, or both). Added a per-visitor latch with re-arm and recovery timers to prevent flee loops, and a prediction-aware escape that works at zero current threat.
* **Birds:** the heatmap forecast drives readiness flutter and early flights to the tree farthest from the predicted visitor position, with a per-visitor latch and re-arm.
* Added visual cues: "PREDICTED" and "FORECAST" rings.
* Evaluators now record `predictionTriggered` / `predictionSource` per flee episode.
* V3 (primary) and V2 remain shadow-only.
* Fixed the ordering of haven-clearing and the FLEE transition so the current frame's visitor data is observed first.

## Update 18 — Extra Diagnostics
* Added `[BirdDiag]`, `[BirdCuriosityDiag]`, and `[BirdPrediction]` logs covering bird state changes, investigation sessions, and forecast escapes.
* Expanded `[PredictionDiag]` with trend and heatmap fields.

## Update 19 — Remove 3D Prototype
* Removed the legacy Three.js application entry point and supporting files: `index.html`, `src/main.js`, `src/style.css`, `src/ai/BehaviorEngine.js`, `src/creatures/Butterfly.js`, and `src/interaction/InteractionEngine.js`.
* Kept `demo2d.html` as the application entry point and `src/demo2d.js` as the active 2D runtime.
* Removed the tree-rustle outline and target-flower highlight from the 2D canvas rendering.

---

## Current Status
* Active demo: 2D forest with two butterflies, five birds, and multi-visitor mouse/camera input.
* Behavior-driving predictors: V3Trend and V3Heatmap. Shadow evaluation: V3 and V2.
