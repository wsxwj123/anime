import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Renders up to two shots (for crossfades) into multisampled HDR targets and
// mixes them. Everything downstream (bloom, grade) sees one HDR image.
class ShotsPass extends Pass {
  constructor(size, samples) {
    super();
    const opts = { type: THREE.HalfFloatType, samples, depthBuffer: true };
    this.rtA = new THREE.WebGLRenderTarget(size.x, size.y, opts);
    this.rtB = new THREE.WebGLRenderTarget(size.x, size.y, opts);
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uMode: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tA; uniform sampler2D tB; uniform float uMix; uniform float uMode;
          varying vec2 vUv;
          void main(){
            vec4 a = texture2D(tA, vUv);
            if (uMix <= 0.0) { gl_FragColor = a; return; }
            vec4 b = texture2D(tB, vUv);
            float m = uMix;
            if (uMode > 0.5) {
              // luminance-keyed dissolve: highlights of the incoming shot arrive first
              float lb = dot(b.rgb, vec3(0.299, 0.587, 0.114));
              m = clamp(uMix * 1.35 + (lb - 0.3) * 0.35 * (1.0 - uMix) * uMix * 4.0, 0.0, 1.0);
            }
            gl_FragColor = mix(a, b, m);
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.a = null;
    this.b = null;
    this.mix = 0;
    this.mode = 0;
    this.needsSwap = true;
  }
  setSize(w, h) {
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
  }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.rtA);
    renderer.clear();
    if (this.a) renderer.render(this.a.scene, this.a.camera);
    const u = this.quad.material.uniforms;
    u.tA.value = this.rtA.texture;
    u.uMix.value = 0;
    if (this.b && this.mix > 0) {
      renderer.setRenderTarget(this.rtB);
      renderer.clear();
      renderer.render(this.b.scene, this.b.camera);
      u.tB.value = this.rtB.texture;
      u.uMix.value = this.mix;
      u.uMode.value = this.mode;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// Tone mapping + filmic grade, done by hand so the look is identical everywhere.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uFade: { value: 1.0 },
    uTime: { value: 0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.55 },
    uCA: { value: 0.0022 },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uLift: { value: new THREE.Vector3(0.006, 0.012, 0.022) },
    uGain: { value: new THREE.Vector3(1.02, 1.0, 0.97) },
    uSat: { value: 1.05 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure; uniform float uFade; uniform float uTime; uniform float uGrain;
    uniform float uVignette; uniform float uCA; uniform vec2 uRes; uniform vec3 uLift; uniform vec3 uGain;
    uniform float uSat; uniform float uFlash;
    varying vec2 vUv;
    // ACES fitted (Stephen Hill)
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 c) {
      const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = inM * c;
      c = RRTAndODTFit(c);
      c = outM * c;
      return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uCA * (0.4 + 3.0 * r2);
      vec3 hdr;
      hdr.r = texture2D(tDiffuse, vUv - off).r;
      hdr.g = texture2D(tDiffuse, vUv).g;
      hdr.b = texture2D(tDiffuse, vUv + off).b;
      hdr *= uExposure;
      hdr += uFlash;
      vec3 c = aces(hdr);
      // grade in display-ish space
      c = uLift + c * (1.0 - uLift);
      c *= uGain;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      float vig = 1.0 - uVignette * smoothstep(0.08, 0.62, r2 * 1.6);
      c *= vig;
      c *= uFade;
      c = toSRGB(clamp(c, 0.0, 1.0));
      float g = hash(vUv * uRes + fract(uTime * 13.37) * 311.0) - 0.5;
      c += g * uGrain * (0.35 + 0.65 * (1.0 - l));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Renderer {
  constructor(canvas, { preserve = false, samples = 4, dpr = 1 } = {}) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: preserve,
    });
    r.setClearColor(0x000000, 1);
    r.autoClear = true;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.r = r;
    this.dpr = dpr;
    this.size = new THREE.Vector2(1920, 1080);
    const px = this.size.clone().multiplyScalar(dpr);
    const rt = new THREE.WebGLRenderTarget(px.x, px.y, { type: THREE.HalfFloatType, depthBuffer: false });
    this.composer = new EffectComposer(r, rt);
    this.shots = new ShotsPass(px, samples);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(px.x, px.y), 0.8, 0.55, 0.72);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.shots);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.final);
    this.frame = 0;
  }
  setSize(w, h, dpr = this.dpr) {
    this.dpr = dpr;
    this.size.set(w, h);
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w * dpr, h * dpr);
  }
  // state: { a:{scene,camera}, b?, mix, mode, exposure, fade, bloom:{strength,radius,threshold}, grade:{...}, time }
  render(state) {
    const s = this.shots;
    s.a = state.a;
    s.b = state.b || null;
    s.mix = state.mix || 0;
    s.mode = state.mode || 0;
    const bl = state.bloom || {};
    this.bloom.strength = bl.strength ?? 0.8;
    this.bloom.radius = bl.radius ?? 0.55;
    this.bloom.threshold = bl.threshold ?? 0.72;
    const u = this.final.uniforms;
    u.uExposure.value = state.exposure ?? 1;
    u.uFade.value = state.fade ?? 1;
    u.uTime.value = state.time ?? 0;
    u.uFlash.value = state.flash ?? 0;
    const g = state.grade || {};
    u.uVignette.value = g.vignette ?? 0.55;
    u.uSat.value = g.sat ?? 1.05;
    u.uGrain.value = g.grain ?? 0.035;
    this.composer.render(1 / 60);
    this.frame++;
  }
  compile(scene, camera) {
    this.r.compile(scene, camera);
  }
}
