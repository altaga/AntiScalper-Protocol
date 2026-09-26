import "dotenv/config";
import { x402Facilitator } from "@altaga/x402-sui/core/facilitator";
import { ExactSuiFacilitatorScheme } from "@altaga/x402-sui/sui/exact/facilitator";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import express from "express";
import cors from "cors";

// Setup SUI Client (gRPC — JSON-RPC fullnodes are deprecated)
const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: "https://fullnode.testnet.sui.io:443",
});

// Load Facilitator Wallet
const facSecret = process.env.FACILITATOR_PRIVATE_KEY;
const facilitatorKeypair = Ed25519Keypair.fromSecretKey(facSecret);
const facilitatorAddress = facilitatorKeypair.getPublicKey().toSuiAddress();

// Setup Facilitator SDK
const facilitator = new x402Facilitator();
facilitator.register("exact:sui:testnet", new ExactSuiFacilitatorScheme(client, facilitatorKeypair));

const app = express();
app.use(cors());
app.use(express.json());

console.log(`Starting Facilitator Node (Gas Station Mode)...`);
console.log(`Address: ${facilitatorAddress}`);

// 1. Sponsor Endpoint (Gas Station)
app.post("/sponsor", async (req, res) => {
    try {
        const { scheme, network } = req.body;
        const result = await facilitator.sponsor(scheme, network, req.body);
        res.json(result);
    } catch (error) {
        console.error("Sponsor error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Verify Payment Endpoint
app.post("/verify", async (req, res) => {
    try {
        console.log("RECEIVED REQ.BODY:", req.body);
        const { paymentPayload, paymentRequirement } = req.body;
        const result = await facilitator.verify(paymentPayload, paymentRequirement);
        res.json(result);
    } catch (error) {
        console.error("Verify error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Settle Payment Endpoint
app.post("/settle", async (req, res) => {
    try {
        console.log("Receiving settle request...");
        const { paymentPayload, paymentRequirement } = req.body;
        const result = await facilitator.settle(paymentPayload, paymentRequirement);
        res.json(result);
    } catch (error) {
        console.error("Settle error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(8085, () => {
    console.log("✅ Facilitator Gas Station running on port 8085");
});
