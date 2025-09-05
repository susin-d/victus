const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect to Ethereum provider (e.g., Infura)
const provider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);

// Contract ABIs from compiled artifacts
const produceRegistryAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      }
    ],
    "name": "ProduceDeactivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "farmer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "origin",
        "type": "string"
      }
    ],
    "name": "ProduceRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "quality",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "price",
        "type": "uint256"
      }
    ],
    "name": "ProduceUpdated",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_id",
        "type": "uint256"
      }
    ],
    "name": "deactivateProduce",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_id",
        "type": "uint256"
      }
    ],
    "name": "getProduce",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "farmer",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "origin",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "quality",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "initialPrice",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          }
        ],
        "internalType": "struct ProduceRegistry.Produce",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "produceCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "produces",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "farmer",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "origin",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "quality",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "initialPrice",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_origin",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_quality",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_initialPrice",
        "type": "uint256"
      }
    ],
    "name": "registerProduce",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_id",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "_quality",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_price",
        "type": "uint256"
      }
    ],
    "name": "updateProduce",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
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

// Mock data for testing when contracts are not deployed
const mockProduceData = {
    1: {
        id: 1,
        farmer: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        origin: "Farm A, California",
        quality: "Premium Grade A",
        initialPrice: 100,
        timestamp: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
        isActive: true
    },
    2: {
        id: 2,
        farmer: "0x742d35Cc6634C0532925a3b844Bc454e4438f44f",
        origin: "Farm B, Texas",
        quality: "Grade B",
        initialPrice: 80,
        timestamp: Math.floor(Date.now() / 1000) - 172800, // 2 days ago
        isActive: true
    }
};

// Get produce details
app.get('/api/produce/:id', async (req, res) => {
    const id = req.params.id;
    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Invalid produce ID' });
    }

    try {
        const produce = await produceRegistry.getProduce(id);
        res.json(produce);
    } catch (error) {
        console.error('Error fetching produce from contract:', error.message);

        // Return mock data if contract is not deployed
        const mockData = mockProduceData[id];
        if (mockData) {
            console.log('Returning mock data for produce ID:', id);
            res.json(mockData);
        } else {
            res.status(404).json({ error: 'Produce not found' });
        }
    }
});

// Register new produce
app.post('/api/register-produce', async (req, res) => {
    const { origin, quality, initialPrice, privateKey } = req.body;

    if (!origin || !quality || !initialPrice || !privateKey) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (initialPrice <= 0) {
        return res.status(400).json({ error: 'Initial price must be positive' });
    }

    try {
        // SECURITY NOTE: In production, never accept private keys via API
        // Use wallet signing or secure key management services instead
        const wallet = new ethers.Wallet(privateKey, provider);
        const contractWithSigner = produceRegistry.connect(wallet);
        const tx = await contractWithSigner.registerProduce(origin, quality, initialPrice);
        await tx.wait();
        res.json({ txHash: tx.hash });
    } catch (error) {
        console.error('Error registering produce:', error);
        res.status(500).json({ error: 'Failed to register produce. Check contract deployment and private key.' });
    }
});

// Generate QR code for produce
app.get('/api/qr/:id', async (req, res) => {
    const id = req.params.id;
    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Invalid produce ID' });
    }

    try {
        const url = `${process.env.FRONTEND_URL}/verify/${id}`;
        const qr = await QRCode.toDataURL(url);
        res.json({ qr });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Verify produce (get full history)
app.get('/api/verify/:id', async (req, res) => {
    const id = req.params.id;
    if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Invalid produce ID' });
    }

    try {
        const result = await verificationContract.verifyProduce(id);
        res.json(result);
    } catch (error) {
        console.error('Error verifying produce from contract:', error.message);

        // Return mock verification data
        const mockData = mockProduceData[id];
        if (mockData) {
            const mockResult = {
                produce: mockData,
                transferIds: [1, 2], // Mock transfer IDs
                priceUpdateIds: [1] // Mock price update IDs
            };
            console.log('Returning mock verification data for produce ID:', id);
            res.json(mockResult);
        } else {
            res.status(404).json({ error: 'Produce not found for verification' });
        }
    }
});

// Additional routes for transfers, pricing updates can be added similarly

app.listen(3001, () => {
    console.log('Backend API running on port 3001');
});