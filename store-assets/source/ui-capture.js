// Loads ui.html in an off-screen iframe and returns its capture of the real popup or settings page.
const uiCache = new Map();

export function captureUi(page, locale, query = '', frameWidth = page === 'options' ? 840 : 360) {
  const key = `${page}:${locale}:${query}:${frameWidth}`;
  if (!uiCache.has(key)) {
    uiCache.set(
      key,
      new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.style.cssText = `position:absolute;left:-10000px;top:0;width:${frameWidth}px;height:1600px;border:0;`;
        frame.src = `./ui.html?page=${page}&locale=${locale}&${query}`;
        frame.addEventListener('load', async () => {
          try {
            for (let attempt = 0; attempt < 400 && !frame.contentWindow.uiReady; attempt += 1) {
              await new Promise((wait) => setTimeout(wait, 25));
            }
            resolve(await frame.contentWindow.captureUi());
          } catch (error) {
            reject(error);
          } finally {
            frame.remove();
          }
        });
        document.body.append(frame);
      })
    );
  }
  return uiCache.get(key);
}
