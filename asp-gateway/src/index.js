import http from 'node:http';
import { settings } from './services/settings/settings.js';
import { describeConfig } from './utils/utils.js';
import { startSuiListener }       from './services/sui/listener.js';
import { createMqttBroker }       from './services/mqtt/broker.js';
import { makeDispatch, resolveReceipt, inFlight } from './services/dispatch/dispatcher.js';
import { createGatewayApp }       from './app.js';

const TAG = '[GATEWAY]';
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[90m',
  green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m',
  red:'\x1b[31m', magenta:'\x1b[35m',
};
const log  = (m) => console.log(`${TAG} ${m}`);
const ok   = (m) => console.log(`${TAG} ${C.green}✔${C.reset} ${m}`);
const info = (m) => console.log(`${TAG} ${C.cyan}ℹ${C.reset} ${m}`);
const warn = (m) => console.log(`${TAG} ${C.yellow}⚠${C.reset} ${m}`);
const fail = (m) => console.log(`${TAG} ${C.red}✖${C.reset} ${m}`);
const banner = (m) =>
  console.log(`\n${C.bold}${C.magenta}══ ${m} ${'═'.repeat(Math.max(0, 60 - m.length))}${C.reset}`);

process.on('uncaughtException', (err) => {
  fail(`uncaughtException: ${err?.message || err}`);
  if (err?.stack) console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  fail(`unhandledRejection: ${reason?.message || reason}`);
  if (reason?.stack) console.error(reason.stack);
});
process.on('warning', (w) => warn(`Node warning: ${w.name} — ${w.message}`));

function parseBootTestAction(argv) {
  if (argv.includes('--on'))        return 'ON';
  if (argv.includes('--off'))       return 'OFF';
  if (argv.includes('--help') || argv.includes('-h')) return 'HELP';
  return null;
}
const BOOT_TEST_ACTION = parseBootTestAction(process.argv);
if (BOOT_TEST_ACTION === 'HELP') {
  console.log(`Usage: node src/index.js [--on | --off]\n`);
  process.exit(0);
}

const BOOT_TEST_DELAY_MS = 4_000;
const BOOT_TEST_TIMEOUT_MS = 12_000;
let bootTest = {
  pending: false,
  action:  null,
  sentAt:  0,
};

const broker = createMqttBroker({
  onTelemetry: async (topic, payload) => {
    // Extract nodeId + domain from topic (e.g. asp/passive/Sub_B803/telemetry)
    const topicParts = topic ? topic.split('/') : [];
    const domain  = topicParts[1] || 'passive'; // 'passive' | 'active'
    const nodeId  = payload.node_id || payload.device_id || (topicParts.length >= 3 ? topicParts[2] : '(unknown)');

    info(`MQTT packet on ${topic}  keys=${Object.keys(payload).join(',')}`);

    if (bootTest.pending && payload.task === bootTest.action) {
      const elapsed = Date.now() - bootTest.sentAt;
      bootTest.pending = false;
      ok(`boot test ✓  ${bootTest.action} acknowledged by ${nodeId}  (${elapsed}ms after publish)`);
    }

    // Only attempt to resolve in-flight requests for actual receipts
    if (topic && topic.endsWith('/receipt')) {
      resolveReceipt({ receipt: payload, from: nodeId, transport: 'mqtt', topic, warn });
    }
  }
});

const app = createGatewayApp({
  dispatch:      makeDispatch(broker, log),
  brokerState:   broker.state,
  inFlight,
});
const server = http.createServer(app);

