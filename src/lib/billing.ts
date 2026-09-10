/**
 * Billing System for Lead Generation
 *
 * Tracks:
 * - Qualified leads transferred ($150 per lead)
 * - Monthly guarantees (20 leads/month minimum)
 * - Refunds if below guarantee
 * - Invoice generation
 * - Revenue tracking (actual vs guaranteed)
 */

import { SupabaseClient } from '@supabase/supabase-js';

export const LEAD_PRICE = 150; // $ per qualified lead
export const MINIMUM_LEADS_PER_MONTH = 20;
export const MINIMUM_MONTHLY_REVENUE = LEAD_PRICE * MINIMUM_LEADS_PER_MONTH; // $3,000
export const SETUP_FEE = 1000; // $ one-time

export interface MonthlyLeadStats {
  client_id: string;
  year: number;
  month: number;
  qualified_leads_count: number;
  transferred_count: number;
  converted_count: number;
  total_charges: number;
  guaranteed_charges: number;
  refund_amount: number;
  ad_spend: number;
  roi: number; // ad_spend / total_charges
}

export interface ClientBillingStatus {
  client_id: string;
  client_name: string;
  setup_fee_paid: boolean;
  current_month_leads: number;
  current_month_minimum_met: boolean;
  estimated_charges: number;
  last_billing_date?: string;
  payment_status: 'pending' | 'paid' | 'overdue';
}

export interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  qualified_leads: number;
  lead_charges: number;
  guarantee_difference: number; // Refund (negative) if under 20 leads
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  created_at: string;
  due_date: string;
}

/**
 * Calculate charges for a month
 */
export function calculateMonthlyCharges(
  qualifiedLeadsCount: number,
): {
  leads: number;
  leadCharges: number;
  guaranteeCharges: number;
  refundAmount: number;
  totalCharges: number;
} {
  const leadCharges = qualifiedLeadsCount * LEAD_PRICE;
  const guaranteeCharges = MINIMUM_MONTHLY_REVENUE;

  let refundAmount = 0;
  let totalCharges = leadCharges;

  // If below guarantee, client gets refund difference
  if (qualifiedLeadsCount < MINIMUM_LEADS_PER_MONTH) {
    refundAmount = guaranteeCharges - leadCharges;
    totalCharges = guaranteeCharges;
  }

  return {
    leads: qualifiedLeadsCount,
    leadCharges,
    guaranteeCharges,
    refundAmount,
    totalCharges,
  };
}

/**
 * Generate monthly invoice
 */
export function generateInvoice(
  clientId: string,
  clientName: string,
  year: number,
  month: number,
  qualifiedLeadsCount: number,
): Invoice {
  const charges = calculateMonthlyCharges(qualifiedLeadsCount);
  const periodStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const periodEnd = new Date(year, month, 0).toISOString().split('T')[0];
  const invoiceNumber = `INV-${clientId}-${year}-${String(month).padStart(2, '0')}`;

  return {
    id: `inv_${clientId}_${year}_${month}`,
    client_id: clientId,
    invoice_number: invoiceNumber,
    period_start: periodStart,
    period_end: periodEnd,
    qualified_leads: qualifiedLeadsCount,
    lead_charges: charges.leadCharges,
    guarantee_difference: charges.refundAmount * -1, // Positive = extra we keep, negative = refund
    total_amount: charges.totalCharges,
    status: 'draft',
    created_at: new Date().toISOString(),
    due_date: new Date(year, month, 15).toISOString().split('T')[0],
  };
}

/**
 * Format invoice as readable text
 */
export function formatInvoice(invoice: Invoice): string {
  return [
    `INVOICE ${invoice.invoice_number}`,
    `Period: ${invoice.period_start} to ${invoice.period_end}`,
    ``,
    `Qualified Leads: ${invoice.qualified_leads}`,
    `  @ $${LEAD_PRICE}/lead = $${invoice.lead_charges.toFixed(2)}`,
    ``,
    `Monthly Guarantee: ${MINIMUM_LEADS_PER_MONTH} leads = $${MINIMUM_MONTHLY_REVENUE.toFixed(2)}`,
    invoice.guarantee_difference > 0
      ? `  Refund due (under guarantee): -$${invoice.guarantee_difference.toFixed(2)}`
      : `  No refund (met or exceeded guarantee)`,
    ``,
    `TOTAL DUE: $${invoice.total_amount.toFixed(2)}`,
    `Due Date: ${invoice.due_date}`,
  ].join('\n');
}

/**
 * Track a qualified lead transfer
 * Call this when a lead is successfully transferred to the client
 */
export async function trackQualifiedLeadTransfer(
  supabase: SupabaseClient,
  clientId: string,
  callId: string,
  leadData: {
    caller_name: string;
    caller_phone: string;
    service_requested: string;
    qualification_score: number;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create lead record in database
    const { error } = await supabase.from('qualified_leads').insert([
      {
        client_id: clientId,
        call_id: callId,
        caller_name: leadData.caller_name,
        caller_phone: leadData.caller_phone,
        service_requested: leadData.service_requested,
        qualification_score: leadData.qualification_score,
        transferred_at: new Date().toISOString(),
        status: 'pending', // pending → converted → lost
      },
    ]);

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Track conversion (lead became a booking/sale)
 */
export async function trackLeadConversion(
  supabase: SupabaseClient,
  leadId: string,
  conversionData?: { booking_id?: string; notes?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('qualified_leads')
      .update({
        status: 'converted',
        converted_at: new Date().toISOString(),
        ...conversionData,
      })
      .eq('id', leadId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Get current month billing status for a client
 */
export async function getClientBillingStatus(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ClientBillingStatus | null> {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const { data: client } = await supabase
      .from('clients')
      .select('id, name, setup_fee_paid_at')
      .eq('id', clientId)
      .single();

    if (!client) return null;

    // Count qualified leads this month
    const { count: qualifiedLeads } = await supabase
      .from('qualified_leads')
      .select('id', { count: 'exact' })
      .eq('client_id', clientId)
      .gte(
        'transferred_at',
        new Date(currentYear, currentMonth - 1, 1).toISOString(),
      )
      .lte(
        'transferred_at',
        new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString(),
      );

    const leadCount = qualifiedLeads ?? 0;
    const charges = calculateMonthlyCharges(leadCount);

    return {
      client_id: clientId,
      client_name: client.name,
      setup_fee_paid: !!client.setup_fee_paid_at,
      current_month_leads: leadCount,
      current_month_minimum_met: leadCount >= MINIMUM_LEADS_PER_MONTH,
      estimated_charges: charges.totalCharges,
      last_billing_date: client.setup_fee_paid_at,
      payment_status: charges.totalCharges > 0 ? 'pending' : 'paid',
    };
  } catch (err) {
    console.error('Error getting billing status:', err);
    return null;
  }
}

/**
 * Calculate ROI for a month
 */
export function calculateROI(
  adSpend: number,
  qualifiedLeadsCount: number,
): number {
  const revenue = qualifiedLeadsCount * LEAD_PRICE;
  if (revenue === 0) return -100;
  return ((revenue - adSpend) / adSpend) * 100;
}
