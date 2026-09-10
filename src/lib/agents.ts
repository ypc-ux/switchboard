/**
 * Agent Configuration Management
 * Handles CRUD for Dograh voice agent configs per client
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AgentConfig {
  id: string;
  client_id: string;
  client_slug: string;
  tts_provider: "google" | "elevenlabs" | "aws" | "openai";
  voice_id: string;
  greeting: string;
  agent_instructions: string;
  services: string[];
  business_hours: Record<string, [string, string]>;
  faq: Array<{ question: string; answer: string }>;
  updated_at: string;
}

export async function getAgentConfig(
  clientId: string
): Promise<AgentConfig | null> {
  const { data } = await supabase
    .from("business_knowledge")
    .select("*")
    .eq("client_id", clientId)
    .single();

  if (!data) return null;

  return {
    id: data.id,
    client_id: data.client_id,
    client_slug: data.client_slug,
    tts_provider: data.tts_provider || "google",
    voice_id: data.voice_id || "en-US-Neural2-C",
    greeting: data.greeting || `Hi, calling on behalf of ${data.client_slug}`,
    agent_instructions: data.agent_instructions || "",
    services: data.services || [],
    business_hours: data.business_hours || {},
    faq: data.faq || [],
    updated_at: data.updated_at,
  };
}

export async function updateAgentConfig(
  clientId: string,
  config: Partial<AgentConfig>
): Promise<AgentConfig> {
  const { data, error } = await supabase
    .from("business_knowledge")
    .update({
      tts_provider: config.tts_provider,
      voice_id: config.voice_id,
      greeting: config.greeting,
      agent_instructions: config.agent_instructions,
      services: config.services,
      business_hours: config.business_hours,
      faq: config.faq,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", clientId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    client_id: data.client_id,
    client_slug: data.client_slug,
    tts_provider: data.tts_provider,
    voice_id: data.voice_id,
    greeting: data.greeting,
    agent_instructions: data.agent_instructions,
    services: data.services,
    business_hours: data.business_hours,
    faq: data.faq,
    updated_at: data.updated_at,
  };
}

export async function listClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("id, slug, name, voice_agent_enabled")
    .eq("voice_agent_enabled", true);

  if (error) throw error;
  return data;
}

export const TTS_PROVIDERS = {
  google: {
    name: "Google Cloud TTS",
    voices: [
      { id: "en-US-Neural2-C", name: "Paige (Female)" },
      { id: "en-US-Neural2-E", name: "Evan (Male)" },
      { id: "en-US-Neural2-A", name: "Amy (Female)" },
      { id: "en-US-Neural2-I", name: "Isaac (Male)" },
    ],
    cost: "~$2-4/hour",
  },
  elevenlabs: {
    name: "ElevenLabs",
    voices: [
      { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Professional)" },
      { id: "AZnzlk1W34gdsz4yXWNW", name: "Domi (Authoritative)" },
      { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella (Warm)" },
      { id: "g0FPH82WrITT8r7aHiN2", name: "Antoni (Confident)" },
    ],
    cost: "~$10-30/hour",
  },
  aws: {
    name: "AWS Polly",
    voices: [
      { id: "Joanna", name: "Joanna (Professional Female)" },
      { id: "Matthew", name: "Matthew (Professional Male)" },
      { id: "Kimberly", name: "Kimberly (Friendly Female)" },
      { id: "Justin", name: "Justin (Friendly Male)" },
    ],
    cost: "~$0.50/hour",
  },
  openai: {
    name: "OpenAI TTS",
    voices: [
      { id: "alloy", name: "Alloy (Neutral)" },
      { id: "echo", name: "Echo (Deep)" },
      { id: "fable", name: "Fable (Friendly)" },
      { id: "onyx", name: "Onyx (Professional)" },
      { id: "nova", name: "Nova (Energetic)" },
      { id: "shimmer", name: "Shimmer (Bright)" },
    ],
    cost: "~$1-2/hour",
  },
};
