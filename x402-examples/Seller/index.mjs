import { HTTPFacilitatorClient, x402ResourceServer } from "@altaga/x402-sui/core/server";
import { x402HTTPResourceServer } from "@altaga/x402-sui/core/server-http";
import { ExactSuiServerScheme } from "@altaga/x402-sui/sui/exact/server";
import express from "express";

console.log(`Starting Seller Server...`);

// Load Seller Wallet
const sellerAddress = "0x327dccb397de6926ce1c192eb494760d51554d6cc8e258444cd5285f0c4151cf";
console.log(`Receiving Address: ${sellerAddress}`);

// Connect to facilitator
const facilitatorClient = new HTTPFacilitatorClient({
    url: process.env.FACILITATOR_URL || 'http://localhost:8085',
});

// Create resource server with payment schemes
const resourceServer = new x402ResourceServer(facilitatorClient)
    .register('exact:sui:testnet', new ExactSuiServerScheme());

await resourceServer.initialize();

// Configure routes
const routes = {
    'GET /premium-data': {
        accepts: {
            scheme: 'exact',
            network: 'sui:testnet',
            asset: '0x2::sui::SUI',
            payTo: sellerAddress,
            price: 10000,
            feePayer: 'facilitator' // Just metadata for clarity
        },
        description: 'Premium data access',
        mimeType: 'application/json',
    },
};

const httpServer = new x402HTTPResourceServer(resourceServer, routes);

const app = express();

// Apply x402 Middleware
app.use(httpServer.middleware());

// Protected Route
app.get("/premium-data", (req, res) => {
    // If the middleware passed, payment was successful and settled!
    console.log("🎉 Valid request received on /premium-data!");
    console.log("Payment settled:", req.payment.transactionDigest);
    res.json({ status: "success", data: "Here is the premium data requested." });
});

app.listen(4021, () => {
    console.log("✅ Seller Server running on port 4021");
});
