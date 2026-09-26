import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const gatewayPrivateKey = process.env.GATEWAY_PRIVATE_KEY || '';

let keypair = null;
let address = null;

if (gatewayPrivateKey) {
  try {
    keypair = Ed25519Keypair.fromSecretKey(gatewayPrivateKey);
    address = keypair.getPublicKey().toSuiAddress();
  } catch (e) {
    console.error(`[SUI WALLET] GATEWAY_PRIVATE_KEY is malformed: ${e.message}`);
  }
}

export const gatewayWallet = {
  keypair,
  address,
};
