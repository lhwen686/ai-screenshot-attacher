// A browser tab that is not on screen never paints, so img.decode() and requestAnimationFrame() never settle there.
// html-to-image waits on both after an image has already loaded; resolving them right away keeps captures working.
export function allowRenderingWithoutPaint() {
  HTMLImageElement.prototype.decode = function decode() {
    return Promise.resolve();
  };
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
}
