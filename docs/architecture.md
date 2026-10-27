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

Overlapping manual triggers for the same captured image and target share the completed result while the queue drains. Once that batch ends, a later deliberate repeat is allowed. Disabling the automatic monitor invalidates pending target-selection work; it cannot revoke a browser operation already dispatched.

## Grok Adapter

`src/adapters/grok.ts` targets only the HTTPS host `grok.com`. It finds a visible editor under `form[data-composer="true"] [data-testid="chat-input"]`. Its attachment scope is the whole composer form because Grok places the hidden file input outside the editor's query bar.

The adapter tries the captured `File` through that form's file input, then synthetic paste/drop if no mutation has occurred. It stops on an unconfirmed mutation, does not use the later system clipboard contents, and does not click upload-menu or send buttons. The sanitized fixture under `tests/fixtures` represents the public composer observed on 2026-10-27; signed-in upload acceptance requires separate browser validation.

## Engineering Boundaries

- Do not broaden host permissions without a specific target-site need.
- Do not auto-send user messages.
- Do not store screenshot history or chat content.
- Keep target-specific DOM assumptions inside adapters.
- Keep browser-extension APIs behind mockable modules when adding tests.
