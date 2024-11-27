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
            blur: [0, 0],
            color: 0x7F7F7F,
            depthScale: 0,
            depthToBlurRatioBias: 0.25,
            distortion: 1,
            distortionMap: null,
            maxDepthThreshold: 1,
            minDepthThreshold: 0.9,

            mirror: 0,

            mixBlur: 0,
            mixContrast: 1,
            mixStrength: 0.5,

            opacity: 1,
            resolution: 256,
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

        const shader = this.getReflectorShader()
        const material = new ShaderMaterial({
            name: shader.name,
            defines: shader.defines,
            uniforms: UniformsUtils.clone(shader.uniforms),
            fragmentShader: shader.fragmentShader,
            vertexShader: shader.vertexShader,
            transparent: true
        })

        const reflectorProps = {
            color: new Color(this.options.color),
            depthScale: this.options.depthScale,
            depthToBlurRatioBias: this.options.depthToBlurRatioBias,
            distortion: this.options.distortion,
            distortionMap: this.options.distortionMap,
            hasBlur: this.hasBlur,
            maxDepthThreshold: this.options.maxDepthThreshold,
            minDepthThreshold: this.options.minDepthThreshold,
            mirror: this.options.mirror,

            mixBlur: this.options.mixBlur,
            mixContrast: this.options.mixContrast,
            mixStrength: this.options.mixStrength,

            opacity: this.options.opacity,
            tDepth: this.fbo1.depthTexture,
            tDiffuse: this.fbo1.texture,
            tDiffuseBlur: this.fbo2.texture,
            textureMatrix: this.textureMatrix,
            transparent: true,
        }

        material.uniforms['color'].value = reflectorProps.color
        material.uniforms['depthScale'].value = reflectorProps.depthScale
        material.uniforms['depthToBlurRatioBias'].value = reflectorProps.depthToBlurRatioBias
        material.uniforms['distortion'].value = reflectorProps.distortion
        material.uniforms['maxDepthThreshold'].value = reflectorProps.maxDepthThreshold
        material.uniforms['minDepthThreshold'].value = reflectorProps.minDepthThreshold
        material.uniforms['mirror'].value = reflectorProps.mirror

        material.uniforms['mixBlur'].value = reflectorProps.mixBlur
        material.uniforms['mixContrast'].value = reflectorProps.mixContrast
        material.uniforms['mixStrength'].value = reflectorProps.mixStrength

        material.uniforms['opacity'].value = reflectorProps.opacity
        material.uniforms['tDepth'].value = this.fbo1.depthTexture
        material.uniforms['tDiffuse'].value = this.fbo1.texture
        material.uniforms['tDiffuseBlur'].value = this.fbo2.texture
        material.uniforms['textureMatrix'].value = this.textureMatrix
        if (reflectorProps.distortionMap) {
            material.uniforms['distortionMap'].value = reflectorProps.distortionMap
            material.defines['USE_DISTORTION'] = ''
        }
        if (this.hasBlur) material.defines['USE_BLUR'] = ''
        if (this.options.depthScale > 0) material.defines['USE_DEPTH'] = ''

        this.material = material
    }

    getReflectorShader () {
        return {
            name: 'ReflectorShader',
            defines: {
                USE_UV: ''
            },
            uniforms: {
                'color': { value: new Color('white') },
                'depthScale': { value: 0 },
                'depthToBlurRatioBias': { value: 0.25 },
                'distortion': { value: 1 },
                'distortionMap': { value: null },
                'maxDepthThreshold': { value: 1 },
                'minDepthThreshold': { value: 0 },
                'mirror': { value: 0 },

                'mixBlur': { value: 0 },
                'mixContrast': { value: 1 },
                'mixStrength': { value: 0.5 },

                'opacity': { value: 1 },
                'tDepth': { value: null },
                'tDiffuse': { value: null },
                'tDiffuseBlur': { value: null },
                'textureMatrix': { value: null },
            },
            vertexShader: /* glsl */ `
                uniform mat4 textureMatrix;
                varying vec4 my_vUv;

                #include <common>
                #include <uv_pars_vertex>

                void main() {

	                #include <uv_vertex>

                    my_vUv = textureMatrix * vec4(position, 1.0);

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    
                }`,
            fragmentShader: /* glsl */ `
                uniform vec3 color;
                uniform float opacity;
                uniform sampler2D tDiffuse;
                uniform sampler2D tDepth;
                uniform sampler2D tDiffuseBlur;
                uniform float mirror;
                uniform float mixBlur;
                uniform float mixStrength;
                uniform float minDepthThreshold;
                uniform float maxDepthThreshold;
                uniform float depthScale;
                uniform float depthToBlurRatioBias;
                uniform float distortion;
                uniform float mixContrast;
                uniform sampler2D distortionMap;
                varying vec4 my_vUv;

                #include <common>
                #include <packing>
                #include <uv_pars_fragment>

                void main() {

                    float distortionFactor = 0.0;
                    #ifdef USE_DISTORTION
                        distortionFactor = texture2D(distortionMap, vUv).r * distortion;
                    #endif

                    vec4 new_vUv = my_vUv;
                    new_vUv.x += distortionFactor;
                    new_vUv.y += distortionFactor;

                    vec4 base = texture2DProj(tDiffuse, new_vUv);
                    vec4 blur = texture2DProj(tDiffuseBlur, new_vUv);

                    vec4 merge = base;

                    #ifdef USE_NORMALMAP
                        vec2 normal_uv = vec2(0.0);
                        vec4 normalColor = texture2D(normalMap, vUv * normalScale);
                        vec3 my_normal = normalize( vec3( normalColor.r * 2.0 - 1.0, normalColor.b,  normalColor.g * 2.0 - 1.0 ) );
                        vec3 coord = new_vUv.xyz / new_vUv.w;
                        normal_uv = coord.xy + coord.z * my_normal.xz * 0.05;
                        vec4 base_normal = texture2D(tDiffuse, normal_uv);
                        vec4 blur_normal = texture2D(tDiffuseBlur, normal_uv);
                        merge = base_normal;
                        blur = blur_normal;
                    #endif

                    float depthFactor = 0.0001;
                    float blurFactor = 0.0;

                    #ifdef USE_DEPTH
                        vec4 depth = texture2DProj(tDepth, new_vUv);
                        depthFactor = smoothstep(minDepthThreshold, maxDepthThreshold, 1.0-(depth.r * depth.a));
                        depthFactor *= depthScale;
                        depthFactor = max(0.0001, min(1.0, depthFactor));

                        #ifdef USE_BLUR
                        blur = blur * min(1.0, depthFactor + depthToBlurRatioBias);
                        merge = merge * min(1.0, depthFactor + 0.5);
                        #else
                        merge = merge * depthFactor;
                        #endif

                    #endif

                    float reflectorRoughnessFactor = 1.0;//roughness;
                    #ifdef USE_ROUGHNESSMAP
                        vec4 reflectorTexelRoughness = texture2D( roughnessMap, vUv );
                        reflectorRoughnessFactor *= reflectorTexelRoughness.g;
                    #endif

                    #ifdef USE_BLUR
                        blurFactor = min(1.0, mixBlur * reflectorRoughnessFactor);
                        merge = mix(merge, blur, blurFactor);
                    #endif

                    vec4 newMerge = vec4(0.0, 0.0, 0.0, 1.0);
                    newMerge.r = (merge.r - 0.5) * mixContrast + 0.5;
                    newMerge.g = (merge.g - 0.5) * mixContrast + 0.5;
                    newMerge.b = (merge.b - 0.5) * mixContrast + 0.5;

                    vec3 diffuseColor =color;
                    diffuseColor.rgb = diffuseColor.rgb * ((1.0 - min(1.0, mirror)) + newMerge.rgb * mixStrength);

                    gl_FragColor = vec4( diffuseColor, opacity);
                 
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