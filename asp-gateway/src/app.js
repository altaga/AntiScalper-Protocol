import express from 'express';
import cors from 'cors';
import { createX402Router } from './services/x402/routes.js';
import { createPolicyRouter } from './services/policy/routes.js';
import { createKioskRouter } from './services/kiosk/routes.js';
import { settings } from './services/settings/settings.js';

export function createGatewayApp({ dispatch, brokerState, inFlight }) {
  const app = express();
  app.use(/* cors before routes */ cors({
    exposedHeaders: ['payment-required', 'payment-signature', 'payment-response', 'facilitator-url']
  }));
  app.use(express.json());

  // Petition / Proof of Human — before paid hire; never MQTT on their own.
  app.use('/', createPolicyRouter());

  // Kiosk unique-link pay (Slush Payment Kit) — parallel to x402; no second charge.
  app.use('/', createKioskRouter({ dispatch }));

  // Mount the x402 router + diagnostic endpoints in one place.
  app.use('/', createX402Router({
    gatewayAddress: settings.sui.address,
    dispatch,
    brokerState,
    inFlight,
  }));

  return app;
}
