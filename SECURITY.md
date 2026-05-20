# Security Policy

## Supported Versions

Only the latest code on `main` is actively maintained before a formal release channel exists.

## Reporting a Vulnerability

Open a private report if the hosting platform supports it, or contact the maintainer directly. Do not publish:

- API keys, tokens, cookies, or passwords.
- Private screenshots or chat content.
- Full browser profile data.

## Security Boundaries

The extension:

- Reads clipboard images only after explicit user action or after automatic mode is enabled.
- Does not send AI messages automatically.
- Does not read chat history.
- Does not store screenshot history.
- Does not upload screenshots to an extension-author server.

Keep permissions and host permissions as narrow as possible.