async function main() {
  banner('ASP GATEWAY BOOT');
  describeConfig(log);

  server.listen(settings.http.port, settings.http.host, () => {
    ok(`http server listening on ${settings.http.host}:${settings.http.port}`);
  });

  await broker.listen();

  if (BOOT_TEST_ACTION) {
    bootTest.action  = BOOT_TEST_ACTION;
    bootTest.pending = true;
    setTimeout(() => {
      const targets = Array.isArray(settings.devices) ? settings.devices.map((d) => d.id) : [];
      if (targets.length === 0) return warn('boot test aborted: no supervised devices config');
      const target = targets[0];
      const payload = {
        action: bootTest.action,
        target,
        timestamp: Date.now()
      };
      const topic = `asp/passive/${target}/action`;
      log(`publishing boot test -> ${topic}`);
      bootTest.sentAt = Date.now();
      broker.publish(topic, payload);

      setTimeout(() => {
        if (bootTest.pending) {
          bootTest.pending = false;
          warn(`boot test timeout: no receipt seen on telemetry within ${BOOT_TEST_TIMEOUT_MS}ms`);
        }
      }, BOOT_TEST_TIMEOUT_MS);
    }, BOOT_TEST_DELAY_MS);
  }

  const listener = await startSuiListener({
    onEvent: (evt) => {
      const action = (typeof evt.action === 'string' && (evt.action === 'ON' || evt.action === 'OFF'))
        ? evt.action
        : 'ON';
      const command = {
        action,
        target:    evt.target,
        timestamp: Date.now(),
      };
      const topic = `asp/passive/${evt.target}/action`;
      broker.publish(topic, command);
      ok(`dispatched  →  ${topic}  (action=${action}, target=${evt.target})`);
    },
  });

  ok('all systems online');
  banner('READY TO SERVE');
  const displayHost = settings.http.host === '0.0.0.0' ? 'localhost' : settings.http.host;
  const base = `http://${displayHost}:${settings.http.port}`;
  log(`  GET   ${base}/                redirects to user page`);
  log(`  GET   ${base}/user            human-readable gateway capabilities`);
  log(`  GET   ${base}/agentic         machine-oriented x402 integration guide`);
  log(`  GET   ${base}/asp/agent-guide.json  AI orchestration schema`);
  log(`  POST  ${base}/asp/petition              create hire request (no MQTT)`);
  log(`  POST  ${base}/asp/proof-of-human/verify World verify → authorize`);
  log(`  POST  ${base}/asp/hire                  x402 paid hire (PoH gated)`);
  log(`  POST  ${base}/asp/kiosk/intent          unique Slush pay link (kiosk)`);
  log(`  POST  ${base}/asp/kiosk/lab/intent      Slush-only lab (no World)`);
  log(`  GET   ${base}/asp/kiosk/intent/:nonce   poll Payment Kit record`);
  log(`  POST  ${base}/asp/kiosk/dispense        dispense after phone pay (no x402)`);
  log(`  POST  ${base}/asp/kiosk/complete        QR checkout: verify pay + dispense`);
  log(`  GET   ${base}/asp/health                liveness probe`);
  log(`  GET   ${base}/asp/skills                live skill registry`);
  log(`  GET   ${base}/asp/status                full subsystem snapshot`);
  log(`  MQTT  ${settings.mqtt.brokerUrl}  (asp/passive/+/action)`);
  log(`${C.dim}press Ctrl-C to stop${C.reset}`);

  const HEARTBEAT_MS = 240_000;
  const heartbeat = setInterval(() => {
    const m = broker.state();
    const up = Math.round(process.uptime());
    const inflight = inFlight.size;
    const parts = [
      `uptime=${up}s`,
      `broker=${m.connected ? 'connected' : 'disconnected'}`,
      `inflight=${inflight}`,
    ];
    if (bootTest.pending) parts.push(`boot_test=${bootTest.action}?`);
    log(`♥  ${parts.join('  ')}`);
  }, HEARTBEAT_MS);
  heartbeat.unref();

  let isShuttingDown = false;
  const shutdown = async (sig) => {
    if (isShuttingDown) {
      process.exit(0);
    }
    isShuttingDown = true;
    log(`\n${sig} — shutting down…`);
    
    try { listener.stop(); } catch {}
    try { await broker.stop(); } catch {}
    
    // Forcefully drop connections so server.close doesn't hang
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(() => process.exit(0));
    
    // Failsafe
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  fail(`boot sequence failed: ${err.message}`);
  process.exit(1);
});
