export default function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Invalid prompt provided.' });
  }

  // Very basic regex-based censorship & abuse prevention guardrails
  // In a production environment, this would call OpenAI Moderation API or Perspective API
  const forbiddenPatterns = [
    /ignore all previous instructions/i,
    /you are a developer mode/i,

    /how to make a bomb/i,
    /bypass safety/i,
    /DAN/i, // Do Anything Now jailbreaks
    /\b(kill|murder|suicide|rape)\b/i
  ];

  for (let pattern of forbiddenPatterns) {
    if (pattern.test(prompt)) {
      return res.status(200).json({
        flagged: true,
        reason: 'Your prompt violates the Quantora AI Safety & Acceptable Use Policy. Please revise your input.',
        matchedPattern: pattern.toString()
      });
    }
  }

  // If no violations found
  return res.status(200).json({
    flagged: false,
    reason: null
  });
}
