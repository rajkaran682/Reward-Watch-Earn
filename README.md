# Reward Watch & Earn — starter website

Hindi-first starter project for a rewards website. It includes registration/login, a balance, a clearly labelled demo task, withdrawal requests, and an admin review page.

## Important before launch
- This project does **not** contain a real advertising network or automatic bank transfer integration.
- Demo tasks are simulated and must never be presented as real paid ad views. `DEMO_MODE=true` is for testing only.
- For real rewards, first get written approval from an ad/offer provider that explicitly permits cash rewards. Many ad networks prohibit cash rewards for ad views; check the current policy before integration.
- Real payouts need a verified business payout account, KYC, adequate funds, fraud checks, and server-side provider integration. This starter records withdrawal requests for manual review; it does not transfer money.
- Do not put API secrets in frontend code or commit `.env` to GitHub.
- A production deployment should use persistent storage and a durable session store; ephemeral free hosting can lose local SQLite data when instances/redeploys change.

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and replace both secrets with long random values.
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

## Deploy on Render
- Push these files to a new GitHub repository.
- Render → New → Web Service → connect repository.
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `.env.example` in Render.
- Set `DEMO_MODE=true` for initial testing. Do not advertise the demo task as real earning.
- Add a persistent disk mounted at `/var/data` and set `DB_PATH=/var/data/data.sqlite` if using SQLite on Render; confirm the current plan supports persistent disks. For a larger production app, use managed PostgreSQL.
- Set `DEMO_MODE=false` only after implementing and testing a genuine provider callback in `server.js`.

## Real ad/provider integration
Implement the provider's server-to-server callback with signature verification and unique event IDs before crediting a user's wallet. Never award cash for a mere button click, timer, client-side JavaScript event, ad click, or fabricated completion. Keep provider event IDs unique to prevent replay/double-credit.

## Admin
Open `/admin` and enter the `ADMIN_KEY` value from the server environment. Admin can view users and mark withdrawal requests as `approved`, `paid`, or `rejected`. These labels are records only; `paid` must only be selected after a real transfer is independently completed. No payout is triggered by this app.
