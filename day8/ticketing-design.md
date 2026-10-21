# TicketHub - Design Document

## 1. Requirements

### Functional requirements

- Visitors can browse events by artist, venue, date, and location, then view event details and a seat map.
- A signed-in customer can select available seats, place a temporary hold, pay, and retrieve issued tickets.
- Customers can view their orders and ticket status; support staff can inspect an order and its payment/audit history.
- The system releases expired or abandoned holds and reports unavailable seats without confirming a purchase.

### Non-functional requirements

- **Correctness:** A seat is sold to at most one order, and an order is confirmed only after payment is confirmed.
- **Fairness:** A virtual waiting room admits sale traffic in a defined FIFO order, with rate limits and anti-bot checks, rather than letting clients win by retrying fastest.
- **Speed:** Event pages and seat maps should remain responsive during a sale; inventory checks and holds must be fast, while ticket email/QR generation can happen asynchronously.
- **Availability:** Browsing can degrade gracefully if a downstream service is unhealthy, but the system must fail closed for a seat hold or purchase when authoritative inventory cannot be checked.
- **Security:** Authenticate customers, authorize every order/hold against its owner, protect payment data through a payment provider, and rate-limit sensitive endpoints.
- **Durability and observability:** Persist confirmed orders, audit inventory transitions, and alert on payment errors, queue age, database contention, and expired holds.

## 2. Traffic estimates

Assumptions: use the worksheet's rounded 100,000-second normal-day divisor; each of 50,000 normal-day visitors views 10 pages. For a popular sale, 200,000 people arrive within 600 seconds and make about 10 requests each while refreshing, choosing seats, and paying. These interval averages do not model the sharper burst at the exact sale opening.

### Normal day

```text
Page views/day        = 50,000 visitors x 10 pages = 500,000
Average requests/sec  = 500,000 / 100,000 seconds = 5
Completed tickets/day = 5,000
```

### Popular concert sale

```text
Sale requests        = 200,000 people x about 10 requests = 2,000,000
Average requests/sec = 2,000,000 / 600 seconds = about 3,333
Sale vs normal       = 3,333 / 5 = about 667x (nearly 700x)
Maximum seat orders  = 20,000 seats; at least 180,000 visitors cannot buy one
```

Normal traffic is small; the hard problem is the sudden roughly 700x request spike and the fact that many people will contend for the same finite seats. The waiting room limits how quickly that crowd reaches the inventory database, and the service must quickly return `409 Conflict` when a seat is no longer available.

## 3. API design

All endpoints use HTTPS, JSON, and a customer bearer token where account ownership applies. Mutating payment/hold endpoints accept an `Idempotency-Key` so client retries do not duplicate a hold or charge.

| Method and path | Purpose | Success response |
| --- | --- | --- |
| `GET /events?search=&city=` | List and search events by terms and city. | `200 OK` with matching events. |
| `GET /events/{id}` | Return event details. | `200 OK` with event data. |
| `GET /events/{id}/seats` | Return seat labels, prices, and current statuses. | `200 OK` with a seat map; availability may be briefly stale. |
| `POST /holds` | Hold the requested seats for the authenticated customer for 10 minutes. | `201 Created` with `holdId` and `expiresAt`; `409 Conflict` if a seat is unavailable. |
| `POST /orders` | Pay for a valid hold and create an order with tickets. | `201 Created` with order and ticket data. |
| `GET /me/tickets` | List tickets belonging to the authenticated customer. | `200 OK` with the customer's tickets. |

Example hold body: `{ "eventId": 7, "seatIds": [101, 102] }`. Example order body: `{ "holdId": 55, "paymentToken": "provider-token" }`. `409 Conflict` means the request clashes with current inventory state because at least one requested seat is no longer available. The seat map can be briefly cached, but a hold always checks the primary database.

## 4. Data model

The relational model uses five tables:

