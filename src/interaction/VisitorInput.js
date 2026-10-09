import * as THREE from "three"

export class VisitorInput {
  constructor(camera, domElement) {
    this.camera = camera
    this.domElement = domElement

    // Mouse position in normalized device coordinates.
    // Range:
    // x = -1 to +1
    // y = -1 to +1
    this.mouse = new THREE.Vector2()

    // Current visitor position in world space.
    this.position = new THREE.Vector3()

    // Previous visitor position.
    this.lastPosition = new THREE.Vector3()

    // Movement information.
    this.speed = 0
    this.isMoving = false

    // Prevent the system from treating the visitor
    // as being at (0, 0, 0) before the mouse is used.
    this.hasInput = false

    // Three.js raycaster.
    this.raycaster = new THREE.Raycaster()

    // Horizontal ground plane at world Y = 0.
    this.groundPlane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      0
    )

    window.addEventListener(
      "mousemove",
      (event) => {
        this.updateMousePosition(event)
      }
    )
  }

  updateMousePosition(event) {
    // Get the actual position and size of the
    // Three.js rendering canvas on the screen.
    const rect =
      this.domElement.getBoundingClientRect()

    // Convert browser screen coordinates
    // into coordinates relative to the canvas.
    const mouseX =
      event.clientX - rect.left

    const mouseY =
      event.clientY - rect.top

    // Convert canvas coordinates into
    // Normalized Device Coordinates.
    //
    // x:
    // left  = -1
    // center = 0
    // right = +1
    //
    // y:
    // top    = +1
    // center = 0
    // bottom = -1
    this.mouse.x =
      (mouseX / rect.width) * 2 - 1

    this.mouse.y =
      -(mouseY / rect.height) * 2 + 1

    // Create a ray from the camera
    // through the mouse position.
    this.raycaster.setFromCamera(
      this.mouse,
      this.camera
    )

    // Temporary vector used to store
    // the world-space intersection point.
    const intersectionPoint =
      new THREE.Vector3()

    // Find where the mouse ray intersects
    // the horizontal forest ground.
    const hit =
      this.raycaster.ray.intersectPlane(
        this.groundPlane,
        intersectionPoint
      )

    // Only update the visitor if the ray
    // successfully hit the ground plane.
    if (hit) {
      // Store previous position.
      this.lastPosition.copy(
        this.position
      )

      // Store new world position.
      this.position.copy(
        intersectionPoint
      )

      // Calculate movement distance.
      this.speed =
        this.position.distanceTo(
          this.lastPosition
        )

      // Small threshold prevents tiny mouse
      // movements from being treated as movement.
      this.isMoving =
        this.speed > 0.001

      // We now have valid visitor input.
      this.hasInput = true
    }
  }

  getState() {
    return {
      x: this.position.x,
      y: this.position.y,
      speed: this.speed,
      isMoving: this.isMoving
    }
  }
}