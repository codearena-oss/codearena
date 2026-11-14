# Maintaining CodeArena

A guide for maintainers: how the project fits together, how changes reach codearena.co, what to check before merging, and what to do when something breaks. Contributors should start with [CONTRIBUTING.md](CONTRIBUTING.md).

## The shape of it

| Part | Where | Notes |
|---|---|---|
| Backend | `backend/` | Node, Express, Socket.io, SQLite. `server.js` holds battles, matchmaking and sockets; `routes/` the REST API; `db.js` schema, migrations and queries. |
| Code runner | `backend/arena/` | Builds a program from a player's code plus a small driver, runs it on Judge0, compares results. One driver per language in `runner/harness.js`. |
| Problems | `backend/arena/problems/` | One JSON file per problem, with JavaScript and Python reference solutions in `arena/solutions/`. |
| Frontend | `frontend/` | Next.js, React, Tailwind, Monaco. |
| Shared | `shared/` | Code both sides use, such as fair-use limits (`codearenaProductMode.js`). |

## How a change reaches codearena.co

1. A pull request runs CI (`.github/workflows/ci.yml`):
   - the publish boundary check;
   - backend: problem validation, a boot and health probe, and every test;
   - frontend: lint, tests and a production build.
   - browser flows: practice, private and bot battles, matchmaking, and page rendering against an isolated local database without production credentials.
2. Merging to `main` deploys automatically:
   - **backend** on Railway, using `railway.toml` at the repo root. Keep the service's Root Directory **empty**: the build and start commands already point into `backend/`.
   - **frontend** on Vercel, with Root Directory `frontend`.
3. Railway waits for `GET /health` to pass before switching traffic, so a build that crashes on boot never replaces the running version.

**`main` is production.** Merge only what you would deploy.

## Before you merge a pull request

- CI is green.
- The change is something you understand. Ask the author to explain anything unclear; that is normal in review.
- **New dependency?** Check it is maintained and widely used. Dependabot opens security updates on its own.
- **New environment variable?** It is documented in `backend/.env.example` (or `frontend/.env.example`). Optional features stay off when their variable is unset.
- **Database change?** It is a new migration at the end of the `migrations` list in `backend/db.js` with the next id, recorded with `npm run migrations:ledger`. Never edit or reorder an existing migration: live databases have already run it.
- **New problem?** `npm run validate:problems` passes (both reference solutions pass every test), and it is the author's own work.
- **Anything that costs money per use** (model calls, code runs) goes through the fair-use limits in `shared/codearenaProductMode.js`.

## Costs and safety limits

Application quotas limit normal use. Configure provider spending limits separately; application quotas do not protect against a stolen provider key.

| Service | Used for | Cap |
|---|---|---|
| Judge0 (RapidAPI) | Running player code | `CODEARENA_GLOBAL_DAILY_CODE_EXECUTION_LIMIT` runs per day, plus per-player daily limits |
| Anthropic | Claude models in prompt battles and other AI features | Workspace spend limit, plus `CODEARENA_GLOBAL_DAILY_PROMPT_EVALUATION_LIMIT` |
| OpenAI, Gemini, DeepSeek | Extra prompt battle models | Prepaid credit or free tier; each model hides itself when its key is unset |
| Resend | Email | Key restricted to the codearena.co domain |

Pricier models count more against the daily prompt budget (Opus 5, Sonnet 3, the rest 1), in `backend/services/promptBattleRunner.js`.

## Hosted deployment isolation

- Use dedicated provider credentials and resources for this deployment. A different repository or an avatar folder does not isolate a shared provider account.
- Cloudinary: use a dedicated product environment with its own cloud name, API key and secret. Existing avatar URLs can remain readable; only assets owned by the configured environment are eligible for deletion.
- RapidAPI: use a dedicated app/key for code execution and configure provider usage limits. A separate key alone does not guarantee separate billing or quota; verify the subscription settings.
- Keep production secrets in the hosting provider, never in this repository, browser configuration, CI logs or test artifacts.
- Give maintainers repository access and only the hosting projects they need. Require two-factor authentication for organization members after the owner has enrolled.
- After replacing credentials, redeploy the backend from source, verify health and exercise an avatar upload and code run. Revoke superseded credentials only after confirming that no other deployment still needs them.

