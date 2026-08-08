import { applyCors, clientIp, isRateLimited } from "../_lib/rate-limit";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate-limited even for a caller who has the password below — the auth on
  // this endpoint is weak (see the code review), so this at least stops
  // someone from hammering it. Set well above the dashboard's own 2s poll
  // interval (30/min) so normal viewing is never affected. Does not change
  // who can authenticate.
  if (isRateLimited(`admin-metrics:${clientIp(req)}`, 90, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  // NOTE: this password is hardcoded and shipped in the client bundle
  // (src/components/AdminDashboard.jsx) — it provides no real access
  // control today. Left unchanged in this pass; needs a real auth mechanism
  // before this dashboard should be trusted with anything sensitive.
  const adminKey = req.query.admin || req.body?.admin;
  if (adminKey !== 'quantora2026') {
    return res.status(401).json({ error: 'Unauthorized Access to Telemetry' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // Base fallback synthetic data
  let totalRequests = 148432;
  let tokensGenerated = 12450392;
  let avgLatency = 850;
  let activeSessions = [
    { id: 'usr_syn1', location: 'London, UK', model: 'Gemini', duration: '14m', tokens: 4200 },
    { id: 'usr_syn2', location: 'New York, US', model: 'OpenRouter', duration: '4m', tokens: 890 }
  ];

  if (supabaseUrl && supabaseKey) {
    try {
      // Fetch exact count of requests
      const countRes = await fetch(`${supabaseUrl}/rest/v1/telemetry?select=id`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'count=exact'
        }
      });
      
      const countHeader = countRes.headers.get('content-range');
      const dbCount = countHeader ? parseInt(countHeader.split('/')[1]) : 0;
      
      // Fetch latest 50 requests for aggregation
      const dataRes = await fetch(`${supabaseUrl}/rest/v1/telemetry?select=*&order=created_at.desc&limit=50`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      const latestData = await dataRes.json();

      if (Array.isArray(latestData) && latestData.length > 0) {
        totalRequests += dbCount;
        
        // Sum up tokens from db to add to baseline
        const recentTokens = latestData.reduce((acc, row) => acc + (row.tokens_generated || 0), 0);
        tokensGenerated += (dbCount * 150) + recentTokens; // Estimate total tokens based on count

        // Avg latency of last 50 requests
        avgLatency = Math.floor(latestData.reduce((acc, row) => acc + (row.latency_ms || 800), 0) / latestData.length);
        
        // Map to active sessions
        activeSessions = latestData.slice(0, 6).map((row, i) => ({
          id: `req_${row.id}`,
          location: ['San Francisco, US', 'Frankfurt, DE', 'Singapore, SG', 'London, UK', 'Tokyo, JP'][i % 5],
          model: row.model_id || 'Unknown',
          duration: 'live',
          tokens: row.tokens_generated || 0
        }));
      }
    } catch (e) {
      console.error("Supabase telemetry fetch failed:", e);
    }
  }

  // Generate realistic 24-hour traffic (simulated for visual density)
  const hourlyTraffic = Array.from({ length: 24 }).map((_, i) => {
    if (i >= 9 && i <= 15) return Math.floor(Math.random() * 50) + 150;
    if (i >= 19 && i <= 22) return Math.floor(Math.random() * 30) + 100;
    return Math.floor(Math.random() * 20) + 10;
  });

  const cacheHitRatio = (82 + Math.random() * 5).toFixed(1);
  const computeHours = 452.4 + Math.random();

  const endpoints = [
    { name: 'Gemini 3.6 Flash', status: 'Healthy', latency: Math.floor(Math.random() * 300) + 400, load: Math.floor(Math.random() * 40) + 40 },
    { name: 'OpenRouter Relay', status: 'Healthy', latency: Math.floor(Math.random() * 150) + 150, load: Math.floor(Math.random() * 20) + 10 },
    { name: 'Vector DB (Supabase)', status: supabaseUrl ? 'Optimal' : 'Disconnected', latency: Math.floor(Math.random() * 20) + 10, load: Math.floor(Math.random() * 15) + 5 }
  ];

  const activeConnections = Math.floor(Math.random() * 12) + 24; 

  return res.status(200).json({
    activeConnections,
    totalRequests,
    avgLatency,
    peakConcurrentConnections: 342,
    hourlyTraffic,
    tokensGenerated,
    cacheHitRatio,
    computeHours,
    endpoints,
    activeSessions,
    systemUptime: '99.998%',
    cpuUsage: Math.floor(Math.random() * 15) + 10,
    memoryUsage: Math.floor(Math.random() * 10) + 45,
    timestamp: Date.now(),
    isLiveConnected: !!(supabaseUrl && supabaseKey)
  });
}
