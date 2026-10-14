
import {
  FilesetResolver,
  HandLandmarker
} from "@mediapipe/tasks-vision";

const DEAD_ZONE = 0.008;
const SMOOTHING_TIME_CONSTANT = 0.12;
const TRACKING_GRACE_MS = 140;
const GESTURE_CONFIRMATION_MS = 140;

// Pinch begins below this distance and ends above RELEASE_THRESHOLD.
const PINCH_THRESHOLD = 0.06;
const RELEASE_THRESHOLD = 0.09;

export class CameraInput {
  constructor(videoElement, statusElement) {
    this.video = videoElement;
    this.statusEl = statusElement;

    this.handLandmarker = null;
    this.isReady = false;
    this.lastVideoTime = -1;

    this.smoothedX = null;
    this.smoothedY = null;
    this.wasPinching = false;
    this.pinchStarted = false;
    this.handStates = new Map();
    this.cameraVisitors = [];
    this.pinchStartedIds = new Set();
    this.suppressPinchStarts = false;
    this.nextHandId = 0;

    this.rawNormalizedState = {
      normX: 0,
      normY: 0,
      active: false,
      isPinching: false
    };
  }

  async init() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setStatus("Camera: Not Supported");
      return;
    }

    try {
      this.setStatus("Requesting Camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      });

      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.autoplay = true;
      this.video.playsInline = true;

      await this.video.play();

      if (this.video.videoWidth === 0) {
        await new Promise((resolve, reject) => {
          this.video.addEventListener("loadeddata", resolve, {
            once: true
          });
          this.video.addEventListener(
            "error",
            () => reject(new Error("Camera video failed to load")),
            { once: true }
          );
        });
      }

      this.setStatus("Loading Hand Tracking Model...");

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 4
        }
      );

      this.isReady = true;
      this.setStatus("Camera: Tracking Active");
    } catch (err) {
      console.error("[CameraInput] Initialization failed:", err);
      this.setStatus(`Camera unavailable: ${err.message}`);
    }
  }

  lerp(current, target, alpha) {
    return current + (target - current) * alpha;
  }

  smoothCoordinate(current, target, alpha) {
    // Initialize immediately so the visitor doesn't slide in from (0, 0).
    if (current === null) return target;

    // Ignore tiny changes caused by tracking noise.
    if (Math.abs(target - current) < DEAD_ZONE) {
      return current;
    }

    return this.lerp(current, target, alpha);
  }

  classifyGesture(landmarks) {
    if (!landmarks || landmarks.length < 21) return null

    const wrist = landmarks[0];
    const distanceFromWrist = (point) =>
      Math.hypot(point.x - wrist.x, point.y - wrist.y);
    const fingers = [
      [landmarks[8], landmarks[6]],
      [landmarks[12], landmarks[10]],
      [landmarks[16], landmarks[14]],
      [landmarks[20], landmarks[18]]
    ];
    const extended = fingers.map(([tip, joint]) =>
      distanceFromWrist(tip) > distanceFromWrist(joint) * 1.12
    );

    if (extended.every(Boolean)) return "open-palm"

    if (extended.every((isExtended) => !isExtended)) return "fist";
    return null;
  }

  stabilizeGesture(gesture, previous, now) {
    const candidateSince = previous?.gestureCandidate === gesture
      ? previous.gestureCandidateSince
      : now;
    const stableGesture = now - candidateSince >= GESTURE_CONFIRMATION_MS
      ? gesture
      : previous?.gesture ?? null;

    return {
      gesture: stableGesture,
      gestureCandidate: gesture,
      gestureCandidateSince: candidateSince
    };
  }

  update() {
    if (
      !this.isReady ||
      !this.handLandmarker ||
      this.video.readyState < 2 ||
      this.video.currentTime === this.lastVideoTime
    ) {
      return;
    }

    this.lastVideoTime = this.video.currentTime;

    try {
      this.pinchStarted = false;
      const now = performance.now();
      const suppressPinchStarts = this.suppressPinchStarts;
      const results = this.handLandmarker.detectForVideo(
        this.video,
        now
      );

      const currentHands = new Set();
      const detectedVisitors = (results.landmarks ?? []).map((landmarks, index) => {
        const handedness = results.handedness?.[index]?.[0]?.categoryName;
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        const targetX = 1 - indexTip.x;
        const targetY = indexTip.y;
        const matchingHands = [...this.handStates.entries()]
          .filter(([id, state]) =>
            !currentHands.has(id) &&
            state.handedness === (handedness ?? null)
          )
          .map(([id, state]) => ({
            id,
            state,
            distance: Math.hypot(state.normX - targetX, state.normY - targetY)
          }))
          .filter(({ distance }) => distance <= 0.25)
          .sort((a, b) => a.distance - b.distance);
        const id = matchingHands[0]?.id ?? `camera:hand-${this.nextHandId++}`;
        currentHands.add(id);
        const pinchDistance = Math.hypot(
          indexTip.x - thumbTip.x,
          indexTip.y - thumbTip.y
        );
        const previous = this.handStates.get(id);
        const stabilizedGesture = this.stabilizeGesture(
          this.classifyGesture(landmarks),
          previous,
          now
        );
        const elapsed = previous
          ? Math.max((now - previous.lastSeenAt) / 1000, 0)
          : 0;
        const smoothingAlpha = 1 - Math.exp(-elapsed / SMOOTHING_TIME_CONSTANT);
        const isPinching = previous?.isPinching
          ? pinchDistance < RELEASE_THRESHOLD
          : pinchDistance < PINCH_THRESHOLD;
        const pinchStarted = isPinching &&
          !previous?.isPinching &&
          !suppressPinchStarts;
        if (pinchStarted) this.pinchStartedIds.add(id);

        const clickNormX = 1 - (indexTip.x + thumbTip.x) / 2;
        const clickNormY = (indexTip.y + thumbTip.y) / 2;
        const normX = this.smoothCoordinate(previous?.normX ?? null, targetX, smoothingAlpha);
        const normY = this.smoothCoordinate(previous?.normY ?? null, targetY, smoothingAlpha);
        this.handStates.set(id, {
          ...stabilizedGesture,
          normX,
          normY,
          isPinching,
          handedness: handedness ?? null,
          lastSeenAt: now
        });

        return {
          id,
          normX,
          normY,
          clickNormX,
          clickNormY,
          gesture: stabilizedGesture.gesture,
          active: true,
          isPinching,
          isClicked: pinchStarted
        };
      });
      if (suppressPinchStarts && detectedVisitors.some((visitor) => !visitor.isPinching)) {
        this.suppressPinchStarts = false;
      }

      const retainedVisitors = [];
      for (const id of this.handStates.keys()) {
        if (currentHands.has(id)) continue;
        const previous = this.handStates.get(id);
        if (now - previous.lastSeenAt <= TRACKING_GRACE_MS) {
          retainedVisitors.push({
            id,
            normX: previous.normX,
            normY: previous.normY,
            gesture: previous.gesture,
            active: true,
            isPinching: previous.isPinching,
            isClicked: false
          });
        } else {
          this.handStates.delete(id);
        }
      }

      this.cameraVisitors = [...detectedVisitors, ...retainedVisitors]
        .sort((a, b) => a.id.localeCompare(b.id));
      const primaryHand = this.cameraVisitors[0];
      this.rawNormalizedState = primaryHand
        ? {
            normX: primaryHand.normX,
            normY: primaryHand.normY,
            active: true,
            isPinching: primaryHand.isPinching
          }
        : {
            normX: 0,
            normY: 0,
            active: false,
            isPinching: false
          };
      this.pinchStarted = this.pinchStartedIds.size > 0;
      this.wasPinching = this.cameraVisitors.some((hand) => hand.isPinching);
    } catch (err) {
      console.error("[CameraInput] Hand tracking failed:", err);
      this.cameraVisitors = [];
      this.handStates.clear();
      this.pinchStarted = false;
      this.pinchStartedIds.clear();
      this.wasPinching = false;
      this.suppressPinchStarts = true;
      this.rawNormalizedState = {
        normX: 0,
        normY: 0,
        active: false,
        isPinching: false
      };
    }
  }

  getState() {
    return this.rawNormalizedState;
  }

  getVisitors() {
    const visitors = this.cameraVisitors.map((visitor) => ({
      ...visitor,
      isClicked: this.pinchStartedIds.has(visitor.id)
    }));
    this.pinchStartedIds.clear();
    this.pinchStarted = false;
    return visitors;
  }

  consumePinchStart() {
    const started = this.pinchStarted;
    this.pinchStarted = false;
    this.pinchStartedIds.clear();
    return started;
  }

  setStatus(message) {
    if (this.statusEl) {
      this.statusEl.textContent = message;
    }
  }
}
