const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect to Ethereum provider (e.g., Infura)
const provider = new ethers.providers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

// Placeholder contract ABIs (replace with actual compiled ABIs)
const produceRegistryAbi = [
    // Add ABI here
];
const transferContractAbi = [];
const pricingContractAbi = [];
const verificationContractAbi = [];

// Contract addresses (from deployment)
const produceRegistryAddress = process.env.PRODUCE_REGISTRY_ADDRESS;
const transferContractAddress = process.env.TRANSFER_CONTRACT_ADDRESS;
const pricingContractAddress = process.env.PRICING_CONTRACT_ADDRESS;
const verificationContractAddress = process.env.VERIFICATION_CONTRACT_ADDRESS;

// Contract instances
const produceRegistry = new ethers.Contract(produceRegistryAddress, produceRegistryAbi, provider);
const transferContract = new ethers.Contract(transferContractAddress, transferContractAbi, provider);
const pricingContract = new ethers.Contract(pricingContractAddress, pricingContractAbi, provider);
const verificationContract = new ethers.Contract(verificationContractAddress, verificationContractAbi, provider);

// Routes

// Get produce details
app.get('/api/produce/:id', async (req, res) => {
    try {
        const produce = await produceRegistry.getProduce(req.params.id);
        res.json(produce);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register new produce
app.post('/api/register-produce', async (req, res) => {
    try {
        const { origin, quality, initialPrice, privateKey } = req.body;
        const wallet = new ethers.Wallet(privateKey, provider);
        const contractWithSigner = produceRegistry.connect(wallet);
        const tx = await contractWithSigner.registerProduce(origin, quality, initialPrice);
        await tx.wait();
        res.json({ txHash: tx.hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate QR code for produce
app.get('/api/qr/:id', async (req, res) => {
    try {
        const url = `${process.env.FRONTEND_URL}/verify/${req.params.id}`;
        const qr = await QRCode.toDataURL(url);
        res.json({ qr });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify produce (get full history)
app.get('/api/verify/:id', async (req, res) => {
    try {
        const result = await verificationContract.verifyProduce(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Additional routes for transfers, pricing updates can be added similarly

app.listen(3001, () => {
    console.log('Backend API running on port 3001');
});