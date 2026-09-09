/**
 * Seed realistic test data for the voice agent system
 *
 * Usage:
 *   npx tsx scripts/seed-test-data.ts
 */

import { db } from "../src/lib/supabase";
import { randomUUID } from "crypto";

interface SeedClient {
  name: string;
  timezone: string;
  slug: string;
  twilio_number: string;
  forward_number: string;
  services: Array<{
    name: string;
    description: string;
    duration_minutes: number;
    price: string;
  }>;
  hours: Record<string, Array<[string, string]>>;
  booking_rules: {
    lead_time_minutes: number;
    buffer_minutes: number;
    max_days_out: number;
    max_per_day: number;
  };
  faqs: Array<{ q: string; a: string }>;
  agent_greeting: string;
  agent_instructions: string;
}

const testClients: SeedClient[] = [
  {
    name: "Demo Salon",
    timezone: "America/Los_Angeles",
    slug: "demo-salon",
    twilio_number: "+16505550100",
    forward_number: "+16505551000",
    agent_greeting: "Hi there! Welcome to Demo Salon. How can I help you today?",
    agent_instructions:
      "Be friendly and professional. If the caller is not sure which service they need, ask clarifying questions.",
    services: [
      { name: "Haircut", description: "Classic or modern cut", duration_minutes: 45, price: "$35" },
      { name: "Color", description: "Full color or touch-up", duration_minutes: 90, price: "$85" },
      { name: "Styling", description: "Special event styling", duration_minutes: 60, price: "$50" },
    ],
    hours: {
      mon: [["09:00", "19:00"]],
      tue: [["09:00", "19:00"]],
      wed: [["09:00", "19:00"]],
      thu: [["09:00", "19:00"]],
      fri: [["09:00", "20:00"]],
      sat: [["10:00", "18:00"]],
      sun: [],
    },
    booking_rules: {
      lead_time_minutes: 30,
      buffer_minutes: 15,
      max_days_out: 90,
      max_per_day: 8,
    },
    faqs: [
      {
        q: "Do you take walk-ins?",
        a: "Yes, we welcome walk-ins. Depending on the time, there may be a short wait.",
      },
      { q: "Do you offer color services?", a: "Absolutely! Our stylists are experienced with all hair types and colors." },
      { q: "How long does a haircut take?", a: "Most haircuts take 30-45 minutes." },
    ],
  },

  {
    name: "NYC Dental",
    timezone: "America/New_York",
    slug: "nyc-dental",
    twilio_number: "+12125550200",
    forward_number: "+12125551200",
    agent_greeting: "Hello, you've reached NYC Dental. Press 1 for appointments, 2 for billing questions.",
    agent_instructions: "This is a dental office. Be professional and helpful. For serious complaints, escalate to a human.",
    services: [
      { name: "Cleaning", description: "Regular cleaning and exam", duration_minutes: 60, price: "$150" },
      {
        name: "Whitening",
        description: "Professional teeth whitening",
        duration_minutes: 45,
        price: "$200",
      },
      { name: "Root Canal", description: "Root canal treatment", duration_minutes: 120, price: "$800" },
    ],
    hours: {
      mon: [
        ["08:00", "12:00"],
        ["13:00", "17:00"],
      ],
      tue: [
        ["08:00", "12:00"],
        ["13:00", "17:00"],
      ],
      wed: [
        ["08:00", "12:00"],
        ["13:00", "17:00"],
      ],
      thu: [
        ["08:00", "12:00"],
        ["13:00", "17:00"],
      ],
      fri: [
        ["08:00", "12:00"],
        ["13:00", "16:00"],
      ],
      sat: [],
      sun: [],
    },
    booking_rules: {
      lead_time_minutes: 60,
      buffer_minutes: 30,
      max_days_out: 60,
      max_per_day: 6,
    },
    faqs: [
      { q: "Do you accept insurance?", a: "Yes, we accept most major dental insurance plans." },
      { q: "What should I bring for my first visit?", a: "Please bring your ID, insurance card, and any previous dental records." },
      { q: "Is it painful?", a: "We use modern anesthetics to ensure your comfort." },
    ],
  },

  {
    name: "Zen Yoga Studio",
    timezone: "America/Denver",
    slug: "zen-yoga",
    twilio_number: "+13035550300",
    forward_number: "+13035551300",
    agent_greeting: "Namaste! Welcome to Zen Yoga. We offer classes in yoga, pilates, and meditation.",
    agent_instructions:
      "Be calm and welcoming. Help them find the right class for their level and schedule.",
    services: [
      { name: "Beginner Yoga", description: "Gentle intro class", duration_minutes: 60, price: "$18" },
      { name: "Power Yoga", description: "High-intensity flow", duration_minutes: 75, price: "$20" },
      { name: "Meditation", description: "Guided meditation session", duration_minutes: 45, price: "$12" },
      { name: "Monthly Pass", description: "Unlimited classes for 30 days", duration_minutes: 0, price: "$99" },
    ],
    hours: {
      mon: [
        ["06:00", "09:00"],
        ["17:00", "20:00"],
      ],
      tue: [
        ["06:00", "09:00"],
        ["17:00", "20:00"],
      ],
      wed: [
        ["06:00", "09:00"],
        ["17:00", "20:00"],
      ],
      thu: [
        ["06:00", "09:00"],
        ["17:00", "20:00"],
      ],
      fri: [
        ["06:00", "09:00"],
        ["17:00", "20:00"],
      ],
      sat: [
        ["08:00", "11:00"],
        ["14:00", "17:00"],
      ],
      sun: [["09:00", "12:00"]],
    },
    booking_rules: {
      lead_time_minutes: 15,
      buffer_minutes: 5,
      max_days_out: 30,
      max_per_day: 12,
    },
    faqs: [
      { q: "Do I need experience?", a: "No, we have classes for all levels from beginner to advanced." },
      { q: "What should I bring?", a: "We provide mats and props. Just bring water and wear comfortable clothes." },
      { q: "Can I try a free class?", a: "Yes! First-time visitors get one free class." },
    ],
  },

  {
    name: "Mike's Pizza",
    timezone: "America/Chicago",
    slug: "mikes-pizza",
    twilio_number: "+13125550400",
    forward_number: "+13125551400",
    agent_greeting: "Welcome to Mike's Pizza! Would you like to place an order?",
    agent_instructions: "Help customers order pizza. Collect name, phone, and delivery address.",
    services: [
      { name: "Small Pizza", description: "10-inch pizza", duration_minutes: 20, price: "$12" },
      { name: "Large Pizza", description: "14-inch pizza", duration_minutes: 30, price: "$18" },
      { name: "Delivery", description: "Home delivery", duration_minutes: 45, price: "$3" },
    ],
    hours: {
      mon: [["11:00", "22:00"]],
      tue: [["11:00", "22:00"]],
      wed: [["11:00", "22:00"]],
      thu: [["11:00", "22:00"]],
      fri: [["11:00", "23:00"]],
      sat: [["12:00", "23:00"]],
      sun: [["12:00", "21:00"]],
    },
    booking_rules: {
      lead_time_minutes: 5,
      buffer_minutes: 0,
      max_days_out: 7,
      max_per_day: 999,
    },
    faqs: [
      { q: "How long for delivery?", a: "Usually 30-45 minutes depending on traffic." },
      { q: "Do you offer vegetarian options?", a: "Yes, we have many vegan and vegetarian pizzas." },
      { q: "What payment methods do you accept?", a: "We accept cash, card, and digital payments." },
    ],
  },
];

