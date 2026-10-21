# TicketHub System Design

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

Assumptions: a day has 86,400 seconds; the 50,000 normal-day visitors each view 10 pages; each of the 5,000 daily tickets is treated as one completed order for a conservative write estimate. During a popular sale, assume each of 200,000 visitors makes 10 page requests and one hold attempt over the first 600 seconds. These are averages over each stated period; the real opening-second burst and retries can be higher.

### Normal day

```text
Page views/day       = 50,000 visitors x 10 pages = 500,000
Average reads/second = 500,000 / 86,400 = 5.79, about 5.8
Completed writes/day = 5,000 ticket orders
Average writes/second = 5,000 / 86,400 = 0.058
```

### Popular concert sale

```text
Sale page requests   = 200,000 visitors x 10 pages = 2,000,000
Average reads/second = 2,000,000 / 600 = 3,333
Hold attempts/second = 200,000 / 600 = 333
Seat sales/second    = at most 20,000 seats / 600 = 33.3
```

Under these assumptions, sale browsing is about **575x** the normal average read rate. Hold attempts are about **5,700x** the normal completed-order write rate, but many holds will contend for the same 20,000 seats and fail. Plan for higher synchronized bursts using load tests and a controlled waiting-room admission rate; do not treat these interval averages as safe peak capacity.

## 3. API design

All endpoints use HTTPS, JSON, and a customer bearer token where account ownership applies. Mutating payment/hold endpoints accept an `Idempotency-Key` so client retries do not duplicate a hold or charge.

| Method and path | Purpose | Success response |
| --- | --- | --- |
| `GET /v1/events?query=&date=&city=` | Browse and search published events. | `200 OK` with a paginated event list. |
| `GET /v1/events/{eventId}` | View event, venue, sale window, and price bands. | `200 OK` with event details. |
| `GET /v1/events/{eventId}/seats` | View seat labels, prices, and approximate availability. | `200 OK` with a seat map; availability is advisory. |
| `POST /v1/holds` | Hold one or more seat IDs for the authenticated customer for a short TTL. | `201 Created` with `holdId`, seats, and `expiresAt`; `409 Conflict` if any requested seat is unavailable. |
| `GET /v1/holds/{holdId}` | Check an owned hold's state and expiry. | `200 OK` with hold status. |
| `POST /v1/holds/{holdId}/purchase` | Authorize payment for a valid hold and create the order/tickets. | `201 Created` with order and ticket IDs, or `202 Accepted` while payment is processing. |
| `GET /v1/me/tickets` | List tickets for the authenticated customer. | `200 OK` with paginated tickets. |

The seat-map endpoint can be briefly cached, but the hold endpoint always checks the primary inventory database; a displayed available seat is not a promise that it remains available.

## 4. Data model

The core relational tables are `users`, `events`, `seats`, and `orders`.

- **users** (`user_id` primary key, `email` unique/not null, `display_name`, `created_at`) represents a customer account; one user can own many orders.
- **events** (`event_id` primary key, `name`, `venue_name`, `starts_at`, `sale_opens_at`, `status`) represents a performance; one event has many event-specific seat inventory rows.
- **seats** (`seat_id` primary key, `event_id` foreign key, `section`, `row_label`, `seat_label`, `price_cents`, `status`, `hold_id`, `held_by_user_id` foreign key, `hold_expires_at`) represents one sellable seat for one event. `UNIQUE(event_id, seat_label)` ensures a seat label is not duplicated within that event. A seat can be available, held, payment-pending, or sold.
- **orders** (`order_item_id` primary key, `order_id` checkout/group ID, `user_id` foreign key, `event_id` foreign key, `seat_id` foreign key, `amount_cents`, `status`, `payment_reference` unique, `created_at`) stores one ticket line; multiple rows may share an `order_id` when a customer buys several seats together. A unique constraint/index on `(event_id, seat_id)` for active or paid order lines prevents a seat appearing in two live or completed purchases; failed/cancelled rows do not block resale.

