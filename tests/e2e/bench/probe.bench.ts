// @fixture tiny
// PROTOTYPE (S14 spike, throwaway): what the Tauri webview (WebKitGTK) offers for a canvas renderer.
import { browser } from '@wdio/globals';
import { openRelief } from '../helpers/open-relief';

it('probes the webview for canvas, WebGL and workers', async () => {
  await openRelief({ size: { width: 1600, height: 900 } });
  const info = await browser.execute(() => {
    const gl = (kind: string) => {
      const c = document.createElement('canvas');
      const ctx = c.getContext(kind) as WebGLRenderingContext | null;
      if (!ctx) return null;
      const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
      return {
        version: ctx.getParameter(ctx.VERSION),
        renderer: dbg
          ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
          : ctx.getParameter(ctx.RENDERER),
        vendor: dbg ? ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : ctx.getParameter(ctx.VENDOR),
        maxTexture: ctx.getParameter(ctx.MAX_TEXTURE_SIZE),
      };
    };
    // Canvas 2D throughput: 5,000 bezier strokes + 1,500 rects with text on a 1600x900 canvas.
    const c = document.createElement('canvas');
    c.width = 1600 * devicePixelRatio;
    c.height = 900 * devicePixelRatio;
    const ctx = c.getContext('2d')!;
    const t0 = performance.now();
    for (let k = 0; k < 3; k++) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.beginPath();
      for (let i = 0; i < 5000; i++) {
        const x = (i * 37) % 1600;
        const y = (i * 91) % 900;
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 40, y, x + 80, y + 60, x + 120, y + 60);
      }
      ctx.stroke();
      ctx.font = '12px sans-serif';
      for (let i = 0; i < 1500; i++) {
        const x = (i * 53) % 1600;
        const y = (i * 29) % 900;
        ctx.strokeRect(x, y, 80, 24);
        ctx.fillText('file-name.tsx', x + 4, y + 16);
      }
      ctx.getImageData(0, 0, 1, 1);
    }
    const canvas2dMs = (performance.now() - t0) / 3;
    return {
      ua: navigator.userAgent,
      dpr: devicePixelRatio,
      webgl: gl('webgl'),
      webgl2: gl('webgl2'),
      webgpu: 'gpu' in navigator,
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      offscreen2d:
        typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('2d'),
      offscreenWebgl2:
        typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2'),
      transferControl: 'transferControlToOffscreen' in HTMLCanvasElement.prototype,
      worker: typeof Worker !== 'undefined',
      path2dFromSvg: (() => {
        try {
          return !!new Path2D('M0 0 C 10 10 20 20 30 30');
        } catch {
          return false;
        }
      })(),
      canvas2dMs,
    };
  });
  console.log(`probe: ${JSON.stringify(info)}`);
});
