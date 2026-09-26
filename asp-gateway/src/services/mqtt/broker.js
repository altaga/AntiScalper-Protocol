// =============================================================================
//  Asp Gateway — MQTT-over-WSS Client (External Broker)
//  -----------------------------------------------------------------------------
//  Connects to the external MQTT-over-WSS broker configured in .env.
//
//  The gateway's role on the broker:
//
//    • SUBSCRIBE  to passive/active telemetry + receipt topics
//    • PUBLISH    to passive action / active intent topics
//
//  The target devices are derived from `config/skills.json` through the
//  central settings service, so there is no separate devices config file.
//
//  Authentication
//  --------------
//  The broker expects a JWT in the MQTT password field. We send:
//    username = ""
//    password = the raw JWT
//
//  The client does not verify the JWT signature. The broker does.
//
//  Exports the same `createMqttBroker({ onTelemetry })` shape the
//  coordinator already calls, so the rest of the gateway doesn't need
//  to know whether the broker is local or remote.
// =============================================================================

import mqtt from 'mqtt';
import { randomBytes } from 'node:crypto';

import { settings } from '../settings/settings.js';

const TAG = '[MQTT]';
const log  = (m) => console.log(`${TAG} ${m}`);
const info = (m) => console.log(`${TAG} \x1b[36mℹ ${m}\x1b[0m`);
const warn = (m) => console.log(`${TAG} \x1b[33m⚠ ${m}\x1b[0m`);
const ok   = (m) => console.log(`${TAG} \x1b[32m✔ ${m}\x1b[0m`);

//  createMqttBroker({ onTelemetry })
//
//   onTelemetry(parsedJson) is called for every JSON payload published on
//   the telemetry topic. Errors thrown by the handler are caught and
//   logged but never affect MQTT delivery.
//
//   Returns:
//     {
//       publish,  // (topic, payload) -> boolean
//       listen,   // () -> Promise<void>  — initiates the connection
//       stop,     // () -> Promise<void>  — disconnects cleanly
//     }
// =============================================================================
export function createMqttBroker({ onTelemetry }) {
  let client = null;
  let ready  = false;

  function connect() {
    const creds = settings.gateway;
    const clientId = `asp-gw-${randomBytes(4).toString('hex')}`;

    info(`connecting → ${settings.mqtt.brokerUrl}  (auth=jwt  user=""` +
         `  id=${creds.id}  role=${creds.role})`);

    client = mqtt.connect(settings.mqtt.brokerUrl, {
      username:        '',
      password:        creds.jwt,
      clientId,
      clean:           true,
      keepalive:       30,
      reconnectPeriod: 5_000,
      connectTimeout:  8_000,
    });

    client.on('connect', () => {
      ready = true;
      ok(`connected · ${settings.mqtt.brokerUrl}  (auth=jwt)`);
      const topics = [];
      const configuredDevices = Array.isArray(settings.devices) ? settings.devices : [];
      if (configuredDevices.length > 0) {
        configuredDevices.forEach((d) => {
          const id = String(d?.id || '');
          const domain = String(d?.domain || '');
          if (!id) return;
          if (domain === 'passive') {
            topics.push(`asp/passive/${id}/telemetry`, `asp/passive/${id}/receipt`);
          } else if (domain === 'active') {
            topics.push(`asp/active/${id}/telemetry`, `asp/active/${id}/receipt`);
          } else {
            topics.push(`asp/passive/${id}/telemetry`, `asp/passive/${id}/receipt`, `asp/active/${id}/telemetry`, `asp/active/${id}/receipt`);
          }
        });
      } else {
        topics.push(
          'asp/passive/+/telemetry',
          'asp/passive/+/receipt',
          'asp/active/+/telemetry',
          'asp/active/+/receipt'
        );
      }
      
      client.subscribe(topics, { qos: 0 }, (err) => {
        if (err) return warn(`subscribe error: ${err.message}`);
        ok(`subscribed to ${topics.length} device topics`);
      });
    });

    client.on('message', (topic, payload) => {
      if ((!topic.startsWith('asp/passive/') && !topic.startsWith('asp/active/')) || (!topic.endsWith('/telemetry') && !topic.endsWith('/receipt'))) return;
      let parsed;
      try { parsed = JSON.parse(payload.toString()); }
      catch { return warn(`non-JSON telemetry on ${topic} — dropped`); }

      if (typeof onTelemetry !== 'function') return;
      Promise.resolve()
        .then(() => onTelemetry(topic, parsed))
        .catch((e) => warn(`onTelemetry handler threw: ${e.message}`));
    });

    client.on('error',       (e) => warn(`mqtt error: ${e.message}`));
    client.on('disconnect',  ()  => { ready = false; warn('disconnected'); });
    client.on('reconnect',   ()  => info('reconnecting…'));
    client.on('offline',     ()  => warn('offline'));
  }

  // The connection itself is async; `listen()` resolves immediately so
  // the coordinator doesn't block waiting for the broker to dial out.
  function listen() {
    connect();
    return Promise.resolve();
  }

  function publish(topic, payload) {
    if (!client || !ready) {
      warn(`publish ignored (not ready): ${topic}`);
      return false;
    }
    const body = JSON.stringify(payload);
    client.publish(topic, body, { qos: 0 }, (err) => {
      if (err) warn(`publish error on ${topic}: ${err.message}`);
    });
    log(`→ ${topic}  ${body.slice(0, 120)}`);
    return true;
  }

  function stop() {
    return new Promise((resolve) => {
      if (!client) return resolve();
      ready = false;
      client.end(false, () => resolve());
    });
  }

  // Snapshot of the broker's connection state — used by the gateway's
  // /asp/status endpoint and the 30s heartbeat.
  function state() {
    return {
      connected:    !!ready,
      broker:       settings.mqtt.brokerUrl,
      clientId:     client?.options?.clientId || null,
      mode:         'jwt',
      gatewayId:    settings.gateway.id || null,
      devices:      Array.isArray(settings.devices) ? settings.devices.length : 0,
    };
  }

  return { publish, listen, stop, state };
}
