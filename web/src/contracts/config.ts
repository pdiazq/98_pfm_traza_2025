import SupplyChainArtifact from "./SupplyChain.json";

export const CONTRACT_CONFIG = {
  address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // dirección del contrato desplegado
  abi: (SupplyChainArtifact as any).abi,
  adminAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // cuenta #0 de Anvil
};
