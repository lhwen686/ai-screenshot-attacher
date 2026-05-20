# Architecture

AI Screenshot Attacher is a Manifest V3 Chrome/Edge extension built with Vite, TypeScript, and React.

## Runtime Pieces

- Popup and options pages are React views under `src/popup` and `src/options`.
- The service worker under `src/background` handles commands, popup messages, tab selection, auto-monitor coordination, and operation feedback.
- The offscreen document under `src/offscreen` performs DOM clipboard reads and writes that the service worker cannot do directly.
- The content runtime under `src/content` is injected into supported AI pages and delegates attachment behavior to target adapters.
- Target adapters under `src/adapters` encapsulate site-specific selectors and attachment strategies.

## Data Flow

Manual attach flow:

1. User triggers a command or popup button.
2. Service worker reads current settings and asks the offscreen document for a clipboard image.
3. Service worker opens or focuses the selected AI target tab according to settings.
4. Service worker injects the content runtime and sends the image payload.
5. The target adapter tries paste, file input, drop, or target-specific strategies.
6. On failure, the service worker can write the image back to the clipboard and focus the target input for manual paste.

Automatic attach flow:

1. User enables automatic mode in options.
2. Service worker starts the offscreen monitor only while supported AI pages are open.
3. The monitor fingerprints clipboard images and reports new images.
4. Service worker attaches to the best open supported target without opening new pages.

## Engineering Boundaries

- Do not broaden host permissions without a specific target-site need.
- Do not auto-send user messages.
- Do not store screenshot history or chat content.
- Keep target-specific DOM assumptions inside adapters.
- Keep browser-extension APIs behind mockable modules when adding tests.
