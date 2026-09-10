"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Client {
  id: string;
  slug: string;
  name: string;
  voice_agent_enabled: boolean;
}

export default function AgentsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClients() {
      try {
        const response = await fetch("/api/admin/agents");
        if (!response.ok) throw new Error("Failed to fetch clients");
        const { clients } = await response.json();
        setClients(clients);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, []);

  if (loading)
    return (
      <div className="p-8">
        <div className="text-gray-600">Loading agents...</div>
      </div>
    );

  if (error)
    return (
      <div className="p-8">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Voice Agents
          </h1>
          <p className="text-gray-600">
            Configure Dograh voice agent settings for each client
          </p>
        </div>

        {clients.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-600">No agents configured yet</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {clients.map((client) => (
              <Link
                key={client.id}
                href={`/admin/agents/${client.id}/edit`}
                className="block"
              >
                <div className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {client.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {client.slug}
                      </p>
                    </div>
                    <div className="text-right">
                      <div
                        className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          client.voice_agent_enabled
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {client.voice_agent_enabled ? "Enabled" : "Disabled"}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">→ Edit</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
