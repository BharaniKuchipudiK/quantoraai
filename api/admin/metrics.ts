export default function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Basic authentication check
  const adminKey = req.query.admin || req.body?.admin;
  if (adminKey !== 'quantora2026') {
    return res.status(401).json({ error: 'Unauthorized Access to Telemetry' });
  }

  // Generate realistic 24-hour traffic
  const hourlyTraffic = Array.from({ length: 24 }).map((_, i) => {
    if (i >= 9 && i <= 15) return Math.floor(Math.random() * 50) + 150;
    if (i >= 19 && i <= 22) return Math.floor(Math.random() * 30) + 100;
    return Math.floor(Math.random() * 20) + 10;
  });

  // Simulated AI Usage Metrics
  const tokensGenerated = 12450392 + Math.floor(Math.random() * 5000);
  const cacheHitRatio = (82 + Math.random() * 5).toFixed(1);
  const computeHours = 452.4 + Math.random();

  // Simulated Endpoint Health
  const endpoints = [
    { name: 'Gemini 3.6 Flash', status: 'Healthy', latency: Math.floor(Math.random() * 300) + 400, load: Math.floor(Math.random() * 40) + 40 },
    { name: 'OpenRouter Relay', status: 'Healthy', latency: Math.floor(Math.random() * 150) + 150, load: Math.floor(Math.random() * 20) + 10 },
    { name: 'Vector DB (Supabase)', status: 'Optimal', latency: Math.floor(Math.random() * 20) + 10, load: Math.floor(Math.random() * 15) + 5 },
    { name: 'Edge Node (NYC)', status: 'Healthy', latency: Math.floor(Math.random() * 5) + 2, load: Math.floor(Math.random() * 30) + 20 }
  ];

  // Active Users list (Synthetic)
  const activeSessions = [
    { id: 'usr_82j', location: 'London, UK', model: 'Gemini 3.6', duration: '14m', tokens: 4200 },
    { id: 'usr_94p', location: 'New York, US', model: 'Gemma 27B', duration: '4m', tokens: 890 },
    { id: 'usr_11x', location: 'Tokyo, JP', model: 'Nemotron', duration: '42m', tokens: 15400 },
    { id: 'usr_55k', location: 'Berlin, DE', model: 'Gemini 3.6', duration: '2m', tokens: 120 },
    { id: 'usr_29m', location: 'Sydney, AU', model: 'OpenRouter', duration: '18m', tokens: 6700 },
  ];

  const activeConnections = Math.floor(Math.random() * 12) + 24; 
  const avgLatency = Math.floor(Math.random() * 100) + 650; 

  return res.status(200).json({
    activeConnections,
    totalRequests: 148432 + Math.floor(Math.random() * 50),
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
    timestamp: Date.now()
  });
}
