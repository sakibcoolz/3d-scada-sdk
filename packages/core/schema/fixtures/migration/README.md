# Migration corpus (T-095)

Documents written by earlier versions of the SDK, each with its expected version 4 output (`*.v4.json`). `packages/react/src/migration-corpus.test.ts` loads each input as the editor does (`importSceneText`: parse, migrate, re-seat to ASME sizes) and checks four things:
- the result is the golden file;
- the golden file passes the JSON Schema;
- loading it again changes nothing;
- the joints are the same.

| Input | Schema | Written by |
|---|---|---|
| `v1-demo` | 1 | playground `demoScene` at `814f520^`, as `JSON.stringify` (version 1 had no serializer) |
| `v2-demo`, `v2-generated-12` | 2 | `serializeScene` and playground `demoScene` / `generatedScene(12)` at `32de410^` |
| `v3-demo`, `v3-generated-12` | 3 | the same at the `v0.1.2` release |
| `v3-mostly-connected-plant`, `v3-open-joints-plant`, `v3-unconnected-plant` | 3 | the owner's plant files shipped as components fixtures in 0.1.0–0.1.2; written before ASME fittings (ADR-0014), so loading re-seats them |

Every 0.1.x release wrote version 3. No version 1 or 2 file was ever committed, so those inputs were produced with the code of their time.

**Do not regenerate the inputs.** If a golden file changes, the change to loading must be deliberate and noted in RELEASE.md.
