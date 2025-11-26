"use client";

import { useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import { CONTRACT_CONFIG } from "../../src/contracts/config";

type UserInfo = {
  id: bigint;
  userAddress: string;
  role: string;
  status: number;
} | null;

function statusLabel(s?: number) {
  if (s === undefined) return "Sin registro";
  return ["Pending", "Approved", "Rejected", "Canceled"][s] ?? "Desconocido";
}

export default function AdminPage() {
  const [account, setAccount] = useState<string | null>(null);
  const [targetAddress, setTargetAddress] = useState<string>("");
  const [userInfo, setUserInfo] = useState<UserInfo>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function connectAsAdmin() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("MetaMask no está disponible.");
      return;
    }

    const ethereum = (window as any).ethereum;
    setMsg(null);

    // Aseguramos red local Anvil
    const chainId = await ethereum.request({ method: "eth_chainId" });
    const normalized = String(chainId).toLowerCase();
    if (normalized !== "0x7a69" && normalized !== "0x539") {
      alert(`Red incorrecta. Conéctate a Anvil (chainId 31337). Detectado: ${chainId}`);
      return;
    }

    const provider = new BrowserProvider(ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    const selected = (accounts[0] as string) || "";

    if (selected.toLowerCase() !== CONTRACT_CONFIG.adminAddress.toLowerCase()) {
      alert(
        `Esta página es solo para el admin.\nConéctate con: ${CONTRACT_CONFIG.adminAddress}`
      );
      setAccount(null);
      return;
    }

    setAccount(selected);
    setMsg("Admin conectado correctamente.");
  }

  async function getReadOnlyContract() {
    const ethereum = (window as any).ethereum;
    const provider = new BrowserProvider(ethereum);
    return new Contract(CONTRACT_CONFIG.address, CONTRACT_CONFIG.abi, provider);
  }

  async function getWriteContract() {
    if (!account) throw new Error("Wallet no conectada como admin");
    const ethereum = (window as any).ethereum;
    const provider = new BrowserProvider(ethereum);

    const chainId = await ethereum.request({ method: "eth_chainId" });
    const normalized = String(chainId).toLowerCase();
    if (normalized !== "0x7a69" && normalized !== "0x539") {
      throw new Error(`Red incorrecta. chainId detectado: ${chainId}`);
    }

    const signer = await provider.getSigner();
    return new Contract(CONTRACT_CONFIG.address, CONTRACT_CONFIG.abi, signer);
  }

  async function fetchUser() {
    setMsg(null);
    setUserInfo(null);

    if (!targetAddress) {
      alert("Introduce una dirección de usuario (0x...)");
      return;
    }

    try {
      const contract = await getReadOnlyContract();
      const u = await contract.getUserInfo(targetAddress);
      setUserInfo({
        id: u.id,
        userAddress: u.userAddress,
        role: u.role,
        status: Number(u.status),
      });
      setMsg("Usuario encontrado.");
    } catch (e: any) {
      console.error(e);
      setUserInfo(null);
      setMsg("No se encontró usuario para esa dirección (o aún no se ha registrado).");
    }
  }

  async function changeStatus(newStatus: number) {
    if (!targetAddress) {
      alert("Introduce una dirección de usuario");
      return;
    }
    setLoading(true);
    setMsg(null);

    try {
      const contract = await getWriteContract();
      const tx = await contract.changeStatusUser(targetAddress, newStatus);
      setMsg("Transacción enviada… esperando confirmación");
      await tx.wait();
      setMsg("Estado actualizado correctamente.");
      await fetchUser();
    } catch (e: any) {
      console.error(e);
      setMsg("Error: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Panel de Administración – Supply Chain Tracker</h1>

      {!account ? (
        <button
          onClick={connectAsAdmin}
          style={{ padding: "8px 12px", marginTop: 12 }}
        >
          Conectar como Admin
        </button>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div>
            <b>Admin conectado:</b> {account}
          </div>
        </div>
      )}

      {account && (
        <>
          <section style={{ marginTop: 24 }}>
            <h2>Gestión de usuarios</h2>
            <p style={{ marginTop: 8 }}>
              Introduce la dirección del usuario que quieres revisar o aprobar.
            </p>

            <input
              type="text"
              placeholder="Dirección del usuario (0x...)"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value.trim())}
              style={{
                width: "100%",
                maxWidth: 480,
                padding: "8px",
                marginTop: 8,
                fontFamily: "monospace",
              }}
            />

            <div style={{ marginTop: 8 }}>
              <button
                onClick={fetchUser}
                style={{ padding: "6px 10px", marginRight: 8 }}
              >
                Buscar usuario
              </button>
            </div>

            {userInfo && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                }}
              >
                <h3>Información del usuario</h3>
                <ul>
                  <li>
                    <b>ID:</b> {userInfo.id.toString()}
                  </li>
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

                <div style={{ marginTop: 12 }}>
                  <button
                    disabled={loading}
                    onClick={() => changeStatus(1)} // Approved
                    style={{ padding: "6px 10px", marginRight: 8 }}
                  >
                    {loading ? "Procesando…" : "Aprobar (Approved)"}
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => changeStatus(2)} // Rejected
                    style={{ padding: "6px 10px", marginRight: 8 }}
                  >
                    Rechazar (Rejected)
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => changeStatus(3)} // Canceled
                    style={{ padding: "6px 10px" }}
                  >
                    Cancelar (Canceled)
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
    </main>
  );
}