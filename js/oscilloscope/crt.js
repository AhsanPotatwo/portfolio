// oscilloscope playground: the tube. the beam's path from signals.js is drawn with webgl2 into a
// float buffer that fades the way phosphor does, then glows. each piece of path is drawn as a
// gaussian spot sliding along it, integrated, so brightness depends on how long the beam spent
// there: slow parts burn bright, fast edges are faint lines, a parked dot is a hot spot
(function () {
  'use strict';

  // two afterglows per phosphor, a quick one and a slow one, each with its own colour and fade time
  const TUBES = {
    P31: { fast: [0.3, 1, 0.42], slow: [0.2, 0.8, 0.3], decay: [0.03, 0.22], weight: [1, 0.06] },
    P7: { fast: [0.62, 0.74, 1], slow: [0.8, 1, 0.22], decay: [0.022, 1.4], weight: [0.75, 0.05] },
    P1: { fast: [0.45, 1, 0.25], slow: [0.4, 0.95, 0.2], decay: [0.06, 0.3], weight: [1, 0.05] },
    P4: { fast: [0.9, 0.93, 1], slow: [0.95, 0.88, 0.72], decay: [0.028, 0.18], weight: [1, 0.05] },
  };
  // the canvas shows a little past the graticule's 10 x 8 divisions
  const VIEW_W = 11.2, VIEW_H = 9.2;

  const FULL_VS = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const BEAM_VS = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 seg;
layout(location = 2) in float energy;
uniform float sigma;
uniform vec2 rot;
out vec2 vP;
out float vL;
out float vE;
void main() {
  vec2 a = seg.xy, d = seg.zw - seg.xy;
  float L = length(d);
  vec2 dir = L > 1e-6 ? d / L : vec2(1.0, 0.0);
  vec2 nr = vec2(-dir.y, dir.x);
  float ext = 3.2 * sigma;
  float along = corner.x < 0.0 ? -ext : L + ext;
  float perp = corner.y * ext;
  vP = vec2(along, perp);
  vL = L;
  vE = energy;
  vec2 c = a + dir * along + nr * perp - vec2(5.0, 0.0);
  c = vec2(c.x * rot.x - c.y * rot.y, c.x * rot.y + c.y * rot.x);
  gl_Position = vec4(c.x / ${VIEW_W / 2}, c.y / ${VIEW_H / 2}, 0.0, 1.0);
}`;

  const BEAM_FS = `#version 300 es
precision highp float;
in vec2 vP;
in float vL;
in float vE;
uniform float sigma;
uniform vec2 weight;
out vec4 o;
float erf(float x) {
  float a = abs(x), t = 1.0 / (1.0 + 0.3275911 * a);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return sign(x) * y;
}
void main() {
  float s2 = sigma * 1.4142136, norm = 1.0 / (2.5066283 * sigma);
  float across = exp(-vP.y * vP.y / (s2 * s2)) * norm;
  float along = vL > sigma * 0.02
    ? 0.5 * (erf(vP.x / s2) - erf((vP.x - vL) / s2)) / vL
    : exp(-vP.x * vP.x / (s2 * s2)) * norm;
  o = vec4(vE * across * along * weight, 0.0, 1.0);
}`;

  const CLEAR_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

  const DOWN_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
uniform vec2 px;
out vec4 o;
void main() {
  o = 0.25 * (texture(src, uv + px * vec2(-1.0, -1.0)) + texture(src, uv + px * vec2(1.0, -1.0))
            + texture(src, uv + px * vec2(-1.0, 1.0)) + texture(src, uv + px * vec2(1.0, 1.0)));
}`;

  const BLUR_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
uniform vec2 dir;
out vec4 o;
void main() {
  vec4 s = texture(src, uv) * 0.2270270;
  s += (texture(src, uv + dir * 1.3846154) + texture(src, uv - dir * 1.3846154)) * 0.3162162;
  s += (texture(src, uv + dir * 3.2307692) + texture(src, uv - dir * 3.2307692)) * 0.0702703;
  o = s;
}`;

  const SHOW_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D acc;
uniform sampler2D glow;
uniform vec3 colF;
uniform vec3 colS;
uniform float expo;
out vec4 o;
void main() {
  vec2 a = texture(acc, uv).rg * expo;
  vec2 g = texture(glow, uv).rg * expo;
  vec2 e = pow(a + g * 1.6, vec2(0.75)) * 1.25;
  vec3 c = colF * (1.0 - exp(-e.x)) + colS * (1.0 - exp(-e.y));
  // a hard-driven spot washes out towards white in the middle
  float hot = 1.0 - exp(-(a.x + a.y) * 0.12);
  c = mix(c, vec3(1.0, 1.0, 0.96), hot * hot * 0.6);
  vec2 p = uv * 2.0 - 1.0;
  vec3 base = vec3(0.05, 0.062, 0.058) * (1.0 - 0.3 * dot(p, p));
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(base + c + (n - 0.5) / 255.0, 1.0);
}`;

  function compile(gl, vs, fs) {
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(prog, i).name;
      u[name] = gl.getUniformLocation(prog, name);
    }
    return { prog, u };
  }

  function CRT(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('webgl2 unavailable');
    this.gl = gl;
    this.canvas = canvas;
    // a float buffer lets the glow fade all the way to black; plain bytes get stuck on a faint ghost
    this.float = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.p = {
      beam: compile(gl, BEAM_VS, BEAM_FS),
      clear: compile(gl, FULL_VS, CLEAR_FS),
      down: compile(gl, FULL_VS, DOWN_FS),
      blur: compile(gl, FULL_VS, BLUR_FS),
      show: compile(gl, FULL_VS, SHOW_FS),
    };
    this.empty = gl.createVertexArray();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, 60000 * 20, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    this.w = 0; this.h = 0;
  }

  CRT.prototype.target = function (w, h) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  };

  CRT.prototype.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(16, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(16, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    for (const t of [this.acc, this.g1, this.g2]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    this.canvas.width = this.w = w;
    this.canvas.height = this.h = h;
    this.acc = this.target(w, h);
    const gw = Math.ceil(w / 4), gh = Math.ceil(h / 4);
    this.g1 = this.target(gw, gh);
    this.g2 = this.target(gw, gh);
  };

  CRT.prototype.pass = function (p, dst) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
    gl.useProgram(p.prog);
    gl.bindVertexArray(this.empty);
    return p.u;
  };
  CRT.prototype.full = function () { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); };
  CRT.prototype.bind = function (unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  };

  // seg holds n pieces of path (x0, y0, x1, y1, energy) in divisions from the left edge and centre
  // line. opts: sigma (spot size in divisions), rot (radians), tube (a TUBES key)
  CRT.prototype.draw = function (seg, n, dt, opts) {
    this.resize();
    const gl = this.gl, tube = TUBES[opts.tube] || TUBES.P31;

    // fade what's there, each afterglow at its own rate
    let u = this.pass(this.p.clear, this.acc);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
    gl.blendColor(Math.exp(-dt / tube.decay[0]), Math.exp(-dt / tube.decay[1]), 0, 1);
    this.full();

    if (n > 0) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.p.beam.prog);
      u = this.p.beam.u;
      gl.uniform1f(u.sigma, Math.max(opts.sigma, 0.6 * VIEW_W / this.w));
      gl.uniform2f(u.rot, Math.cos(opts.rot), Math.sin(opts.rot));
      gl.uniform2f(u.weight, tube.weight[0], tube.weight[1]);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, seg, 0, n * 5);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    gl.disable(gl.BLEND);

    // the halo: a quarter size copy, blurred both ways
    u = this.pass(this.p.down, this.g1);
    this.bind(0, this.acc.tex);
    gl.uniform1i(u.src, 0);
    gl.uniform2f(u.px, 1 / this.w, 1 / this.h);
    this.full();
    for (const r of [1, 2]) {
      u = this.pass(this.p.blur, this.g2);
      this.bind(0, this.g1.tex);
      gl.uniform1i(u.src, 0);
      gl.uniform2f(u.dir, r / this.g1.w, 0);
      this.full();
      u = this.pass(this.p.blur, this.g1);
      this.bind(0, this.g2.tex);
      gl.uniform1i(u.src, 0);
      gl.uniform2f(u.dir, 0, r / this.g1.h);
      this.full();
    }

    u = this.pass(this.p.show, null);
    this.bind(0, this.acc.tex);
    this.bind(1, this.g1.tex);
    gl.uniform1i(u.acc, 0);
    gl.uniform1i(u.glow, 1);
    gl.uniform3fv(u.colF, tube.fast);
    gl.uniform3fv(u.colS, tube.slow);
    gl.uniform1f(u.expo, 0.5);
    this.full();
  };

  CRT.TUBES = TUBES;
  window.OscCRT = CRT;
})();
