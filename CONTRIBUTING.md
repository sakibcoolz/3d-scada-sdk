# Contributing

Thanks for helping. The SDK is developed in small, reviewed steps:

1. Read [AGENTS.md](AGENTS.md) and [rules.md](rules.md) (they apply to people as well as coding agents), then the docs they list.
2. Pick or open an issue; larger changes start with an ADR in `docs/adr/` (see [DECISION_LOG.md](docs/DECISION_LOG.md)).
3. Work on a feature branch off `develop`; write the failing test first.
4. Run the checks and say which ones you ran:

   ```sh
   pnpm install --frozen-lockfile
   pnpm typecheck && pnpm test && pnpm build
   pnpm test:e2e
   pnpm verify:consumer && CONSUMER_APP=<printed dir> pnpm test:consumer
   ```
5. Update the docs touched by the change, and open a pull request to `develop`.

Safety boundary: the SDK must not gain the ability to write to PLCs or control equipment without an approved safety design (see [docs/SECURITY_AND_SAFETY.md](docs/SECURITY_AND_SAFETY.md)). No mandatory network connection is allowed in the SDK packages.

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
