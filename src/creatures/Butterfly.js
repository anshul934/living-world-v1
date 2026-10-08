import * as THREE from "three"

export class Butterfly {
  constructor(scene) {
    this.scene = scene

    // Butterfly position
    this.position = new THREE.Vector3(0, 2, 0)

    // Movement
    this.velocity = new THREE.Vector3(0.01, 0, 0.005)

    // Create butterfly group
    this.mesh = new THREE.Group()

    // Body
    const bodyGeometry = new THREE.SphereGeometry(0.12, 12, 12)

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222
    })

    const body = new THREE.Mesh(
      bodyGeometry,
      bodyMaterial
    )

    body.scale.set(0.5, 1.5, 0.5)

    this.mesh.add(body)

    // Wings
    const wingGeometry = new THREE.CircleGeometry(
      0.35,
      16
    )

    const wingMaterial = new THREE.MeshStandardMaterial({
      color: 0xff66cc,
      side: THREE.DoubleSide
    })

    const leftWing = new THREE.Mesh(
      wingGeometry,
      wingMaterial
    )

    leftWing.position.x = -0.25
    leftWing.rotation.y = Math.PI / 2

    const rightWing = new THREE.Mesh(
      wingGeometry,
      wingMaterial
    )

    rightWing.position.x = 0.25
    rightWing.rotation.y = Math.PI / 2

    this.mesh.add(leftWing)
    this.mesh.add(rightWing)

    // Position butterfly
    this.mesh.position.copy(this.position)

    scene.add(this.mesh)
  }

  update(interaction) {
  // Visitor is close
  if (interaction.isDanger) {
    console.log(
      "BUTTERFLY FLEEING",
      interaction.distance
    )

    this.velocity.copy(
      interaction.escapeDirection
        .multiplyScalar(0.08)
    )
  }

  // Move butterfly
  this.position.add(this.velocity)

  // Keep butterfly inside forest
  if (this.position.x > 10) {
    this.position.x = 10
    this.velocity.x *= -1
  }

  if (this.position.x < -10) {
    this.position.x = -10
    this.velocity.x *= -1
  }

  if (this.position.z > 10) {
    this.position.z = 10
    this.velocity.z *= -1
  }

  if (this.position.z < -10) {
    this.position.z = -10
    this.velocity.z *= -1
  }

  // Keep butterfly at flying height
  this.position.y = 2

  // Update visual position
  this.mesh.position.copy(this.position)
}
}