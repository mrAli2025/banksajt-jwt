"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const FEATURE_NEW_DASHBOARD = process.env.NEXT_PUBLIC_FEATURE_NEW_DASHBOARD === "true";

export default function Account() {
  const [amount, setAmount] = useState(null);
  const [deposit, setDeposit] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [error, setError] = useState("");
  const [withdrawalError, setWithdrawalError] = useState("");
  const router = useRouter();
  const { accessToken, logout } = useAuth();

  useEffect(() => {
    const fetchBalance = async () => {
      if (!accessToken) {
        router.push("/login");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/me/accounts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Kunde inte hämta saldo");
        }

        const data = await response.json();
        setAmount(data.amount);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchBalance();
  }, [accessToken, router]);

  const handleDeposit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch(`${API_URL}/me/accounts/transactions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: Number(deposit) }),
      });

      if (!response.ok) {
        throw new Error("Kunde inte sätta in pengar");
      }

      const data = await response.json();
      setAmount(data.amount);
      setDeposit("");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleWithdrawal = async (e) => {
    e.preventDefault();
    setWithdrawalError("");

    try {
      const response = await fetch(`${API_URL}/me/accounts/withdrawals`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: Number(withdrawal) }),
      });

      if (!response.ok) {
        throw new Error("Uttaget kunde inte genomföras");
      }

      const data = await response.json();
      setAmount(data.amount);
      setWithdrawal("");
    } catch (err) {
      setWithdrawalError(err.message);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-black px-4">
      <div className="flex flex-col gap-6 w-full max-w-sm bg-white dark:bg-zinc-900 p-8 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Mitt konto</h1>
          <button
            onClick={handleLogout}
            className="text-sm font-medium underline underline-offset-4"
          >
            Logga ut
          </button>
        </div>

        {FEATURE_NEW_DASHBOARD && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-200">
            🎉 Nytt: Spara pengar automatiskt med vårt sparkonto!
          </div>
        )}

        <p className="text-center text-xl">
          Saldo: {amount !== null ? `${amount} kr` : "Laddar..."}
        </p>

        <form onSubmit={handleDeposit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="deposit">Belopp</label>
            <input
              id="deposit"
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="border rounded px-3 py-2"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="rounded-full bg-foreground px-6 py-3 text-background font-medium transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sätt in pengar
          </button>
        </form>

        <form onSubmit={handleWithdrawal} className="flex flex-col gap-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="withdrawal">Ta ut belopp</label>
            <input
              id="withdrawal"
              type="number"
              value={withdrawal}
              onChange={(e) => setWithdrawal(e.target.value)}
              className="border rounded px-3 py-2"
              required
            />
          </div>

          {withdrawalError && <p className="text-red-500 text-sm">{withdrawalError}</p>}

          <button
            type="submit"
            className="rounded-full border border-foreground px-6 py-3 font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Ta ut pengar
          </button>
        </form>

        <Link
          href="/transactions"
          className="text-center text-sm font-medium underline underline-offset-4"
        >
          Visa transaktionshistorik
        </Link>
      </div>
    </div>
  );
}