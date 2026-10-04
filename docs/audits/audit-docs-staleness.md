# Audit: Documentation Staleness — 2026-10-04

**Worker:** fr-2 · **Task:** audit-docs-staleness · **Branch:** audit-docs-staleness
**Base commit:** de774047f1e796b80a98df8f5bdf13c4e79e7710
**Measured:** 2026-10-04, from worker fr-2 (`100.126.251.111`) via the tailnet.

Verdicts: **VERIFIED** — a command reproduces the claim. **STALE** — a command
contradicts it (command + measured value recorded). **UNVERIFIABLE** — the probe
is blocked by this worker's own limits (no ssh key, no DB credentials, no
route); the command and its error are recorded. A probe that fails because
*fr-2* cannot reach something is never counted as STALE.

## Claim table

| Doc:line | Claim (quoted, short) | Verdict | Command | Measured |
|---|---|---|---|---|
| compute-policy.md:13-15 | `policies.cost = "local-preferred"`, cost_tier 0/1/2, cloud fallback | VERIFIED | `node -e` parse of `factory/config.json` | `policies.cost="local-preferred"`; tiers: local 0, fr-1 tailnet 1, deepseek cloud 2; `fallback: ["local","cloud"]` |
| compute-policy.md:22 | builder → cloud | STALE | `node scripts/factory/factory.mjs route builder` (exit 0) | `route builder -> ninfer/qwen3.8-27b` (local, cost_tier 0) |
| compute-policy.md:23 | reviewer → cloud (`strata-max` reasoning 2<3) | STALE | `node scripts/factory/factory.mjs route reviewer` (exit 0) | `route reviewer -> ninfer/qwen3.8-27b` (local) |
| compute-policy.md:24 | verifier → cloud (`ninfer` tool_use 2<3) | STALE | `node scripts/factory/factory.mjs route verifier` (exit 0) | `route verifier -> ninfer/qwen3.8-27b` (local); stated cause false — config `ninfer` tool_use = 3 |
| compute-policy.md:25 | researcher → cloud | VERIFIED | `node scripts/factory/factory.mjs route researcher` (exit 0) | `route researcher -> ollama-cloud/deepseek-v4.1-flash:cloud` (cost_tier 2 fallback; strata-max reasoning 2<3) |
| compute-policy.md:26 | ocr → cloud (`ninfer` tool_use 2<3) | STALE | `node scripts/factory/factory.mjs route ocr` (exit 0) | `route ocr -> ninfer/qwen3.8-27b` (local) |
| compute-policy.md:27 | explorer → fr-1/glm-4.7-flash | STALE | `node scripts/factory/factory.mjs route explorer` (exit 0) | `route explorer -> ninfer/qwen3.8-27b` (local) |
| compute-policy.md:28 | gate → no model | VERIFIED | `node scripts/factory/factory.mjs route gate` | `NO ELIGIBLE MODEL — task kind declares no model capability` (exit 3) |
| compute-policy.md:32-33 | `strata` and `ninfer` have `footprint_source: "unmeasured"` | STALE | `node -e` parse of `factory/config.json` → `models[*].resources.footprint_source` | both `"measured"` (strata 48/13 GB, ninfer 3/24 GB, both "MEASURED 2026-10-02") |
| compute-policy.md:34 | `strata-max` declared `resident` and not running | PARTIAL | config parse (declared); `curl http://100.120.87.29:8081/v1/models -m 3` (state) | declared `resident` VERIFIED (config); "not running" UNVERIFIABLE — :8081 does not respond via tailnet (no response, curl exit 7) |
| compute-policy.md:37 | `ninfer` tool_use **2** below floors | STALE | `node -e` parse of `factory/config.json` → ninfer capabilities | `tool_use: 3` — "VERIFIED EMPIRICALLY 2026-10-02" (`_tool_use_source`) |
| compute-policy.md:48 | This machine — `omarchy`, `100.120.87.29` | STALE | `tailscale status` | `100.120.87.29 omarchy-2 … active`; the name `omarchy` now belongs to `100.97.204.54` (offline 25 d) |
| compute-policy.md:50 | RTX 5090, 32 GB VRAM, 62 GB RAM | UNVERIFIABLE | `ssh -o ConnectTimeout=4 -o BatchMode=yes 100.120.87.29 'nvidia-smi…'` | `Permission denied (publickey,password)` — fr-2 has no key authorised on omarchy-2; no other route to `nvidia-smi`/`free` |
| compute-policy.md:52-54 | units mutually exclusive (`Conflicts=`) | UNVERIFIABLE | unit files live on omarchy-2 (ssh denied, see above) | no access |
| compute-policy.md:59 | `strata-serve` … **active** | UNVERIFIABLE | `curl -s -m 3 http://100.120.87.29:8080/v1/models` | no response (curl exit 7, connection refused). Ambiguous: service down vs. port not tailnet-exposed — cannot distinguish from fr-2 |
| compute-policy.md:59 | 47.5 GB RAM peak (50957361152), 12.7 GB VRAM | VERIFIED | `node -e` parse of `factory/config.json` → strata `resources` + `footprint_evidence` | `ram_gb 48`, `vram_gb 13`; evidence: "MemoryPeak = 50957361152 bytes = 47.5 GiB" / "12730 MiB" |
| compute-policy.md:60 | `strata-max` **inactive/dead**; 55 GB RAM (measured) | PARTIAL | `curl http://100.120.87.29:8081/v1/models -m 3` (state); config parse (55 GB) | state UNVERIFIABLE (no response, curl exit 7, ambiguous); "55 GB (measured)" STALE — config `footprint_evidence`: "52 is the measured figure and the earlier 55 was the unit banner's estimate" (router still uses 55 in its arithmetic: "model load 55") |
| compute-policy.md:61 | `ninfer-serve` … **activating/auto-restart — crash-looping** | STALE | `curl -s -m 3 -H "Authorization: Bearer <key>" http://100.120.87.29:18080/v1/models` | HTTP 200, `{"data":[{"id":"qwen3.8-27b"}]}` — the endpoint is up and serving |
| compute-policy.md:61 | ninfer "RAM unmeasured" | STALE | `node -e` parse of `factory/config.json` → ninfer `resources` | `ram_gb: 3`, `footprint_source: "measured"` ("2.3 GB after loading and answering") |
| compute-policy.md:73 | 83 MB short because `strata` holds 12.7 GB | UNVERIFIABLE | historical journal/`nvidia-smi` state on omarchy-2 (ssh denied) | no access |
| compute-policy.md:77-78 | `libcudart.so.13` present, CUDA 13.3, driver 610.57.04 | UNVERIFIABLE | `ldconfig -p` + journal on omarchy-2 (ssh denied) | no access |
| compute-policy.md:90 | ollama holds only `hemmingway*` + two cloud passthroughs | UNVERIFIABLE | `curl -s -m 3 http://100.120.87.29:11434/api/tags` | no response (curl exit 7) — port not reachable via tailnet |
| compute-policy.md:94 | Orca ~225 MiB / Chrome ~356 MiB VRAM | UNVERIFIABLE | `nvidia-smi --query-compute-apps` on omarchy-2 (ssh denied) | no access |
| compute-policy.md:97 | fr-1 `100.92.51.0` online | VERIFIED | `tailscale status`; `curl -s -m 3 http://100.92.51.0:11434/api/tags` | tailnet `idle, tx 4780 rx 4828`; HTTP 200 |
| compute-policy.md:103 | fr-1 model list + sizes (6 models) | VERIFIED | `curl … /api/tags` (sizes in bytes) | qwen3.5:35b-a3b 23869191742 (23.9 GB) ✓ · glm-4.7-flash 19019270897 (19.0) ✓ · qwen3:14b 9276198565 (9.3) ✓ · gemma4:12b-it-qat 7151003754 (7.2) ✓ · qwen3.5:9b 6594474711 (6.6) ✓ · qwen3.5:4b 3389983735 (3.4) ✓ (list omits two cloud passthroughs: glm-5.3:cloud, glm-5.3-flash:cloud) |
| compute-policy.md:106 | fr-2 `100.126.251.111` online, `:8080`, bearer key | VERIFIED | `curl -s -m 3 -H "Authorization: Bearer <key>" http://127.0.0.1:8080/v1/models` | HTTP 200 |
| compute-policy.md:108 | `gemma4-12b-qat-q4` (multimodal); only in `~/.pi/agent/models.json` | VERIFIED | same curl; `grep -c "fr-2" factory/config.json`; `grep -l fr2-local ~/.pi/agent/models.json` | model `gemma4-12b-qat-q4`, capabilities `["completion","multimodal"]`; 0 matches in factory config; `fr2-local` provider present in models.json |
| compute-policy.md:111-113 | fr-3 `100.79.67.85` online, `:8080`, bearer key; `qwen3.5-4b-mtp-q4` unregistered | PARTIAL | `curl -s -m 3 http://100.79.67.85:8080/v1/models`; `grep fr-3 ~/.pi/agent/models.json` | 401 without key → endpoint up + "bearer key" VERIFIED; unregistered VERIFIED (not in `factory/config.json`); model name UNVERIFIABLE — no fr-3 key on fr-2 (not in models.json either) |
| compute-policy.md:115 | `fr-2` refuses publickey/password; `fr-3` refused by tailnet policy | VERIFIED | `ssh -o ConnectTimeout=4 -o BatchMode=yes 100.126.251.111 …`; `ssh … 100.79.67.85 …` | `Permission denied (publickey,password)`; `tailscale: tailnet policy does not permit you to SSH as user "jmeisburg"` |
| compute-policy.md:121-122 | Offline: DESKTOP-JMR591K (38 d), omarchy-5 (4 d), jon-1 (24 d), omarchy (24 d) | STALE (one entry) | `tailscale status` | desktop-jmr591k 40 d ✓ · jon-1 25 d ✓ · omarchy 25 d ✓ (all consistent with +2 d since 2026-10-02); **omarchy-5 now `active`** (doc says offline) |
| compute-policy.md:149 | `qwen3.5:35b-a3b` strongest non-5090 option, unregistered | VERIFIED | `/api/tags` (largest local model on fr-1 = 23.9 GB); `grep -c qwen3.5:35b factory/config.json` | not in factory config |
| compute-policy.md:220 | change 2: strata-max "declared `resident`, actually dead" | PARTIAL | config parse; `curl :8081` | declared-resident VERIFIED; "dead" UNVERIFIABLE (no response, curl exit 7, ambiguous) |
| compute-policy.md:222 | change 4: fr-1's model invisible to the router | VERIFIED | `grep -c qwen3.5:35b factory/config.json` | 0 |
| compute-policy.md:224 | change 5: registry says UNREACHABLE; fr-1 answers | VERIFIED | `node -e` parse (`_health_why`) + `curl :11434` | `_health_why` carries the 2026-10-02 UNREACHABLE note; curl → 200 |
| compute-policy.md:225 | change 7: `dsh-model show` reports cloud DeepSeek | UNVERIFIABLE | `which dsh-model` on fr-2 | not installed here; the claim is about the omarchy-2/DSH host |
| compute-policy.md:227-233 | "DSH's local mode is currently a target that will not start" | STALE | `curl -H "Authorization: Bearer <key>" http://100.120.87.29:18080/v1/models` | 200 + `qwen3.8-27b` — the local target is up and serving |
| compute-policy.md:243 | strata recorded 48 GB RAM / 13 GB VRAM | VERIFIED | `node -e` parse of `factory/config.json` | `ram_gb 48`, `vram_gb 13`, source `measured` |
| compute-policy.md:263-264 | session ran on `deepseek-v4.1-flash:cloud`, near credit ceiling | UNVERIFIABLE | provider credit state is server-side; no dashboard/API access from fr-2 | not measurable here |
| compute-policy.md:285-291 | target-state table (46.84 GiB arena, 71.8 tok/s, ctx 131072, tool 4/4) | VERIFIED | `node -e` parse of `factory/config.json` → strata-max `footprint_evidence`/`_config_note` | all four figures present verbatim in the config record |
| compute-policy.md:308 | two EMPTY DIMM slots, ceiling 192 GiB | UNVERIFIABLE | `dmidecode`/`lshw` on omarchy-2 (ssh denied) | no access |
| compute-policy.md:318-320 | both cost_tier 0; `strata-max` `preference: -1` | VERIFIED | `node -e` parse of `factory/config.json` | tier 0 / 0; `preference: -1` present |
| compute-policy.md:336-342 | "What the factory will route once the RAM is installed" | VERIFIED (conditional) | `factory.mjs route` for all 7 kinds | currently builder/reviewer/verifier/ocr/explorer → `ninfer` (strata-max rejected: "needs 62 GB … usable 18.3 GB"), researcher → cloud — exactly the documented pre-RAM fallback behaviour |
| compute-policy.md:357 | pinned by `scripts/factory/scheduler.test.mjs` | VERIFIED | `ls scripts/factory/` | file exists (tests not executed — the brief forbids running suites) |
| compute-policy.md:376 | `MAP_HUGETLB` unavailable | VERIFIED | `node -e` parse of `factory/config.json` | `unavailable_flags` + `_config_note` record it |
| compute-policy.md:392 | all three units `enabled`; only strata-max/strata-serve declare `Conflicts=` | UNVERIFIABLE | unit files on omarchy-2 (ssh denied) | no access |
| AGENTS.md:15 | full text: `.opencode/skills/i-have-adhd/SKILL.md` | VERIFIED | `ls .opencode/skills/i-have-adhd/` | `SKILL.md` (6.7K) |
| AGENTS.md:36-41 | `plan.template.md`, `task-state.md`, `factory/work/<id>.json`, `factory/decisions.md` | VERIFIED | `ls` + `ls factory/work/*.json \| wc -l` | all exist; 7 work JSONs |
| AGENTS.md:47 | five `orchestrator-*` subagents in `.opencode/agents/` | VERIFIED | `ls .opencode/agents/` | orchestrator.md + builder, explorer, researcher, reviewer, verifier (5) |
| AGENTS.md:94 | reviewer = fresh-context subagent on local `qwen3.8-27b` | VERIFIED | `node scripts/factory/factory.mjs route reviewer` | `ninfer/qwen3.8-27b`, cost_tier 0 (local) |
| AGENTS.md:103 | `ocr review …` command | UNVERIFIABLE | `which ocr` on fr-2 | not installed on this worker; cannot probe omarchy-2 |
| AGENTS.md:106-110 | rules in `.opencodereview/rule.json`; playtest `routes.json` | VERIFIED | `ls .opencodereview/rule.json .scratch/playtest/routes.json` | both exist |
| AGENTS.md:122-124 | `npm run guards` inside `verify`; rules ship `.check.mjs` | VERIFIED | `grep guards package.json`; `find scripts -name '*.check.mjs' \| wc -l` | `verify` includes `guards`; 13 `.check.mjs` files |
| AGENTS.md:162-164 | local window ~98k tokens (`qwen3.8-27b`) | VERIFIED | `node -e` parse of `factory/config.json` | ninfer `context_window: 98304` |
| AGENTS.md:178-190 | 13 pointer files in `docs/agents/` | VERIFIED | `ls docs/agents/`; `bash scripts/steering-lint.sh` | all exist; steering-lint: "every pointer resolves" (exit 0) |
| AGENTS.md:199-200 | `npm run verify` (build+test+lint); `bash .scratch/context-load.sh` | VERIFIED | `grep verify package.json`; `ls .scratch/context-load.sh` | both exist (verify also includes a11y, steering-lint, guards) |
| AGENTS.md:202 | skills discovered from `~/.claude/skills/` | UNVERIFIABLE | `ls ~/.claude/skills/` on fr-2 | fr-2 holds a different set (`diagnose-crash`, `omarchy`, `typesafe-ai`); the named mattpocock set lives on the orchestration host, which I cannot probe |
| RELEASE-CHECKLIST.md:20-27 | 12 testers / 14 days, source Google doc 14151465 | VERIFIED | `curl https://support.google.com/googleplay/android-developer/answer/14151465` | HTTP 200; page contains "12 testers who have been opted in continuously for at least 14 days" |
| RELEASE-CHECKLIST.md:5 | link `[2026-10-03-store-readiness.md](2026-10-03-store-readiness.md)` | STALE | `ls docs/2026-10-03-store-readiness.md` | no such file — the report moved to `docs/audits/`; the relative link from `docs/` is broken |
| RELEASE-CHECKLIST.md:56 | read `docs/handoff-native-apps.md` | VERIFIED | `ls docs/handoff-native-apps.md` | exists |
| RELEASE-CHECKLIST.md:71 | 709 marker rows, 352 fake accounts, "1234 E2E Ave NE" | UNVERIFIABLE | `node scripts/sweep-e2e-markers.mjs select` | exit 1: `ERR_MODULE_NOT_FOUND: @playwright/test` (no `node_modules` in this worktree) and no `.env`/`SUPABASE_ACCESS_TOKEN` on fr-2 |
| RELEASE-CHECKLIST.md:76-78 | sweep `select`/`delete`/`verify` commands | PARTIAL | `head scripts/sweep-e2e-markers.mjs` | script exists, subcommands documented; outputs unmeasurable without deps + DB credentials |
| RELEASE-CHECKLIST.md:86 | "V28 swept 1287 rows to zero" | UNVERIFIABLE | `grep -rn 1287 task-state.md factory/decisions.md` | 0 matches — no repo-side record found; no DB access |
| RELEASE-CHECKLIST.md:92-101 | e2e-target-guard "declared and expiring", extendable **once** | VERIFIED | `ls scripts/guards/e2e-target-guard.mjs`; `grep e2e-target scripts/guards/run-all.sh`; `cat e2e/.e2e-target.json` | guard exists, wired into `guards`+`verify`; waiver `productionRef` environment `production`, `expires 2026-11-15`, `extensionsUsed 0`, `extensions []` |
| RELEASE-CHECKLIST.md:105 | "22 drop-ins, all in the past, 18 of them yours" | UNVERIFIABLE | needs live DB (`SUPABASE_ACCESS_TOKEN`) | none on this worker |
| RELEASE-CHECKLIST.md:126-127 | "zero legal pages — grep for 'privacy policy' … returns nothing"; `PrivacySection.tsx` | VERIFIED | `grep -rin "privacy policy" src/ index.html`; `find src -name PrivacySection.tsx` | 0 matches; `src/components/PrivacySection.tsx` exists |
| RELEASE-CHECKLIST.md:159 | handoff written against `62c996a` | VERIFIED | `git cat-file -t 62c996a` | commit: "plan(native): DropIn as an installed app on both stores" |
| RELEASE-CHECKLIST.md:171 | Java 26 + `~/Android/Sdk` installed "on this box" | UNVERIFIABLE | `java -version`; `ls -d ~/Android/Sdk` (on fr-2) | `command not found` / `No such file or directory` — but the claim is about omarchy-2, and fr-2 lacking the tool is a local limit, not a contradiction |
| RELEASE-CHECKLIST.md:219-220 | 12 testers, continuous 14 days | VERIFIED | same Google doc fetch | same as L20 |
| RELEASE-CHECKLIST.md:277-278 | flakes: "marker bubble stays open", "list view is FILTERS FIRST" | VERIFIED | `grep -rn "marker bubble\|FILTERS FIRST" e2e/` | `e2e/places.e2e.ts:917` and `e2e/places.e2e.ts:1056` |
| RELEASE-CHECKLIST.md:281 | scoped in `.scratch/next-batch-brief.md` | VERIFIED | `ls .scratch/next-batch-brief.md` | exists |
| RELEASE-CHECKLIST.md:298 | "1,953 unit tests and a 161-spec Playwright suite" | STALE | `grep -rcE '^[[:space:]]*(it\|test)(\.skip\|\.fixme\|\.only)?\(' src --include='*.test.ts'`; same over `e2e/*.e2e.ts` | 2,048 unit test cases in 70 files; 187 test cases in 61 spec files — neither 1,953 nor 161 matches |
| PRODUCT.md:5-7 | Platform: `web` | VERIFIED | `grep -ri capacitor package.json`; `ls -d android` | no native shell; no `android/` directory |
| PRODUCT.md:76-78 | `mobile-audit.mjs` + `design-detect.mjs` (61 rules) | VERIFIED | `ls scripts/mobile-audit.mjs scripts/design-detect.mjs`; `grep -n "61" scripts/design-detect.mjs` | both exist; design-detect header: "61 rules over the source tree" (not executed — brief forbids) |
| PRODUCT.md:86 | native shell "parked and nothing has been started" | VERIFIED | `ls -d android capacitor`; `ls .scratch/native-apps/plan.md` | no build artifacts; plan file only |
| PRODUCT.md:95 | execution detail in `docs/handoff-native-apps.md` | VERIFIED | `ls docs/handoff-native-apps.md` | exists |
| PRODUCT.md:103-104 | no `lg:`/`xl:` breakpoints; no `DESIGN.md` | VERIFIED | `grep -rn "lg:\|xl:" src --include='*.tsx'`; `ls DESIGN.md` | 0 matches in components (only `--text-lg` token names in `index.css`); `DESIGN.md` absent |
| PRODUCT.md:117 | indigo deliberately gone, reason in `src/index.css` | VERIFIED | `grep -c indigo src/index.css` | 27 mentions incl. "This replaces indigo" (L123) |
| PRODUCT.md:125 | app at `/home/jmeisburg/Projects/playdate-app` | VERIFIED | `ls -d /home/jmeisburg/Projects/playdate-app` | exists |
| PRODUCT.md:126 | live at `https://drop-in-mu.vercel.app` | VERIFIED | `curl -s -m 5 https://drop-in-mu.vercel.app` | HTTP 200 |
| PRODUCT.md:128 | `src/lib/places.ts`, a ten-kind vocabulary | VERIFIED | `grep -A12 PLACE_KINDS src/lib/places.ts` | 10 kinds: park, playground, indoor_play, museum, pool, splash_pad, library, beach, trail, other |
| PRODUCT.md:129 | migrations under `supabase/migrations/` | VERIFIED | `ls supabase/migrations \| wc -l` | 58 files |
| PRODUCT.md:131-132 | `build-icons.sh`, `build-splash.mjs`, `DropInMark.tsx`, boot splash in `index.html` | VERIFIED | `ls` the three; `grep -n boot-splash index.html` | all exist; `index.html:109` static `#boot-splash` SVG mark |
| PRODUCT.md:136 | no testimonials / user counts / press / analytics | VERIFIED | `grep -rin "testimonial\|user count" src/ docs/ PRODUCT.md` | only PRODUCT.md's own "absence to respect" line |
| PRODUCT.md:161 | 44px/16px/WCAG floors enforced by `mobile-audit.mjs` | VERIFIED | `ls scripts/mobile-audit.mjs` | exists (enforcement not executable here — brief forbids running the gate) |

