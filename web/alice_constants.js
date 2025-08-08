// Centralized constants for Alice: CSS, HTML templates, and AI prompts

// ===== CSS =====
export const popup_style = `
    .alice-toggle {
      display: inline-block;
      padding: calc(4px * var(--space-scale-factor)) calc(8px * var(--space-scale-factor));
      margin-bottom: calc(5px * var(--space-scale-factor));
      background-color: #C0A9FF;
      color: #333;
      border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
      border-radius: calc(4px * var(--total-scale-factor, 1));
      font-size: calc(10px * var(--total-scale-factor, 1));
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: 500;
      text-align: center;
      min-width: calc(70px * var(--total-scale-factor, 1));
      line-height: calc(20px * var(--total-scale-factor, 1));
      height: auto;
    }
    .alice-toggle:hover {
      background-color: #e0e0e0;
      box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(2px * var(--total-scale-factor, 1)) rgba(0,0,0,0.1);
    }
    .alice-toggle.active {
      background-color: #2196F3;
      color: white;
      border-color: #1976D2;
    }
    .alice-toggle.active:hover {
      background-color: #1976D2;
      box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(3px * var(--total-scale-factor, 1)) rgba(0,0,0,0.2);
    }
    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
      margin-top: calc(0.5em * var(--space-scale-factor));
      margin-bottom: calc(0.5em * var(--space-scale-factor));
    }
    .markdown-content p {
      margin-top: calc(0.3em * var(--space-scale-factor));
      margin-bottom: calc(0.3em * var(--space-scale-factor));
    }
    .markdown-content ul, .markdown-content ol {
      padding-left: calc(1.2em * var(--space-scale-factor));
      margin-top: calc(0.3em * var(--space-scale-factor));
      margin-bottom: calc(0.3em * var(--space-scale-factor));
    }
    .markdown-content li {
      list-style-type: disc;
      margin-bottom: calc(0.5em * var(--space-scale-factor));
      padding-left: 0;
      margin-left: 0;
      text-indent: -1.2em;
      padding-left: 1.2em;
    }
    .main-points ul {
      padding-left: calc(1.2em * var(--space-scale-factor));
      margin-top: 0;
    }
    .main-points li {
      list-style-type: disc;
      margin-bottom: calc(0.6em * var(--space-scale-factor));
      padding-left: 0;
      margin-left: 0;
      text-indent: -1.2em;
      padding-left: 1.2em;
    }
    .markdown-content blockquote {
      margin-left: 0;
      padding-left: calc(1em * var(--space-scale-factor));
      border-left: calc(3px * var(--total-scale-factor, 1)) solid #ccc;
      color: #555;
    }
    .markdown-content code {
      padding: calc(2px * var(--space-scale-factor)) calc(4px * var(--space-scale-factor));
      border-radius: calc(3px * var(--total-scale-factor, 1));
      font-family: monospace;
    }
    .markdown-content pre code {
      display: block;
      padding: calc(0.5em * var(--space-scale-factor));
      overflow-x: auto;
    }
    .concise-summary {
      padding-top: calc(0.5em * var(--space-scale-factor));
    }
    .main-points {
      margin-bottom: calc(0.5em * var(--space-scale-factor));
      margin-top: calc(1em * var(--space-scale-factor));
    }
    .tipsy-inner {
      user-select: text;
    }
    .arxiv-header {
      position: relative;
    }
    .arxiv-main-content {
      flex: 1;
      padding-right: calc(15px * var(--space-scale-factor));
      user-select: text;
    }
    .arxiv-title-row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      gap: calc(8px * var(--space-scale-factor));
    }
    .arxiv-title {
      flex: 1;
      margin-right: calc(5px * var(--space-scale-factor));
    }
    .arxiv-controls {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      white-space: nowrap;
      width: calc(80px * var(--total-scale-factor, 1));
      gap: calc(5px * var(--space-scale-factor));
    }
    .arxiv-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: calc(4px * var(--space-scale-factor));
      vertical-align: middle;
      margin-bottom: 0;
      position: relative;
      height: calc(14px * var(--total-scale-factor, 1));
    }
    .arxiv-link img {
      width: calc(14px * var(--total-scale-factor, 1));
      height: calc(14px * var(--total-scale-factor, 1));
      transition: transform 0.2s ease;
    }
    .arxiv-link:hover img {
      transform: scale(1.2);
    }
    .arxiv-link:focus {
      outline: calc(2px * var(--total-scale-factor, 1)) solid #2196F3;
      border-radius: calc(4px * var(--total-scale-factor, 1));
    }
    .arxiv-info-row {
      display: flex;
      flex-direction: column;
      gap: calc(4px * var(--space-scale-factor));
    }
    .arxiv-info-left {
      flex: 1;
    }
    .code-implementation {
      max-height: calc(400px * var(--total-scale-factor, 1));
      overflow-y: auto;
      padding-right: calc(10px * var(--space-scale-factor));
    }
    .code-content {
      margin-bottom: calc(15px * var(--space-scale-factor));
    }
    .copy-button {
      background-color: #C0A9FF;
      color: #555;
      border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
      border-radius: calc(4px * var(--total-scale-factor, 1));
      padding: calc(6px * var(--space-scale-factor)) calc(12px * var(--space-scale-factor));
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: 500;
      margin-top: calc(12px * var(--space-scale-factor));
      display: block;
      text-align: center;
      width: 100%;
      font-family: 'Solway', serif;
      font-size: calc(11px * var(--total-scale-factor, 1));
    }
    .copy-button:hover {
      background-color: #e0e0e0;
      box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(2px * var(--total-scale-factor, 1)) rgba(0,0,0,0.1);
    }
    .section-nav {
      display: flex;
      overflow-x: auto;
      margin-bottom: calc(10px * var(--space-scale-factor));
      white-space: nowrap;
      -ms-overflow-style: none;
      scrollbar-width: none;
      gap: calc(5px * var(--space-scale-factor));
    }
    .section-nav::-webkit-scrollbar {
      display: none;
    }
    .section-button {
      padding: calc(3px * var(--space-scale-factor)) calc(8px * var(--space-scale-factor));
      background-color: #f0f0f0;
      color: #333;
      border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
      border-radius: calc(12px * var(--total-scale-factor, 1));
      margin-right: calc(5px * var(--space-scale-factor));
      font-size: calc(10px * var(--total-scale-factor, 1));
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .section-button:hover {
      background-color: #e0e0e0;
    }
    .loading-container {
      text-align: center;
      padding: calc(20px * var(--space-scale-factor));
    }
    .loading-animation {
      display: inline-block;
      width: calc(40px * var(--total-scale-factor, 1));
      height: calc(40px * var(--total-scale-factor, 1));
      margin: 0 auto;
      border: calc(3px * var(--total-scale-factor, 1)) solid rgba(192, 169, 255, 0.3);
      border-radius: 50%;
      border-top-color: #C0A9FF;
      animation: spin 1s ease-in-out infinite;
    }
    .clipboard-notice {
      margin-top: calc(15px * var(--space-scale-factor));
      padding: calc(10px * var(--space-scale-factor));
      background-color: #EFF8FF;
      border: calc(1px * var(--total-scale-factor, 1)) solid #BDE3FF;
      border-radius: calc(5px * var(--total-scale-factor, 1));
      font-size: calc(11px * var(--total-scale-factor, 1));
      text-align: center;
      color: #0A558C;
      font-family: 'Solway', serif;
    }
    .clipboard-notice a {
      color: #1E88E5;
      text-decoration: underline;
    }
    .clipboard-notice .clipboard-code {
      font-family: monospace;
      background: #e0e0e0;
      padding: calc(2px * var(--space-scale-factor)) calc(5px * var(--space-scale-factor));
      border-radius: calc(3px * var(--total-scale-factor, 1));
      color: #333;
      font-weight: 500;
    }
    .open-clipboard-button {
      display: block;
      margin: calc(10px * var(--space-scale-factor)) auto 0;
      padding: calc(6px * var(--space-scale-factor)) calc(12px * var(--space-scale-factor));
      background-color: #1E88E5;
      color: white;
      border: none;
      border-radius: calc(4px * var(--total-scale-factor, 1));
      font-size: calc(11px * var(--total-scale-factor, 1));
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'Solway', serif;
      font-weight: 500;
    }
    .open-clipboard-button:hover {
      background-color: #1565C0;
      box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(3px * var(--total-scale-factor, 1)) rgba(0,0,0,0.2);
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .loading-text {
      margin-top: calc(10px * var(--space-scale-factor));
      font-family: 'Solway', serif;
      color: #555;
    }
    .alice_main_content, .alice_main_abstract, .markdown-content, .code-implementation pre {
      user-select: text;
    }
    .main-points, .concise-summary, .arxiv-title, .alice_main_author, .alice_main_date {
      user-select: text;
    }
    .section-nav {
      display: flex;
      overflow-x: auto;
      margin-bottom: calc(10px * var(--space-scale-factor));
      white-space: nowrap;
      -ms-overflow-style: none;
      scrollbar-width: none;
      gap: calc(5px * var(--space-scale-factor));
    }
    .section-nav::-webkit-scrollbar {
      display: none;
    }
    .section-button {
      padding: calc(3px * var(--space-scale-factor)) calc(8px * var(--space-scale-factor));
      background-color: #f0f0f0;
      color: #333;
      border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
      border-radius: calc(12px * var(--total-scale-factor, 1));
      margin-right: calc(5px * var(--space-scale-factor));
      font-size: calc(10px * var(--total-scale-factor, 1));
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .section-button:hover {
      background-color: #e0e0e0;
    }
`;

