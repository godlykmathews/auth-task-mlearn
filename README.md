# Authent — Next.js Authentication

A complete email/password authentication app for the Web Development challenge **#evn-lf26-web-dev14**. Built with Next.js 16 App Router, TypeScript, React, `jose`, Zod, and libSQL.

## Features

- Signup and login with accessible, responsive forms, inline errors, password visibility controls, and loading states.
- Client and server validation: required fields, valid email, 8–128 character passwords, and matching confirmation.
- Passwords hashed with scrypt and a unique random salt; plaintext passwords are never saved.
- Signed HS256 JWTs in `HttpOnly`, `SameSite=Lax` cookies, with `Secure` enabled in production and a 24-hour expiry.
- Protected `/dashboard` using Next.js 16's `proxy.ts` middleware and a database-backed authorization check in the page itself.
- Logout revokes the database session and expires the cookie; a copied token cannot be reused after logout.
- Persistent account-based throttling (10 attempts per action/email in 15 minutes), same-origin POST checks, bounded request bodies, and generic login errors.
- Atomic account/session creation and a unique email constraint prevent partial signup and duplicate accounts.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run setup
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Use that exact origin: requests are checked against `APP_URL`.

`setup` creates `data/` and a private `.env.local` containing a random JWT secret and a persistent local SQLite database URL. It never overwrites an existing environment file. Database tables initialize automatically on the first authentication request. Both credentials and local database files are ignored by Git.

For the production build locally:

```sh
npm run build
npm start
```

## Environment

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | At least 32 random bytes, kept only on the server; generate with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. |
| `DATABASE_URL` | `file:./data/harbor.db` locally, or a dedicated remote `libsql://…` database in serverless production. |
| `DATABASE_AUTH_TOKEN` | Authentication token for the remote database. |
| `APP_URL` | Exact browser origin, such as `https://your-project.vercel.app`; required in production. |

Vercel's Turso Marketplace variables `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are accepted as alternatives. Do not expose any secret with a `NEXT_PUBLIC_` prefix. Use separate databases and secrets for previews and production.

## Tests

```sh
npm test
npm run typecheck
npm run build
```

Then keep `npm start` running in one terminal and run in another:

```sh
TEST_EXPECT_SECURE=true npm run test:integration
npx playwright install chromium
npm run test:browser
```

The HTTP suite checks validation, duplicate signup, cookie flags, protected pages, invalid credentials, token tampering/expiry, logout/replay, origin and content-type checks, body-size limits, and rate limiting. The browser suite checks visible errors, password controls, signup → dashboard → logout → login, cookie behavior, and mobile overflow. Screenshots are written to `test-results/`.

Both integration suites refuse non-local server URLs, use uniquely named `@example.test` accounts, and delete their own records afterward. The server and tests must use the same environment/database. Run against a disposable local database, not production.

## Deploy to Vercel

1. Create an empty GitHub repository and push this project, or import the repository in Vercel. Never commit `.env.local` or `data/`.
2. Create a dedicated Turso/libSQL database, for example with [Turso on the Vercel Marketplace](https://vercel.com/marketplace/tursocloud/database). File-based SQLite is not durable on Vercel; this app explicitly rejects it there.
3. Configure the four environment variables above in Vercel. If using the Turso integration's automatic variables, only `JWT_SECRET` and `APP_URL` need to be added separately. Set `APP_URL` to the project's stable HTTPS production domain, not an individual deployment URL.
4. Deploy using the Next.js preset and `npm run build` (or `npx vercel --prod` from an authenticated CLI). Node.js 22 or newer is required. The schema initializes automatically.
5. Visit the stable production domain. Verify signup, logout, blocked dashboard access, and login with a dedicated test account.

If using Git manually after creating the empty repository:

```sh
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Account throttling is shared through the database. A publicly exposed deployment should additionally enable the hosting provider's IP/bot rate limiting; the app deliberately does not trust arbitrary forwarded-IP headers. Email verification, account recovery, and MFA are outside this challenge's scope, so the UI does not promise them.

## Project map

```text
app/login, app/signup       Authentication pages
app/dashboard              Protected account and session page
app/api/auth/*              Signup, login, logout, and session endpoints
components/                Form, layout, and logout UI
lib/validation.ts          Shared input schemas
lib/password.ts            Scrypt password hashing
lib/jwt.ts                 JWT signing and verification
lib/session.ts             Persisted session creation, lookup, and revocation
lib/db.ts                  Database connection and schema
lib/http.ts                 Origin checks and bounded JSON requests
lib/rate-limit.ts           Persistent attempt limits
proxy.ts                   Next.js 16 middleware gate
tests/                     Unit and browser tests
scripts/test-auth.ts       HTTP integration tests
```

## Submission message

> #evn-lf26-web-dev14 Built an Authentication System with Next.js! Users can sign up, log in, access a protected dashboard via JWT, and log out securely. GitHub: https://github.com/godlykmathews/auth-task-mlearn · Website: [add deployed website link]

The website placeholder should only be replaced after a successful push and verified deployment.

## References

- [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication)
- [Next.js Proxy (middleware)](https://nextjs.org/docs/app/getting-started/proxy)
- [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
