# Contributing

Bug reports and fixes are welcome. Hidden Roof is not open source: the code is public to read, and the [LICENSE](LICENSE) says what else you may do with it.

## Reporting a bug

Open an issue on GitHub (or tell it in the Discord). It helps to have:

- what you did, step by step, and what you expected
- your browser and its version, your OS, and your GPU
- whether it happens in single player, in a multiplayer session or both
- a screenshot or a short clip, if it is about how something looks
- in a multiplayer session that failed: the Multiplayer page of the ESC menu offers COPY NETWORK LOG after a failure; paste it into the issue
- if you run the dev build (`npm run dev`): the F3 panel's values or a copy of its settings, if they matter

## Sending a fix

Fork the repository on GitHub, change it there and open a pull request. For anything bigger than a small fix, open an issue first, so you do not spend time on something that will not fit.

Before you open the pull request, run `npm run check:quick` (types, unit tests, build). `AGENTS.md` and `docs/testing.md` say how the code is kept: small and fast, with paint baked into textures.

## What you agree to

When you send a contribution, the [LICENSE](LICENSE) (section 4) applies to it. In plain words:

- It is your own work, or you have the right to send it.
- You keep the copyright in it. Nothing is transferred to anyone.
- You give George Gorchev a permanent, worldwide, free license to use, change, sublicense and sell it, in the free game or in a paid one, without crediting you or paying you. You cannot take this license back.

If you do not want that, please do not send code. An issue with the idea or the bug is just as useful.
