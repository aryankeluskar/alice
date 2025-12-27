/**
 * jQuery loader for Alice
 * Handles dynamic loading of jQuery if not already available
 */

export function loadJQuery(pdfDocument) {
  // Check if jQuery is loaded, if not, load it dynamically
  if (typeof jQuery === "undefined" || typeof $ === "undefined") {
    console.log("jQuery not loaded, loading it now...");
    return new Promise(resolve => {
      // Array of paths to try for loading jQuery
      const jqueryPaths = [];

      // Try to detect if we're in a Chrome extension context
      const isExtension = typeof chrome !== "undefined" && chrome.runtime;

      if (isExtension) {
        // Chrome extension paths
        try {
          // This is where jQuery should be in the extension
          jqueryPaths.push(
            chrome.runtime.getURL("content/web/jquery-3.6.0.min.js")
          );
        } catch (e) {
          console.error("Failed to get Chrome extension URL:", e);
        }
      }

      // Add additional potential paths
      jqueryPaths.push("jquery-3.6.0.min.js"); // Relative to current page
      jqueryPaths.push("/web/jquery-3.6.0.min.js"); // From root
      jqueryPaths.push("../web/jquery-3.6.0.min.js"); // Up one directory
      jqueryPaths.push("./jquery-3.6.0.min.js"); // Explicit current directory

      // Log all paths we're going to try
      console.log("Will try loading jQuery from paths:", jqueryPaths);

      // Function to try loading from the next path in the array
      function tryNextPath(index) {
        if (index >= jqueryPaths.length) {
          console.error("Failed to load jQuery from all paths");
          resolve(null);
          return;
        }

        const path = jqueryPaths[index];
        console.log(
          `Trying to load jQuery from path (${index + 1}/${jqueryPaths.length}):`,
          path
        );

        const script = document.createElement("script");
        script.src = path;

        script.onload = function () {
          console.log(`jQuery loaded successfully from path: ${path}`);
          // Now that jQuery is loaded, resolve with ready state
          setTimeout(() => resolve(true), 0);
        };

        script.onerror = function () {
          console.error(`Failed to load jQuery from path: ${path}`);
          // Try the next path
          tryNextPath(index + 1);
        };

        document.head.appendChild(script);
      }

      // Start trying from the first path
      tryNextPath(0);
    });
  }

  // jQuery is available
  return Promise.resolve(true);
}