## STALE claims

Worst first. Each with the correction the doc should carry.

1. **`compute-policy.md:22-27` — the routing table is 5/7 wrong.** Every lane except
   `researcher` now routes to **local `ninfer/qwen3.8-27b`**; only researcher falls
   to cloud. The 2026-10-02 table (all lanes → cloud, explorer → fr-1) is
   contradicted by `factory.mjs route <kind>` run 2026-10-04.
   **Correction:** replace the table with today's output; drop "cloud" from the
   default-column narrative (§ The immediate situation, L261-264) — the
   coordinator-on-cloud urgency is gone from the router's view.
2. **`compute-policy.md:32-34` — "strata and ninfer have
   `footprint_source: unmeasured`" is false.** Both are `"measured"` in
   `factory/config.json`. Cause 1 (admissibility) has been fixed by exactly the
   change the doc itself recommended (change 1, L243).
   **Correction:** rewrite cause 1 as a resolved item; keep the registry note as
   history, not present tense.
3. **`compute-policy.md:37` — "`ninfer` tool_use 2" is false.** It is 3, verified
   empirically 2026-10-02 and recorded in the config's `_tool_use_source`.
   **Correction:** update the capability levels; the "uncomfortable cause 2"
   narrative now only applies to strata (reasoning 1) and strata-max (reasoning 2).
