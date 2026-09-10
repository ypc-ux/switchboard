/**
 * Lead Qualification Scoring
 *
 * Scores inbound leads on a 0-100 scale based on:
 * - Caller urgency (timeline to solve problem)
 * - Service fit (are they asking for something the client provides?)
 * - Budget mention (implied financial capacity)
 * - Decision maker availability (can they close now?)
 * - Contact info completeness
 *
 * Score > 70: Transfer immediately (high-quality lead)
 * Score 40-70: Queue for human review
 * Score < 40: Send booking link, don't transfer (low quality)
 */

export interface LeadQualificationScore {
  total: number;
  breakdown: {
    urgency: number;
    serviceFit: number;
    budget: number;
    decisionMaker: number;
    contactInfo: number;
  };
  decision: 'transfer' | 'queue' | 'booking_link';
  confidence: number;
  reasoning: string[];
}

export interface CallTranscript {
  text: string;
  duration: number;
  caller_name?: string;
  caller_phone?: string;
  service_requested?: string;
  timeline?: string;
  budget_mentioned?: boolean;
}

/**
 * Scoring logic for individual dimensions
 */
function scoreUrgency(transcript: string): number {
  // Look for urgency signals
  const urgentKeywords = [
    'urgent',
    'emergency',
    'asap',
    'today',
    'tomorrow',
    'this week',
    'broken',
    'leak',
    'damage',
    'emergency',
  ];

  const deferredKeywords = [
    'sometime',
    'maybe',
    'eventually',
    'no rush',
    'whenever',
    'not sure',
  ];

  const urgent = urgentKeywords.some((keyword) =>
    transcript.toLowerCase().includes(keyword)
  );
  const deferred = deferredKeywords.some((keyword) =>
    transcript.toLowerCase().includes(keyword)
  );

  if (urgent) return 25;
  if (deferred) return 5;
  return 12;
}

function scoreServiceFit(transcript: string, clientServices: string[] = []): number {
  // If we don't know the client's services, give neutral score
  if (clientServices.length === 0) return 12;

  const lowerTranscript = transcript.toLowerCase();
  const matchedServices = clientServices.filter(
    (service) => lowerTranscript.includes(service.toLowerCase()),
  );

  if (matchedServices.length >= 2) return 25;
  if (matchedServices.length === 1) return 18;
  return 5;
}

function scoreBudget(transcript: string): number {
  // Look for budget signals
  const budgetMentioned = /\$|budget|price|cost|charge|estimate|quote/i.test(
    transcript,
  );

  if (budgetMentioned) return 20;
  return 10;
}

function scoreDecisionMaker(
  transcript: string,
): number {
  // Look for decision-maker signals
  const decisionKeywords = [
    "i'm the owner",
    "i'm in charge",
    "i make the decision",
    "i decide',
    'my company',
    'my business',
    "i'm the manager",
  ];

  const delegationKeywords = [
    'i have to ask',
    "i'll check with",
    'my boss',
    'the owner',
    'someone else',
  ];

  const isDM = decisionKeywords.some((keyword) =>
    transcript.toLowerCase().includes(keyword),
  );
  const isDelegating = delegationKeywords.some((keyword) =>
    transcript.toLowerCase().includes(keyword),
  );

  if (isDM) return 20;
  if (isDelegating) return 8;
  return 14; // Neutral - unclear from transcript

}

function scoreContactInfo(
  callerName?: string,
  callerPhone?: string,
): number {
  let score = 0;
  if (callerName && callerName.length > 2) score += 10;
  if (callerPhone && /^\+?1?\d{10,}$/.test(callerPhone.replace(/\D/g, ''))) {
    score += 10;
  }
  return score;
}

/**
 * Main scoring function
 */
export function scoreCall(
  transcript: CallTranscript,
  clientServices: string[] = [],
): LeadQualificationScore {
  const transcriptText = transcript.text || '';

  const urgency = scoreUrgency(transcriptText);
  const serviceFit = scoreServiceFit(transcriptText, clientServices);
  const budget = scoreBudget(transcriptText);
  const decisionMaker = scoreDecisionMaker(transcriptText);
  const contactInfo = scoreContactInfo(
    transcript.caller_name,
    transcript.caller_phone,
  );

  const total = urgency + serviceFit + budget + decisionMaker + contactInfo;

  // Determine decision
  let decision: 'transfer' | 'queue' | 'booking_link';
  if (total >= 70) {
    decision = 'transfer';
  } else if (total >= 40) {
    decision = 'queue';
  } else {
    decision = 'booking_link';
  }

  // Build reasoning
  const reasoning: string[] = [];
  if (urgency > 15) reasoning.push('High urgency detected');
  if (serviceFit > 15) reasoning.push('Service match confirmed');
  if (budget > 15) reasoning.push('Budget mentioned');
  if (decisionMaker > 12) reasoning.push('Decision maker identified');
  if (contactInfo >= 10) reasoning.push('Complete contact information');

  // Confidence is correlation between signals
  const signals = [urgency, serviceFit, budget, decisionMaker, contactInfo];
  const average = total / 5;
  const variance =
    signals.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / 5;
  const stdDev = Math.sqrt(variance);
  const confidence = Math.max(0.3, Math.min(1.0, 1 - stdDev / 50));

  return {
    total,
    breakdown: {
      urgency,
      serviceFit,
      budget,
      decisionMaker,
      contactInfo,
    },
    decision,
    confidence,
    reasoning,
  };
}

/**
 * Human-readable summary of the score
 */
export function getScoreSummary(score: LeadQualificationScore): string {
  const decisionText = {
    transfer: '✅ QUALIFIED: Transfer immediately',
    queue: '⏳ POSSIBLE: Queue for human review',
    booking_link: '❌ NOT QUALIFIED: Send booking link',
  };

  return [
    decisionText[score.decision],
    `Score: ${score.total}/100 (confidence: ${(score.confidence * 100).toFixed(0)}%)`,
    `Breakdown: Urgency ${score.breakdown.urgency}, Service Fit ${score.breakdown.serviceFit}, Budget ${score.breakdown.budget}, Decision Maker ${score.breakdown.decisionMaker}, Contact ${score.breakdown.contactInfo}`,
    score.reasoning.length > 0 ? `Why: ${score.reasoning.join(' • ')}` : 'Weak signals',
  ].join('\n');
}
