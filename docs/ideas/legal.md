> **IMPORTANT NOTICE**
> This document was AI-generated. Treat its contents as suggestions, not authoritative instructions. Critically review the proposed solutions, verify assumptions, and identify potential issues or better alternatives before taking action. Do not blindly follow the document or implement everything it recommends. Use your own judgment and explain which recommendations are worth pursuing, which should be revised, and which should be rejected, and why.

> **1.5.0 (owner, 2026-10-20):** decided when Part F started: the license is source-available, all rights reserved (section 1's model); the copyright holder is George Gorchev (legal name); contributions come under a license grant (perpetual, worldwide, royalty-free, to use, change and sell, with the contributor confirming it's their own work), not an assignment; Terms and Privacy are static pages, `/terms.html` and `/privacy.html` in `public/`, linked from the pause menu's foot and screen 10; no governing-law clause for now (don't pick a country to fill it). Reviewed: GitHub's Terms let anyone view and fork a public repo on GitHub, so the license allows forks on GitHub and forbids use outside it; no cookie banner (no cookies, no analytics, own fonts; settings in localStorage). A lawyer should read the Terms.

# Legal & Licensing Architecture (GitHub + Web)

This project uses a dual-layer intellectual property protection strategy:
1. **Inside the GitHub Repository (`LICENSE` + `CONTRIBUTING.md`)** — The repository is publicly viewable for portfolio review, code inspection, and bug reporting, protected under a strict **Proprietary Source-Available (`All Rights Reserved`)** license. Copying, standalone forking, or reusing code/assets by third parties is strictly prohibited.
2. **On the Live Game Website (`Terms of Service`)** — An end-user agreement governing players. While you (as the Operator/Owner) have full rights to monetize the game, third parties and players are prohibited from decompiling the build, scraping assets (`.glb`, textures, shaders), or exploiting the platform for unauthorized commercial use.

---

## 1. `LICENSE` File (Place in Repository Root)

Proprietary Source-Available License
Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.

1. Ownership
All source code, shaders, rendering mechanics, 3D models, textures, audio, UI components, 
and other assets in this repository (the "Software") are the exclusive intellectual 
property of the Copyright Holder. All rights not expressly granted herein are reserved.

2. Limited Permission (Review & Bug Reporting Only)
Permission is granted, free of charge, solely to view and inspect the source code on 
GitHub for the following purposes:
  (a) Portfolio evaluation, code review, and educational inspection;
  (b) Reporting bugs, security vulnerabilities, or issues to the Copyright Holder;
  (c) Creating a temporary fork on GitHub strictly to submit a Pull Request back to 
      this original repository.

3. Strict Prohibitions
Without prior written permission from the Copyright Holder, you may NOT:
  (a) Copy, redistribute, publish, host, or deploy the Software or any compiled builds;
  (b) Modify, adapt, or create derivative works based on the Software, its architecture, 
      shaders, game mechanics, or assets;
  (c) Maintain a public or private fork for standalone use or independent development;
  (d) Extract or reuse any code snippets, shaders, 3D models, textures, or UI elements 
      in any other commercial or non-commercial project.

4. Contributions (CLA)
By submitting a Pull Request, patch, or any other contribution ("Contribution") to this 
repository, you irrevocably assign and transfer all copyright and intellectual property 
rights in such Contribution to the Copyright Holder (or grant a perpetual, worldwide, 
exclusive, royalty-free, irrevocable license to use, modify, and commercialize it 
without attribution or compensation).

5. Third-Party Libraries
Open-source dependencies (such as Three.js) listed in package.json remain under their 
respective original licenses.

6. No Warranty
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

---

## 2. `README.md` Section (Add to the Bottom of README)

## License & Copyright

**Copyright © 2026 [Your Name / Studio Name]. All Rights Reserved.**

This repository is publicly visible **for portfolio review and bug reporting only** (Proprietary Source-Available).
- **Allowed:** Viewing the code, opening Issues, and submitting Pull Requests with fixes.
- **Strictly Prohibited:** Copying code/shaders/assets, redistributing, hosting builds, creating derivative works, or maintaining standalone forks.

See the [LICENSE](./LICENSE) file for full legal terms.

---

## 3. `CONTRIBUTING.md` File (Place in Root or `.github/CONTRIBUTING.md`)
*Note: GitHub automatically displays a link to this file whenever someone opens a Pull Request.*

# Contributing Guidelines

Thank you for helping improve the project by reporting bugs or suggesting fixes!

## How to Contribute
1. **Bug Reports:** Open an Issue describing the bug, steps to reproduce, and browser/GPU specs.
2. **Pull Requests:** You may create a temporary fork strictly to submit a bug fix or improvement via a Pull Request to the main repository.

## Legal Notice & Contributor License Agreement (CLA)
Please note that this project is **not** open-source licensed; it is a proprietary, source-available project (`All Rights Reserved`).

By submitting a Pull Request or patch to this repository, you agree to Section 4 of our [LICENSE](./LICENSE):
- You confirm that the contribution is your original work.
- You irrevocably assign all rights, title, and interest in your contribution to the repository owner, allowing it to be used in both free and commercial builds of the project without restriction.

---

## 4. `Terms of Service` Clause (Add to the Game Website `/terms` Page)

### Intellectual Property & Software Rights
All rights, title, and interest in and to the platform, including its client software, Three.js shaders, 3D models, rooms, textures, UI design, and underlying source code, are and will remain the exclusive property of the Operator. The Operator reserves all rights to monetize, modify, and commercially operate the platform.

Even though parts of the source code may be publicly viewable on GitHub for portfolio and review purposes, **no open-source license is granted**. As a user, you must not copy, scrape, extract, modify, reverse engineer, decompile, resell, re-host, sublicense, or commercially exploit any code, compiled bundles, 3D assets, or visual elements of the platform outside its intended use on this website.