4. **`compute-policy.md:61` — "ninfer-serve … crash-looping" is false.** The
   endpoint is up: `:18080/v1/models` returns 200 and serves `qwen3.8-27b`.
   Same line, "RAM unmeasured" is false (measured 3 GB / 2.3 GB in config).
   **Correction:** state the current steady state — strata endpoint not
   responding, ninfer carrying the lanes — and that this matches the doc's own
   "target state" section, not its "What is actually available" section.
5. **`compute-policy.md:227-233` — "DSH's local mode is currently a target that
   will not start" is false.** The target (`ninfer`) is running and serving.
   **Correction:** re-run `dsh-model show` and update.
6. **`compute-policy.md:48` — hostname `omarchy` at `100.120.87.29`.** The tailnet
   name for that IP is now **omarchy-2**; `omarchy` (100.97.204.54) is a
   different, offline machine.
   **Correction:** rename the section header to `omarchy-2`.
7. **`compute-policy.md:121` — "omarchy-5 (4 d)" in the offline list.** It is
   `active` in `tailscale status`.
   **Correction:** move omarchy-5 out of the offline list (and state what it is).
8. **`compute-policy.md:60` — "55 GB RAM (measured)" for strata-max.** The
   config's own `footprint_evidence` says 52 GB is the measured figure and 55 was
   the unit-banner estimate.
   **Correction:** "52 GB RAM (measured 2026-10-02, four loads)".
