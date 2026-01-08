let activeRequests = new Set();

function getSemanticScholarApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['semanticScholarApiKey'], (items) => {
      const key = items.semanticScholarApiKey && items.semanticScholarApiKey.trim() 
        ? items.semanticScholarApiKey.trim() 
        : null;
      resolve(key);
    });
  });
}

function buildHeaders(userApiKey) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  
  if (userApiKey) {
    headers['x-api-key'] = userApiKey;
  }
  
  return headers;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callSemanticScholarAPI") {
    console.log("[Background] Received request to call Semantic Scholar API");

    const { url, options } = request.data;
    const requestId = Date.now() + Math.random();
    
    console.log("[Background] Fetching URL:", url);
    console.log("[Background] Request ID:", requestId);
    
    activeRequests.add(requestId);

    getSemanticScholarApiKey().then(userApiKey => {
      const headers = buildHeaders(userApiKey);
      
      if (userApiKey) {
        console.log("[Background] Using user's Semantic Scholar API key");
      } else {
        console.log("[Background] No user API key, using default rate limits");
      }
      
      const fetchOptions = {
        ...options,
        headers: {
          ...(options?.headers || {}),
          ...headers,
        },
      };
      
      return fetch(url, fetchOptions);
    })
      .then(response => {
        console.log("[Background] Got response with status:", response.status);
        
        if (response.status === 429) {
          activeRequests.delete(requestId);
          sendResponse({ 
            success: false, 
            error: "Rate limit exceeded (429). Please configure your own Semantic Scholar API key in the extension settings for unlimited access.",
            isRateLimitError: true,
            statusCode: 429
          });
          return;
        }
        
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`Semantic Scholar API returned ${response.status}: ${text}`);
          });
        }
        return response.json();
      })
      .then(data => {
        if (data) {
          console.log("[Background] Successfully parsed JSON response");
          activeRequests.delete(requestId);
          sendResponse({ success: true, data: data });
        }
      })
      .catch(error => {
        console.error("[Background] Error calling Semantic Scholar API:", error);
        activeRequests.delete(requestId);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
  
  return false;
});

console.log("[Background] Semantic Scholar API handler loaded successfully");

