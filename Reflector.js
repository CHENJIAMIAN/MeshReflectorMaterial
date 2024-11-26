import {
    BoxGeometry,
    Plane,
    Vector3,
    Vector4,
    Matrix4,
    PerspectiveCamera,
    Mesh,
    LinearFilter,
    WebGLRenderTarget,
    DepthTexture,
    DepthFormat,
    UnsignedShortType,
    PlaneGeometry,
    MeshBasicMaterial, // Or any other material you want to use as a base
    HalfFloatType,
    Texture,
} from 'three'

import { BlurPass } from './BlurPass.js' // Assuming you have this file
import { MeshReflectorMaterial } from './MeshReflectorMaterial.js' // Assuming you have this file

class Reflector {
    constructor(options) {
        this.options = {
            mixBlur: 0,
            mixStrength: 0.5,
            resolution: 256,
            blur: [0, 0],
            args: [1, 1],
            minDepthThreshold: 0.9,
            maxDepthThreshold: 1,
            depthScale: 0,
            depthToBlurRatioBias: 0.25,
            mirror: 0,
            debug: 0,
            distortion: 1,
            mixContrast: 1,
            distortionMap: null,
            ...options,
        }

        this.gl = this.options.gl
        this.camera = this.options.camera
        this.scene = this.options.scene

        this.blur = Array.isArray(this.options.blur) ? this.options.blur : [this.options.blur, this.options.blur]
        this.hasBlur = this.blur[0] + this.blur[1] > 0

        // Initialize objects
        this.reflectorPlane = new Plane()
        this.normal = new Vector3()
        this.reflectorWorldPosition = new Vector3()
        this.cameraWorldPosition = new Vector3()
        this.rotationMatrix = new Matrix4()
        this.lookAtPosition = new Vector3(0, 0, -1)
        this.clipPlane = new Vector4()
        this.view = new Vector3()
        this.target = new Vector3()
        this.q = new Vector4()
        this.textureMatrix = new Matrix4()
        this.virtualCamera = new PerspectiveCamera()

        // Create Render Targets and Blur Pass
        this.createRenderTargets()

        // Create Reflector Mesh and Material
        this.createReflectorMesh()
    }

    createRenderTargets () {
        const parameters = {
            type: HalfFloatType,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
        }
        this.fbo1 = new WebGLRenderTarget(this.options.resolution, this.options.resolution, parameters)
        this.fbo1.depthBuffer = true
        this.fbo1.depthTexture = new DepthTexture(this.options.resolution, this.options.resolution)
        this.fbo1.depthTexture.format = DepthFormat
        this.fbo1.depthTexture.type = UnsignedShortType
        this.fbo2 = new WebGLRenderTarget(this.options.resolution, this.options.resolution, parameters)
        this.blurpass = new BlurPass({
            resolution: this.options.resolution,
            width: this.blur[0],
            height: this.blur[1],
            minDepthThreshold: this.options.minDepthThreshold,
            maxDepthThreshold: this.options.maxDepthThreshold,
            depthScale: this.options.depthScale,
            depthToBlurRatioBias: this.options.depthToBlurRatioBias,
        })
    }

    createReflectorMaterial () {
        const reflectorProps = {
            ...this.options,
            mirror: this.options.mirror,
            textureMatrix: this.textureMatrix,
            mixBlur: this.options.mixBlur,
            tDiffuse: this.fbo1.texture,
            tDepth: this.fbo1.depthTexture,
            tDiffuseBlur: this.fbo2.texture,
            hasBlur: this.hasBlur,
            mixStrength: this.options.mixStrength,
            minDepthThreshold: this.options.minDepthThreshold,
            maxDepthThreshold: this.options.maxDepthThreshold,
            depthScale: this.options.depthScale,
            depthToBlurRatioBias: this.options.depthToBlurRatioBias,
            transparent: true,
            debug: this.options.debug,
            distortion: this.options.distortion,
            distortionMap: this.options.distortionMap,
            mixContrast: this.options.mixContrast,
            'defines-USE_BLUR': this.hasBlur ? '' : undefined,
            'defines-USE_DEPTH': this.options.depthScale > 0 ? '' : undefined,
            'defines-USE_DISTORTION': this.options.distortionMap ? '' : undefined,
        }
        return new MeshReflectorMaterial(reflectorProps)
    }

