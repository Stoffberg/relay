# Rate Limit Window Reset Has Race Condition

**Type:** bug
**Severity:** high
**Component:** server
**Reported:** 2026-02-27

## Description

The rate limiting logic in `chat_handler` uses two separate atomics (`global_request_count` and `global_window_start`) that are checked and reset non-atomically. When two requests arrive simultaneously at a window boundary, both can observe the stale `window_start`, both reset the counter, and the second request's `fetch_add` hits the wrong counter value. This lets requests slip through the rate limit.

In `apps/server/src/main.rs` around lines 428-432:

```rust
// Both threads can see old window_start
if now_secs - state.global_window_start.load(Ordering::Relaxed) >= 60 {
    state.global_request_count.store(0, Ordering::Relaxed);
    state.global_window_start.store(now_secs, Ordering::Relaxed);
}
let count = state.global_request_count.fetch_add(1, Ordering::Relaxed);
```

## Steps to Reproduce

1. Send two requests at the exact moment the 60 second window expires
2. Both see the old `window_start` and both reset the counter to 0
3. Both get `count = 0` from `fetch_add`, so neither is rate limited even if the previous window was full

## Expected Behavior

Window reset and counter increment should be atomic. Either use a `Mutex<(u64, u64)>` for the pair, or use `compare_exchange` on `window_start` so only the first thread resets the counter.

## Implementation Notes

A clean fix is `compare_exchange` on `window_start`: only the thread that successfully swaps the old value to the new value gets to reset the counter. All other threads see the exchange fail and skip the reset.

```rust
if state.global_window_start.compare_exchange(
    old_start, now_secs, Ordering::SeqCst, Ordering::Relaxed
).is_ok() {
    state.global_request_count.store(1, Ordering::SeqCst);
} else {
    state.global_request_count.fetch_add(1, Ordering::SeqCst);
}
```

## Resolution

Replaced the non-atomic check-and-reset with compare_exchange on global_window_start. Only the thread that successfully swaps the old window start to the new value resets the counter to 1. All other threads just fetch_add. Changed ordering to SeqCst for correctness. Also includes Retry-After info in the rate limit error message body. Server deployed.

