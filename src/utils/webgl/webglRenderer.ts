import type { RegularGrid2D } from '@/utils/geophysics/interpolation';
import type { ColormapName } from '@/utils/geophysics/colormaps';
import type { InterpolationMethod } from '@/types';

// GLSL ES 3.00 Vertex Shader Source
const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  // Flip Y so row 0 (max latitude / North) is rendered at the top of the canvas
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// GLSL ES 3.00 Fragment Shader Source
const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_gridTexture;
uniform vec2 u_gridDimensions; // (ncols, nrows)
uniform float u_minVal;
uniform float u_maxVal;
uniform int u_colormap;       // 0=gebco, 1=coolwarm, 2=viridis, 3=rainbow
uniform int u_interpMethod;   // 0=nearest, 1=bilinear, 2=bicubic, 3=spline, 4=idw

// 1D Cubic Hermite / Catmull-Rom spline kernel
float cubicHermite(float p0, float p1, float p2, float p3, float t) {
  float a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  float b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  float c = -0.5 * p0 + 0.5 * p2;
  float d = p1;
  return a * t * t * t + b * t * t + c * t + d;
}

// 2D Bicubic Catmull-Rom Sampling on 4x4 Grid in GLSL
float sampleBicubic(sampler2D tex, vec2 uv, vec2 texSize) {
  vec2 texel = 1.0 / texSize;
  vec2 pos = uv * texSize - 0.5;
  vec2 f = fract(pos);
  vec2 base = (floor(pos) + 0.5) * texel;

  float rows[4];
  for (int j = -1; j <= 2; j++) {
    float c0 = texture(tex, base + vec2(-1.0, float(j)) * texel).r;
    float c1 = texture(tex, base + vec2(0.0, float(j)) * texel).r;
    float c2 = texture(tex, base + vec2(1.0, float(j)) * texel).r;
    float c3 = texture(tex, base + vec2(2.0, float(j)) * texel).r;
    rows[j + 1] = cubicHermite(c0, c1, c2, c3, f.x);
  }
  return cubicHermite(rows[0], rows[1], rows[2], rows[3], f.y);
}

// Colormap 1: Coolwarm (Diverging Blue - White - Red)
vec3 colormapCoolwarm(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 cLow = vec3(0.23, 0.299, 0.754);
  vec3 cMid = vec3(0.865, 0.865, 0.865);
  vec3 cHigh = vec3(0.706, 0.016, 0.15);
  if (t < 0.5) {
    return mix(cLow, cMid, t * 2.0);
  } else {
    return mix(cMid, cHigh, (t - 0.5) * 2.0);
  }
}

// Colormap 2: Viridis (Perceptually Uniform Sequential)
vec3 colormapViridis(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.267, 0.004, 0.329);
  vec3 c1 = vec3(0.191, 0.407, 0.556);
  vec3 c2 = vec3(0.128, 0.647, 0.557);
  vec3 c3 = vec3(0.578, 0.828, 0.258);
  vec3 c4 = vec3(0.993, 0.906, 0.144);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}

// Colormap 3: GEBCO Standard Bathymetry & Topography
vec3 colormapGebco(float rawVal, float minVal, float maxVal) {
  if (rawVal < 0.0) {
    // Marine / Seafloor: Deep ocean navy to light coastal blue
    float depthNorm = clamp((rawVal - minVal) / (-minVal + 0.001), 0.0, 1.0);
    vec3 deepNavy = vec3(0.012, 0.078, 0.251);
    vec3 midOcean = vec3(0.078, 0.353, 0.667);
    vec3 coastCyan = vec3(0.439, 0.749, 0.878);
    if (depthNorm < 0.5) {
      return mix(deepNavy, midOcean, depthNorm * 2.0);
    } else {
      return mix(midOcean, coastCyan, (depthNorm - 0.5) * 2.0);
    }
  } else {
    // Land / Continental: Coastal green to highland brown to peak snow
    float elevNorm = clamp(rawVal / (maxVal + 0.001), 0.0, 1.0);
    vec3 green = vec3(0.235, 0.549, 0.235);
    vec3 yellow = vec3(0.855, 0.749, 0.353);
    vec3 brown = vec3(0.545, 0.271, 0.075);
    vec3 snow = vec3(0.941, 0.941, 0.941);
    if (elevNorm < 0.33) return mix(green, yellow, elevNorm / 0.33);
    if (elevNorm < 0.66) return mix(yellow, brown, (elevNorm - 0.33) / 0.33);
    return mix(brown, snow, (elevNorm - 0.66) / 0.34);
  }
}

// Colormap 4: Jet / Rainbow
vec3 colormapRainbow(float t) {
  t = clamp(t, 0.0, 1.0);
  float r = clamp(1.5 - abs(t * 4.0 - 3.0), 0.0, 1.0);
  float g = clamp(1.5 - abs(t * 4.0 - 2.0), 0.0, 1.0);
  float b = clamp(1.5 - abs(t * 4.0 - 1.0), 0.0, 1.0);
  return vec3(r, g, b);
}