// ===== HTML Templates =====
export function TEMPLATE_POPUP({
  popupId,
  tipsyDirection,
  hasEnglishAlphabets,
  fullTitle,
  finalLink,
  dateString,
  authorText,
  abstract,
}) {
  const header = hasEnglishAlphabets
    ? `
              <span class="arxiv-title" style="font-family: 'Solway', serif;font-size: calc(12px * var(--total-scale-factor, 1));">${fullTitle}</span>
              <a href="${finalLink}" title="${finalLink.includes("scholar.google.com") ? "View on Google Scholar" : "View paper on arXiv"}" target="_blank" class="arxiv-link" aria-label="${finalLink.includes("scholar.google.com") ? "View on Google Scholar" : "View paper on arXiv"}" style="display: inline-flex; align-items: center;"><img src="images/${finalLink.includes("scholar.google.com") ? "link-icon.svg" : "link-icon.svg"}" alt="${finalLink.includes("scholar.google.com") ? "External link to Google Scholar" : "External link to arXiv paper"}" width="calc(14px * var(--total-scale-factor, 1))" height="calc(14px * var(--total-scale-factor, 1))" style="margin-left: calc(5px * var(--space-scale-factor));"/></a>
              `
    : `
              <span class="arxiv-title" style="font-family: 'Solway', serif;font-size: calc(12px * var(--total-scale-factor, 1)); flex: 1;">${fullTitle}</span>
              <a href="${finalLink}" title="${finalLink.includes("scholar.google.com") ? "View on Google Scholar" : "View paper on arXiv"}" target="_blank" class="arxiv-link" aria-label="${finalLink.includes("scholar.google.com") ? "View on Google Scholar" : "View paper on arXiv"}" style="display: inline-flex; align-items: center;"><img src="images/${finalLink.includes("scholar.google.com") ? "link-icon.svg" : "link-icon.svg"}" alt="${finalLink.includes("scholar.google.com") ? "External link to Google Scholar" : "External link to arXiv paper"}" width="calc(14px * var(--total-scale-factor, 1))" height="calc(14px * var(--total-scale-factor, 1))"/></a>
              `;

  const controls = hasEnglishAlphabets
    ? `
            <button class="alice-toggle" style="margin-bottom: 5px; vertical-align: middle;" data-view="abstract">Summary</button>
            <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle; display: none;" data-view="code">Code</button>
            <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle;" data-view="bibtex">BibTex</button>
            `
    : `
            <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle; display: none;" data-view="code">Code</button>
            `;

  const headerBlockNorth = `
      <div class="arxiv-header" style="margin-bottom: 10px; border-bottom: 2px solid #000; border-spacing: 5px;">  
        <div class="arxiv-title-row">
          <div class="arxiv-main-content"> 
            <div style="display: flex; align-items: center; gap: calc(10px * var(--space-scale-factor));">
              ${header}
            </div>
            <div class="arxiv-info-row">
              <div class="alice_main_author" style="font-family: 'Solway', serif;">${authorText}</div>
              ${
                dateString !== "Publication date not available"
                  ? `<div class="alice_main_date" style="font-family: 'Solway', serif;">Published on ${dateString}.</div>`
                  : `<div class="alice_main_date" style="font-family: 'Solway', serif;">Publication date not available.</div>`
              }
            </div>
          </div>
          <div class="arxiv-controls">
            ${controls}
          </div>
        </div>
          ‎  
      </div>`;

  const headerBlockSouth = `
      <div class="arxiv-header" style="margin-top: 10px; border-top: 2px solid #000; border-spacing: 5px;">
      ‎  
      <div class="arxiv-title-row">
          <div class="arxiv-main-content">
            <div style="display: flex; align-items: center; gap: calc(10px * var(--space-scale-factor));">
              ${header}
            </div>
            <div class="arxiv-info-row">
              <div class="alice_main_author" style="font-family: 'Solway', serif;">${authorText}</div>
              ${
                dateString !== "Publication date not available"
                  ? `<div class="alice_main_date" style="font-family: 'Solway', serif;">Published on ${dateString}.</div>`
                  : `<div class="alice_main_date" style="font-family: 'Solway', serif;">Publication date not available.</div>`
              }
            </div>
          </div>
          <div class="arxiv-controls">
            ${controls}
          </div>
        </div>
      </div>`;

  const contentBlock = `<div class="alice_main_content" style="font-family: 'Solway', serif;">
        <div class="alice_main_abstract markdown-content" style="font-family: 'Solway', serif;">${abstract}</div>
      </div>`;

  const body = tipsyDirection.startsWith("n")
    ? `${headerBlockNorth}
      ${contentBlock}`
    : `${contentBlock}
      ${headerBlockSouth}`;

  return `
    <div id="${popupId}" class="tipsy tipsy-${tipsyDirection}" style="font-family: 'Solway', serif;">
      <div class="tipsy-arrow"></div>
      <div class="tipsy-inner" style="font-family: 'Solway', serif; padding: calc(10px * var(--total-scale-factor, 1));">
        ${body}
      </div>
    </div>`;
}

