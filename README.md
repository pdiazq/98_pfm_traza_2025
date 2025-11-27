# Supply Chain Tracker en Ethereum

Proyecto final del Máster de Ethereum (CodeCrypto Academy). Pedro Alexander Díaz Quiroga: pdiazq@hotmail.com 
Implementa un sistema de **trazabilidad de productos** sobre una blockchain local (Anvil) usando un contrato inteligente en Solidity y un frontend en Next.js integrado con MetaMask.

La trazabilidad sigue el flujo:

> **Producer → Factory → Retailer → Consumer**

Cada producto (materia prima o derivado) se representa como un **token interno** dentro del contrato, con:
- `name`
- `totalSupply`
- `features` (JSON libre con metadatos)
- `parentId` (para conectar productos derivados con su materia prima)
- `dateCreated`

Las transferencias entre actores quedan registradas y pasan por estados:
> `Pending → Accepted / Rejected`


---

## 1. Arquitectura general

### 1.1 Componentes

- **Smart Contract (backend on-chain)**
  - `sc/src/SupplyChain.sol`
  - Gestiona:
    - Usuarios y roles
    - Tokens de productos
    - Transferencias y estados

- **Tests automatizados (Forge)**
  - `sc/test/SupplyChain.t.sol`
  - Verifican:
    - Registro y aprobación de usuarios
    - Restricciones de rol
    - Creación de tokens
    - Flujo de transferencias

- **Frontend (Next.js + ethers + MetaMask)**
  - `web/app/page.tsx` → pantalla principal para usuarios (Producer/Factory/Retailer/Consumer)
  - `web/app/admin/page.tsx` → panel de administración (aprobación de usuarios y gestión de transferencias)

- **Script de despliegue y arranque local**
  - `start-local.sh` → arranca Anvil y despliega el contrato en `localhost:8545`
  - `sc/script/Deploy.s.sol` → script de Forge que despliega `SupplyChain.sol`


---

## 2. Requisitos

- **Node.js** >= 18  
- **npm**
- **Foundry** (forge, anvil, cast)
- **MetaMask** (extensión de navegador)

Clonado desde el repo original de CodeCrypto y adaptado en:  
`https://github.com/pdiazq/98_pfm_traza_2025`


---

## 3. Ejecución local

### 3.1 Clonar el repositorio

