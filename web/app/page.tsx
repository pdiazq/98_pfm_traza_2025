"use client";

import { useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import { CONTRACT_CONFIG } from "../src/contracts/config";

type UserInfo =
  | {
      id: bigint;
      userAddress: string;
      role: string;
      status: number; // 0 Pending, 1 Approved, 2 Rejected, 3 Canceled
    }
  | null;

type NewTokenForm = {
  name: string;
  totalSupply: string;
  features: string;
};

type TransferInfo = {
  id: number;
  from: string;
  to: string;
  tokenId: number;
  amount: number;
  status: number; // 0 Pending, 1 Accepted, 2 Rejected
  dateCreated: number;
  direction: "in" | "out";
};

export default function HomePage() {
  // ============================
  // Hooks de estado
  // ============================
  const [account, setAccount] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Crear token base (Producer)
  const [newToken, setNewToken] = useState<NewTokenForm>({
    name: "",
    totalSupply: "",
    features: '{"unit":"kg","quality":"A"}',
  });

  // Rol a solicitar
  const [roleToRequest, setRoleToRequest] = useState("Producer");

  // Token hijo (Factory / Retailer)
  const [childName, setChildName] = useState("");
  const [childSupply, setChildSupply] = useState("");
  const [childFeatures, setChildFeatures] = useState('{"unit":"kg"}');
  const [childParentId, setChildParentId] = useState("");
  const [childMsg, setChildMsg] = useState<string | null>(null);

  // Transferencias (enviar)
  const [transferTokenId, setTransferTokenId] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferTo, setTransferTo] = useState("");
  const [transferMsg, setTransferMsg] = useState("");

  // Mis tokens
  const [myTokens, setMyTokens] = useState<any[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  // Transferencias relacionadas conmigo (entrantes/salientes)
  const [myTransfers, setMyTransfers] = useState<TransferInfo[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [transfersMsg, setTransfersMsg] = useState<string | null>(null);

  // ============================
  // Helpers de contrato
  // ============================
  async function getReadContract() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      throw new Error("MetaMask no está disponible");
    }
    const provider = new BrowserProvider((window as any).ethereum);
    return new Contract(CONTRACT_CONFIG.address, CONTRACT_CONFIG.abi, provider);
  }

  async function getWriteContract() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      throw new Error("MetaMask no está disponible");
    }
    const ethereum = (window as any).ethereum;
    const provider = new BrowserProvider(ethereum);

    const chainId: string = await ethereum.request({ method: "eth_chainId" });
    const normalized = chainId.toLowerCase();

    if (normalized !== "0x7a69" && normalized !== "0x539") {
      throw new Error(
        "MetaMask no está en la red local (Anvil, chainId 31337). Cambia la red en MetaMask."
      );
    }

    const signer = await provider.getSigner();
    return new Contract(CONTRACT_CONFIG.address, CONTRACT_CONFIG.abi, signer);
  }

  async function getContractWithSigner() {
    if (!account) throw new Error("Wallet no conectada");

    const provider = new BrowserProvider((window as any).ethereum);
    const chainId = await provider.send("eth_chainId", []);
    const normalized = (chainId as string).toLowerCase();

    if (normalized !== "0x7a69" && normalized !== "0x539") {
      throw new Error("MetaMask no está en la red local (Anvil, chainId 31337)");
    }

    const signer = await provider.getSigner();
    return new Contract(CONTRACT_CONFIG.address, CONTRACT_CONFIG.abi, signer);
  }

  // ============================
  // Conexión con MetaMask
  // ============================
  async function connectWallet() {
    try {
      if (typeof window === "undefined" || !(window as any).ethereum) {
        alert("MetaMask no está disponible.");
        return;
      }

      setMsg(null);
      const ethereum = (window as any).ethereum;
      const provider = new BrowserProvider(ethereum);

      const accounts: string[] = await provider.send(
        "eth_requestAccounts",
        []
      );
      const selected = accounts[0];
      setAccount(selected);

      await fetchUserInfo(selected);
      await fetchMyTokensForAddress(selected);
      await fetchMyTransfersForAddress(selected);
    } catch (err: any) {
      console.error(err);
      setMsg("Error al conectar la wallet: " + (err.message || String(err)));
    }
  }

  // ============================
  // Usuario / Roles
  // ============================
  async function fetchUserInfo(addr?: string) {
    try {
      const contract = await getReadContract();
      const address = addr || account;
      if (!address) return;

      const u = await contract.getUserInfo(address);
      setUserInfo({
        id: u.id,
        userAddress: u.userAddress,
        role: u.role,
        status: Number(u.status),
      });
    } catch {
      setUserInfo(null);
    }
  }

  async function requestRole() {
    if (!account) return alert("Conecta primero la wallet");
    setLoading(true);
    setMsg(null);
    try {
      const c = await getContractWithSigner();
      const tx = await c.requestUserRole(roleToRequest);
      setMsg(
        `Transacción enviada… solicitando rol ${roleToRequest}. Esperando confirmación`
      );
      await tx.wait();
      setMsg(
        `Rol ${roleToRequest} solicitado. Queda en Pending hasta aprobación del admin.`
      );
      await fetchUserInfo(account);
    } catch (e: any) {
      setMsg("Error: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(s?: number) {
    if (s === undefined) return "Sin registro";
    return ["Pending", "Approved", "Rejected", "Canceled"][s] ?? "Desconocido";
  }

  function transferStatusLabel(s: number) {
    return ["Pending", "Accepted", "Rejected"][s] ?? "Desconocido";
  }

  // ============================
  // Crear token de materia prima (Producer)
  // ============================
  async function handleCreateToken() {
    if (!account) {
      alert("Conecta primero la wallet");
      return;
    }
    if (!userInfo || userInfo.role !== "Producer") {
      alert("Solo un Producer puede crear tokens de materia prima");
      return;
    }

    const supplyNum = Number(newToken.totalSupply);
    if (!newToken.name.trim() || !supplyNum || supplyNum <= 0) {
      alert("Nombre y totalSupply deben ser válidos");
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const c = await getWriteContract();
      const tx = await c.createToken(
        newToken.name,
        supplyNum,
        newToken.features,
        0 // parentId = 0
      );
      setMsg("Transacción enviada… creando token en blockchain");
      await tx.wait();
      setMsg("✅ Token de materia prima creado correctamente.");
      await fetchMyTokens(); // refrescar lista
    } catch (e: any) {
      console.error(e);
      setMsg("Error al crear token: " + (e.reason || e.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ============================
  // Crear token derivado (Factory / Retailer)
  // ============================
  async function handleCreateChildToken() {
    try {
      setChildMsg(null);

      if (!userInfo || (userInfo.role !== "Factory" && userInfo.role !== "Retailer")) {
        return setChildMsg("Solo Factory o Retailer pueden crear tokens derivados.");
      }

      if (!childName || !childSupply || !childParentId) {
        return setChildMsg("Faltan datos.");
      }

      const supplyNum = Number(childSupply);
      const parentIdNum = Number(childParentId);

      if (parentIdNum === 0) {
        return setChildMsg("Error: parentId debe ser distinto de 0.");
      }

      const c = await getContractWithSigner();
      const tx = await c.createToken(
        childName,
        supplyNum,
        childFeatures,
        parentIdNum
      );
      setChildMsg("Transacción enviada… esperando confirmación");
      await tx.wait();
      setChildMsg("✅ Token derivado creado correctamente.");
      setChildName("");
      setChildSupply("");
      setChildParentId("");
      await fetchMyTokens(); // refrescar lista
    } catch (e: any) {
      setChildMsg("Error: " + (e.reason || e.message));
    }
  }

  // ============================
  // Transferencias (enviar)
  // ============================
  async function handleTransfer() {
    try {
      setTransferMsg("Procesando...");
      const c = await getContractWithSigner();
      const tx = await c.transfer(transferTo, transferTokenId, transferAmount);
      await tx.wait();
      setTransferMsg("Transferencia enviada y pendiente de aceptación.");
      await fetchMyTransfers(); // refrescar lista de transferencias
      await fetchMyTokens(); // refrescar balances
    } catch (e: any) {
      setTransferMsg("Error: " + (e.reason || e.message));
    }
  }

  // ============================
  // Mis tokens
  // ============================
  async function fetchMyTokensForAddress(addr: string) {
    setLoadingTokens(true);
    setMyTokens([]);

    try {
      const contract = await getReadContract();
      const tokenIds: bigint[] = await contract.getUserTokens(addr);

      const detailedTokens: any[] = [];

      for (let id of tokenIds) {
        const tid = Number(id);
        const token = await contract.getToken(tid);
        const balance = await contract.getTokenBalance(tid, addr);

        detailedTokens.push({
          id: tid,
          name: token.name,
          totalSupply: Number(token.totalSupply),
          features: token.features,
          parentId: Number(token.parentId),
          dateCreated: Number(token.dateCreated),
          balance: Number(balance),
        });
      }

      setMyTokens(detailedTokens);
    } catch (err) {
      console.error("Error al cargar tokens:", err);
    } finally {
      setLoadingTokens(false);
    }
  }

  async function fetchMyTokens() {
    if (!account) return;
    await fetchMyTokensForAddress(account);
  }

  // ============================
  // Mis transferencias (entrantes/salientes)
  // ============================
  async function fetchMyTransfersForAddress(addr: string) {
    setLoadingTransfers(true);
    setMyTransfers([]);
    setTransfersMsg(null);

    try {
      const contract = await getReadContract();
      const ids: bigint[] = await contract.getUserTransfers(addr);

      const list: TransferInfo[] = [];

      for (let id of ids) {
        const tid = Number(id);
        const t = await contract.getTransfer(tid);

        const from = t.from as string;
        const to = t.to as string;
        const direction: "in" | "out" =
          to.toLowerCase() === addr.toLowerCase() ? "in" : "out";

        list.push({
          id: tid,
          from,
          to,
          tokenId: Number(t.tokenId),
          amount: Number(t.amount),
          status: Number(t.status),
          dateCreated: Number(t.dateCreated),
          direction,
        });
      }

      setMyTransfers(list);
      if (list.length === 0) {
        setTransfersMsg("No hay transferencias relacionadas con esta cuenta.");
      }
    } catch (err: any) {
      console.error("Error al cargar transferencias:", err);
      setTransfersMsg("Error al cargar transferencias: " + (err.message || String(err)));
    } finally {
      setLoadingTransfers(false);
    }
  }

  async function fetchMyTransfers() {
    if (!account) return;
    await fetchMyTransfersForAddress(account);
  }

  async function handleAcceptTransfer(id: number) {
    try {
      setTransfersMsg("Aceptando transferencia...");
      const c = await getContractWithSigner();
      const tx = await c.acceptTransfer(id);
      await tx.wait();
      setTransfersMsg("✅ Transferencia aceptada.");
      await fetchMyTransfers();
      await fetchMyTokens();
    } catch (e: any) {
      setTransfersMsg("Error al aceptar: " + (e.reason || e.message));
    }
  }

  async function handleRejectTransfer(id: number) {
    try {
      setTransfersMsg("Rechazando transferencia...");
      const c = await getContractWithSigner();
      const tx = await c.rejectTransfer(id);
      await tx.wait();
      setTransfersMsg("✅ Transferencia rechazada.");
      await fetchMyTransfers();
    } catch (e: any) {
      setTransfersMsg("Error al rechazar: " + (e.reason || e.message));
    }
  }

  // ============================
  // Render
  // ============================
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Supply Chain Tracker – Demo inicial</h1>

      {/* Conexión de wallet */}
      {!account ? (
        <button
          onClick={connectWallet}
          style={{ padding: "8px 12px", marginTop: 12 }}
        >
          Conectar MetaMask
        </button>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div>
            <b>Cuenta:</b> {account}
          </div>
          <button
            onClick={() => {
              fetchUserInfo();
              fetchMyTokens();
              fetchMyTransfers();
            }}
            style={{ padding: "6px 10px", marginTop: 8 }}
          >
            Actualizar info
          </button>
        </div>
      )}

      {/* Gestión de usuario */}
      {account && (
        <>
          <h2 style={{ marginTop: 20 }}>Gestión de usuario</h2>

          <div style={{ marginTop: 8 }}>
            Rol a solicitar:
            <br />
            <select
              value={roleToRequest}
              onChange={(e) => setRoleToRequest(e.target.value)}
              style={{ padding: 6, marginTop: 4 }}
            >
              <option value="Producer">Producer</option>
              <option value="Factory">Factory</option>
              <option value="Retailer">Retailer</option>
              <option value="Consumer">Consumer</option>
            </select>
          </div>

          <button
            onClick={requestRole}
            disabled={loading}
            style={{ padding: "8px 12px", marginTop: 12 }}
          >
            {loading ? "Enviando…" : `Solicitar rol ${roleToRequest}`}
          </button>

          <div style={{ marginTop: 12 }}>
            <h3>Estado actual</h3>
            {userInfo ? (
              <ul>
                <li>
                  <b>Address:</b> {userInfo.userAddress}
                </li>
                <li>
                  <b>Rol:</b> {userInfo.role}
                </li>
                <li>
                  <b>Status:</b> {statusLabel(userInfo.status)}
                </li>
              </ul>
            ) : (
              <p>No hay usuario registrado para esta wallet.</p>
            )}
          </div>
        </>
      )}

      {/* Crear token de materia prima (solo Producer Approved) */}
      {account && userInfo && userInfo.role === "Producer" && (
        <section style={{ marginTop: 32 }}>
          <h2>Crear token de materia prima</h2>
          <p>
            Como <b>Producer Approved</b>, puedes crear un token que represente
            una materia prima (por ejemplo, &quot;Harina de Trigo&quot;). El{" "}
            <code>parentId</code> será 0 porque es un token base.
          </p>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: 400,
            }}
          >
            <label>
              Nombre del token: <br />
              <input
                type="text"
                value={newToken.name}
                onChange={(e) =>
                  setNewToken((t) => ({ ...t, name: e.target.value }))
                }
                style={{ width: "100%", padding: 4 }}
              />
            </label>

            <label>
              Cantidad total (totalSupply): <br />
              <input
                type="number"
                value={newToken.totalSupply}
                onChange={(e) =>
                  setNewToken((t) => ({ ...t, totalSupply: e.target.value }))
                }
                style={{ width: "100%", padding: 4 }}
              />
            </label>

            <label>
              Features (JSON): <br />
              <textarea
                value={newToken.features}
                onChange={(e) =>
                  setNewToken((t) => ({ ...t, features: e.target.value }))
                }
                rows={3}
                style={{ width: "100%", padding: 4 }}
              />
            </label>

            <button
              onClick={handleCreateToken}
              disabled={loading}
              style={{ padding: "8px 12px", marginTop: 8 }}
            >
              {loading ? "Enviando…" : "Crear token de materia prima"}
            </button>
          </div>
        </section>
      )}

      {/* Crear token derivado (Factory / Retailer) */}
      {account &&
        userInfo &&
        (userInfo.role === "Factory" || userInfo.role === "Retailer") && (
          <div style={{ marginTop: 40 }}>
            <h2>Crear token derivado (rol: {userInfo.role})</h2>

            <p>
              Como {userInfo.role} Approved, puedes crear productos derivados
              que provengan de un token existente usando <b>parentId</b>.
            </p>

            <div style={{ marginTop: 12 }}>
              Nombre del token hijo:
              <br />
              <input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                style={{ width: "300px", padding: 6, marginTop: 4 }}
                placeholder="Ej: Harina empacada 1kg"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              Cantidad total (totalSupply):
              <br />
              <input
                type="number"
                value={childSupply}
                onChange={(e) => setChildSupply(e.target.value)}
                style={{ width: "300px", padding: 6, marginTop: 4 }}
                placeholder="Ej: 50"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              Features (JSON):
              <br />
              <textarea
                value={childFeatures}
                onChange={(e) => setChildFeatures(e.target.value)}
                style={{ width: "300px", padding: 6, height: 80, marginTop: 4 }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              parentId (ID del token padre):
              <br />
              <input
                type="number"
                value={childParentId}
                onChange={(e) => setChildParentId(e.target.value)}
                style={{ width: "300px", padding: 6, marginTop: 4 }}
                placeholder="Ej: 2"
              />
            </div>

            <button
              onClick={handleCreateChildToken}
              style={{ padding: "8px 12px", marginTop: 16 }}
            >
              Crear token derivado
            </button>

            {childMsg && (
              <p
                style={{
                  marginTop: 12,
                  color: childMsg.startsWith("Error") ? "red" : "green",
                }}
              >
                {childMsg}
              </p>
            )}
          </div>
        )}

      {/* Mensajes generales */}
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      {/* Mis tokens */}
      {account && (
        <div style={{ marginTop: 40 }}>
          <h2>Mis tokens</h2>

          <button
            onClick={fetchMyTokens}
            style={{ padding: "8px 12px", marginBottom: 12 }}
          >
            {loadingTokens ? "Cargando tokens..." : "Mostrar mis tokens"}
          </button>

          {myTokens.length === 0 && !loadingTokens && (
            <p>No hay tokens para esta cuenta.</p>
          )}

          {myTokens.length > 0 && (
            <table
              border={1}
              cellPadding={8}
              style={{ marginTop: 12, borderCollapse: "collapse" }}
            >
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Balance</th>
                  <th>Total Supply</th>
                  <th>Features</th>
                  <th>Parent ID</th>
                  <th>Fecha creación</th>
                </tr>
              </thead>
              <tbody>
                {myTokens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.name}</td>
                    <td>{t.balance}</td>
                    <td>{t.totalSupply}</td>
                    <td>{t.features}</td>
                    <td>{t.parentId}</td>
                    <td>
                      {new Date(t.dateCreated * 1000).toLocaleString("es-ES")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Transferencias de tokens (enviar) */}
      {account && userInfo && (
        <div style={{ marginTop: 40 }}>
          <h2>Transferir tokens</h2>
          <p>
            Como <b>{userInfo.role}</b>, puedes transferir tokens siguiendo
            el flujo permitido por el contrato:
          </p>
          <ul>
            <li>Producer → Factory</li>
            <li>Factory → Retailer</li>
            <li>Retailer → Consumer</li>
          </ul>

          <div style={{ marginTop: 12 }}>
            <label>ID del token: </label>
            <input
              type="number"
              value={transferTokenId}
              onChange={(e) => setTransferTokenId(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Cantidad a transferir: </label>
            <input
              type="number"
              value={transferAmount}
              onChange={(e) => setTransferAmount(Number(e.target.value))}
              style={{ marginLeft: 8 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Dirección destino: </label>
            <input
              type="text"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              style={{ marginLeft: 8, width: 380 }}
            />
          </div>

          <button
            onClick={handleTransfer}
            style={{ marginTop: 12, padding: "8px 12px" }}
          >
            Enviar transferencia
          </button>

          {transferMsg && (
            <p style={{ marginTop: 10, color: "#0070f3" }}>{transferMsg}</p>
          )}
        </div>
      )}

      {/* Transferencias relacionadas conmigo (entrantes / salientes) */}
      {account && (
        <div style={{ marginTop: 40 }}>
          <h2>Transferencias relacionadas con mi cuenta</h2>

          <button
            onClick={fetchMyTransfers}
            style={{ padding: "8px 12px", marginBottom: 12 }}
          >
            {loadingTransfers ? "Cargando transferencias..." : "Actualizar transferencias"}
          </button>

          {transfersMsg && (
            <p style={{ marginTop: 8 }}>{transfersMsg}</p>
          )}

          {myTransfers.length > 0 && (
            <table
              border={1}
              cellPadding={8}
              style={{ marginTop: 12, borderCollapse: "collapse" }}
            >
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Token ID</th>
                  <th>Cantidad</th>
                  <th>De</th>
                  <th>Para</th>
                  <th>Dirección</th>
                  <th>Status</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {myTransfers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.tokenId}</td>
                    <td>{t.amount}</td>
                    <td>{t.from}</td>
                    <td>{t.to}</td>
                    <td>{t.direction === "in" ? "Entrante" : "Saliente"}</td>
                    <td>{transferStatusLabel(t.status)}</td>
                    <td>
                      {new Date(t.dateCreated * 1000).toLocaleString("es-ES")}
                    </td>
                    <td>
                      {t.direction === "in" && t.status === 0 ? (
                        <>
                          <button
                            onClick={() => handleAcceptTransfer(t.id)}
                            style={{ marginRight: 8 }}
                          >
                            Aceptar
                          </button>
                          <button onClick={() => handleRejectTransfer(t.id)}>
                            Rechazar
                          </button>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}