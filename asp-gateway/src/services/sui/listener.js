// =============================================================================
//  Asp Gateway — Sui Blockchain Listener
//  -----------------------------------------------------------------------------
//  Polls the Sui testnet for `TaskPurchased` Move events emitted by the
//  x402 contract (SUI_PACKAGE_ID). For every new event the supplied
//  callback is invoked with a normalised envelope:
//
//      {
//        tx_hash,          // Sui transaction digest
//        buyer,            // 0x… who paid
//        target,           // capability / device id (string)
//        amount,           // amount in MIST
//        event,            // raw Sui event (for advanced consumers)
//      }
//
//  Errors during a poll are logged and the loop continues — a transient
//  RPC failure must not crash the gateway.
// =============================================================================

import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
import { settings } from '../settings/settings.js';

const TAG = '[SUI]';
const log  = (m) => console.log(`${TAG} ${m}`);
const warn = (m) => console.log(`${TAG} \x1b[33m⚠ ${m}\x1b[0m`);

// -----------------------------------------------------------------------------
//  Build the Move event type filter.
//
//    When SUI_PACKAGE_ID is set:
//      <pkg>::x402::TaskPurchased
//    Otherwise (best-effort): just `TaskPurchased` (matches any package
//    that emits an event with that name).
// -----------------------------------------------------------------------------
function buildEventType() {
  return 'TaskPurchased';
}

// -----------------------------------------------------------------------------
//  Normalise a raw Sui Move event into the envelope we hand to the
//  coordinator. The exact field names depend on the Move struct; the
//  blueprint is:
//
//      struct TaskPurchased has copy, drop {
//          buyer: address,
//          target_capability: vector<u8>,   // UTF-8 string
//          amount: u64,
//          tx_hash: vector<u8>,             // optional, falls back to digest
//      }
// -----------------------------------------------------------------------------
function normaliseEvent(raw) {
  const pj = raw.parsedJson || {};
  const target =
    typeof pj.target_capability === 'string' ? pj.target_capability
    : Array.isArray(pj.target_capability)  ? Buffer.from(pj.target_capability).toString('utf8')
    : (pj.target || pj.capability || 'unknown');
  const amount =
    typeof pj.amount === 'string'  ? pj.amount
    : typeof pj.amount === 'number' ? String(pj.amount)
    : '0';
  return {
    tx_hash: raw.id?.txDigest || pj.tx_hash || '(no-digest)',
    buyer:   pj.buyer || raw.sender || '(unknown)',
    target,
    amount,
    event:   raw,
  };
}

// -----------------------------------------------------------------------------
//  startSuiListener({ onEvent })
// -----------------------------------------------------------------------------
//
//   Connects to the configured Sui RPC and starts a non-blocking polling
//   loop. Returns a small handle the coordinator can use to stop the loop.
// =============================================================================
export async function startSuiListener({ onEvent }) {
  if (typeof onEvent !== 'function') {
    throw new Error('startSuiListener requires an onEvent callback');
  }

  const client = new SuiClient({ url: settings.sui.rpcUrl });
  
  // Since SUI_PACKAGE_ID is removed, disable the on-chain poller to prevent query crashes.
  return { stop: () => {}, client };
  let stopped = false;
  let inFlight = false;
  let seen = new Set();                  // dedup by (txDigest, eventSeq)

  log(`RPC            : ${config.sui.rpcUrl}`);
  log(`event filter   : ${eventType}`);
  log(`poll interval  : ${config.poll.intervalMs} ms`);
  log(`gateway wallet : ${config.sui.address || '(none)'}`);

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const res = await client.queryEvents({
        query:  { MoveEventType: eventType },
        cursor,
        limit:  config.poll.eventLimit,
        order:  'ascending',
      });

      for (const raw of res.data) {
        const key = `${raw.id?.txDigest || ''}::${raw.eventSeq ?? raw.sequenceNumber ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const evt = normaliseEvent(raw);
          log(`TaskPurchased · tx=${evt.tx_hash.slice(0, 14)}…  buyer=${evt.buyer}  target=${evt.target}  amount=${evt.amount}`);
          await onEvent(evt);
        } catch (e) {
          warn(`onEvent handler threw: ${e.message}`);
        }
      }

      if (res.nextCursor) cursor = res.nextCursor;

      // Bound the dedup cache so a long-lived process doesn't grow without limit.
      if (seen.size > 5_000) seen = new Set([...seen].slice(-2_000));
    } catch (e) {
      warn(`poll failed: ${e.message}  (continuing)`);
    } finally {
      inFlight = false;
    }
  };

  // Initial tick + interval. The two are sequenced so a slow first tick
  // never overlaps with the next interval.
  const loop = async () => {
    while (!stopped) {
      await tick();
      if (stopped) break;
      await new Promise((r) => setTimeout(r, config.poll.intervalMs));
    }
  };
  loop().catch((e) => warn(`listener loop crashed: ${e.message}`));

  return {
    stop: () => { stopped = true; },
    client,
  };
}