```bash
git clone https://github.com/pdiazq/98_pfm_traza_2025.git
cd 98_pfm_traza_2025/supply-chain-tracker

Si tu carpeta local ya se llama supply-chain-tracker, simplemente entra en ella.

⸻

3.2 Levantar blockchain local + desplegar contrato

Desde la raíz del proyecto:

cd /Users/pdiazq/supply-chain-tracker

./start-local.sh

Este script hace:
    1.    Arranca Anvil en 127.0.0.1:8545 con chainId = 31337.
    2.    Despliega el contrato SupplyChain.sol usando Foundry.
    3.    Muestra en consola la dirección del contrato desplegado.

El script también genera/actualiza:
    •    sc/broadcast/Deploy.s.sol/31337/run-latest.json
(traza del despliegue)

⚠️ Esta terminal debe quedar abierta mientras uses la dApp.

⸻

3.3 Frontend (Next.js)

En otra terminal:

cd /Users/pdiazq/supply-chain-tracker/web

npm install        # solo la primera vez
npm run dev

Luego abre en el navegador:
    •    http://localhost:3000 → interfaz principal de usuarios
    •    http://localhost:3000/admin → panel de administración

⸻

4. Configuración de MetaMask

4.1 Red local (Anvil)

En MetaMask, crear una red:
    •    Network name: Anvil Local
    •    New RPC URL: http://127.0.0.1:8545
    •    Chain ID: 31337
    •    Currency symbol: ETH
    •    Block explorer URL: (vacío)

Seleccionar después Anvil Local como red activa.

⸻

4.2 Cuentas

Anvil genera 10 cuentas.
La más importante es la cuenta 0 (Admin por defecto):
    •    Admin
    •    Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    •    Private key (solo para entorno local):
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Importar en MetaMask usando Import account → Private key.

Otras cuentas para usar como usuarios:
    •    Producer: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
    •    Factory:  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
    •    Retailer: 0x90F79bf6EB2c4f870365E785982E1f101E93b906
    •    Consumer: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65

(las direcciones exactas pueden variar si se reconfigura Anvil, pero siguen el esquema por defecto de Foundry).

⸻

5. Flujo funcional del sistema

5.1 Roles y usuarios

Roles soportados:
    •    Admin
    •    Producer
    •    Factory
    •    Retailer
    •    Consumer

Estados de usuario:
    •    Pending
    •    Approved
    •    Rejected
    •    Canceled

Flujo:
    1.    Un usuario conecta su wallet en http://localhost:3000.
    2.    Selecciona el rol que desea (Producer, Factory, Retailer, Consumer).
    3.    Envía la transacción requestUserRole(...).
    4.    El admin entra a http://localhost:3000/admin.
    5.    El admin busca la dirección y cambia el estado a Approved (o Rejected / Canceled).

⸻

5.2 Tokens y trazabilidad

Un token en este contrato representa un lote de producto.
    •    parentId = 0 → materia prima base (ej: “Harina de Trigo”).
    •    parentId > 0 → producto derivado de otro token (ej: “Harina empacada 1Kg” a partir de la harina base).

Ejemplos:
    •    Token 1
    •    name = "Harina de trigo"
    •    totalSupply = 1000
    •    parentId = 0
    •    features = {"unit":"kg","quality":"A"}
    •    Token 4
    •    name = "Harina_empacada 1Kg"
    •    totalSupply = 10
    •    parentId = 2
    •    features = {"unit":"kg","package":"1kg","batch":"Lote 2"}

Esto permite reconstruir el origen:
Consumer → Retailer → Factory → Producer → Materia prima inicial.

⸻

5.3 Flujo de transferencias

Rutas permitidas por contrato:
    •    Producer → Factory
    •    Factory → Retailer
    •    Retailer → Consumer

Estados de las transferencias:
    •    Pending
    •    Accepted
    •    Rejected

Flujo:
    1.    El emisor llama a transfer(to, tokenId, amount)
→ se crea una transferencia en estado Pending.
    2.    El receptor entra con su cuenta y ve transferencias entrantes.
    3.    El receptor puede:
    •    Aceptar → se mueven los balances efectivamente.
    •    Rechazar → los balances no cambian.

La interfaz muestra:
    •    Mis tokens (balance por tokenId).
    •    Transferencias relacionadas con mi cuenta:
    •    Entrantes (pueden aceptar / rechazar).
    •    Salientes (para tracking).

⸻

6. Frontend – Pantallas principales

6.1 Página principal /

Funcionalidades:
    •    Conectar MetaMask.
    •    Solicitar rol (Producer / Factory / Retailer / Consumer).
    •    Ver estado de usuario.
    •    Si es Producer Approved:
    •    Crear token de materia prima (parentId = 0).
    •    Si es Factory o Retailer Approved:
    •    Crear tokens derivados (parentId > 0).
    •    Ver Mis tokens (tabla):
    •    ID, nombre, balance, totalSupply, features, parentId, fecha de creación.
    •    Transferir tokens (según el flujo permitido).

6.2 Panel de administración /admin

Funcionalidades:
    •    Conectar como Admin (cuenta 0 de Anvil).
    •    Buscar usuarios por dirección.
    •    Ver datos:
    •    ID, rol solicitado, estado.
    •    Cambiar estado del usuario:
    •    Pending → Approved / Rejected / Canceled.
    •    Ver transferencias y sus estados (Accepted / Rejected / Pending).

⸻

7. Tests (Forge)

Ubicación:
    •    sc/test/SupplyChain.t.sol

Ejecutar:

cd /Users/pdiazq/supply-chain-tracker/sc
forge test

Los tests incluyen, entre otros:
    •    testIsAdmin
    •    testUserRegistration
    •    testAdminApproveUser
    •    testOnlyAdminCanChangeStatus
    •    testCreateTokenByProducer
    •    testTransferFromProducerToFactory
    •    testAcceptTransfer
    •    testRejectTransfer
    •    testUnapprovedUserCannotCreateToken
    •    testUnapprovedUserCannotTransfer
    •    testConsumerCannotTransfer

Todos los tests pasan:

Ran X tests for test/SupplyChain.t.sol:SupplyChainTest
[PASS] ... 
Suite result: ok. X passed; 0 failed; 0 skipped.


pdiazq@Pedros-MacBook-Pro sc % 
pdiazq@Pedros-MacBook-Pro sc % 
pdiazq@Pedros-MacBook-Pro sc % forge test
[⠊] Compiling...
No files changed, compilation skipped

Ran 13 tests for test/SupplyChain.t.sol:SupplyChainTest
[PASS] testAcceptTransfer() (gas: 644305)
[PASS] testAdminApproveUser() (gas: 145604)
[PASS] testConsumerCannotTransfer() (gas: 1279771)
[PASS] testCreateTokenByProducer() (gas: 330190)
[PASS] testIsAdmin() (gas: 14595)
[PASS] testOnlyAdminCanChangeStatus() (gas: 116191)
[PASS] testRejectTransfer() (gas: 621837)
[PASS] testTransferFromProducerToFactory() (gas: 591790)
[PASS] testTransferToSameAddress() (gas: 314259)
[PASS] testTransferZeroAmount() (gas: 435949)
[PASS] testUnapprovedUserCannotCreateToken() (gas: 115540)
[PASS] testUnapprovedUserCannotTransfer() (gas: 442569)
[PASS] testUserRegistration() (gas: 118347)
Suite result: ok. 13 passed; 0 failed; 0 skipped; finished in 7.71ms (9.61ms CPU time)

Ran 1 test suite in 190.39ms (7.71ms CPU time): 13 tests passed, 0 failed, 0 skipped (13 total tests)
pdiazq@Pedros-MacBook-Pro sc % 
pdiazq@Pedros-MacBook-Pro sc % 
pdiazq@Pedros-MacBook-Pro sc % 
pdiazq@Pedros-MacBook-Pro sc % 


⸻

8. Video demostrativo

Duración máxima: 5 minutos (según requisitos del Máster).

El video muestra:
    1.    Arranque de ./start-local.sh.
    2.    Arranque de npm run dev en web.
    3.    Configuración de MetaMask en red Anvil Local.
    4.    Flujo completo:
    •    Solicitud y aprobación de roles.
    •    Creación de tokens de materia prima.
    •    Creación de tokens derivados.
    •    Transferencias Producer → Factory → Retailer → Consumer.
    •    Aceptación / rechazo de transferencias.
    •    Vista de trazabilidad desde la tabla de tokens y transferencias.

Enlace al video:

## Demo en video

👉 https://youtu.be/LVnEL3wEIm8

⸻

9. IA y asistencia

El desarrollo del proyecto se realizó con apoyo de herramientas de IA (ChatGPT) para:
    •    Diseño y refinamiento del contrato SupplyChain.sol.
    •    Generación de pruebas iniciales con Foundry.
    •    Diseño de la interfaz en Next.js y su integración con ethers + MetaMask.
    •    Solución de errores de integración (Anvil, red local, MetaMask, chainId).
    •    Redacción y organización de la documentación.

Todas las decisiones finales de implementación fueron entendidas y ajustadas manualmente por el autor.

Para más detalle, ver el archivo IA.md en la raíz del proyecto.

⸻

10. Conclusiones
    •    El proyecto demuestra cómo un sistema de supply chain se beneficia de la inmutabilidad y trazabilidad de la blockchain.
    •    El uso de parentId permite reconstruir fácilmente el origen de cualquier producto derivado.
    •    La separación de roles (Producer, Factory, Retailer, Consumer, Admin) refleja un flujo realista de la cadena de suministro.
    •    Las pruebas con Foundry y la ejecución local con Anvil permiten validar la lógica antes de desplegar en una red pública o de test.
