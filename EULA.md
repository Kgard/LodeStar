# END USER LICENSE AGREEMENT

**Last updated: April 5, 2026**

This End User License Agreement ("EULA") is a legal agreement between you ("User," "you," "your") and Kylex LLC ("Company," "we," "us," "our"), governing your use of the Lodestar software application, including any associated updates, documentation, and related files (collectively, the "Software").

By installing, copying, or otherwise using the Software, you agree to be bound by the terms of this EULA. If you do not agree to the terms of this EULA, do not install or use the Software.

---

## 1. GRANT OF LICENSE

Subject to your compliance with this EULA, we grant you a limited, non-exclusive, non-transferable, revocable license to install and use the Software on devices that you own or control, solely for your personal or internal business purposes.

This license is granted on a per-user basis. Each individual user must have their own installation. You may install the Software on multiple devices provided that you are the sole user of each installation.

The Software is offered in two tiers:

- **Lodestar Free** — No charge. Includes local session synthesis, context loading, session review, and terminal summary. Requires your own API key ("BYOK").
- **Lodestar Pro** — Paid subscription ($9.99/month or as otherwise published at kylex.io). Includes hosted synthesis, mid-session checkpoints, session history timeline, session diff comparison, team sharing, and additional features as described at kylex.io.

Pro tier features require a valid subscription and are subject to usage limits as described at kylex.io. This EULA governs both tiers.

## 2. RESTRICTIONS

You shall not, and shall not permit any third party to:

(a) Copy, modify, adapt, translate, or create derivative works based on the Software;

(b) Reverse engineer, disassemble, decompile, or otherwise attempt to derive the source code, algorithms, or underlying ideas of the Software, except to the extent that such activity is expressly permitted by applicable law notwithstanding this limitation;

(c) Redistribute, sublicense, rent, lease, lend, sell, resell, or otherwise transfer the Software or any rights therein to any third party;

(d) Remove, alter, or obscure any proprietary notices, labels, or marks on the Software;

(e) Use the Software to build a competing product or service;

(f) Share, publish, or distribute your API keys, license tokens, or account credentials in connection with the Software.

## 3. INTELLECTUAL PROPERTY

The Software is proprietary to Kylex LLC and is protected by copyright, trade secret, and other intellectual property laws. The Software is licensed, not sold. We retain all right, title, and interest in and to the Software, including all intellectual property rights therein. This EULA does not grant you any rights to our trademarks, service marks, or trade names.

## 4. YOUR DATA

The Software generates a `.lodestar.md` file in your project directory containing synthesized session context. This file is yours. You retain full ownership of all `.lodestar.md` files and any other output produced by the Software in your project repositories. We claim no ownership or license over your project code, session context files, or any data stored locally on your machine.

## 5. TELEMETRY

The Software collects anonymous usage telemetry to improve the product. Telemetry data includes:

- Number of sessions per week
- AI provider used (e.g., Anthropic, OpenAI, Ollama)
- Synthesis success and failure rates
- Software version, operating system, and architecture
- Anonymous installation identifier (randomly generated UUID)

Telemetry **does not** include:

- Project names, file names, or file contents
- Source code, diffs, or session context
- API keys or credentials
- Any personally identifiable information (PII)

You may opt out of telemetry during initial setup (`lodestar init`) or at any time by updating your configuration. Telemetry collection is disclosed during first-time setup.

## 6. AUTO-UPDATE

The Software periodically checks for available updates by contacting a remote server. This check transmits your current Software version, operating system, and architecture. No project data or personal information is transmitted during update checks.

When an update is available, the Software will display a non-blocking notice in your terminal. Updates are not installed automatically. You may install updates at your discretion by running `lodestar update`, which downloads and replaces the current binary.

You may suppress update notices by configuring the Software accordingly. Critical security updates may override notice suppression.

## 7. SUBSCRIPTION AND PAYMENT

Lodestar Free requires no payment and no account. It is free to use indefinitely.

Lodestar Pro requires a paid subscription managed through kylex.io. Subscription terms, pricing, billing, cancellation, and refund policies are governed by the Terms and Conditions published at kylex.io. In the event of a conflict between this EULA and the Terms and Conditions regarding payment matters, the Terms and Conditions shall control.

If your Pro subscription expires or is cancelled, Pro features will become unavailable. Your `.lodestar.md` files, session history, and all locally stored data remain yours and are unaffected.

## 8. DISCLAIMER OF WARRANTIES

THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

WE DO NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS. WE DO NOT WARRANT THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY OUTPUT PRODUCED BY THE SOFTWARE, INCLUDING THE CONTENTS OF `.lodestar.md` FILES.

THE SOFTWARE RELIES ON THIRD-PARTY AI PROVIDERS (ANTHROPIC, OPENAI, OLLAMA, AND OTHERS) FOR SYNTHESIS. WE ARE NOT RESPONSIBLE FOR THE AVAILABILITY, ACCURACY, OR PERFORMANCE OF THIRD-PARTY SERVICES.

## 9. LIMITATION OF LIABILITY

IN NO EVENT SHALL KYLEX LLC, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SOFTWARE, REGARDLESS OF THE THEORY OF LIABILITY.

OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THIS EULA SHALL NOT EXCEED THE AMOUNT YOU PAID TO US FOR THE SOFTWARE IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR TEN DOLLARS ($10.00), WHICHEVER IS GREATER.

## 10. TERMINATION

This EULA is effective until terminated. Your rights under this EULA will terminate automatically without notice if you fail to comply with any of its terms.

Upon termination, you shall cease all use of the Software and destroy all copies in your possession or control. Termination does not affect your ownership of `.lodestar.md` files or other output previously generated by the Software.

We may also terminate this EULA at any time by providing notice through the Software or at kylex.io.

Sections 3, 4, 8, 9, 11, and 12 shall survive termination of this EULA.

## 11. GOVERNING LAW

This EULA shall be governed by and construed in accordance with the laws of the State of Wyoming, without regard to its conflict of law principles. Any dispute arising under this EULA shall be resolved in the state and federal courts located in Wyoming, and you consent to the personal jurisdiction of such courts.

## 12. GENERAL

(a) **Entire Agreement.** This EULA, together with the Terms and Conditions at kylex.io, constitutes the entire agreement between you and Kylex LLC regarding the Software.

(b) **Severability.** If any provision of this EULA is found to be unenforceable, the remaining provisions shall remain in full force and effect.

(c) **Waiver.** Our failure to enforce any right or provision of this EULA shall not constitute a waiver of such right or provision.

(d) **Assignment.** You may not assign or transfer this EULA or any rights hereunder without our prior written consent. We may assign this EULA without restriction.

(e) **Amendments.** We reserve the right to modify this EULA at any time. Updated terms will be posted at kylex.io and may be included with Software updates. Your continued use of the Software after such modifications constitutes acceptance of the updated terms.

## 13. CONTACT

If you have questions about this EULA, contact us at:

**Kylex LLC**
Email: info@kylex.io
Web: https://kylex.io
