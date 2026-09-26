import { pushToWalrus } from '../walrus/logger.js';

export const inFlight = new Map();

export function registerInFlight(txId, transport, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      inFlight.delete(txId);
      reject(new Error(`receipt timeout after ${timeoutMs}ms (transport=${transport})`));
    }, timeoutMs);
    inFlight.set(txId, { resolve, reject, timer, transport });
  });
}

export function resolveReceipt({ receipt, from, transport, topic, warn }) {
  if (receipt.tx_id && inFlight.has(receipt.tx_id)) {
    const p = inFlight.get(receipt.tx_id);
    clearTimeout(p.timer);
    inFlight.delete(receipt.tx_id);
    p.resolve(receipt);
    return true;
  }
  // Fallback: real firmware doesn't echo tx_id; bind to the only in-flight
  // request on the same transport.
  // CRITICAL FIX: Only run this fallback if the topic explicitly ends with /receipt
  // or /action, to prevent random /telemetry heartbeats from falsely resolving the intent!
  if (!receipt.tx_id && topic && topic.endsWith('/receipt')) {
    const candidates = [...inFlight.entries()].filter(([, p]) => p.transport === transport);
    if (candidates.length === 1) {
      const [txId, p] = candidates[0];
      clearTimeout(p.timer);
      inFlight.delete(txId);
      p.resolve({ ...receipt, tx_id: txId });
      return true;
    }
  }
  if (warn) {
    warn(`receipt from ${transport} ${from} did not match any in-flight request (have ${inFlight.size})`);
  }
  return false;
}

export function makeDispatch(mqttBroker, log) {
  return async function dispatch(petition, skill) {
    const target = petition.target_hardware_id;

    if (skill && skill.execution_model === 'AGENTIC') {
      log(`[LLM] Invoking Bedrock for Agentic Skill: ${skill.name}`);
      // Inject the user's specific context into the predefined system prompt template
      let finalSystemPrompt = skill.system_prompt || '';
      if (finalSystemPrompt && petition.context) {
        finalSystemPrompt = finalSystemPrompt.replace("The user's specific context sent via the x402 API.", petition.context);
      }

      const reasoning = {
        tx_id: petition.tx_id,
        intent: skill.command,
        system_prompt: finalSystemPrompt,
        prompt: petition.user_prompt,
        target,
        timestamp: Date.now()
      };
      if (mqttBroker && mqttBroker.state().connected) {
        // Increase timeout to 120 seconds for heavy local LLM inference (e.g. qwen2.5 on Jetson)
        const receiptPromise = registerInFlight(petition.tx_id, 'mqtt', 120_000);
        const topic = `asp/active/${target}/intent`;
        mqttBroker.publish(topic, reasoning);
        log(`→ MQTT ${topic}  ${JSON.stringify(reasoning)}`);

        log(`archiving intent to Walrus in parallel...`);
        const walrusPromise = pushToWalrus({
          tx_id: petition.tx_id,
          intent: reasoning,
          skill: skill.name,
          target,
        });

        return Promise.all([receiptPromise, walrusPromise]).then(([receipt, blobId]) => {
          log(`✔ Received agent receipt and Walrus archive for ${petition.tx_id}`);
          if (blobId) {
            receipt.walrus_blob_id = blobId;
            const telemetryTopic = `asp/active/${target}/telemetry`;
            mqttBroker.publish(telemetryTopic, {
              node_id: target,
              tx_id: petition.tx_id,
              walrus_blob_id: blobId,
              status: 'archived',
              timestamp: Date.now(),
            });
            log(`🛰 Enriched agent telemetry sent to ${telemetryTopic} with blobId=${blobId.slice(0, 12)}...`);
          }
          return receipt;
        });
      }
      throw new Error(`no transport available for target=${target} (MQTT disconnected)`);
    }

    // Default to DETERMINISTIC
    const cmd = {
      tx_id: petition.tx_id,
      action: petition.command,
      target,
      timestamp: Date.now(),
    };



    // Fallback to MQTT
    if (mqttBroker && mqttBroker.state().connected) {
      const receiptPromise = registerInFlight(petition.tx_id, 'mqtt');
      const topic = `asp/passive/${target}/action`;
      mqttBroker.publish(topic, cmd);
      log(`→ MQTT ${topic}  ${JSON.stringify(cmd)}`);

      log(`archiving action to Walrus in parallel...`);
      const walrusPromise = pushToWalrus({
        tx_id: petition.tx_id,
        action: cmd,
        skill: skill.name,
        target,
      });

      // Wait for the receipt and Walrus, then enrich
      return Promise.all([receiptPromise, walrusPromise]).then(([receipt, blobId]) => {
        log(`✔ Received receipt and Walrus archive for ${petition.tx_id}`);

        if (blobId) {
          receipt.walrus_blob_id = blobId;
          const telemetryTopic = `asp/passive/${target}/telemetry`;
          mqttBroker.publish(telemetryTopic, {
            node_id: target,
            tx_id: petition.tx_id,
            walrus_blob_id: blobId,
            status: 'archived',
            timestamp: Date.now(),
          });
          log(`🛰 Enriched telemetry sent to ${telemetryTopic} with blobId=${blobId.slice(0, 12)}...`);
        }

        return receipt;
      });
    }

    throw new Error(`no transport available for target=${target} (MQTT disconnected)`);
  };
}
