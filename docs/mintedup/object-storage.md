# Minted Up production object storage

## Decision

Minted Up uses a storage boundary with two explicit backends:

- `file` — local development only;
- `r2` — the recommended production backend for listing photographs.

Cloudflare R2 is the production recommendation for the current application because it provides private S3-compatible object storage, presigned PUT/GET operations, zero internet egress charges, and a useful free allowance for a solo-operated image-heavy marketplace. Neon Object Storage was also evaluated, but the current London Neon project reports object storage as unavailable in its region. Vercel Blob remains a viable alternative, but the project currently has unresolved Vercel workspace-authorisation issues and its transfer/storage economics are less attractive for a high-resolution catalogue.

This document describes the code path. It does **not** mean R2 is active in production. Production is not storage-ready until the real bucket, CORS policy, lifecycle rule and deployment secrets are configured and an end-to-end upload/read/replace/delete test passes.

## Architecture

The browser never receives an R2 API credential.

1. The signed-in seller selects a JPEG, PNG or WebP in the existing 30-slot composer.
2. The browser measures focus as before.
3. `POST /api/mintedup/images/presign` re-authenticates the seller, applies same-origin/rate-limit checks, validates the slot/MIME/announced size, and verifies listing ownership plus editable state.
4. Minted Up generates an opaque `pending-...` object key and a short-lived presigned `PUT` URL restricted to the declared `Content-Type`.
5. The browser uploads the image bytes directly to the private R2 bucket.
6. `POST /api/mintedup/images/finalize` re-authenticates and re-checks ownership/state, uses `HEAD` to inspect object metadata, reads the stored bytes, re-runs Minted Up's server-side image-quality/content sniffing, and verifies actual content against the declared MIME type.
7. Accepted bytes are promoted from `pending-...` to an immutable `image-...` object key.
8. Only then is the listing record updated. The Durable Data Core mutation callback contains no R2 side effects, so optimistic-concurrency retries cannot replay an upload/delete operation.
9. Replaced objects are cleaned up after the database has taken ownership of the new object.
10. The stable `/api/mintedup/images/<filename>` route issues a short-lived signed read redirect for durable objects. Local development files continue to stream through the same route.

Failed direct uploads use an authenticated cleanup endpoint. A bucket lifecycle rule is still required as a backstop for clients that disappear after receiving a presigned URL.

## Security invariants

- R2 access key and secret never enter browser JavaScript, HTML, Git, logs or listing records.
- Presign and finalise requests require the existing Minted Up session.
- Same-origin protection remains on all application mutations.
- Upload/finalise/cancel/delete operations remain rate limited.
- The object key contains SHA-256 ownership tokens rather than reversible user/listing identifiers.
- A pending key is accepted only for the authenticated seller and listing that generated it.
- Pending keys cannot be served by the public image route.
- Listing ownership and editable status are checked at presign **and again** at finalisation.
- JPEG/PNG/WebP allow-list, 25 MB ceiling, 30-slot ceiling, content sniffing and image-quality grading remain server-enforced.
- The stored object's actual byte length is checked before acceptance; the client-supplied size is not trusted.
- External object-storage operations do not run inside a replayable Durable Data Core `mutate()` callback.
- The bucket stays private. Listing reads use short-lived signed GET URLs.

## Required production environment

Set these only in the canonical deployment's secret/environment store:

```text
MINTEDUP_UPLOAD_BACKEND=r2
MINTEDUP_R2_ACCOUNT_ID=<Cloudflare account id>
MINTEDUP_R2_BUCKET=<private bucket name>
MINTEDUP_R2_ACCESS_KEY_ID=<bucket-scoped S3 access key id>
MINTEDUP_R2_SECRET_ACCESS_KEY=<bucket-scoped S3 secret>
```

Optional override for testing an S3-compatible endpoint:

```text
MINTEDUP_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
```

Do not commit real values. Do not expose them through `NEXT_PUBLIC_*` variables.

## R2 credentials

Create credentials scoped to the Minted Up bucket with only the object permissions needed by the server-side S3 client. The application needs to PUT, GET/HEAD, COPY and DELETE objects in that bucket. Do not use a global Cloudflare account token as the application credential when a bucket-scoped R2 token is available.

## Browser CORS

Browser PUTs to a presigned R2 URL still require bucket CORS. Allow only the exact Minted Up production and intentional preview origins.

Example for one production origin:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-MINTED-UP-HOST"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add preview origins deliberately; do not use `*` as the production origin merely to make previews convenient.

## Abandoned-upload lifecycle

Create an R2 object lifecycle rule:

```text
Prefix: pending-
Action: delete objects
Age: 1 day
```

Accepted images are renamed/promoted to the separate `image-` prefix and therefore do not match this rule.

The application also calls the authenticated cancel endpoint when a direct browser PUT fails, but lifecycle cleanup is the authoritative backstop for browser crashes, closed tabs and lost network connections.

## Local development

Default behaviour remains:

```text
MINTEDUP_UPLOAD_BACKEND=file
```

or simply omit `MINTEDUP_UPLOAD_BACKEND`.

Local files stay under `.data/mintedup/uploads`. In production, the Data Core page deliberately reports filesystem image storage as not ready.

## Activation checklist

Do not set `MINTEDUP_UPLOAD_BACKEND=r2` until the bucket is ready.

1. Create the private R2 bucket.
2. Create bucket-scoped S3 credentials.
3. Configure exact-origin CORS for browser PUT requests.
4. Add the `pending-` one-day lifecycle rule.
5. Put the five R2 environment values in the **canonical** Vercel project only.
6. Redeploy.
7. Open `/mintedup/admin/data` as an administrator and confirm image backend = `r2`, configured = yes, durable = yes, ready = yes.
8. As a seller, upload an accepted image and verify the slot displays it after a fresh request.
9. Replace the image and verify the replacement remains while the old object is removed.
10. Delete an image and verify the listing record and object both disappear.
11. Try an unsupported MIME type and an oversized file; both must be refused.
12. Confirm a pending object cannot be read through `/api/mintedup/images/<pending-key>`.
13. Confirm another seller/listing cannot finalise or cancel the first seller's pending key.
14. Confirm persistence across a separate request and a deployment/cold start.

Only after those checks should object storage be considered release-ready.

## Provider comparison summary

| Provider | Fit for Minted Up | Notes |
| --- | --- | --- |
| Cloudflare R2 | **Recommended** | S3-compatible, private buckets, presigned URLs, zero internet egress, good free allowance. |
| Vercel Blob | Good alternative | Tight Vercel integration, private storage available; current project has Vercel account-scope issues and transfer/storage is more metered. |
| AWS S3 | Excellent but heavier | Mature S3 feature set and presigned URLs; more account/IAM/cost surface for a solo-operated first release. |
| Neon Object Storage | Not currently viable | Current London Neon project reports the storage feature unavailable in-region. |

## References

- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Cloudflare R2 browser CORS: https://developers.cloudflare.com/r2/buckets/cors/
- Cloudflare R2 object lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
