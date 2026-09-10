/**
 * Vapi Lead Qualification Integration
 *
 * Integrates the lead qualification scoring system with Vapi voice agent:
 * 1. Score inbound calls based on transcript
 * 2. Track qualified leads for billing
 * 3. Decide if lead should be transferred or booking link sent
 * 4. Calculate revenue impact
 */

import { scoreCall, type LeadQualificationScore } from '../lead-qualifier';
import { trackQualifiedLeadTransfer, trackLeadConversion } from '../billing';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CallData {
  vapi_call_id: string;
  client_id: string;
  call_id: string | null;
  caller_number: string;
  transcript: string;
  summary: string;
  duration_seconds: number;
}

export interface LeadQualificationResult {
  score: LeadQualificationScore;
  qualified: boolean;
  should_transfer: boolean;
  tracking_id?: string;
  error?: string;
}

/**
 * Extract lead data from call transcript
 * Uses AI summary + transcript to extract structured data
 */
export function extractLeadData(transcript: string, summary: string) {
  // Look for caller name patterns
  const nameMatch = transcript.match(
    /(?:my name is|i'm|this is|call me)\s+([a-z]+)/i,
  );
  const callerName = nameMatch ? nameMatch[1] : undefined;

  // Look for phone number patterns
  const phoneMatch = transcript.match(
    /(?:\+?1?\s?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}/,
  );
  const callerPhone = phoneMatch ? phoneMatch[0] : undefined;

  // Extract service from summary (look for common service keywords)
  const serviceKeywords = [
    'roof',
    'roofing',
    'repair',
    'fix',
    'damage',
    'window',
    'door',
    'frame',
    'installation',
    'inspection',
  ];
  let serviceRequested = undefined;
  for (const keyword of serviceKeywords) {
    if (transcript.toLowerCase().includes(keyword)) {
      serviceRequested = keyword;
      break;
    }
  }

  // Look for timeline indicators
  const timelineMatch = transcript.match(
    /(?:by|in|within|before)\s+(?:this\s+)?(\w+day|\w+week|\w+month|tomorrow|today|asap|urgent)/i,
  );
  const timeline = timelineMatch ? timelineMatch[1] : undefined;

  // Detect if budget was mentioned
  const budgetMentioned = /(\$|budget|price|cost|charge|estimate|quote)/i.test(
    transcript,
  );

  return {
    caller_name: callerName,
    caller_phone: callerPhone,
    service_requested: serviceRequested,
    timeline,
    budget_mentioned: budgetMentioned,
  };
}

/**
 * Score a completed call and determine if it's a qualified lead
 */
export async function scoreCallAndTrackLead(
  supabase: SupabaseClient,
  callData: CallData,
  clientServices: string[] = [],
): Promise<LeadQualificationResult> {
  try {
    // Extract lead information from call data
    const leadData = extractLeadData(callData.transcript, callData.summary);

    // Score the call using lead qualification engine
    const score = scoreCall(
      {
        text: callData.transcript,
        duration: callData.duration_seconds,
        caller_name: leadData.caller_name,
        caller_phone: leadData.caller_phone,
        service_requested: leadData.service_requested,
        timeline: leadData.timeline,
      },
      clientServices,
    );

    // Determine if qualified (score > 70 = transfer, 40-70 = queue, < 40 = booking link)
    const qualified = score.decision === 'transfer';
    const should_transfer = score.decision === 'transfer';

    let tracking_id: string | undefined;

    // If qualified, track as a lead for billing
    if (qualified && leadData.caller_phone) {
      const trackResult = await trackQualifiedLeadTransfer(supabase, callData.client_id, callData.call_id || '', {
        caller_name: leadData.caller_name || 'Unknown',
        caller_phone: leadData.caller_phone,
        service_requested: leadData.service_requested || 'General Inquiry',
        qualification_score: score.total,
      });

      if (trackResult.success) {
        tracking_id = callData.vapi_call_id;
        console.info('lead tracked for billing', {
          client_id: callData.client_id,
          score: score.total,
          caller: leadData.caller_phone,
        });
      } else {
        console.error('failed to track lead', {
          error: trackResult.error,
          client_id: callData.client_id,
        });
      }
    }

    return {
      score,
      qualified,
      should_transfer,
      tracking_id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('error scoring call', { error: message });
    return {
      score: {
        total: 0,
        breakdown: {
          urgency: 0,
          serviceFit: 0,
          budget: 0,
          decisionMaker: 0,
          contactInfo: 0,
        },
        decision: 'booking_link',
        confidence: 0,
        reasoning: [],
      },
      qualified: false,
      should_transfer: false,
      error: message,
    };
  }
}

/**
 * Update call record with lead qualification score
 */
export async function updateCallWithLeadScore(
  supabase: SupabaseClient,
  callId: string,
  result: LeadQualificationResult,
): Promise<void> {
  if (!callId) return;

  await supabase
    .from('calls')
    .update({
      qualification_score: result.score.total,
      is_qualified_lead: result.qualified,
      lead_tracking_id: result.tracking_id || null,
    })
    .eq('id', callId);
}

/**
 * Generate lead summary for admin dashboard
 */
export function generateLeadSummary(
  result: LeadQualificationResult,
  leadData: ReturnType<typeof extractLeadData>,
): string {
  const parts = [
    `Score: ${result.score.total}/100`,
    `Decision: ${result.score.decision === 'transfer' ? '✅ Transfer' : result.score.decision === 'queue' ? '⏳ Queue' : '❌ Booking Link'}`,
    `Confidence: ${(result.score.confidence * 100).toFixed(0)}%`,
  ];

  if (leadData.caller_name) parts.push(`Caller: ${leadData.caller_name}`);
  if (leadData.service_requested) parts.push(`Service: ${leadData.service_requested}`);
  if (leadData.timeline) parts.push(`Timeline: ${leadData.timeline}`);

  if (result.score.reasoning.length > 0) {
    parts.push(`Signals: ${result.score.reasoning.join(', ')}`);
  }

  return parts.join('\n');
}
