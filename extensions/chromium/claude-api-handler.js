// Background script for handling Claude API calls
// This solves CORS issues by making requests from the extension's background context

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callClaudeAPI") {
    console.log("Background script received request to call Claude API");
    
    // Extract API details from the request
    const { prompt, model } = request.data;

    console.log("Prompt:", prompt);
    console.log("Model:", model);
    
    // Use the secure backend API instead of direct calls with hardcoded keys
    fetch("https://api.aryankeluskar.com/api/claude", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        model: model || "claude-3-7-sonnet-20250219",
        max_tokens: 4000,
        temperature: 0.5
      })
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`Claude API returned ${response.status}: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log("Claude API response received by background script: ", data);
      sendResponse({ success: true, data: data });
    })
    .catch(error => {
      console.error("Error in background script calling Claude API:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Return true to indicate that we will send a response asynchronously
    return true;
  }
});

console.log("Claude API handler background script loaded"); 