The local browser suite does not verify production email delivery, provider credentials or hosting access. Before announcing a release, separately verify a new account's registration, email verification, login and code execution on the deployed site.

### Provider maintenance

Deploy support for these controls before enabling them:

- `CODEARENA_RUNNER=disabled` keeps the API running but returns execution unavailable for code submissions and custom inputs. It overrides configured Judge0 credentials and never falls back to local execution. Practice and coding battles cannot complete normally while it is enabled.
- `CODEARENA_AVATARS_DISABLED=1` rejects avatar uploads and deletions with HTTP 503 before processing images or contacting storage. Existing avatar URLs remain readable.

These switches stop normal application calls; they do not protect credentials still present in the process from a server compromise. Remove affected provider secrets from the deployment and restart it to remove runtime access. Revoke old keys at the provider after all legitimate consumers have migrated. Old deployments may retain configuration, so do not roll back to a deployment containing retired credentials.

To restore service, configure dedicated provider credentials, remove the maintenance switches, redeploy, and verify a code submission and an avatar change.

## When something breaks

- **Site down or acting strangely:** check `https://api.codearena.co/health`. It reports the running version (commit) and whether the database and websockets are up.
- **A bad deploy:**
  - frontend: in Vercel, promote the previous deployment (Instant Rollback);
  - backend: in Railway, redeploy the previous deployment;
  - then revert the commit on `main` so the next push does not bring it back.
- **"Code execution unavailable":** Judge0 is down or the daily cap is reached. It never counts against players. Check the RapidAPI dashboard and the cap.
- **A model errors in prompt battles:** usually a wrong model name or exhausted credit. Model names come from variables (`GEMINI_MODEL`, `OPENAI_PREMIUM_MODEL`, and so on); see `backend/.env.example`.
- **Security report:** handle it privately as described in [SECURITY.md](SECURITY.md). Do not discuss it in public issues until it is fixed.

## Moderation

### Integrity implementation boundary

The public battle-integrity implementation is developed independently for this project's players. Do not import private assessment detection engines, proctoring modules, edit-trace analysis, calibration fixtures, scoring thresholds or their tests from another product. The publish guard checks known private module names and identifiers, including copies under renamed paths. Human review is still required; this is not a general detector of copied code.

Generic UI state, account security and community moderation can remain public. New community-developed integrity techniques are welcome when contributors have the right to publish them. Validate detection and false-positive behavior before enabling them for players.

The project's license governs community contributions. Do not assume maintaining the project grants additional rights to incorporate others' contributions into proprietary software. Before any such reuse, record the source revision, authors and dependencies, and obtain a legal review of the applicable licenses and any separate permissions. No contributor has granted extra rights merely because this guide describes that review.

- Players can report users. Usernames go through a profanity filter.
- Gallery games run in a sandboxed frame (`sandbox="allow-scripts"`, no same-origin access), so a game cannot touch a player's account.
- Publishing a game runs automated checks first.

Act on reports promptly. Remove content that breaks the [Terms](https://codearena.co/terms).

## Known quirks

- Older accounts show 0 wins and 0 losses on the dashboard and friends list, while their profile shows their real record. The stats table was never backfilled from the battle history. A one-off backfill would fix it.
- All ratings sit at 1000 because ranked play has been quiet.
- Every problem and test is public, so ranked results can be gamed. A hosted instance can keep an extra private set in `CODEARENA_PRIVATE_PROBLEMS_DIR` (see the README).
- Booting a fresh database logs "migration statement skipped: duplicate column" warnings. They come from old migrations re-adding columns that already exist and are harmless.

## Good next things

- Languages: [Java #1](https://github.com/codearena-oss/codearena/issues/1), [C++ #2](https://github.com/codearena-oss/codearena/issues/2), [Go #3](https://github.com/codearena-oss/codearena/issues/3).
- More problems (the best first contribution for newcomers).
- The win/loss backfill above.
- A private problem set for ranked play.
- Issue and pull request templates, and labels such as `good first issue`.

## Running the checks locally

```bash
cd backend && npm test && npm run validate:problems
cd frontend && npm run lint && npm test
node scripts/check-boundary.js
```