async function seed() {
  console.log("🌱 Seeding test data...\n");

  for (const clientData of testClients) {
    try {
      const clientId = randomUUID();

      console.log(`Creating ${clientData.name}...`);

      // Create client
      const { error: clientError } = await db().from("clients").insert({
        id: clientId,
        slug: clientData.slug,
        name: clientData.name,
        timezone: clientData.timezone,
        twilio_number: clientData.twilio_number,
        forward_number: clientData.forward_number,
        voice_agent_enabled: true,
        agent_greeting: clientData.agent_greeting,
        agent_instructions: clientData.agent_instructions,
        active: true,
      });

      if (clientError) throw clientError;

      // Create business knowledge
      const { error: knowError } = await db().from("business_knowledge").insert({
        client_id: clientId,
        services: clientData.services,
        hours: clientData.hours,
        faqs: clientData.faqs,
        booking_rules: clientData.booking_rules,
      });

      if (knowError) throw knowError;

      console.log(`  ✓ Client created: ${clientId}`);
      console.log(`  ✓ Business knowledge seeded`);
      console.log(`  Services: ${clientData.services.map((s) => s.name).join(", ")}\n`);
    } catch (error) {
      console.error(`✗ Failed to seed ${clientData.name}:`, error);
    }
  }

  console.log("✅ Seeding complete!\n");
  console.log("Test clients created:");
  testClients.forEach((c) => {
    console.log(`  - ${c.name} (${c.timezone})`);
  });
}

seed().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