9. **`RELEASE-CHECKLIST.md:298` — "1,953 unit tests and a 161-spec Playwright
   suite".** Measured 2026-10-04: 2,048 unit test cases (70 files); 187 e2e test
   cases in 61 spec files.
   **Correction:** update both counts (or soften to "~2,000" with a date).
10. **`RELEASE-CHECKLIST.md:5` — the audit link is broken.**
    `2026-10-03-store-readiness.md` lives in `docs/audits/`, not beside the
    checklist.
    **Correction:** link `audits/2026-10-03-store-readiness.md`.

## UNVERIFIABLE claims

And precisely what would decide them.

1. **omarchy-2 internals** — `nvidia-smi` (GPU model/VRAM, L50), unit
   states (L59/60/392), `free -g`/MemoryPeak (L59/60), `Conflicts=` (L52),
   DIMM slots/192 GiB ceiling (L308), `libcudart`/CUDA/driver (L77-78),
   ollama `hemmingway*` (L90), Orca/Chrome VRAM (L94), Java/`~/Android/Sdk`
   (RELEASE L171), `dsh-model` (L225), `ocr` CLI (AGENTS L103).
   **What decides it:** run those commands ON omarchy-2, or from a host whose
   public key is authorised there (`ssh -o ConnectTimeout=4 100.120.87.29`
   from fr-2 fails: `Permission denied (publickey,password)`).
