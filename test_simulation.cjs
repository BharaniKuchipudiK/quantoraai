async function runSyntheticTest() {
  console.log("Running synthetic transaction to live endpoint: https://quantoraai.app/api/chat");
  
  try {
    const response = await fetch("https://quantoraai.app/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Origin": "https://quantoraai.app",
        "Referer": "https://quantoraai.app/"
      },
      body: JSON.stringify({
        message: "Can you quickly write a React component for a counter? Just the component, no filler.",
        history: [],
        modelId: "qwen/qwen-2.5-coder-32b-instruct",
        modelName: "Qwen 2.5 Coder",
        provider: "OpenRouter"
      })
    });
    
    const text = await response.text();
    console.log("Response Body:", text);
    
  } catch (error) {
    console.error("Simulation failed:", error);
  }
}

runSyntheticTest();
