/**
 * WebGL Capability & Standard Verification Utility.
 * Checks whether the user's browser/device supports WebGL hardware acceleration
 * and necessary extensions (floating point textures, max texture size >= 2048).
 */

export interface WebGLSupportStatus {
  isSupported: boolean;
  version: 'webgl2' | 'webgl1' | 'none';
  renderer?: string;
  vendor?: string;
  maxTextureSize: number;
  reason?: string;
}

export function checkWebGLSupport(): WebGLSupportStatus {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      isSupported: false,
      version: 'none',
      maxTextureSize: 0,
      reason: 'Server-side rendering environment',
    };
  }

  try {
    const canvas = document.createElement('canvas');
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    let version: 'webgl2' | 'webgl1' | 'none' = 'none';

    // 1. Try WebGL 2 first
    gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl) {
      version = 'webgl2';
    } else {
      // 2. Try WebGL 1
      gl = (canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (gl) {
        version = 'webgl1';
      }
    }

    if (!gl) {
      return {
        isSupported: false,
        version: 'none',
        maxTextureSize: 0,
        reason: 'WebGL is disabled or not supported by graphics drivers / browser.',
      };
    }

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    if (maxTextureSize < 1024) {
      return {
        isSupported: false,
        version,
        maxTextureSize,
        reason: `GPU texture limit (${maxTextureSize}px) is below minimum standard (1024px).`,
      };
    }

    // Extract GPU debug info if available
    let renderer = 'Standard WebGL Hardware';
    let vendor = 'Standard GPU';
    const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbgExt) {
      renderer = gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) || renderer;
      vendor = gl.getParameter(dbgExt.UNMASKED_VENDOR_WEBGL) || vendor;
    }

    return {
      isSupported: true,
      version,
      renderer,
      vendor,
      maxTextureSize,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown WebGL initialization error';
    return {
      isSupported: false,
      version: 'none',
      maxTextureSize: 0,
      reason: msg,
    };
  }
}
