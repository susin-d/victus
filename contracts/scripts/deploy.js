import { ethers } from "hardhat";

async function main() {
  console.log("Deploying contracts...");

  // Deploy ProduceRegistry
  const ProduceRegistry = await ethers.getContractFactory("ProduceRegistry");
  const produceRegistry = await ProduceRegistry.deploy();
  await produceRegistry.waitForDeployment();
  const produceRegistryAddress = await produceRegistry.getAddress();
  console.log("ProduceRegistry deployed to:", produceRegistryAddress);

  // Deploy PricingContract
  const PricingContract = await ethers.getContractFactory("PricingContract");
  const pricingContract = await PricingContract.deploy(produceRegistryAddress);
  await pricingContract.waitForDeployment();
  const pricingContractAddress = await pricingContract.getAddress();
  console.log("PricingContract deployed to:", pricingContractAddress);

  // Deploy TransferContract
  const TransferContract = await ethers.getContractFactory("TransferContract");
  const transferContract = await TransferContract.deploy(produceRegistryAddress);
  await transferContract.waitForDeployment();
  const transferContractAddress = await transferContract.getAddress();
  console.log("TransferContract deployed to:", transferContractAddress);

  // Deploy VerificationContract
  const VerificationContract = await ethers.getContractFactory("VerificationContract");
  const verificationContract = await VerificationContract.deploy(
    produceRegistryAddress,
    transferContractAddress,
    pricingContractAddress
  );
  await verificationContract.waitForDeployment();
  const verificationContractAddress = await verificationContract.getAddress();
  console.log("VerificationContract deployed to:", verificationContractAddress);

  console.log("\nDeployment complete!");
  console.log("Contract addresses:");
  console.log("ProduceRegistry:", produceRegistryAddress);
  console.log("PricingContract:", pricingContractAddress);
  console.log("TransferContract:", transferContractAddress);
  console.log("VerificationContract:", verificationContractAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });