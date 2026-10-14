export class VisitorInput {
  constructor(canvasElement) {
    this.canvas = canvasElement

    this.position = { x: -1000, y: -1000 }
    this.lastPosition = { x: -1000, y: -1000 }
    this.hasPosition = false

    this.speed = 0
    this.isMoving = false
    this.active = false

    this.pendingClick = false
    this.isClicked = false

    this.inputSource = "mouse"
    this.cameraProvider = null
    this.wasPinching = false
    this.mouseNormX = 0
    this.mouseNormY = 0
    this.mouseActive = false

    this.pointerVisitors = new Map()
    this.visitorMotion = new Map()
    this.currentVisitors = []
    this.lastVisitorUpdate = performance.now()

    this.initMouseListeners()
  }

  setCameraProvider(provider) {
    this.cameraProvider = provider
  }

  initMouseListeners() {
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      const pointer = this.pointerVisitors.get(event.pointerId) ?? {
        pointerType: event.pointerType || "mouse",
        isClicked: false
      }
      pointer.normX = (event.clientX - rect.left) / rect.width
      pointer.normY = (event.clientY - rect.top) / rect.height
      pointer.pointerType = event.pointerType || "mouse"
      pointer.active = true
      this.pointerVisitors.set(event.pointerId, pointer)

      this.mouseNormX = pointer.normX
      this.mouseNormY = pointer.normY
      this.mouseActive = true
      if (this.inputSource !== "camera") {
        this.updateState(this.mouseNormX, this.mouseNormY, true)
      }
    })

    this.canvas.addEventListener("pointerdown", (event) => {
      const rect = this.canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const pointer = this.pointerVisitors.get(event.pointerId) ?? {
        pointerType: event.pointerType || "mouse",
        active: true
      }
      pointer.normX = (event.clientX - rect.left) / rect.width
      pointer.normY = (event.clientY - rect.top) / rect.height
      pointer.pointerType = event.pointerType || "mouse"
      pointer.active = true
      pointer.isClicked = true
      this.pointerVisitors.set(event.pointerId, pointer)
      this.pendingClick = true
    })

    this.canvas.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "mouse") {
        this.pointerVisitors.delete(event.pointerId)
      }
    })
    this.canvas.addEventListener("pointercancel", (event) => {
      this.pointerVisitors.delete(event.pointerId)
    })
    this.canvas.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") {
        this.pointerVisitors.delete(event.pointerId)
        return
      }
      this.pointerVisitors.delete(event.pointerId)
      this.mouseActive = false
      if (this.inputSource !== "camera") {
        this.active = false
        this.speed = 0
        this.isMoving = false
        this.hasPosition = false
      }
    })
  }

  update(worldW = 1000, worldH = 650) {
    const now = performance.now()
    const elapsed = Math.max((now - this.lastVisitorUpdate) / 1000, 0.001)
    this.lastVisitorUpdate = now
    const clickedThisFrame = this.pendingClick
    this.pendingClick = false
    this.isClicked = false

    let cameraVisitors = []
    if (this.cameraProvider?.isReady) {
      this.cameraProvider.update()
      if (typeof this.cameraProvider.getVisitors === "function") {
        cameraVisitors = this.cameraProvider.getVisitors()
      } else {
        const state = this.cameraProvider.getState()
        if (state.active) {
          cameraVisitors = [{
            id: "camera:hand",
            normX: state.normX,
            normY: state.normY,
            isClicked: this.cameraProvider.consumePinchStart?.() ?? false
          }]
        }
      }

      const cameraState = this.cameraProvider.getState()
      if (cameraState.active) {
        this.inputSource = "camera"
        this.updateState(cameraState.normX, cameraState.normY, true, worldW, worldH)
      } else {
        this.inputSource = "mouse"
      }
    } else {
      this.inputSource = "mouse"
    }

    const nextVisitors = []
    for (const [pointerId, pointer] of this.pointerVisitors) {
      if (!pointer.active) continue
      nextVisitors.push(this.updateVisitorMotion({
        id: `pointer:${pointerId}`,
        source: pointer.pointerType,
        normX: pointer.normX,
        normY: pointer.normY,
        isClicked: pointer.isClicked || (clickedThisFrame && nextVisitors.length === 0)
      }, worldW, worldH, now, elapsed))
      pointer.isClicked = false
    }

    for (const cameraVisitor of cameraVisitors) {
      if (!cameraVisitor.active && cameraVisitor.active !== undefined) continue
      nextVisitors.push(this.updateVisitorMotion({
        ...cameraVisitor,
        source: "camera"
      }, worldW, worldH, now, elapsed))
    }

    const activeIds = new Set(nextVisitors.map((visitor) => visitor.id))
    for (const id of this.visitorMotion.keys()) {
      if (!activeIds.has(id)) this.visitorMotion.delete(id)
    }
    this.currentVisitors = nextVisitors

    if (cameraVisitors.length && this.cameraProvider?.getState().active) {
      this.wasPinching = Boolean(this.cameraProvider.getState().isPinching)
    } else {
      this.wasPinching = false
    }

    if (!this.cameraProvider?.getState().active && this.mouseActive) {
      this.updateState(this.mouseNormX, this.mouseNormY, true, worldW, worldH)
    } else if (!this.cameraProvider?.getState().active && !this.mouseActive) {
      this.active = false
      this.speed = 0
      this.isMoving = false
      this.hasPosition = false
    }
  }

  updateVisitorMotion(visitor, worldW, worldH, now, elapsed) {
    const x = visitor.normX * worldW
    const y = visitor.normY * worldH
    const previous = this.visitorMotion.get(visitor.id)
    const moved = previous ? Math.hypot(x - previous.x, y - previous.y) : Infinity
    const lastMovedAt = !previous || moved > (visitor.source === "camera" ? 5 : 1.5)
      ? now
      : previous.lastMovedAt
    const speed = previous ? moved / elapsed : 0
    const motion = { x, y, lastMovedAt }
    this.visitorMotion.set(visitor.id, motion)

    return {
      id: visitor.id,
      source: visitor.source,
      x,
      y,
      clickX: visitor.clickNormX === undefined
        ? x
        : visitor.clickNormX * worldW,
      clickY: visitor.clickNormY === undefined
        ? y
        : visitor.clickNormY * worldH,
      gesture: visitor.gesture ?? null,
      active: true,
      speed,
      isMoving: now - lastMovedAt < 250,
      lastMovedAt,
      approachSpeed: speed,
      isClicked: Boolean(visitor.isClicked)
    }
  }

  updateState(
    normX,
    normY,
    active,
    worldW = 1000,
    worldH = 650
  ) {
    if (!active) {
      this.active = false
      this.speed = 0
      this.isMoving = false
      this.hasPosition = false
      return
    }

    const worldX = normX * worldW
    const worldY = normY * worldH

    if (!this.hasPosition) {
      this.position.x = worldX
      this.position.y = worldY
      this.lastPosition.x = worldX
      this.lastPosition.y = worldY
      this.hasPosition = true
      this.active = true
      this.speed = 0
      this.isMoving = false
      return
    }

    this.lastPosition.x = this.position.x
    this.lastPosition.y = this.position.y
    this.position.x += (worldX - this.position.x) * 0.25
    this.position.y += (worldY - this.position.y) * 0.25

    const dx = this.position.x - this.lastPosition.x
    const dy = this.position.y - this.lastPosition.y
    this.speed = Math.hypot(dx, dy)
    this.isMoving = this.speed > 0.05
    this.active = true
  }

  getVisitors() {
    return this.currentVisitors
  }

  getState() {
    return {
      x: this.position.x,
      y: this.position.y,
      speed: this.speed,
      isMoving: this.isMoving,
      active: this.active,
      isClicked: this.isClicked
    }
  }
}
