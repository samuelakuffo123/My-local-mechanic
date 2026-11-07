# MechNow

## Project

MechNow is a React 19 and TypeScript application built with Vite and Tailwind CSS v4. Its Node.js API uses SQLite.

## Development

- Use `npm run dev` to start the web client.
- Use `npm run api` to start the backend.
- Use `npm run test:api` for API integration tests.
- Use `npm run build` to validate the production client bundle.

## Conventions

- Keep changes focused and preserve existing UI and API behavior.
- Use Tailwind CSS utilities for component styling and `src/index.css` for shared styles.
- Keep secrets and local database files out of source control.
- Validate API inputs on the server and scope private records to the authenticated user.
