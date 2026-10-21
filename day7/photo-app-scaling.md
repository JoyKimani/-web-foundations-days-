# SnapShare Photo-App Scaling Plan

## Assumptions and estimates

- There are 10 million registered users, and 10% are active on a typical day.
- Each daily active user uploads one original photo and requests 50 feed pages per day.
- Each original photo is 2 MB, and its generated thumbnail is 50 KB (0.05 MB).
- Use decimal storage units (1 TB = 1,000,000 MB), 86,400 seconds per day, and 365 days per year.
- For the yearly storage estimate, retain every original and thumbnail for the full year; exclude replication, backups, other media sizes, and metadata.

Daily active users:

```text
10,000,000 registered users x 0.10 active = 1,000,000 DAU
```

Average uploads per second:

```text
1,000,000 uploads per day / 86,400 seconds per day = 11.57 uploads/second
```

Feed views per second:

```text
1,000,000 DAU x 50 feed pages = 50,000,000 feed views per day
50,000,000 / 86,400 = 578.70 average feed views/second
578.70 x 5 = 2,893.52 peak feed views/second (about 2,894)
```

Photo storage per year:

```text
Originals:   1,000,000 photos/day x 2 MB x 365 = 730,000,000 MB = 730 TB/year
Thumbnails:  1,000,000 photos/day x 0.05 MB x 365 = 18,250,000 MB = 18.25 TB/year
Combined:    748,250,000 MB = 748.25 TB/year
```

These are average rates and raw stored-object sizes; real peak upload traffic, image renditions, replication, backups, and retention policies can increase capacity needs.

## Read/write profile

SnapShare is read-heavy: the stated workload has about 50 million feed-page reads per day for 1 million new uploads, or roughly 50 feed reads per upload. The design therefore caches hot feed data, serves photo bytes through a CDN, and scales database reads separately, while keeping upload processing durable and asynchronous.

## Architecture

```text
                          feed/API requests
[Mobile/Web Clients] ------------------------------+
       |                                            v
       | photo delivery                     [Load Balancer]
       v                                            |
     [CDN] <---- cache miss ---- [Object Storage]   v
       ^                                      [Stateless App Servers]
       |                                            |          \
       +---------- thumbnails/originals             |           +--> [Feed Cache]
                                                    |                    |
                                                    |                    v
                                                    |             [Read Replica]
                                                    |                    ^
                                                    +--> [Primary Database] --replication--+
                                                    |                                      |
                                                    +--> [Durable Thumbnail Queue]          |
                                                               |                            |
                                                               v                            |
                                                        [Thumbnail Worker] ----------------+
                                                          |             |
                                                          +--> reads original and writes thumbnail
                                                                in [Object Storage]
```

### Components

- **CDN:** Caches photo objects close to viewers to reduce image latency and origin bandwidth.
- **Load balancer:** Distributes API requests across healthy app servers and absorbs traffic spikes.
- **Stateless app servers:** Authenticate users, validate uploads, issue signed upload URLs, write metadata, and assemble personalized feeds.
- **Feed cache:** Keeps frequently requested feed pages or feed IDs in fast storage to reduce repeated database work.
- **Primary database:** Stores users, follow relationships, photo metadata, object keys, and processing state as the authoritative write source.
- **Read replica:** Serves feed and profile reads to increase read capacity without competing with primary writes.
- **Object storage:** Holds original photos and generated thumbnails as durable, scalable blobs without placing large binary files in database rows.
- **Durable thumbnail queue:** Buffers thumbnail jobs so upload traffic is decoupled from image processing and jobs can be retried.
- **Thumbnail worker:** Consumes queued jobs, reads originals, creates smaller thumbnails, stores them, and records completion.

Photos should not be stored inside the relational database because large blobs make backups, replication, and database I/O more expensive; store the bytes in object storage and keep their keys and metadata in the database.

## Photo upload flow

1. The client asks an app server to start an upload; the app authenticates the user, validates the request, and creates a pending photo record.
2. The app returns a short-lived signed upload URL for the original-photo object in object storage.
3. The client uploads the original directly to object storage, avoiding routing large bytes through the app servers.
4. The client notifies the app that the upload completed; the app verifies the stored object and marks the record as processing.
5. The app enqueues a thumbnail job; the durable queue acknowledges it so the client does not wait for image processing.
6. A worker reads the original from object storage, creates the thumbnail, and writes the thumbnail object back to storage.
7. The worker marks the photo ready in the primary database; subsequent feed reads can return its metadata and CDN-backed image URLs.

## Trade-offs

- **Precomputed feeds vs. feed-on-read:** Fan-out-on-write makes common feed reads fast but adds write amplification and can be costly for users with many followers; fan-out-on-read reduces write work but increases feed-query latency, so a hybrid can treat high-follower accounts differently.
- **Caching/CDN vs. freshness and access control:** Caches lower latency and database/object-storage load, but updates may be briefly stale and private photos require signed URLs or careful cache-key and invalidation rules.
- **Asynchronous thumbnails vs. immediate completeness:** A queue keeps uploads fast and absorbs worker outages, but a newly uploaded photo may lack its thumbnail until a worker succeeds, requiring visible processing state and retry handling.