    createReflectorMesh () {
        const geometry = new PlaneGeometry(...this.options.args)
        this.reflectorMaterial = this.createReflectorMaterial()
        this.mesh = new Mesh(geometry, this.reflectorMaterial)

        // Apply initial position/rotation/scale from options
        if (this.options.position) {
            this.mesh.position.copy(this.options.position)
        }
        if (this.options.rotation) {
            this.mesh.rotation.copy(this.options.rotation)
        }
        if (this.options.scale) {
            this.mesh.scale.copy(this.options.scale)
        }
    }

    beforeRender () {
        this.reflectorWorldPosition.setFromMatrixPosition(this.mesh.matrixWorld)
        this.cameraWorldPosition.setFromMatrixPosition(this.camera.matrixWorld)
        this.rotationMatrix.extractRotation(this.mesh.matrixWorld)
        this.normal.set(0, 0, 1)
        this.normal.applyMatrix4(this.rotationMatrix)
        this.view.subVectors(this.reflectorWorldPosition, this.cameraWorldPosition)
        // Avoid rendering when reflector is facing away
        if (this.view.dot(this.normal) > 0) return

        this.view.reflect(this.normal).negate()
        this.view.add(this.reflectorWorldPosition)
        this.rotationMatrix.extractRotation(this.camera.matrixWorld)
        this.lookAtPosition.set(0, 0, -1)
        this.lookAtPosition.applyMatrix4(this.rotationMatrix)
        this.lookAtPosition.add(this.cameraWorldPosition)
        this.target.subVectors(this.reflectorWorldPosition, this.lookAtPosition)
        this.target.reflect(this.normal).negate()
        this.target.add(this.reflectorWorldPosition)
        this.virtualCamera.position.copy(this.view)
        this.virtualCamera.up.set(0, 1, 0)
        this.virtualCamera.up.applyMatrix4(this.rotationMatrix)
        this.virtualCamera.up.reflect(this.normal)
        this.virtualCamera.lookAt(this.target)
        this.virtualCamera.far = this.camera.far // Used in WebGLBackground
        this.virtualCamera.updateMatrixWorld()
        this.virtualCamera.projectionMatrix.copy(this.camera.projectionMatrix)
        // Update the texture matrix
        this.textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0)
        this.textureMatrix.multiply(this.virtualCamera.projectionMatrix)
        this.textureMatrix.multiply(this.virtualCamera.matrixWorldInverse)
        this.textureMatrix.multiply(this.mesh.matrixWorld)
        // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
        // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
        this.reflectorPlane.setFromNormalAndCoplanarPoint(this.normal, this.reflectorWorldPosition)
        this.reflectorPlane.applyMatrix4(this.virtualCamera.matrixWorldInverse)
        this.clipPlane.set(
            this.reflectorPlane.normal.x,
            this.reflectorPlane.normal.y,
            this.reflectorPlane.normal.z,
            this.reflectorPlane.constant
        )
        const projectionMatrix = this.virtualCamera.projectionMatrix
        this.q.x = (Math.sign(this.clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0]
        this.q.y = (Math.sign(this.clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5]
        this.q.z = -1.0
        this.q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14]
        // Calculate the scaled plane vector
        this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(this.q))
        // Replacing the third row of the projection matrix
        projectionMatrix.elements[2] = this.clipPlane.x
        projectionMatrix.elements[6] = this.clipPlane.y
        projectionMatrix.elements[10] = this.clipPlane.z + 1.0
        projectionMatrix.elements[14] = this.clipPlane.w
    }

    render () {
        this.mesh.visible = false
        const currentXrEnabled = this.gl.xr.enabled
        const currentShadowAutoUpdate = this.gl.shadowMap.autoUpdate
        this.beforeRender()
        this.gl.xr.enabled = false
        this.gl.shadowMap.autoUpdate = false
        this.gl.setRenderTarget(this.fbo1)
        this.gl.state.buffers.depth.setMask(true)
        if (!this.gl.autoClear) this.gl.clear()
        this.gl.render(this.scene, this.virtualCamera)
        if (this.hasBlur) this.blurpass.render(this.gl, this.fbo1, this.fbo2)
        this.gl.xr.enabled = currentXrEnabled
        this.gl.shadowMap.autoUpdate = currentShadowAutoUpdate
        this.mesh.visible = true
        this.gl.setRenderTarget(null)
    }

    getMesh () {
        return this.mesh
    }
}

export { Reflector }