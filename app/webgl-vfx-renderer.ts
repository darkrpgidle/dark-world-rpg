export type VfxColor = [number, number, number, number];

const VERTEX_SHADER = `#version 300 es
in vec2 a_corner;
uniform vec2 u_resolution;
uniform vec4 u_rect;
uniform float u_rotation;
out vec2 v_uv;
void main() {
  v_uv = a_corner;
  vec2 local = (a_corner - 0.5) * u_rect.zw;
  float c = cos(u_rotation), s = sin(u_rotation);
  vec2 position = u_rect.xy + u_rect.zw * 0.5 + mat2(c, s, -s, c) * local;
  vec2 clip = position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec4 u_uv_rect;
uniform vec4 u_color;
uniform float u_mode;
uniform float u_ring_width;
out vec4 output_color;
void main() {
  if (u_mode < 0.5) {
    output_color = texture(u_texture, u_uv_rect.xy + v_uv * u_uv_rect.zw) * u_color;
    return;
  }
  float distance_from_center = length((v_uv - 0.5) * 2.0);
  float coverage = 1.0;
  if (u_mode < 1.5) coverage = 1.0 - smoothstep(0.96, 1.0, distance_from_center);
  else if (u_mode < 2.5) coverage = smoothstep(1.0 - u_ring_width - 0.03, 1.0 - u_ring_width, distance_from_center)
    * (1.0 - smoothstep(0.97, 1.0, distance_from_center));
  else coverage = pow(max(0.0, 1.0 - distance_from_center), 2.0);
  output_color = vec4(u_color.rgb, u_color.a * coverage);
}`;

function compileShader(gl: WebGL2RenderingContext, kind: number, source: string) {
  const value = gl.createShader(kind);
  if (!value) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(value) ?? "Unable to compile WebGL shader";
    gl.deleteShader(value);
    throw new Error(message);
  }
  return value;
}

export class WebGLVfxRenderer {
  readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly textures = new Map<HTMLImageElement, WebGLTexture>();
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private width = 1;
  private height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    // Blending stores premultiplied RGB in the transparent framebuffer.
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create WebGL program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? "Unable to link WebGL program";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    this.program = program;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Unable to create WebGL buffer");
    this.buffer = buffer;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "a_corner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(["u_resolution", "u_rect", "u_rotation", "u_uv_rect", "u_color", "u_mode", "u_ring_width", "u_texture"]
      .map((name) => [name, gl.getUniformLocation(program, name)]));
    gl.uniform1i(this.uniforms.u_texture, 0);
    gl.enable(gl.BLEND);
  }

  resize(logicalWidth?: number, logicalHeight?: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, logicalWidth ?? rect.width);
    this.height = Math.max(1, logicalHeight ?? rect.height);
    const pixelWidth = Math.max(1, Math.round(this.width * ratio));
    const pixelHeight = Math.max(1, Math.round(this.height * ratio));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.uniforms.u_resolution, this.width, this.height);
  }

  clear() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private draw(x: number, y: number, width: number, height: number, mode: number, color: VfxColor,
    rotation = 0, uv: [number, number, number, number] = [0, 0, 1, 1], ringWidth = 0.08, additive = false) {
    if (width <= 0 || height <= 0 || color[3] <= 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.blendFuncSeparate(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform4f(this.uniforms.u_rect, x, y, width, height);
    gl.uniform1f(this.uniforms.u_rotation, rotation);
    gl.uniform4f(this.uniforms.u_uv_rect, ...uv);
    gl.uniform4f(this.uniforms.u_color, ...color);
    gl.uniform1f(this.uniforms.u_mode, mode);
    gl.uniform1f(this.uniforms.u_ring_width, ringWidth);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  sprite(image: HTMLImageElement, x: number, y: number, width: number, height: number, opacity = 1, additive = false,
    uv: [number, number, number, number] = [0, 0, 1, 1], rotation = 0) {
    if (!image.complete || !image.naturalWidth) return;
    let texture = this.textures.get(image);
    if (!texture) {
      const created = this.gl.createTexture();
      if (!created) throw new Error("Unable to create WebGL texture");
      texture = created;
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      // Atlas UVs and quads use top-left coordinates, matching Canvas drawImage.
      // Flipping on upload would select the opposite row and invert the artwork.
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
      this.textures.set(image, texture);
    } else this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.draw(x, y, width, height, 0, [1, 1, 1, Math.max(0, Math.min(1, opacity))], rotation, uv, 0, additive);
  }

  ring(x: number, y: number, radius: number, thickness: number, color: VfxColor, additive = true) {
    this.draw(x - radius, y - radius, radius * 2, radius * 2, 2, color, 0, [0, 0, 1, 1],
      Math.min(0.8, thickness / Math.max(radius, 1)), additive);
  }

  glow(x: number, y: number, radius: number, color: VfxColor) {
    this.draw(x - radius, y - radius, radius * 2, radius * 2, 3, color, 0, [0, 0, 1, 1], 0, true);
  }

  dispose() {
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture);
    this.textures.clear();
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
