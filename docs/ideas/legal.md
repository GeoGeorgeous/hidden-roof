# Legal (TASK-187, IDEA-188, TASK-189)

What `LICENSE`, `public/terms.html` and `public/privacy.html` rest on, and what each future feature must do before it ships. Not legal advice; a lawyer read the texts in 1.5.0 (TASK-183).

## Facts

- **Who:** Hidden Haus is a brand of an individual living in the country of Georgia; a free portfolio project, no income. GDPR applies through Article 3(2), Georgia's Law on Personal Data Protection (No. 3144) where the owner is; the German Impressum most likely not.
- **Host:** Hetzner, Nuremberg. Caddy keeps no access log; the game server cleans its own log files (`server/log-files.ts`).
- **Code:** the privacy page lists what the code does on `dev` (storage keys, `src/net/protocol.ts`, `server/log.ts`, the timers in `SERVER`). Change the page with the code.

## Decisions

- The controller is named once, on the privacy page ("Hidden Haus, operated by George Gorchev"); elsewhere it is Hidden Haus. The only contact is roof@hidden.haus.
- Players are 18+; nothing checks it until TASK-189.
- Recordings may be published to promote the game, nicknames included, on legitimate interest, with the right to object in its own section (Article 21(4)).
- Law of the country of Georgia, courts of Tbilisi, not exclusive: consumers keep their own law and courts (Rome I 6(2); Brussels I bis 18, 19).
- Moderation is the owner, by hand, on email reports, "if we believe" a rule was broken: a vaguer ground fails DSA Article 14. IP blocks are by hand on the host, kept while needed.
- Streaming and videos of play are allowed, monetized too; the LICENSE leaves playing to the Terms.
- LICENSE §6 names no components: the Credits and `public/licenses/` list them. §4 is the CLA.

## Risks the owner accepts

- **Browsewrap:** no click to accept the Terms, so the recordings license is weaker (TASK-189 adds the click).
- **No EU representative** (GDPR 27, DSA 13), on the occasional-processing exception: revisit at 1.6.0.
- **Transfers to Georgia** rest on Article 49(1)(b), read narrowly.
- **No data processing agreement with Hetzner** (Article 28); a few minutes in the Hetzner account.
- **Until 1.5.0 is deployed**, the Docker log is rotated only by size, so the 14 days don't hold yet.
- **The first playtest's data is kept**, though the testers were promised deletion.
- **Disk not encrypted**; the page claims none (Article 32 allows it for this risk).
- **Moral-rights waivers** hold only where the law allows them.

## Before telemetry ships (TASK-187)

A device id in `localStorage`, or reading GPU, memory, battery or connection from JavaScript, needs consent (ePrivacy 5(3); EDPB Guidelines 2/2023), and consent required to play is not free (GDPR 7(4)). So: off by default, equal "yes" and "no", the game the same either way, changeable later, fixed retention with automatic deletion, and the privacy page updated before deploy. Without consent, only what the server measures itself (ping, drops, load) is safe.

## Before analytics ships (IDEA-188)

Country from the IP at connect, counters only, no IP kept, nothing on the device: legitimate interest with the right to object, and a privacy page section first. Read the IP-tracking part of EDPB Guidelines 2/2023 before building it.

## Before public servers ship (TASK-189)

One action to accept the house rules: 18+, the Terms and Privacy Policy, sessions may be recorded. The Terms get a DSA moderation section: grounds and proportionate measures (Article 14), reports by email (16), a restricted player told what and why, able to reply (17). Article 19 spares micro enterprises the platform duties.
