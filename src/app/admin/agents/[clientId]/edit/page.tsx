"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AgentConfig, TTS_PROVIDERS } from "@/lib/agents";

interface DayHours {
  open: string;
  close: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function EditAgentPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch(`/api/admin/agents/${clientId}`);
        if (!response.ok) throw new Error("Failed to fetch agent config");
        const { config } = await response.json();
        setConfig(config);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, [clientId]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/admin/agents/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) throw new Error("Failed to save config");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-gray-600">Loading...</div>
      </div>
    );

  if (!config)
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-red-600">Agent not found</div>
      </div>
    );

  const currentProvider = TTS_PROVIDERS[config.tts_provider];
  const voices = currentProvider.voices;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{config.client_slug}</h1>
          <p className="text-gray-600 mt-1">Configure voice agent settings</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-800">
            ✓ Settings saved successfully
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-8 space-y-8">
          {/* TTS Provider Selection */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Voice Provider
            </h2>
            <div className="space-y-3">
              {Object.entries(TTS_PROVIDERS).map(([key, provider]) => (
                <label key={key} className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="tts_provider"
                    value={key}
                    checked={config.tts_provider === key}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        tts_provider: e.target.value as any,
                        voice_id: TTS_PROVIDERS[e.target.value as keyof typeof TTS_PROVIDERS].voices[0].id,
                      })
                    }
                    className="w-4 h-4 text-blue-600"
                  />
                  <div className="ml-3 flex-1">
                    <div className="font-medium text-gray-900">{provider.name}</div>
                    <div className="text-sm text-gray-500">{provider.cost}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Voice Selection */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Voice</h2>
            <select
              value={config.voice_id}
              onChange={(e) => setConfig({ ...config, voice_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          {/* Greeting */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Greeting</h2>
            <textarea
              value={config.greeting}
              onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
              rows={3}
              placeholder="E.g., Hi, calling on behalf of your roofer. How can we help?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-2">The first thing the agent says when it calls</p>
          </div>

          {/* Agent Instructions */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Agent Instructions
            </h2>
            <textarea
              value={config.agent_instructions}
              onChange={(e) =>
                setConfig({ ...config, agent_instructions: e.target.value })
              }
              rows={5}
              placeholder="Personality, tone, how to handle objections, what to prioritize..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              System prompt for the AI. Describe tone, personality, and decision rules.
            </p>
          </div>

          {/* Services */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Services</h2>
            <div className="space-y-2">
              {config.services.map((service, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={service}
                    onChange={(e) => {
                      const newServices = [...config.services];
                      newServices[idx] = e.target.value;
                      setConfig({ ...config, services: newServices });
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="E.g., Roof repair, Inspection, Replacement"
                  />
                  <button
                    onClick={() => {
                      setConfig({
                        ...config,
                        services: config.services.filter((_, i) => i !== idx),
                      });
                    }}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setConfig({ ...config, services: [...config.services, ""] })
                }
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + Add Service
              </button>
            </div>
          </div>

          {/* Business Hours */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Business Hours
            </h2>
            <div className="space-y-2">
              {DAYS.map((day) => {
                const hours = config.business_hours[day] as [string, string] | undefined;
                return (
                  <div key={day} className="flex gap-3 items-center">
                    <div className="w-24 text-sm font-medium text-gray-900">
                      {day}
                    </div>
                    <input
                      type="time"
                      value={hours?.[0] || "09:00"}
                      onChange={(e) => {
                        const newHours = { ...config.business_hours };
                        newHours[day] = [e.target.value, hours?.[1] || "17:00"];
                        setConfig({ ...config, business_hours: newHours });
                      }}
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="time"
                      value={hours?.[1] || "17:00"}
                      onChange={(e) => {
                        const newHours = { ...config.business_hours };
                        newHours[day] = [hours?.[0] || "09:00", e.target.value];
                        setConfig({ ...config, business_hours: newHours });
                      }}
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* FAQs */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">FAQs</h2>
            <div className="space-y-4">
              {config.faq.map((item, idx) => (
                <div key={idx} className="p-4 border border-gray-200 rounded-lg space-y-2">
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) => {
                      const newFaq = [...config.faq];
                      newFaq[idx].question = e.target.value;
                      setConfig({ ...config, faq: newFaq });
                    }}
                    placeholder="Question"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                  <textarea
                    value={item.answer}
                    onChange={(e) => {
                      const newFaq = [...config.faq];
                      newFaq[idx].answer = e.target.value;
                      setConfig({ ...config, faq: newFaq });
                    }}
                    placeholder="Answer"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                  <button
                    onClick={() => {
                      setConfig({
                        ...config,
                        faq: config.faq.filter((_, i) => i !== idx),
                      });
                    }}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setConfig({
                    ...config,
                    faq: [...config.faq, { question: "", answer: "" }],
                  })
                }
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + Add FAQ
              </button>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-3 pt-6 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-2 text-gray-700 font-medium rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