export function TEMPLATE_CODE_BLOCK(code) {
  return `
    <div class="code-implementation">
      <pre style="background-color: rgba(0,0,0,0.1); padding: calc(10px * var(--total-scale-factor, 1)); border-radius: calc(4px * var(--total-scale-factor, 1)); white-space: pre-wrap; word-break: break-word; color: white;">${code}</pre>
      <button class="copy-button">Copy to Clipboard</button>
    </div>
  `;
}

export function TEMPLATE_CODE_ERROR(message) {
  return `
    <div style="text-align: center; padding: calc(20px * var(--total-scale-factor, 1)); background: rgba(0,0,0,0.1); border: calc(1px * var(--total-scale-factor, 1)) solid rgba(255,255,255,0.2); border-radius: calc(5px * var(--total-scale-factor, 1)); color: white;">
      <div style="margin-bottom: calc(15px * var(--total-scale-factor, 1));">
        <svg xmlns="http://www.w3.org/2000/svg" width="calc(24px * var(--total-scale-factor, 1))" height="calc(24px * var(--total-scale-factor, 1))" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <div style="font-weight: 500;">${message || "Failed to generate code implementation. Please try again later."}</div>
    </div>
  `;
}

export function TEMPLATE_BIBTEX(popupId, bibtexData) {
  return `
    <div style="position: relative;">
      <pre style="white-space: pre-wrap; word-wrap: break-word; margin-bottom: 30px; font-family: 'Solway', serif; font-size: calc(10px * var(--total-scale-factor, 1));">${bibtexData}</pre>
      <button id="${popupId}-copy-bibtex" class="alice-toggle" style="position: absolute; bottom: 0; right: 0; padding-left: 10px; padding-right: 10px;">Copy to clipboard</button>
    </div>
  `;
}

