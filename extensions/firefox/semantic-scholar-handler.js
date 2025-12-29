// Background script for handling Semantic Scholar API calls
// This solves CORS issues by making requests from the extension's background context

// Keep track of active requests to prevent service worker from going inactive
let activeRequests = new Set();

const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callSemanticScholarAPI") {
    console.log("[Background] Received request to call Semantic Scholar API");

    // Extract API details from the request
    const { url, options } = request.data;
    const requestId = Date.now() + Math.random();
    
    console.log("[Background] Fetching URL:", url);
    console.log("[Background] Request ID:", requestId);
    
    // Track this request
    activeRequests.add(requestId);

    // Make the API call from background context (bypasses CORS)
    fetch(url, options || {})
      .then(response => {
        console.log("[Background] Got response with status:", response.status);
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`Semantic Scholar API returned ${response.status}: ${text}`);
          });
        }
        return response.json();
      })
      .then(data => {
        console.log("[Background] Successfully parsed JSON response");
        activeRequests.delete(requestId);
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        console.error("[Background] Error calling Semantic Scholar API:", error);
        activeRequests.delete(requestId);
        sendResponse({ success: false, error: error.message });
      });

    // Return true to keep the message port open for async response
    return true;
  }
  
  // Return false for other message types to close the port immediately
  return false;
});

console.log("[Background] Semantic Scholar API handler loaded successfully");

