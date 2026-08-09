async function runTests() {
  const modelsToTest = [
    {
      id: 'gemini-3.6-flash',
      name: 'Gemini 3 Flash',
      provider: 'Google'
    },
    {
      id: 'qwen/qwen-2.5-coder-32b-instruct',
      name: 'Qwen 2.5 Coder',
      provider: 'OpenRouter'
    }
  ];

  console.log("🚀 Starting Synthetic Production Tests on https://quantoraai.app/api/chat\n");

  for (const model of modelsToTest) {
    console.log(`Testing Model: ${model.name} (${model.provider})`);
    try {
      const response = await fetch("https://quantoraai.app/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://quantoraai.app", 
          "User-Agent": "Quantora-Synthetic-Test"
        },
        body: JSON.stringify({
          message: "What is 2+2? Reply with just the number.",
          history: [],
          modelId: model.id,
          modelName: model.name,
          provider: model.provider
        })
      });
      
      if (!response.ok) {
        console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.error(`Response: ${text}\n`);
        continue;
      }
      
      const data = await response.json();
      console.log(`✅ Success! Response: ${data.text}`);
      console.log(`⏱️ Latency: ${data.latencyMs}ms\n`);
      
    } catch (error) {
      console.error(`❌ Fetch Exception for ${model.name}:`, error, '\n');
    }
  }

  // Test CORS
  console.log(`Testing CORS Protection (Origin: https://evil-hacker.com)`);
  try {
      const response = await fetch("https://quantoraai.app/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://evil-hacker.com", 
          "User-Agent": "Quantora-Synthetic-Test"
        },
        body: JSON.stringify({
          message: "test",
          history: [],
          modelId: "gemini-3.6-flash",
        })
      });
      // the fetch won't strictly fail on cors in node.js unless the server rejects it.
      // But Vercel might reject it, or our rate limiter doesn't block but just doesn't set CORS.
      // Let's check headers.
      const corsHeader = response.headers.get("access-control-allow-origin");
      if (corsHeader) {
          console.error(`❌ CORS check failed. Server returned ACAO header: ${corsHeader}`);
      } else {
          console.log(`✅ CORS Protection active! No ACAO header returned for cross-origin request.\n`);
      }
  } catch (err) {
      console.log(`✅ Request failed as expected for cross-origin: ${err.message}\n`);
  }
}

runTests();
