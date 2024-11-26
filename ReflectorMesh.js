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
    LinearFilter,
    DepthTexture,
    DepthFormat,
    UnsignedShortType
} from 'three'

import { BlurPass } from './BlurPass.js'

class ReflectorMesh extends Mesh {

    constructor(geometry, options = {}) {
        super(geometry)

        this.isReflector = true
        this.type = 'Reflector'
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
            color: 0x7F7F7F,
            ...options
        }

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

        // Render Targets and Blur Pass
        this.createRenderTargets()

        // Create Reflector Material
        this.createReflectorMaterial()

        // Apply initial position/rotation/scale from options
        if (this.options.position) {
            this.position.copy(this.options.position)
        }
        if (this.options.rotation) {
            this.rotation.copy(this.options.rotation)
        }
        if (this.options.scale) {
            this.scale.copy(this.options.scale)
        }
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
            color: new Color(this.options.color),
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
        }

        const shader = this.getReflectorShader(reflectorProps)

        const material = new ShaderMaterial({
            name: shader.name,
            uniforms: UniformsUtils.clone(shader.uniforms),
            fragmentShader: shader.fragmentShader,
            vertexShader: shader.vertexShader,
            transparent: true
        })

        material.uniforms['tDiffuse'].value = this.fbo1.texture
        material.uniforms['tDepth'].value = this.fbo1.depthTexture
        material.uniforms['tDiffuseBlur'].value = this.fbo2.texture
        material.uniforms['color'].value = reflectorProps.color
        material.uniforms['textureMatrix'].value = this.textureMatrix
        material.uniforms['mixBlur'].value = reflectorProps.mixBlur
        material.uniforms['mixStrength'].value = reflectorProps.mixStrength
        material.uniforms['minDepthThreshold'].value = reflectorProps.minDepthThreshold
        material.uniforms['maxDepthThreshold'].value = reflectorProps.maxDepthThreshold
        material.uniforms['depthScale'].value = reflectorProps.depthScale
        material.uniforms['depthToBlurRatioBias'].value = reflectorProps.depthToBlurRatioBias
        material.uniforms['distortion'].value = reflectorProps.distortion
        material.uniforms['mixContrast'].value = reflectorProps.mixContrast
        if (reflectorProps.distortionMap) {
            material.uniforms['distortionMap'].value = reflectorProps.distortionMap
            material.defines['USE_DISTORTION'] = ''
        }
        if (this.hasBlur) material.defines['USE_BLUR'] = ''
        if (this.options.depthScale > 0) material.defines['USE_DEPTH'] = ''

        this.material = material
    }

    getReflectorShader (reflectorProps) {
        return {
            name: 'ReflectorShader',
            uniforms: {
                'color': { value: null },
                'tDiffuse': { value: null },
                'tDepth': { value: null },
                'tDiffuseBlur': { value: null },
                'textureMatrix': { value: null },
                'mixBlur': { value: 0 },
                'mixStrength': { value: 0.5 },
                'minDepthThreshold': { value: 0 },
                'maxDepthThreshold': { value: 1 },
                'depthScale': { value: 0 },
                'depthToBlurRatioBias': { value: 0.25 },
                'distortion': { value: 1 },
                'distortionMap': { value: null },
                'mixContrast': { value: 1 }
            },
            vertexShader: /* glsl */ `
                uniform mat4 textureMatrix;
                varying vec4 vUv;
                varying float vDepth;

                #include <common>
                #include <logdepthbuf_pars_vertex>

                void main() {
                    vUv = textureMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    
                    #include <logdepthbuf_vertex>
                    vDepth = gl_Position.z;
                }`,
            fragmentShader: /* glsl */ `
                uniform vec3 color;
                uniform sampler2D tDiffuse;
                uniform sampler2D tDepth;
                uniform sampler2D tDiffuseBlur;
                uniform float mixBlur;
                uniform float mixStrength;
                uniform float minDepthThreshold;
                uniform float maxDepthThreshold;
                uniform float depthScale;
                uniform float depthToBlurRatioBias;
                uniform float distortion;
                uniform float mixContrast;

                #ifdef USE_DISTORTION
                    uniform sampler2D distortionMap;
                #endif

                varying vec4 vUv;
                varying float vDepth;

                #include <common>
                #include <logdepthbuf_pars_fragment>
                #include <packing>

                float blendOverlay(float base, float blend) {
                    return(base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend)));
                }

                vec3 blendOverlay(vec3 base, vec3 blend) {
                    return vec3(blendOverlay(base.r, blend.r), blendOverlay(base.g, blend.g), blendOverlay(base.b, blend.b));
                }

                float getBlurFactor(float depth) {
                    float blurFactor = clamp((depth - minDepthThreshold) / (maxDepthThreshold - minDepthThreshold), 0.0, 1.0 );
                    
                    #ifdef USE_DEPTH
                        float depthFactor = pow(depth * depthScale, depthToBlurRatioBias);
                        blurFactor = mix(blurFactor, depthFactor, saturate(depthScale));
                    #endif
                    
                    return blurFactor;
                }

                void main() {
                    #include <logdepthbuf_fragment>
                    vec4 base = texture2DProj(tDiffuse, vUv);
                    
                    #ifdef USE_BLUR
                        float depth = texture2DProj(tDepth, vUv).r;
                        float blurFactor = getBlurFactor(depth);
                        vec4 blur = texture2DProj(tDiffuseBlur, vUv);

                        vec3 finalColor = mix(base.rgb, blur.rgb, blurFactor * mixBlur);
                    #else
                        vec3 finalColor = base.rgb;
                    #endif

                    #ifdef USE_DISTORTION
                        vec2 distortionUV = vUv.xy;
                        
                        #ifdef USE_DEPTH
                            float depth = texture2DProj(tDepth, vUv).r;
                            float distortionFactor = getBlurFactor(depth);
                            distortionUV += (texture2D(distortionMap, distortionUV).rg * 2.0 - 1.0) * distortion * distortionFactor;
                        #else
                            distortionUV += (texture2D(distortionMap, distortionUV).rg * 2.0 - 1.0) * distortion;
                        #endif

                        vec4 distortedBase = texture2DProj(tDiffuse, vec4(distortionUV, vUv.z, vUv.w));
                        #ifdef USE_BLUR
                            vec4 distortedBlur = texture2DProj(tDiffuseBlur, vec4(distortionUV, vUv.z, vUv.w));
                            finalColor = mix(distortedBase.rgb, distortedBlur.rgb, blurFactor * mixBlur);
                        #else
                            finalColor = distortedBase.rgb;
                        #endif
                    #endif

                    gl_FragColor = vec4( blendOverlay(finalColor, color * mixStrength) , 1.0);
                    float contrastFactor = (1.0 + mixContrast) / (1.0 - mixContrast);
                        gl_FragColor.rgb = (gl_FragColor.rgb - 0.5) * contrastFactor + 0.5;
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }`
        }
    }

    onBeforeRender (renderer, scene, camera) {
        this.reflectorWorldPosition.setFromMatrixPosition(this.matrixWorld)
        this.cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld)

        this.rotationMatrix.extractRotation(this.matrixWorld)

        this.normal.set(0, 0, 1)
        this.normal.applyMatrix4(this.rotationMatrix)

        this.view.subVectors(this.reflectorWorldPosition, this.cameraWorldPosition)

        // Avoid rendering when reflector is facing away
        if (this.view.dot(this.normal) > 0) return

        this.view.reflect(this.normal).negate()
        this.view.add(this.reflectorWorldPosition)

        this.rotationMatrix.extractRotation(camera.matrixWorld)

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

        this.virtualCamera.far = camera.far // Used in WebGLBackground

        this.virtualCamera.updateMatrixWorld()
        this.virtualCamera.projectionMatrix.copy(camera.projectionMatrix)

        // Update the texture matrix
        this.textureMatrix.set(
            0.5, 0.0, 0.0, 0.5,
            0.0, 0.5, 0.0, 0.5,
            0.0, 0.0, 0.5, 0.5,
            0.0, 0.0, 0.0, 1.0
        )
        this.textureMatrix.multiply(this.virtualCamera.projectionMatrix)
        this.textureMatrix.multiply(this.virtualCamera.matrixWorldInverse)
        this.textureMatrix.multiply(this.matrixWorld)

        // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
        // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
        this.reflectorPlane.setFromNormalAndCoplanarPoint(this.normal, this.reflectorWorldPosition)
        this.reflectorPlane.applyMatrix4(this.virtualCamera.matrixWorldInverse)

        this.clipPlane.set(this.reflectorPlane.normal.x, this.reflectorPlane.normal.y, this.reflectorPlane.normal.z, this.reflectorPlane.constant)

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

        // Render
        this.visible = false

        const currentRenderTarget = renderer.getRenderTarget()

        const currentXrEnabled = renderer.xr.enabled
        const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate

        renderer.xr.enabled = false // Avoid camera modification
        renderer.shadowMap.autoUpdate = false // Avoid re-computing shadows

        renderer.setRenderTarget(this.fbo1)
        renderer.state.buffers.depth.setMask(true) // make sure the depth buffer is writable so it can be properly cleared, see #18897
        if (renderer.autoClear === false) renderer.clear()
        renderer.render(scene, this.virtualCamera)

        if (this.hasBlur) this.blurpass.render(renderer, this.fbo1, this.fbo2)

        renderer.xr.enabled = currentXrEnabled
        renderer.shadowMap.autoUpdate = currentShadowAutoUpdate

        renderer.setRenderTarget(currentRenderTarget)

        // Restore viewport
        const viewport = camera.viewport
        if (viewport !== undefined) {
            renderer.state.viewport(viewport)
        }
        this.visible = true
    }

    getRenderTarget () {
        return this.fbo1
    }

    dispose () {
        this.fbo1.dispose()
        this.fbo2.dispose()
        this.material.dispose()
    }
}

export { ReflectorMesh }