void main() {
  vec2 uv = clamp(v_uv, 0.0, 1.0);
  float val = 0.0;

  if (u_interpMethod == 0) {
    // Nearest neighbor
    val = texture(u_gridTexture, uv).r;
  } else if (u_interpMethod == 1) {
    // Bilinear
    val = texture(u_gridTexture, uv).r;
  } else {
    // Bicubic / Spline
    val = sampleBicubic(u_gridTexture, uv, u_gridDimensions);
  }

  // Handle missing data NaN check (fallback or transparent)
  if (isnan(val)) {
    fragColor = vec4(0.1, 0.1, 0.1, 1.0);
    return;
  }

  float range = u_maxVal - u_minVal;
  if (range <= 0.0001) range = 1.0;
  float t = clamp((val - u_minVal) / range, 0.0, 1.0);

  vec3 rgb = vec3(0.0);
  if (u_colormap == 0) {
    rgb = colormapGebco(val, u_minVal, u_maxVal);
  } else if (u_colormap == 1) {
    rgb = colormapCoolwarm(t);
  } else if (u_colormap == 2) {
    rgb = colormapViridis(t);
  } else {
    rgb = colormapRainbow(t);
  }

  fragColor = vec4(rgb, 1.0);
}
`;

interface WebGLContextBundle {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  positionBuffer: WebGLBuffer;
  loc: {
    a_position: number;
    u_gridTexture: WebGLUniformLocation | null;
    u_gridDimensions: WebGLUniformLocation | null;
    u_minVal: WebGLUniformLocation | null;
    u_maxVal: WebGLUniformLocation | null;
    u_colormap: WebGLUniformLocation | null;
    u_interpMethod: WebGLUniformLocation | null;
  };
}

const contextCache = new WeakMap<HTMLCanvasElement, WebGLContextBundle>();

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[WebGL2] Shader compilation error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initWebGL2(canvas: HTMLCanvasElement): WebGLContextBundle | null {
  const cached = contextCache.get(canvas);
  if (cached) return cached;

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    console.warn('[WebGL2] WebGL 2.0 context is not available on this canvas');
    return null;
  }

  // Ensure EXT_color_buffer_float if available
  gl.getExtension('EXT_color_buffer_float');

  const vertShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  if (!vertShader || !fragShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[WebGL2] Program linking error:', gl.getProgramInfoLog(program));
    return null;
  }

  // Full-screen quad geometry
  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const quadPositions = new Float32Array([
    -1.0, -1.0,
     1.0, -1.0,
    -1.0,  1.0,
    -1.0,  1.0,
     1.0, -1.0,
     1.0,  1.0,
  ]);
  gl.bufferData(gl.ARRAY_BUFFER, quadPositions, gl.STATIC_DRAW);

  // Texture creation
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const loc = {
    a_position: gl.getAttribLocation(program, 'a_position'),
    u_gridTexture: gl.getUniformLocation(program, 'u_gridTexture'),
    u_gridDimensions: gl.getUniformLocation(program, 'u_gridDimensions'),
    u_minVal: gl.getUniformLocation(program, 'u_minVal'),
    u_maxVal: gl.getUniformLocation(program, 'u_maxVal'),
    u_colormap: gl.getUniformLocation(program, 'u_colormap'),
    u_interpMethod: gl.getUniformLocation(program, 'u_interpMethod'),
  };

  const bundle: WebGLContextBundle = {
    gl,
    program,
    texture,
    positionBuffer,
    loc,
  };

  contextCache.set(canvas, bundle);
  return bundle;
}

/**
 * High-performance GPU rasterization of a 2D regular matrix using WebGL 2.0.
 */
export function renderWebGL2Raster(
  canvas: HTMLCanvasElement,
  grid: RegularGrid2D,
  colormap: ColormapName,
  method: InterpolationMethod = 'bicubic'
): boolean {
  const bundle = initWebGL2(canvas);
  if (!bundle) return false;

  const { gl, program, texture, positionBuffer, loc } = bundle;
  const { nrows, ncols, data, minVal, maxVal } = grid;

  if (nrows === 0 || ncols === 0 || data.length === 0) return false;

  // Resize canvas viewport to match dimensions if needed
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);

  // Upload Grid to R32F Float Texture on GPU
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set filter based on interpolation method
  if (method === 'nearest') {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  // Upload R32F 32-bit floating point matrix directly to GPU VRAM
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32F,
    ncols,
    nrows,
    0,
    gl.RED,
    gl.FLOAT,
    data
  );

  gl.uniform1i(loc.u_gridTexture, 0);
  gl.uniform2f(loc.u_gridDimensions, ncols, nrows);
  gl.uniform1f(loc.u_minVal, minVal);
  gl.uniform1f(loc.u_maxVal, maxVal);

  // Map colormap enum
  let colormapCode = 0; // gebco
  if (colormap === 'coolwarm') colormapCode = 1;
  else if (colormap === 'viridis') colormapCode = 2;
  else if (colormap === 'turbo') colormapCode = 3;
  gl.uniform1i(loc.u_colormap, colormapCode);

  // Map interpolation method enum
  let methodCode = 2; // bicubic
  if (method === 'nearest') methodCode = 0;
  else if (method === 'bilinear') methodCode = 1;
  else if (method === 'spline') methodCode = 3;
  else if (method === 'idw') methodCode = 4;
  gl.uniform1i(loc.u_interpMethod, methodCode);

  // Bind full-screen quad vertex buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(loc.a_position);
  gl.vertexAttribPointer(loc.a_position, 2, gl.FLOAT, false, 0, 0);

  // Draw fullscreen quad via GPU shader
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  return true;
}
