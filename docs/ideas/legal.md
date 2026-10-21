# Legal (TASK-187, IDEA-188)

What the legal texts (`LICENSE`, `CONTRIBUTING.md`, `public/terms.html`, `public/privacy.html`) rest on, the owner's decisions behind them, and what each future feature must do before it ships. Not legal advice; TASK-183 is the lawyer's read.

## Facts the texts rely on

- **Who:** Hidden Haus is a brand, not a company. The owner is an individual living in Georgia, deregistered from Germany; the game is a free portfolio project, with no income from it. So the GDPR applies through Article 3(2) (the game is offered to people in the EU), Georgia's Law on Personal Data Protection (No. 3144, in force since 1 March 2024) applies where the owner is, and the German Impressum (§ 5 DDG) most likely does not.
- **Host:** Hetzner Online GmbH, a CX33 in Nuremberg, Germany. Caddy keeps no access log. Container logs are rotated by size or not at all (`docs/ideas/vps.md`).
- **Code:** what the privacy page lists is what the code does on `dev` (localStorage settings and nickname, sessionStorage code, token and nickname, the messages in `src/net/protocol.ts`, the lines `server/log.ts` writes, the timers in `SERVER` in `src/config.ts`). Change the page with the code.

## Decisions

- The controller is named once, in the privacy page: "Hidden Haus, operated by George Gorchev", with the email and no address. Everywhere else it is Hidden Haus. The name is in the public git history anyway; Article 13(1)(a) GDPR requires the controller's identity at collection, not on request.
- The only contact is roof@hidden.haus. GitHub appears only where it is the mechanism (issues, forks, pull requests).
- Players are 18+. Nothing in the game checks it yet; TASK-189 adds it to the house rules.
- Recordings of sessions may be published to promote the game, nicknames included, on legitimate interest. The right to object (Article 21) is its own section of the page, as Article 21(4) requires; an objection keeps the nickname out of new material.
- Logs: the game server writes its log to files and cleans them itself (`server/log-files.ts`): IP addresses and nicknames gone after 14 days, lines after 60. Caddy is shared with other sites on the host; the owner allowed its restart (2026-10-21), so its own log is kept 13 days, cut daily (devops, 2026-10-21).
- Nothing on the host may change for the sake of this game that touches the other projects there, except what the owner allowed: the network settings (BBR) and Caddy's restart and log.
- Terms and LICENSE: the laws of Georgia, keeping consumers' mandatory protection at home (Rome I Article 6(2)).
- Pull requests are welcome; LICENSE §4 is the CLA. CONTRIBUTING stays three lines.
- The texts are short on purpose: a free experiment with no players yet. Article 12 GDPR asks for concise, plain language anyway.
- Moderation is the owner alone, by hand, on reports by email. The Terms say only what may be done; the DSA details wait for public servers (TASK-189).

## Risks the owner accepts

- **Browsewrap.** Playing means accepting the Terms; there is no click. The license to use recordings is weaker for it, most of all in the US. TASK-189 adds the click for public servers.
- **No EU representative** (Article 27 GDPR; Article 13 DSA). Resting on the exception for occasional, low-risk processing (Article 27(2)(a)). Public servers 24/7, telemetry and analytics weaken it: revisit at 1.6.0.
- **Transfers to Georgia.** The owner runs the server from Georgia, which has no adequacy decision; the page relies on Article 49(1)(b), which the EDPB reads narrowly. Moving the controller into the EU, or standard contractual clauses, would close it.
- **No data processing agreement with Hetzner** (Article 28 GDPR). The law asks for one whoever the hosting provider is; the page doesn't mention it. Concluding it later takes a few minutes in the Hetzner account.
- **Until the release with the log files is deployed**, the game server's Docker log is rotated only by size (3 × 10 MB), so the privacy page's 14 days don't hold for it yet (Article 5(1)(e) GDPR). Caddy's log is kept 13 days since 2026-10-21.
- **The first playtest's data is kept** (telemetry with nicknames and hashed addresses, on the host and the owner's machine), though the testers' notice promised deletion after the test (Article 5(1)(b) and (e)).
- **Disk not encrypted** (plain ext4). Article 32 GDPR asks for security appropriate to the risk and names encryption only as an example; for IP addresses and nicknames on a rented server that is acceptable. The page claims no encryption.
- **Moral rights.** The waivers in the Terms and LICENSE hold only where the law allows it (not fully in France or Germany).

## Before telemetry ships (TASK-187)

The owner's wish is telemetry on for everyone ("don't like it, don't play"). In the EU that doesn't hold:

- A device id in `localStorage`, and reading the device's GPU, memory, battery or connection from JavaScript, store or read information on the player's device. That needs consent unless strictly necessary for what the player asked for (ePrivacy Directive Article 5(3); EDPB Guidelines 2/2023), and telemetry for our own analysis isn't. There is no legitimate-interest basis under Article 5(3).
- Consent that the game requires to play is not freely given (GDPR Article 7(4), Recital 43; EDPB Guidelines 05/2020 on cookie walls).

So: off by default, an equal "yes" and "no", the game the same either way, a way to change the answer later; the notice in the game's language; a fixed retention with automatic deletion; and this page updated before the build is deployed. Without consent, only what the server measures on its own (ping, connection drops, session load) is safe. The Digital Omnibus may widen the exemptions; as of October 2026 it is still a proposal.

## Before analytics ships (IDEA-188)

Who plays and from where, counted on the server: look up the country of the IP when a player connects, add to counters (players per day, sessions, countries), and keep no IP. No script on the device, no third party, no banner. The legal basis is legitimate interest, with the right to object; the privacy page gets a section first. EDPB Guidelines 2/2023 discuss tracking by IP alone: read that section before building it.

## Before public servers ship (TASK-189)

House rules on the way into a public server, with one action to accept: 18+, the Terms and the Privacy Policy, sessions may be recorded and published.

The Terms then get a moderation section, as the DSA asks of a hosting service: the grounds and the measures (erase paint, rename, remove, block an IP) applied in proportion (Article 14), reports by email with what they need (Article 16), and a restricted player told what was done and why, and able to reply (Article 17). Article 19 spares micro enterprises the online-platform duties.
