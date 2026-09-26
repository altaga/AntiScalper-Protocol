import { decodeJwtPayload } from './jwt.js';

const mqttBrokerJwt = process.env.MQTT_BROKER_JWT || '';

if (!mqttBrokerJwt) {
  throw new Error('MQTT_BROKER_JWT must be provided');
}

const claims = decodeJwtPayload(mqttBrokerJwt);

if (!claims || !claims.id || !claims.role) {
  throw new Error('MQTT_BROKER_JWT is missing required claims (id, role) or is malformed');
}

export const gatewayAuth = {
  jwt: mqttBrokerJwt,
  id: String(claims.id),
  role: String(claims.role),
  payload: claims,
};
