#!/bin/bash

echo "🔵 Iniciando Anvil..."
cd ~/supply-chain-tracker/sc
anvil --port 8545 &

sleep 2

echo "🟢 Deploy del contrato SupplyChain.sol..."
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast

echo ""
echo "🟣 Backend listo y contrato desplegado correctamente."
echo "➡  Dirección del contrato: revisa el output arriba."
echo ""
echo "⚡ Para iniciar la web utiliza en otra terminal:"
echo "    cd ~/supply-chain-tracker/web && npm run dev"
echo ""