- **users** (`id` primary key, `name`, `email` unique, `password_hash`) stores customer accounts.
- **events** (`id` primary key, `name`, `venue`, `starts_at`) stores concerts and other performances.
- **seats** (`id` primary key, `event_id` foreign key to `events.id`, `section`, `row`, `number`, `status`, `hold_id`, `hold_expires_at`) stores event inventory; `UNIQUE(event_id, section, row, number)` prevents duplicate seat labels within an event.
- **orders** (`id` primary key, `user_id` foreign key to `users.id`, `event_id` foreign key to `events.id`, `total`, `status`, `created_at`) stores one purchase for a user and event.
- **order_seats** (`order_id` foreign key to `orders.id`, `seat_id` foreign key to `seats.id`, composite primary key `(order_id, seat_id)`, and `UNIQUE(seat_id)`) links seats to orders and prevents one seat from appearing in multiple orders.

Relationships: an event has many seats (one-to-many); a user has many orders (one-to-many); an order can contain many seats, while each seat can belong to at most one order. `order_seats` implements the order-to-seat relationship, and the unique `seat_id` constraint enforces the one-order-per-seat rule.

Example schema constraints:

```sql
CREATE TABLE users (
       id BIGINT PRIMARY KEY,
       name VARCHAR(120) NOT NULL,
       email VARCHAR(254) NOT NULL UNIQUE,
       password_hash TEXT NOT NULL
);

CREATE TABLE events (
       id BIGINT PRIMARY KEY,
       name VARCHAR(200) NOT NULL,
       venue VARCHAR(200) NOT NULL,
       starts_at TIMESTAMP NOT NULL
);

CREATE TABLE seats (
       id BIGINT PRIMARY KEY,
       event_id BIGINT NOT NULL REFERENCES events(id),
       section VARCHAR(40) NOT NULL,
       row VARCHAR(20) NOT NULL,
       number VARCHAR(20) NOT NULL,
       status VARCHAR(20) NOT NULL CHECK (status IN ('available', 'held', 'sold')),
       hold_id BIGINT,
       hold_expires_at TIMESTAMP,
       UNIQUE (event_id, section, row, number)
);

CREATE TABLE orders (
       id BIGINT PRIMARY KEY,
       user_id BIGINT NOT NULL REFERENCES users(id),
       event_id BIGINT NOT NULL REFERENCES events(id),
       total DECIMAL(10, 2) NOT NULL,
       status VARCHAR(20) NOT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_seats (
       order_id BIGINT NOT NULL REFERENCES orders(id),
       seat_id BIGINT NOT NULL UNIQUE REFERENCES seats(id),
       PRIMARY KEY (order_id, seat_id)
);
```

## 5. Preventing double-booking

Holding a seat uses one conditional update inside a transaction:

```sql
BEGIN;

UPDATE seats
SET status = 'held',
              hold_id = 55,
              hold_expires_at = NOW() + INTERVAL '10 minutes'
WHERE id IN (101, 102)
       AND event_id = 7
       AND (
              status = 'available'
              OR (status = 'held' AND hold_expires_at < NOW())
       );

-- If fewer than 2 rows changed: ROLLBACK and return 409 Conflict.
-- If both requested rows changed: COMMIT and return 201 Created.
```

The database checks and changes each seat atomically. If two buyers request the same seat at the same time, one update changes the row first; the other update rechecks the `WHERE` condition and no longer matches the `held` seat. The application rolls back the entire request unless every requested seat changed, so a buyer never receives a partial set. An expired hold becomes eligible again after 10 minutes. `UNIQUE(order_seats.seat_id)` is a second safety net that prevents a seat from appearing in two orders. The cached seat map is advisory; the primary database makes the final decision.

After a valid hold, the payment flow uses an idempotency key with the payment provider. When payment succeeds, one transaction creates the order and `order_seats` rows and marks the seats sold. A failed payment does not create an order; reconciliation releases expired holds or refunds an already-captured payment if order finalization fails.

