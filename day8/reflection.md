The most difficult concept for me was asynchronous JavaScript. At first I did not understand why my code showed `Promise {<pending>}` instead of the data. What helped was learning that `fetch` returns a promise for a future value and that `await` pauses only its async function while the browser continues working. Rebuilding the user directory assignment and watching requests in the Network tab made the idea click.

The feedback on my capstone was that the architecture diagram had good components but did not explain cache invalidation clearly. I would improve the `POST /notes` flow by showing exactly when the affected user's notes cache is invalidated, how stale entries are prevented from being served, and how a successful write appears on the next read.

Next, I want to build a real QuickNotes backend with Node.js, Express, and PostgreSQL so the API contract and data model become working code. I would then learn React and use it to build a richer client for the service.
