import {
    Color,
    Matrix4,
    Mesh,
    PerspectiveCamera,
    Plane,
    ShaderMaterial,
    UniformsUtils,
    Vector3,
    Vector4,
    WebGLRenderTarget,
    HalfFloatType,
    Vector2,
    LinearFilter,
    DepthTexture,
    DepthFormat,
    UnsignedShortType
} from 'three'

import { MyReflectorShader } from './MyReflectorShader.js'
import { BlurPass } from './BlurPass.js'

class Reflector extends Mesh {

    constructor(geometry, options = {}) {

        super(geometry)

        this.isReflector = true

        this.type = 'Reflector'
        this.camera = new PerspectiveCamera()

        const scope = this

        this.options = {
            mixBlur: 0,
            mixStrength: 0.5,
            resolution: 256,
            blur: [0, 0],
            minDepthThreshold: 0.9,
            maxDepthThreshold: 1,
            depthScale: 0,
            depthToBlurRatioBias: 0.25,
            mirror: 0,
            debug: 0,
            distortion: 1,
            mixContrast: 1,
            distortionMap: null,
            ...options
        }

        const color = (this.options.color !== undefined) ? new Color(this.options.color) : new Color(0x7F7F7F)
        const textureWidth = this.options.resolution
        const textureHeight = this.options.resolution
        const clipBias = this.options.clipBias || 0
        const shader = this.options.shader || MyReflectorShader
        const multisample = (this.options.multisample !== undefined) ? this.options.multisample : 4

        this.blur = Array.isArray(this.options.blur) ? this.options.blur : [this.options.blur, this.options.blur]
        this.hasBlur = this.blur[0] + this.blur[1] > 0

        const reflectorPlane = new Plane()
        const normal = new Vector3()
        const reflectorWorldPosition = new Vector3()
        const cameraWorldPosition = new Vector3()
        const rotationMatrix = new Matrix4()
        const lookAtPosition = new Vector3(0, 0, - 1)
        const clipPlane = new Vector4()

        const view = new Vector3()
        const target = new Vector3()
        const q = new Vector4()

        const textureMatrix = new Matrix4()
        const virtualCamera = this.camera

        const parameters = {
            type: HalfFloatType,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
        }

        this.fbo1 = new WebGLRenderTarget(textureWidth, textureHeight, parameters)
        this.fbo1.depthBuffer = true
        this.fbo1.depthTexture = new DepthTexture(textureWidth, textureHeight)
        this.fbo1.depthTexture.format = DepthFormat
        this.fbo1.depthTexture.type = UnsignedShortType
        this.fbo2 = new WebGLRenderTarget(textureWidth, textureHeight, parameters)
        this.blurpass = new BlurPass({
            resolution: textureWidth,
            width: this.blur[0],
            height: this.blur[1],
            minDepthThreshold: this.options.minDepthThreshold,
            maxDepthThreshold: this.options.maxDepthThreshold,
            depthScale: this.options.depthScale,
            depthToBlurRatioBias: this.options.depthToBlurRatioBias,
        })

        const material = new ShaderMaterial({
            name: (shader.name !== undefined) ? shader.name : 'unspecified',
            uniforms: UniformsUtils.clone(shader.uniforms),
            fragmentShader: shader.fragmentShader,
            vertexShader: shader.vertexShader,
            transparent: true
        })

        material.uniforms['tDiffuse'].value = this.fbo1.texture
        material.uniforms['tDepth'].value = this.fbo1.depthTexture
        material.uniforms['tDiffuseBlur'].value = this.fbo2.texture
        material.uniforms['color'].value = color
        material.uniforms['textureMatrix'].value = textureMatrix
        material.uniforms['distortionMap'].value = this.options.distortionMap
        material.uniforms['mixBlur'].value = this.options.mixBlur
        material.uniforms['mixStrength'].value = this.options.mixStrength
        material.uniforms['minDepthThreshold'].value = this.options.minDepthThreshold
        material.uniforms['maxDepthThreshold'].value = this.options.maxDepthThreshold
        material.uniforms['depthScale'].value = this.options.depthScale
        material.uniforms['depthToBlurRatioBias'].value = this.options.depthToBlurRatioBias
        material.uniforms['distortion'].value = this.options.distortion
        material.uniforms['mixContrast'].value = this.options.mixContrast
        material.uniforms['blurSize'].value = new Vector2(this.blur[0], this.blur[1])
        material.uniforms['debug'].value = this.options.debug
        material.uniforms['resolution'].value = new Vector2(textureWidth, textureHeight)

        if (this.hasBlur) {
            material.defines['USE_BLUR'] = ''
        }

        if (this.options.depthScale > 0) {
            material.defines['USE_DEPTH'] = ''
        }

        if (this.options.distortionMap) {
            material.defines['USE_DISTORTION'] = ''
        }

        this.material = material

        this.onBeforeRender = function (renderer, scene, camera) {

            reflectorWorldPosition.setFromMatrixPosition(scope.matrixWorld)
            cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld)

            rotationMatrix.extractRotation(scope.matrixWorld)

            normal.set(0, 0, 1)
            normal.applyMatrix4(rotationMatrix)

            view.subVectors(reflectorWorldPosition, cameraWorldPosition)

            if (view.dot(normal) > 0) return

            view.reflect(normal).negate()
            view.add(reflectorWorldPosition)

            rotationMatrix.extractRotation(camera.matrixWorld)

            lookAtPosition.set(0, 0, - 1)
            lookAtPosition.applyMatrix4(rotationMatrix)
            lookAtPosition.add(cameraWorldPosition)

            target.subVectors(reflectorWorldPosition, lookAtPosition)
            target.reflect(normal).negate()
            target.add(reflectorWorldPosition)

            virtualCamera.position.copy(view)
            virtualCamera.up.set(0, 1, 0)
            virtualCamera.up.applyMatrix4(rotationMatrix)
            virtualCamera.up.reflect(normal)
            virtualCamera.lookAt(target)

            virtualCamera.far = camera.far

            virtualCamera.updateMatrixWorld()
            virtualCamera.projectionMatrix.copy(camera.projectionMatrix)

            textureMatrix.set(
                0.5, 0.0, 0.0, 0.5,
                0.0, 0.5, 0.0, 0.5,
                0.0, 0.0, 0.5, 0.5,
                0.0, 0.0, 0.0, 1.0
            )
            textureMatrix.multiply(virtualCamera.projectionMatrix)
            textureMatrix.multiply(virtualCamera.matrixWorldInverse)
            textureMatrix.multiply(scope.matrixWorld)

            reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition)
            reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse)

            clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant)

            const projectionMatrix = virtualCamera.projectionMatrix

            q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0]
            q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5]
            q.z = - 1.0
            q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14]

            clipPlane.multiplyScalar(2.0 / clipPlane.dot(q))

            projectionMatrix.elements[2] = clipPlane.x
            projectionMatrix.elements[6] = clipPlane.y
            projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias
            projectionMatrix.elements[14] = clipPlane.w

            scope.visible = false

            const currentRenderTarget = renderer.getRenderTarget()

            const currentXrEnabled = renderer.xr.enabled
            const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate

            renderer.xr.enabled = false
            renderer.shadowMap.autoUpdate = false

            renderer.setRenderTarget(scope.fbo1)

            renderer.state.buffers.depth.setMask(true)

            if (renderer.autoClear === false) renderer.clear()
            renderer.render(scene, virtualCamera)

            if (scope.hasBlur) scope.blurpass.render(renderer, scope.fbo1, scope.fbo2)


            renderer.xr.enabled = currentXrEnabled
            renderer.shadowMap.autoUpdate = currentShadowAutoUpdate

            renderer.setRenderTarget(currentRenderTarget)

            const viewport = camera.viewport

            if (viewport !== undefined) {

                renderer.state.viewport(viewport)

            }

            scope.visible = true

        }

        this.getRenderTarget = function () {

            return renderTarget

        }

        this.dispose = function () {
            scope.fbo1.dispose()
            scope.fbo2.dispose()
            scope.material.dispose()

        }

    }

}


export { Reflector }