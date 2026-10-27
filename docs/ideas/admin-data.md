# Admin data for 1.6.0 (CCTV-253 to CCTV-260)

What the admin page (cctv) gets from the server next, after the owner's list of 2026-10-27. The page's own items (CCTV-252, CCTV-257) need nothing here. The API's rules stay as in `docs/ideas/public-servers.md` (data, not views; times ISO UTC, durations in seconds, sizes in bytes). ADMIN_API stays 2 for additions; a field removed, renamed or with a new meaning bumps it (cctv checks for an exact match). Each change goes to cctv as a diff before it's merged.

All built for 1.6.0 (the items are in the backlog's Done). The API as it is now: `docs/deploy.md` (Admin, Kept paint, Traffic) and the header of `server/admin-api.ts`. What stays here is why it is so.

## Decisions (owner, 2026-10-27)

- Events are kept on disk, bounded so they can never fill it; the page shows 50 a page.
- Stats per session belong to its paint: a wipe resets them (the server's history keeps counting); a restored save brings its own back.
- Saves: 5 kept by age for public sessions; private ones are never kept, their paint downloads as it is now.
- A new session starts empty or from an uploaded save.
- The beacon carries ids: a page id (each page load) and the device id (`src/stored.ts`), for counts that are right. A well-known way: as an analytics client id and a page view id.
- People in one model (CCTV-260); the owner reviews it live.
- Each figure on the page says how fresh it is, and the tooltip says where it comes from.

