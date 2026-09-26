import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { x402Client, x402HTTPClient, ExactSuiClientScheme } from "@altaga/x402-sui";

console.log("Starting AI Agent (Buyer)...");

import "dotenv/config";

// Load Buyer Wallet
const buyerSecret = process.env.BUYER_SECRET || "";
const buyerKeypair = Ed25519Keypair.fromSecretKey(buyerSecret);
const buyerAddress = buyerKeypair.getPublicKey().toSuiAddress();
console.log(`Buyer Address: ${buyerAddress}`);

// Setup SUI Client (gRPC — JSON-RPC fullnodes are deprecated)
const suiClient = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
});

// Setup SDK
const coreClient = new x402Client()
    .register('exact:sui:testnet', new ExactSuiClientScheme(suiClient, buyerKeypair));

const client = new x402HTTPClient(coreClient);

async function run() {
    const targetUrl = "http://localhost:4021/premium-data";
    console.log(`📡 Fetching ${targetUrl}...`);

    const initialRes = await fetch(targetUrl, { method: "GET" });

    if (initialRes.status === 402) {
        // Extract payment requirements from response
        const paymentRequired = client.getPaymentRequiredResponse(
            (name) => initialRes.headers.get(name),
            await initialRes.json()
        );

        const req0 = paymentRequired.accepts[0];
        console.log(`Creating sponsored payment: ${req0.amount ?? req0.maxAmountRequired ?? req0.price} ${req0.asset}`);
        console.log("⛽ Asking Facilitator to sponsor the gas & signing...");

        // Create and send payment
        const paymentPayload = await client.createPaymentPayload(paymentRequired);

        console.log("💳 Submitting dual-signed sponsored transaction to Seller...");
        const paidResponse = await fetch(targetUrl, {
            method: "GET",
            headers: {
                ...client.encodePaymentSignatureHeader(paymentPayload),
            }
        });

        // Get settlement confirmation
        const settlement = client.getPaymentSettleResponse(
            (name) => paidResponse.headers.get(name)
        );

        if (paidResponse.ok) {
            console.log("✅ Request Successful! Payload received:");
            console.log(await paidResponse.json());
            console.log('Transaction Settled:', settlement?.transactionDigest);
        } else {
            console.error("❌ Payment rejected by seller:", await paidResponse.text());
        }
    } else {
        console.log("Resource was free!", await initialRes.text());
    }
}

run().catch(console.error);
