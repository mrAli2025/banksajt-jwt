"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function Transactions() {
  const [transactions, setTransactions] = useState(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const { accessToken } = useAuth();

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!accessToken) {
        router.push("/login");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/me/transactions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Kunde inte hämta transaktioner");
        }

        const data = await response.json();
        setTransactions(data.transactions);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchTransactions();
  }, [accessToken, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-black px-4 py-12">
      <div className="flex flex-col gap-6 w-full max-w-sm bg-white dark:bg-zinc-900 p-8 rounded-lg shadow">
        <h1 className="text-2xl font-semibold text-center">Transaktioner</h1>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        {transactions === null && !error && (
          <p className="text-center text-zinc-500">Laddar...</p>
        )}

        {transactions !== null && transactions.length === 0 && (
          <p className="text-center text-zinc-500">
            Inga transaktioner än. Sätt in pengar på kontosidan för att komma igång.
          </p>
        )}

        {transactions !== null && transactions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 py-2 text-sm"
              >
                <span>
                  {t.type === "withdrawal" ? "Uttag" : "Insättning"}
                </span>
                <span className="text-zinc-500">{formatDate(t.created_at)}</span>
                <span
                  className={
                    t.type === "withdrawal" ? "text-red-500" : "text-green-600"
                  }
                >
                  {t.type === "withdrawal" ? "-" : "+"}
                  {t.amount} kr
                </span>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/account"
          className="text-center text-sm font-medium underline underline-offset-4"
        >
          Tillbaka till kontot
        </Link>
      </div>
    </div>
  );
}