// ===== AI Prompts =====
export function buildFallbackReferencePrompt(linkHref, cachedReference) {
  return (
    "From the given list of references, which reference do you predict the citation hyperlink " +
    linkHref.split("cite")[1] +
    " refers to? \n\n Return a string with the EXACT paper title found in the list. ONLY RETURN THE TITLE EXACTLY AS IT IS IN THE LIST, NOTHING ELSE. \n\n List of references: " +
    JSON.stringify(cachedReference)
  );
}

export function PROMPT_EXTRACT_TITLE(pageText) {
  return `Extract only the FORMATTED title of this academic paper. If the title doesn't feel properly formatted as english text, then fix the formatting. Return ONLY the title, nothing else. If you cannot find a clear title, return NULL.\n\nText from first page:\n${pageText}`;
}

export const PROMPT_LLM_ANALYZE =
  "Analyze this academic paper. First identify the key contributions and why they matter (main points), then provide a concise factual summary. DO NOT include any introductory text like 'Here's the summary' or 'I've analyzed'. Start directly with the content.";

export function PROMPT_SYSTEM_BASE({ retryCount = 0 } = {}) {
  let systemPrompt =
    "You are a research assistant providing concise paper summaries. Format your response in Markdown, but ensure it will render properly. For main points, focus ONLY on key contributions and why they matter. For the concise summary, provide a factual overview. Start directly with the content - no introductions like 'Here's a summary'.";
  if (retryCount > 0) {
    systemPrompt +=
      " IMPORTANT: DO NOT return Python code or function calls in your response. DO NOT use print() or code syntax. Respond ONLY with natural language markdown content.";
  }
  return systemPrompt;
}