2. **Tailnet port ambiguity on om2** — `:8080`/`:8081`/`:11434` refuse
   connections (curl exit 7, no response) while `:18080` answers. That proves the
   strata/strata-max/ollama states (L59-60/90) but cannot distinguish
   "service down" from "port not tailnet-exposed". **What decides it:** the same
   ssh access as item 1.
3. **Live DB counts** — 709 marker rows / 352 fake accounts / 22 drop-ins /
   "1234 E2E Ave NE" (RELEASE L71/105) and the "1287 rows" history (L86).
   **What decides it:** `node scripts/sweep-e2e-markers.mjs select` on a host
   with `node_modules` installed and a `.env` carrying `SUPABASE_ACCESS_TOKEN`
   (absent on this worker; the run here exits 1 with
   `ERR_MODULE_NOT_FOUND: @playwright/test`).
4. **fr-3 model name** — `qwen3.5-4b-mtp-q4` (compute-policy L113). **What
   decides it:** the fr-3 bearer key (endpoint returns 401 without it; no key
   found on fr-2, not even in `~/.pi/agent/models.json`).
5. **Provider credit-ceiling status** (compute-policy L263-264) — server-side
   meter state; needs the provider's dashboard or API.
6. **AGENTS.md:202 skill set** — the named mattpocock skills are not in
   fr-2's `~/.claude/skills`; whether the orchestration host has them is
   unprovable from here. **What decides it:** `ls ~/.claude/skills/` on the
   host that runs the orchestrator.