## 6. Architecture

```text
[Web / Mobile Clients]
          |
          v
        [DNS] ---> [CDN / WAF] ---> [Load Balancer]
                         |                  |
                  static/event cache        v
                                   +---------+----------+
                                   |                    |
                              [App Server A]       [App Server B] ...
                                   |                    |
                        +----------+----------+---------+
                        |                     |         |
                        v                     v         v
                 [Waiting Room]       [Browse Cache] [Payment Provider]
                 admits ~2,000 at once    |             ^
                        |                   |             |
                        +-------------------+             |
                                    |                     |
                                    v                     |
                    [Primary Relational Database] <-------+
                       | seats / holds / orders
                       | replication
                       v
                    [Read Replica(s)]
                                    \
                                     +--> [Durable Queue] --> [Worker Pool]
                                                               | tickets, QR,
                                                               | email, expiry
                                                               +--> database/provider
```

- **Web/mobile clients:** Let customers browse, choose seats, and purchase while treating server inventory as authoritative.
- **DNS:** Routes users to healthy regional entry points and supports controlled traffic shifting.
- **CDN/WAF:** Delivers static assets near users and filters common abusive traffic before it reaches the API.
- **Load balancer:** Distributes requests across healthy application instances and spans availability zones.
- **Waiting room:** Queues sale traffic using a signed FIFO token and admits about 2,000 buyers at a time, limiting pressure on inventory while preserving arrival order.
- **App servers:** Authenticate, validate, authorize, coordinate holds/orders, and scale horizontally because they keep no session state locally.
- **Browse cache:** Serves popular event details and approximate seat maps quickly; it is never authoritative for a hold or sale.
- **Primary relational database:** Serializes seat-state changes and durably records holds, orders, and payment outcomes.
- **Read replicas:** Increase capacity for event and ticket reads while keeping browse queries off the write primary.
- **Payment provider:** Handles card data and authorization so TicketHub does not store raw card details.
- **Durable queue:** Buffers ticket delivery, QR generation, notifications, and hold-expiry work outside the critical purchase request.
- **Worker pool:** Processes queued work idempotently and retries transient failures without blocking customers.

### Surviving the big sale

The waiting room admits about 2,000 buyers concurrently and releases more in FIFO order as capacity allows; the CDN and browse cache absorb event-page reads, allowing the database to handle the sale's roughly 3,300 incoming requests per second more predictably. Stateless app servers scale out behind a multi-zone load balancer. The primary database applies conditional updates only to the selected seat rows rather than a global inventory lock; replicas serve browsing, not inventory decisions. The queue and workers handle ticket delivery after purchase. Every tier has multiple instances or managed failover, and backups, health checks, metrics, and load tests cover recovery and sale-day capacity.

## 7. Trade-offs

- **Strict seat locking vs. maximum write throughput:** Row locks and an all-or-nothing multi-seat hold can briefly queue requests for popular seats, but they make the inventory decision correct; locking only selected seats and admitting traffic gradually limits the contention scope.
- **FIFO waiting room vs. immediate access:** A queue adds waiting time and operational complexity, but it improves fairness and protects the database from an uncontrolled thundering herd; signed queue tokens and published queue status make admission predictable.
- **Short holds vs. checkout convenience:** Short expirations free abandoned seats quickly, but can frustrate customers during slow payment; a bounded extension for active payment plus expiry workers balances fairness against completion time.
- **Cached availability vs. freshness:** Caching makes maps fast, but can show a seat that another buyer just held; clearly label availability as approximate and always confirm against locked primary rows before accepting a hold.

No tier is a single point of failure: DNS/CDN/load balancing are multi-endpoint services; application and worker fleets have redundant instances across zones; the queue is replicated; and the primary database has a synchronous standby/failover path, read replicas, and tested backups. Payment-provider failures fail closed for orders and can be retried idempotently.
