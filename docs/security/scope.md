# Security assessment scope

Engagement: defensive white-box review of the portfolio monorepo (branch `rebuild/monorepo`), authorised by the repository owner.
Rules: localhost only; no external hosts, production, or third-party systems; no destructive payloads; secrets are never printed.

Scope is checked with the Claude-BugHunter deterministic checker (`scope.py`: deny wins, default deny). The lead supplied the checker partway through the engagement; see `BUGHUNTER_AUDIT.md` for its output. The bullets below are in the format the checker parses: the first token of each bullet is the pattern.

## In scope

- localhost — loopback hostname (and `*.localhost`)
- 127.0.0.0/8 — IPv4 loopback (API via `app.listen('127.0.0.1')`, dev servers, PoC servers)
- ::1 — IPv6 loopback

Non-network assets (not checked by the tool, since they are not hosts):

- Source code, migrations, configuration and git history of this repository (`D:\CODING\My-Protfolio`).
- In-process test instances: `buildApp()` + in-memory PGlite driven with `app.inject()`. These open no socket.
- Infrastructure files (`infrastructure/**`, `docker-compose*`, `.github/**`). These are reviewed only (read-only). Their owners are still editing them, and the Docker/nginx stack was not run.

## Out of scope

- islambadran.com — production site and API (and all subdomains)
- etqanpp.com — the owner's company site, linked from the footer
- wa.me — WhatsApp hand-off (third party)
- instagram.com — linked social profile (third party)
- example.com — placeholder domain used in tests and docs
- example.net — placeholder
- example.org — placeholder
- cloudflare.com — referenced in nginx comments only

Everything not listed under "In scope" is out of scope by default: hosting providers (Hetzner), CDNs, package registries, GitHub, and any IP outside loopback. The only outbound network call was `npm audit`, a read-only query to the npm registry made by the standard tooling. It sends the dependency list, not project data.
