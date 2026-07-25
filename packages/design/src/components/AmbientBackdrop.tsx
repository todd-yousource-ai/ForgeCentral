// packages/design/src/components/AmbientBackdrop.tsx -- the living ambient glow layer (the SOC Ops
// visual-language proof, TRD-CONSOLE-03 direction).
//
// The HONEYCOMB stays the identity backdrop (operator direction 2026-07-25): the shell already ships
// the brand honeycomb as the fixed app background, and this layer must never obscure it. What this
// adds is living depth: a TRANSLUCENT WebGL layer of slow, domain-warped light wisps in the brand
// palette, alpha-composited over the honeycomb so the lattice reads through everywhere. One fragment
// shader, zero dependencies. The colors are NOT literals -- they are read at mount from the
// design-token custom properties, so the ambient recolors with the theme
// (INV-CONSOLE-DESIGN-SEMANTIC-COLOR).
//
// Honesty + accessibility + performance contract:
//   - Pure decoration: `aria-hidden`, `pointer-events: none`, never carries information.
//   - `prefers-reduced-motion`: draws exactly ONE frame and stops (still beautiful, never moving).
//   - No WebGL (jsdom, hardened browsers, remote desktops): renders the static token-gradient
//     fallback div instead -- the page is identical minus the shader.
//   - Pauses when the document is hidden; devicePixelRatio capped so 4K canvases stay cheap.

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

/**
 * Fragment shader: domain-warped value-noise light wisps, output as PREMULTIPLIED translucent color
 * so the layer composites over the honeycomb backdrop without ever hiding it. Peak alpha stays low
 * (TUNE: ~0.34 at the densest wisp; above ~0.5 the lattice starts to wash out).
 */
const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_t;
uniform vec3 u_deep;
uniform vec3 u_brand;
uniform vec3 u_accent;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * noise(p); p = p * 2.03 + 17.7; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 2.2;
  float t = u_t * 0.012;
  // Domain-warped drift: the light breathes across the honeycomb rather than scrolling over it.
  vec2 warp = vec2(fbm(p + vec2(t, -t * 0.6)), fbm(p + vec2(-t * 0.4, t)));
  float n = fbm(p + 1.6 * warp);
  float wisp = smoothstep(0.40, 0.90, n);
  // Brand-deep light, a breath of teal, a rare amber ember -- weighted into one translucent glow.
  float aDeep = wisp * 0.26;
  float aBrand = smoothstep(0.66, 0.96, n) * 0.10;
  float aAccent = smoothstep(0.82, 0.99, fbm(p * 1.7 - warp + t)) * 0.06;
  vec3 col = u_deep * aDeep + u_brand * aBrand + u_accent * aAccent;
  float alpha = aDeep + aBrand + aAccent;
  // A soft focal lift toward the upper third, so the glass panels sit in the brightest light.
  float focal = smoothstep(1.25, 0.30, distance(uv, vec2(0.5, 0.62)));
  gl_FragColor = vec4(col * (0.7 + 0.3 * focal), alpha * (0.7 + 0.3 * focal));
}
`;

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/** Parse a `#rrggbb` token value to normalized RGB; a non-hex value falls back to near-black. */
function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.02, 0.04, 0.08];
  const v = Number.parseInt(m[1] ?? '000000', 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

/** TUNE: DPR cap. The nebula is soft by design; rendering past 1.5x wastes GPU on invisible detail. */
const MAX_DPR = 1.5;

/**
 * The ambient nebula. Mount once per surface, absolutely positioned behind the content by the
 * `fc-ambient` stylesheet rules; the parent supplies `position: relative`.
 */
export function AmbientBackdrop(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      setWebglFailed(true);
      return undefined;
    }

    // Compile the pair; any driver refusal falls back to the static gradient (never a blank layer).
    const compile = (type: number, src: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!(gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean)) return null;
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setWebglFailed(true);
      return undefined;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!(gl.getProgramParameter(program, gl.LINK_STATUS) as boolean)) {
      setWebglFailed(true);
      return undefined;
    }
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // The palette comes from the live token custom properties, never literals.
    const styles = getComputedStyle(canvas);
    const token = (name: string): readonly [number, number, number] =>
      hexToRgb(styles.getPropertyValue(name));
    const uRes = gl.getUniformLocation(program, 'u_res');
    const uT = gl.getUniformLocation(program, 'u_t');
    gl.uniform3fv(gl.getUniformLocation(program, 'u_deep'), [...token('--fc-color-brand-deep')]);
    gl.uniform3fv(gl.getUniformLocation(program, 'u_brand'), [
      ...token('--fc-color-brand-primary'),
    ]);
    gl.uniform3fv(gl.getUniformLocation(program, 'u_accent'), [
      ...token('--fc-color-flow-objects'),
    ]);

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const resize = (): void => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    };
    resize();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const started = performance.now();
    const draw = (now: number): void => {
      resize();
      gl.uniform1f(uT, (now - started) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (now: number): void => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = (): void => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reducedMotion) raf = requestAnimationFrame(loop);
    };

    // Reduced motion: one still frame. Otherwise: the slow drift, paused while the tab is hidden.
    draw(started);
    if (!reducedMotion) raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return webglFailed ? (
    <div className="fc-ambient fc-ambient--static" aria-hidden="true" data-ambient="static" />
  ) : (
    <canvas className="fc-ambient" aria-hidden="true" data-ambient="live" ref={canvasRef} />
  );
}
