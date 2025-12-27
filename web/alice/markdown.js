/**
 * Markdown rendering and text processing utilities
 */

// Enhanced function to clean up AI introduction text
export function cleanAIIntroText(text) {
  if (!text) return "";

  // More aggressive removal of introductory phrases
  const cleanedText = text
    // Remove common AI introductions
    .replace(
      /^(Sure|Okay|I'd be happy to|I will|Here's|Let me|I'll|Certainly|Alright|I've analyzed|I can|Here is|Based on the article|After analyzing)[,.:]?\s+/i,
      ""
    )
    .replace(
      /^(I'll|I will) (provide|give|create|generate|summarize|break down)[^.]*[,.]\s*/i,
      ""
    )
    .replace(
      /^(Here's|Here is|Below is|Following is) (a|an|the|my) (summary|analysis|breakdown)[^.]*[,.]\s*/i,
      ""
    )
    .replace(/^Let's (break|dive|look)[^.]*[,.]\s*/i, "")
    // Remove phrases like "The main points are:"
    // Remove phrases like "In summary:"
    .replace(
      /^(In summary|To summarize|Summarizing|In conclusion|To conclude)[^.]*[:]?\s*/i,
      ""
    )
    // Remove markdown artifacts that might appear
    .replace(/```[a-z]*\s*/, "")
    .replace(/```\s*$/, "");

  return cleanedText;
}

// Function to clean up code remnants from response
export function cleanupCodeFromResponse(text) {
  // Remove Python function calls
  text = text.replace(/print\s*\([^)]*\)/g, "");
  text = text.replace(/\bdef\s+\w+\s*\([^)]*\):/g, "");
  text = text.replace(/\bimport\s+\w+/g, "");
  text = text.replace(/summarizePaper\s*\(.*?\)/gs, "");

  // Remove indented code blocks
  text = text.replace(/\n\s{2,}[\w.]+.*?\n/g, "\n");

  // Replace any code-like patterns with readable text
  text = text.replace(/(\w+)\s*=\s*(['"])(.+?)\2/g, "$3");

  return text;
}

// Function to detect Python code
export function containsPythonCode(text) {
  // Check for common Python patterns
  const pythonPatterns = [
    /\bdef\s+\w+\s*\(/i, // function definitions
    /\bprint\s*\(/i, // print statements
    /\bimport\s+\w+/i, // import statements
    /\bclass\s+\w+/i, // class definitions
    /\bif\s+__name__\s*==\s*('|")__main__\1/i, // main block
    /\breturn\s+\w+/i, // return statements
    /\s{2,}[\w.]+\s*=/, // indented variable assignments
    /\s{2,}for\s+\w+\s+in\s+/i, // indented for loops
    /\s{2,}if\s+.*:/i, // indented if statements
    /summarizePaper\s*\(/i, // detect function calls like summarizePaper(
  ];

  return pythonPatterns.some(pattern => pattern.test(text));
}

// Function to render markdown content
export function renderMarkdown(text) {
  if (!text) return "";

  // Custom markdown to HTML converter
  function markdownToHtml(markdown) {
    // Escape HTML
    function escapeHtml(unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    let html = markdown;

    // Process code blocks first (```)
    html = html.replace(/```([^`]+)```/g, (match, p1) => {
      return `<pre><code>${escapeHtml(p1.trim())}</code></pre>`;
    });

    // Process inline code (`)
    html = html.replace(/`([^`]+)`/g, (match, p1) => {
      return `<code>${escapeHtml(p1)}</code>`;
    });

    // Headers (# Heading)
    html = html.replace(
      /^### (.*$)/gm,
      '<h3 style="margin-bottom: calc(12px * var(--space-scale-factor));">$1 \n\n </h3>'
    );
    html = html.replace(
      /^## (.*$)/gm,
      '<h2 style="margin-bottom: calc(12px * var(--space-scale-factor));">$1 \n\n </h2>'
    );
    html = html.replace(
      /^# (.*$)/gm,
      '<h1 style="margin-bottom: calc(12px * var(--space-scale-factor));">$1 \n\n </h1>'
    );

    // Bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic (*text*)
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Line breaks
    html = html.replace(/\n$/gm, " <br>");

    // Unordered lists
    html = html.replace(/^\s*[\-\*]\s+(.*$)/gm, "<li>$1</li>");
    html = html.replace(
      /(<li>.*<\/li>)/s,
      ' <div style="font-size: calc(5px * var(--total-scale-factor));">‎</div> <ul>$1</ul>'
    );

    // Ordered lists
    html = html.replace(/^\s*\d+\.\s+(.*$)/gm, "<li>$1</li>");
    html = html.replace(
      /(<li>.*<\/li>)/s,
      '<ol style="list-style-position: inside; padding-left: 0;">$1</ol>'
    );

    // Blockquotes
    html = html.replace(/^\>\s(.*$)/gm, "<blockquote>$1</blockquote>");

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Paragraphs - wrap any remaining newline-separated content
    html = html.replace(/^([^<].*[^>])$/gm, "<p>$1</p>");

    // Clean up any remaining newlines and extra paragraph tags
    html = html.replace(/<\/p>\s*<p>/g, "</p><p>");

    return html;
  }

  // Function to format the main points as bulleted list
  function formatMainPoints(mainPoints) {
    // Convert markdown to HTML first
    const htmlContent = markdownToHtml(mainPoints);

    // If it already has list items with proper bullet style, just return it
    if (
      htmlContent.includes("<li") &&
      !htmlContent.includes("list-style-type: decimal")
    ) {
      return htmlContent;
    }

    // Otherwise, split the content and create list items with bullet style
    const points = mainPoints
      .split(/\n\s*[\*\-•]\s+|\n\s*\d+\.\s+/)
      .filter(point => point.trim());

    if (points.length === 0) {
      // If no bullet points detected, try splitting by newlines
      const lines = mainPoints.split("\n").filter(line => line.trim());
      const listItems = lines
        .map(
          line =>
            `<li style="text-indent: -1.2em; padding-left: 1.2em; margin-bottom: 10px; list-style-type: disc; margin-left: 5px;">${markdownToHtml(line.trim())}</li>`
        )
        .join("");
      return `<ul style="padding-left: 10px; margin-top: 0;">${listItems}</ul>`;
    }

    // Always use disc bullets for consistency
    const listItems = points
      .map(
        point =>
          `<li style="text-indent: -1.2em; padding-left: 1.2em; margin-bottom: 10px; list-style-type: disc; margin-left: 5px;">${markdownToHtml(point.trim())}</li>`
      )
      .join("");
    return `<ul style="padding-left: 10px; margin-top: 1em !important;">${listItems}</ul>`;
  }

  // Check if the content is JSON format (from AI responses)
  try {
    const jsonContent = JSON.parse(text);

    console.log("JSON content:", jsonContent);

    if (jsonContent.mainPoints && jsonContent.conciseSummary) {
      // Format JSON content to match the screenshot style
      return `
                  <div style="background-color: #C0A9FF; border-radius: 8px; padding: 10px;">
                    <h2 style="font-size: 1.3em; font-weight: bold; margin-top: 0; margin-bottom: 1em !important;">Main Points:</h2>
                    ${formatMainPoints(jsonContent.mainPoints)}
                    <div style="margin-top: 15px; font-size: 0.9em;">
                      ${markdownToHtml(jsonContent.conciseSummary)}
                    </div>
                  </div>
                `;
    }
  } catch (e) {
    // Not JSON, continue with normal markdown processing
  }

  return markdownToHtml(text);
}

// Function to ensure MathJax is loaded
export function ensureMathJaxLoaded() {
  if (window.MathJax) {
    // MathJax is already loaded
    return;
  }

  // Load MathJax if not already loaded
  if (!$('script[src*="mathjax"]').length) {
    const script = document.createElement("script");
    script.src = "mathjax-tex-mml-chtml.js";
    script.async = true;

    // Configure MathJax
    window.MathJax = {
      tex: {
        inlineMath: [
          ["$", "$"],
          ["\\(", "\\)"],
        ],
        displayMath: [
          ["$$", "$$"],
          ["\\[", "\\]"],
        ],
        processEscapes: true,
      },
      svg: {
        fontCache: "global",
      },
      startup: {
        typeset: false, // Don't process the whole page on load
      },
    };

    document.head.appendChild(script);

    // Add a load handler to process math in the popup
    script.onload = function () {
      setTimeout(() => {
        if (window.MathJax && window.MathJax.typesetPromise) {
          window.MathJax.typesetPromise();
        }
      }, 500);
    };
  }
}