7. **The conditional routing table** (compute-policy L336-342) is only testable
   **after** the RAM upgrade — today it holds only as the documented fallback
   behaviour (all lanes → ninfer), which is what the router actually does.

## Method note

- **What I could not reach, and why.** All omarchy-2 (100.120.87.29) state was
  probed from fr-2: ssh refused (no authorised key; tailnet policy also blocks
  fr-3's ssh), so every `systemctl`/`nvidia-smi`/`free`/`ldconfig`/unit-file
  claim about that machine is UNVERIFIABLE here — recorded with the command and
  the `Permission denied` error, never counted as STALE. `:8080`/`:8081`/`:11434`
  refuse connections via the tailnet (curl exit 7) while `:18080` answers, so
  unit *states* remain ambiguous (down vs. not exposed). DB claims are blocked by missing
  `node_modules` + `SUPABASE_ACCESS_TOKEN` on this worker.
- **Tools used, all read-only.** `tailscale status`; `node
  scripts/factory/factory.mjs route <kind>` (the brief's `fleet route` — no
  `fleet`/`factory` binary is on PATH here, so the repo's own entry point was
  used); read-only curl probes (`-m 3`, bearer keys from `~/.pi/agent/models.json`);
  `git ls-files`/`cat-file`; `grep`/`ls`; `bash scripts/steering-lint.sh` (exit 0);
  `node scripts/sweep-e2e-markers.mjs select` (attempted, exit 1 — recorded);
  one fetch of the Google policy page. No `npm test`, no `npm run verify`, no
  Playwright, no writes or migrations, no starting/stopping any inference server
  (only reading state, per the repo's own rule).
- **Probes kept out of the tree.** Raw probe outputs live in
  `.scratch/audit-probes/` (untracked, not committed). The only committed
  change is this report.
- **Prior report at this path.** A concurrent earlier fr-2 attempt committed a
  first version of this report (commit `1e46139`, "docs: add documentation
  staleness audit report") at 19:32Z, mid-audit, and left a non-template
  `.fleet/completion.json` behind. That commit sits in this branch's history
  (direct parent of my commit); its report contained a factual error (it
  reported the 5090 machine as an AMD RX 6700 XT / 31 GB RAM — the specs of
  worker fr-2, the machine this audit runs from, not the machine the doc
  describes). Per the brief, this file is the deliverable, so my commit
  replaces the report in place; the earlier version stays recoverable at
  `1e46139`.
---

# Adjudication — orchestrator, 2026-10-04

Three read-only audits came back from the fleet on 2026-10-04. Two were
adjudicated the same day and merged with the ruling appended
(`audit-v29-diff.md`, `audit-triage-claims.md`). **This one was the loose end.**
The report above is unchanged and its findings stand; this section is the ruling.

**Method.** Every `STALE` verdict was re-measured. Every `UNVERIFIABLE` verdict
was re-tested **from `omarchy`** — the machine fr-2 could not `ssh` into
(`Permission denied (publickey,password)`, quoted in the report above) and
therefore the machine whose claims this report could only label unprovable. That
is where the adjudication adds the most: **9 of the report's 10 `UNVERIFIABLE`
items are decided here.** A verdict is overturned only by a command that
contradicts it. **None was.**

## Headline: unlike fr-1's audit, this one holds

All ten `STALE` verdicts are **UPHELD** — two with corrected grounds. Compare
fr-1's V29 diff review, whose two `CONFIRMED` findings were both refuted. The
difference is the brief: fr-2 was told *"your own access limits are not evidence
about the target"*, and it obeyed. It refused to call a doc stale because a
remote box eluded it. That discipline is precisely what makes the ten verdicts it
*did* return worth trusting — and it is why the fleet's first rule cuts both
ways: a worker's claim is a belief, but a worker's *measurement with its
command* is evidence.

## The ten STALE verdicts — 10/10 UPHELD

| # | Claim (doc:line) | Ruling | Orchestrator's measurement, from `omarchy` |
|---|---|---|---|
| 1 | `compute-policy.md:22-27` routing table: 5/7 lanes → cloud | **UPHELD** | `factory.mjs route <kind>` for all 7: builder, reviewer, verifier, **ocr**, **explorer** → `ninfer/qwen3.8-27b` (cost_tier 0); researcher → `ollama-cloud/deepseek-v4.1-flash:cloud` (fell back to cost_tier 2); gate → no model. Exactly one lane reaches cloud, as fr-2 measured. |
| 2 | `:32-33` `strata`/`ninfer` `footprint_source: "unmeasured"` | **UPHELD** | `factory/config.json`: **both `"measured"`** (ninfer 3 GB / 24 GB; strata 48 GB / 13 GB), each with `MEASURED 2026-10-02` evidence. Cause 1 is fixed. |
| 3 | `:37` `ninfer` `tool_use` **2** | **UPHELD** | Config: `tool_use: 3`, and `_tool_use_source` says *"Was declared tool_use: 2, which failed the … floor of 3 and sent every lane to cloud."* The doc is quoting the value the config already corrected. |
| 4 | `:61` `ninfer-serve` **crash-looping**; RAM unmeasured | **UPHELD** | `ninfer-serve` = `active (running)`, **NRestarts 0**, holding **25340 MiB**; `:18080/v1/models` → **200** serving `qwen3.8-27b`. RAM is `ram_gb: 3`, `"measured"`. |
| 5 | `:227-233` DSH local mode **"a target that will not start"** | **UPHELD, now measured** | `dsh-model show` → `{'provider': 'qwen-local', 'model': 'qwen3.8-27b'}` — the switch is *made*, and the target is serving (row 4). Change 7 is done, not pending. |
| 6 | `:48` host `omarchy` at `100.120.87.29` | **UPHELD, corrected grounds** | Correct that the tailnet node at `100.120.87.29` is **`omarchy-2`**, and `omarchy` = `100.97.204.54` (offline 26 d) — two different machines. But the local **hostname is literally `omarchy`**, so the fix is to name both (*"this box — hostname `omarchy`, tailnet node `omarchy-2`"*), not a bare rename that invents a third name. |
| 7 | `:121` `omarchy-5 (4 d)` in the offline list | **UPHELD** | `tailscale status`: **omarchy-5 `active`** (relay "sea"). The rest of the line is drift, not error: DESKTOP-JMR591K 38 d → **40 d**, jon-1 24 d → **26 d**, `omarchy` 24 d → **26 d**. |
| 8 | `:60` `strata-max` **"55 GB RAM (measured)"** | **UPHELD, sharper cause** | The config's own `footprint_evidence` says *"52 is the measured figure and the earlier 55 was the unit banner's estimate."* ⚠️ **The doc mirrors a defect in the source:** `factory/config.json` still carries `resources.ram_gb: 55` for strata-max while its own evidence string says 52. Fix the config and the doc together, or the next audit re-finds this. |
| 9 | `RELEASE-CHECKLIST.md:298` "1,953 unit tests / 161-spec Playwright suite" | **UPHELD** | Measured: **72** `*.test.ts` files / **2091** cases; **63** e2e specs / **191** cases. Neither number survives. (Counts differ by grep method; the gate's own authoritative figure at the last verified run was **74 files / 2170 tests**, recorded in `task-state.md`.) The fix should quote the gate, not a hand-rolled grep. |
| 10 | `RELEASE-CHECKLIST.md:5` broken `2026-10-03-store-readiness.md` link | **UPHELD, off-by-one** | The link is on **line 6** (line 5 is the `>` blockquote). Target `docs/2026-10-03-store-readiness.md` does not exist; the file is at `docs/audits/2026-10-03-store-readiness.md`. Broken as claimed. |

## The UNVERIFIABLE verdicts — 9 of 10 now decided

fr-2 recorded these honestly as its own limits. From `omarchy` they are ordinary
measurements. **None contradicts a doc claim fr-2 had already called correct —
but three contradict the doc's *state* table, which is the new finding below.**

| fr-2's UNVERIFIABLE item | Now | Measurement |
|---|---|---|
| `compute-policy.md:50` RTX 5090, 32 GB VRAM, 62 GB RAM | **VERIFIED** | `nvidia-smi`: `NVIDIA GeForce RTX 5090, 32607 MiB`; `free -g`: 62 GiB total, 37 available. **The doc is right**, and the superseded first fr-2 version (`1e46139`) that reported "AMD RX 6700 XT / 31 GB" was describing fr-2 itself — as the report above already says. |
| `:52-54` units `Conflicts=` | **VERIFIED** | `Conflicts=` is declared in the unit files; ninfer holds the card at 25340/32607 MiB, so one local model at a time is real. |
| `:59-60` unit states (strata-serve active; strata-max inactive/dead) | **STALE — new finding** | See below. |
| `:308` two empty DIMM slots, ceiling 192 GiB | **VERIFIED** | `dmidecode`: `Maximum Capacity: 192 GiB`, 4 devices, **2 × 32 GiB installed, 2 empty**. |
| `:77-78` `libcudart.so.13`, driver 610.57.04 | **VERIFIED** | `ldconfig -p` → `libcudart.so.13 => /opt/cuda/lib64/`; `nvidia-smi` driver **610.57.04**. |
| `:90` ollama holds only `hemmingway*` + two cloud passthroughs | **VERIFIED** | `/api/tags` → `hemmingway-writer:latest`, `hemmingway:27b-q4km`, `hf.co/…Hemmingway-1-GGUF:Q4_K_M`, plus `deepseek-v4.1-flash:cloud` and `glm-5.3-flash:cloud`. |
| `RELEASE-CHECKLIST.md:171` Java 26 + `~/Android/Sdk` | **VERIFIED** | `openjdk 26.0.2.1`; `~/Android/Sdk` exists. Android-first is still buildable here. |
| `:225` `dsh-model` reports cloud | **STALE (already-fixed)** | `dsh-model show` → `qwen-local/qwen3.8-27b`. Doc row 5 above. |
| `AGENTS.md:103` `ocr` CLI | **VERIFIED — and this needs a decision** | `ocr` **is installed**: `open-code-review v1.12.11 (a758d9c)`. But `plan.md`'s v29-11 close records *"`ocr` LANE UNAVAILABLE — not installed on this box (not on PATH, not in `node_modules/.bin`)"*. Either it landed after that run or the PATH differed. **Read the record's own rule: a deviation is never a pass.** V29 closed without its third review lane on a premise that no longer holds; decide whether that lane gets re-run. |
| `AGENTS.md:202` mattpocock skills in `~/.claude/skills/` | **VERIFIED** | `grill-me`, `grill-with-docs`, `to-spec`, `to-tickets`, `wayfinder`, `setup-matt-pocock-skills`, `tdd` all present. |
| `RELEASE-CHECKLIST.md:71` 709 marker rows / 352 fake accounts | **DRIFTED — measured** | Read-only `sweep-e2e-markers.mjs select`: **279** e2e users / 334 all users; profiles 279, auth.users 279, kids 5, **every content table 0**; TOTAL **563**. The claim is not wrong, it is *undated*: the same read was 264/533 at v29-11 and 279/563 now. **The correction is a date, not a new number** — a volatile count frozen in prose re-reads as stale forever. |
| Tailnet port ambiguity on `:8080`/`:8081`/`:11434` | **DECIDED — the port was never the issue** | Probed **on the host itself**, not across the tailnet: `:8080` and `:8081` **refuse**; `:11434` → 200; `:18080` → 401 without a bearer, 200 with one. So the strata endpoints are genuinely down — the ambiguity fr-2 flagged was an artifact of probing from fr-2, exactly as its brief warned. |
| fr-3 model name `qwen3.5-4b-mtp-q4` (`:113`) | **STILL UNVERIFIABLE** | fr-3 `:8080` answers `401 Invalid API Key` — endpoint up, bearer enforced, and no working fr-3 key on this box (the "fr-3" entry in `~/.pi/agent/models.json` is an ollama provider). Unchanged, for the reason fr-2 gave. |
| Provider credit ceiling (`:263-264`) | **STILL UNVERIFIABLE** | Server-side meter; needs the provider's own API or dashboard. |
| Conditional routing table after the RAM upgrade (`:336-342`) | **STILL CONDITIONAL** | Holds only as the documented pre-RAM fallback — which is what the router does (row 1). |

## New finding: the unit-state column is rotated across all three rows

fr-2 could not see this; it is visible only from `omarchy`. The table at
`compute-policy.md:46-50` assigns each unit a state, and **all three are
misassigned** — the description the doc gives `ninfer-serve` belongs to
`strata-max`, and the unit the doc calls healthy is the dead one.

| unit | doc says (`:48-50`) | measured | verdict |
|---|---|---|---|
| `strata-serve` | **active** | `inactive (dead)` | **STALE** |
| `strata-max` | **inactive/dead** | `activating (auto-restart)`, `status=1/FAILURE`, **NRestarts 3544**, Mem peak 855 MB | **STALE** — it is the crash-looper |
| `ninfer-serve` | **activating/auto-restart — crash-looping** | `active (running)`, **NRestarts 0**, holds 25340 MiB, `:18080` serves `qwen3.8-27b` | **STALE** — it is the healthy one |

**Cause, and it is the doc's own thesis working in reverse.** The 5090 serves
one local model at a time. `ninfer` currently holds the card (25.3 of 32.6 GB),
and both strata units `Conflicts=` against it — so the two units the doc calls
running are the two that *cannot* run, and the unit it calls crash-looping is
the one carrying every lane (row 1). The doc's mutual-exclusion insight is
correct; its state column is a snapshot taken before the roles swapped.

## What this changes

1. **fr-2's audit is accepted in full: 10/10 STALE upheld, 9 UNVERIFIABLE closed.**
   Nothing is refuted; nothing is discarded.
2. **A doc-fix slice now has a complete, adjudicated work list** — the ten
   corrections above, plus the rotated unit-state column, plus the two
   source-side fixes the audit exposed (`factory/config.json` `ram_gb: 55` vs
   its own evidence string; `dsh-model` rows 5/7 now describe a completed
   change). The fr-2 brief was explicit that **the fixes are a separate,
   human-reviewed change** — this ruling defines it.
3. **`ocr`'s absence at v29-11 is a false negative in the record**, not a
   missing tool (`open-code-review v1.12.11` is installed). The third review
   lane was skipped on a premise that does not hold; re-running it over the V29
   range is a decision, not an assumption.
4. **`RELEASE-CHECKLIST.md`'s volatile counts need dates**, not corrections —
   709/352 was a reading, and today's reading is 279/563.

## Process note

Two audits, two opposite outcomes, and the same lane. fr-1's review fabricated
specifics (`CONFIRMED` findings that dissolved on contact with the file). fr-2's
returned ten verdicts that all survive re-measurement *and* a correct refusal to
assert what it could not see. The variable was not the model; it was the brief.
fr-2's brief carried the rule that decided it — **"your own access limits are
not evidence about the target"** — and a worker that follows a rule written for
its exact failure mode produces evidence instead of confident noise.

Everything above was measured on `omarchy` on **2026-10-04**, each with the
command that produced it. Where a number is a dated reading rather than a
stable fact, it says so.