Relationships: users-to-orders is one-to-many; events-to-seats and events-to-orders are one-to-many; each seat can have at most one active/purchased order line. Foreign keys preserve event, customer, and seat references. A real deployment should use a partial unique index over `(event_id, seat_id)` where order status is `payment_pending` or `paid`, plus a database transaction to update the seat and order together.

## 5. Architecture

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
                 fair sale admission       |             ^
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
- **Waiting room:** Queues sale traffic using a signed FIFO token and releases users at a rate the inventory service can sustain.
- **App servers:** Authenticate, validate, authorize, coordinate holds/orders, and scale horizontally because they keep no session state locally.
- **Browse cache:** Serves popular event details and approximate seat maps quickly; it is never authoritative for a hold or sale.
- **Primary relational database:** Serializes seat-state changes and durably records holds, orders, and payment outcomes.
- **Read replicas:** Increase capacity for event and ticket reads while keeping browse queries off the write primary.
- **Payment provider:** Handles card data and authorization so TicketHub does not store raw card details.
- **Durable queue:** Buffers ticket delivery, QR generation, notifications, and hold-expiry work outside the critical purchase request.
- **Worker pool:** Processes queued work idempotently and retries transient failures without blocking customers.

### Preventing double-booking

For a hold request, the application starts a database transaction and locks the requested `seats` rows with `SELECT ... FOR UPDATE` in sorted seat-ID order. It verifies that every seat is available or has an expired hold; if any seat is unavailable, it rolls back the entire request. Otherwise it atomically changes all selected rows to `held`, stores the same hold ID, owner, and expiry, then commits. Concurrent requests for the same seat wait for that row lock and re-check the committed status, so only one can win. A unique constraint/index on `(event_id, seat_id)` for payment-pending or paid order lines is a second line of defense. Cache data is never used to authorize a sale.

At checkout, the service verifies the hold belongs to the caller and has not expired, transitions it to `payment_pending`, and calls the payment provider with an idempotency key without holding database locks across the network request. On confirmed payment, one transaction locks the seats, inserts the unique order lines, and marks the seats sold. A failed or timed-out payment releases the hold when safe; if payment succeeds after the hold has expired or the inventory commit fails, reconciliation triggers a refund rather than issuing a duplicate ticket.

### Surviving the big sale

The waiting room limits the number of concurrent seat-map/hold requests admitted to the database, while the CDN and browse cache absorb event-page reads. Stateless app servers scale out behind a multi-zone load balancer. The primary database uses row-level locks only on the selected seats rather than a global lock; replicas serve browse traffic, not inventory decisions. The queue and workers handle delivery after purchase. Every tier has multiple instances or managed failover, and backups, health checks, metrics, and load tests cover recovery and sale-day capacity.

## 6. Trade-offs

- **Strict seat locking vs. maximum write throughput:** Row locks and an all-or-nothing multi-seat hold can briefly queue requests for popular seats, but they make the inventory decision correct; locking only selected seats and admitting traffic gradually limits the contention scope.
- **FIFO waiting room vs. immediate access:** A queue adds waiting time and operational complexity, but it improves fairness and protects the database from an uncontrolled thundering herd; signed queue tokens and published queue status make admission predictable.
- **Short holds vs. checkout convenience:** Short expirations free abandoned seats quickly, but can frustrate customers during slow payment; a bounded extension for active payment plus expiry workers balances fairness against completion time.
- **Cached availability vs. freshness:** Caching makes maps fast, but can show a seat that another buyer just held; clearly label availability as approximate and always confirm against locked primary rows before accepting a hold.

No tier is a single point of failure: DNS/CDN/load balancing are multi-endpoint services; application and worker fleets have redundant instances across zones; the queue is replicated; and the primary database has a synchronous standby/failover path, read replicas, and tested backups. Payment-provider failures fail closed for orders and can be retried idempotently.
