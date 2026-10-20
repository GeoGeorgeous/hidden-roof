# Contributing to Hidden Roof

Bug reports and fixes are welcome. Please note that **Hidden Roof is not an open-source project**: the repository is publicly visible strictly for code review, bug reporting, and submitting pull requests. All access and contributions are governed by the repository's proprietary [`LICENSE`](./LICENSE) (`All Rights Reserved`).

---

### 1. Reporting Bugs
To report a bug, open an issue on GitHub or report it via the official Discord server. To help reproduce and resolve the issue quickly, please include:
* **Steps to reproduce:** What you did step by step, what happened, and what you expected to happen;
* **Environment:** Your browser (and version), operating system, and GPU model;
* **Mode:** Whether the issue occurs in Single-Player, in a Multiplayer session, or both;
* **Visuals:** A screenshot or short video clip if the issue is visual or rendering-related;
* **Network Log (for Multiplayer failures):** If a multiplayer session fails, open the `ESC` menu, navigate to the **Multiplayer** page, click **`COPY NETWORK LOG`**, and paste the output into the issue;
* **Dev Telemetry (if running locally via `npm run dev`):** The values from the `F3` debug panel or a copy of your active settings, if relevant to the issue.

> **Privacy & Security Notice:** GitHub issues are public. Before pasting logs, screenshots, or terminal outputs, please ensure they do not contain private personal information (such as real names in local file paths or raw IP addresses). **Do not report security vulnerabilities or server exploits in public GitHub issues**—please send security reports privately to `roof@hidden.haus`.

---

### 2. Submitting Pull Requests (Fixes)
You may fork the repository on GitHub solely to develop and submit a pull request back to this upstream repository (in accordance with Section 2(d) of the [`LICENSE`](./LICENSE)).

* **Discuss major changes first:** For anything larger than a minor bug fix or typo, please open an issue first to discuss the approach, so you do not spend time building something that does not fit the project’s architecture or design direction.
* **Architecture & Standards:** Read `AGENTS.md` and `docs/testing.md` before modifying code. The codebase is intentionally kept small, strict, and fast, with paint baked directly into textures.
* **Pre-submission checks:** Before opening a pull request, run the verification suite locally and ensure all checks pass without errors:

```bash
npm run check:quick
```

*(This validates TypeScript types, unit tests, and the production build).*

---

### 3. Contribution Terms & Inbound License Agreement
When you submit any contribution to this repository—including a pull request, patch, shader, asset, or code snippet in an issue or comment ("Contribution")—your submission is legally governed by **Section 4 of the [`LICENSE`](./LICENSE)**.

By submitting a Contribution, you expressly represent, warrant, and agree to the following:

1. **Original Work & No Copyleft Contamination:** The Contribution is entirely your own original work (and you have the full legal right to submit it, including from your employer if applicable). **You must not include any third-party code or assets copied from incompatible sources** (such as StackOverflow, Shadertoy, or GPL/AGPL/CC-BY-SA repositories) without prior written approval from the Copyright Holder.
2. **Retention of Underlying Copyright:** You retain the copyright to your independent Contribution; this is a license grant, not a copyright assignment. However, submitting a Contribution does not grant you any ownership or expanded license to the rest of the **Hidden Roof** codebase.
3. **Broad, Irrevocable License to the Operator:** You grant the Copyright Holder (the Operator of **Hidden Roof** under the **Hidden Haus** project network) a **perpetual, irrevocable, worldwide, non-exclusive, transferable, sublicensable, and royalty-free copyright and patent license** to use, modify, reformat, distribute, and commercialize your Contribution as part of the free game, a paid/commercial version, or any other project, **without any obligation of attribution (credit) or financial compensation to you**.
4. **Waiver of Moral Rights:** To the fullest extent permitted by applicable law, you irrevocably waive any moral rights (including rights of attribution and integrity) in your Contribution.

*(Note: The bullet points above are a summary for convenience. In the event of any conflict or ambiguity, the full legal text of **Section 4 of the [`LICENSE`](./LICENSE)** governs exclusively).*

If you do not agree to these terms, **please do not submit code or pull requests**. Opening an issue to describe a bug or suggest an idea is equally appreciated and does not require submitting code.

---

### 4. Contact
* **General & Legal Inquiries / Security Reports:** `roof@hidden.haus`
* **Bug Reports & Technical Discussion:** GitHub Issues or the official Discord server.