export function PROMPT_DIRECT_FALLBACK(llmPrompt, arxivText) {
  return `${llmPrompt} ${arxivText}
                          
                    Format your response in two distinct sections:
                          
                    MAIN POINTS (focus only on key contributions and why they matter):
                          
                    CONCISE SUMMARY (provide a factual overview in under 50 words):
                          
                          IMPORTANT: Start each section directly with content. No introductions, no Python code, no markdown artifacts.`;
}

export function PROMPT_CLAUDE_IMPLEMENTATION(paperDetails) {
  return `
  You are analyzing a scientific paper from arXiv to extract all implementation details, code, and mathematical formulations.
  
  Paper Title: ${paperDetails.title}
  Paper Authors: ${paperDetails.authors}
  Paper Abstract: ${paperDetails.abstract}
  arXiv Link: ${paperDetails.link}
  ${paperDetails.fullTextUrl ? `Full Text URL: ${paperDetails.fullTextUrl}` : ""}
  
  Please provide a comprehensive implementation guide for this paper with the following sections:
  
  1. MATHEMATICAL FORMULATION:
     - Explain all key equations, theorems, and mathematical concepts in the paper
     - Rewrite any complex math in a clear, step-by-step format using markdown math notation
     - Include all variables, symbols, and their meanings
     - If there are multiple equations, number them for easy reference
  
  2. PSEUDOCODE:
     - Convert the core algorithms into clear pseudocode
     - Include inputs, outputs, and key steps
     - Break down complex procedures into simpler components
     - Ensure the pseudocode is detailed enough to be implemented by a programmer
  
  3. IMPLEMENTATION DETAILS:
     - Suggest programming languages and libraries best suited for implementation
     - Outline data structures needed
     - Discuss potential computational bottlenecks and solutions
     - Provide time and space complexity analysis where relevant
  
  4. CODE SAMPLE:
     - Provide clean, well-commented sample code for the most important algorithm or technique
     - Include imports and necessary setup
     - Focus on clarity and correctness over optimization
     - Use best practices for the chosen programming language
  
  5. RESOURCES:
     - Mention relevant GitHub repositories with links if they exist
     - Identify any available implementations or similar projects
     - Suggest additional papers or resources for implementation
     - Note any available pre-trained models or datasets that could be leveraged
  
  Format your response with clear section headers and use markdown for code blocks and equations. When writing math equations, use proper Markdown math syntax with $...$ for inline equations and $$...$$$ for block equations.
  
  Your response should be comprehensive yet concise, focusing on practical implementation rather than theory.
  `;
}


