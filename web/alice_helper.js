import {
  popup_style,
  buildFallbackReferencePrompt,
  TEMPLATE_POPUP,
  TEMPLATE_BIBTEX,
  PROMPT_EXTRACT_TITLE,
  PROMPT_LLM_ANALYZE,
  PROMPT_SYSTEM_BASE,
  PROMPT_DIRECT_FALLBACK,
} from "./alice_constants.js";

/**
 * Class representing ArXiv paper information
 * @typedef {Object} ArxivInfo
 * @property {string} title - The title of the paper
 * @property {string} authors - The authors of the paper
 * @property {string} year - The publication year
 * @property {string} abstract - The paper abstract
 * @property {string} link - The link to the paper
 */
class ArxivInfo {
  constructor(title, authors, year, abstract, link) {
    this.title = title;
    this.authors = authors;
    this.year = year;
    this.abstract = abstract;
    this.link = link;
  }
}

function fail(el, reason) {
  // Log the failure reason to help with debugging
  console.log(`Citation popup failed: ${reason}`, $(el).attr("href"));
  // Store the reason on the element for reference
  $(el).data("failReason", reason);
}

// Helper function to fetch BibTex data from API
async function fetchBibTexData(arxivId) {
  try {
    const bibtexUrl = `https://api.aryankeluskar.com/api/bibtex?arxiv_id=${arxivId}`;
    const response = await fetchWithRetry(bibtexUrl, {}, 3);
    return await response.text();
  } catch (error) {
    console.error("Error fetching BibTex data:", error);
    throw error;
  }
}

async function getGeminiFallbackReference(paperId, linkHref, currentElement) {
  // check if user is still hovering before adding to DOM
  if ($(currentElement).parent().find("a:hover").length === 0) {
    return;
  }

  const cachedPaperDataString = localStorage.getItem(`paper_data_${paperId}`);
  const cachedReference = JSON.parse(cachedPaperDataString)["references"];
  const fallback_prompt = buildFallbackReferencePrompt(linkHref, cachedReference);

  // Call Gemini API
  const response = await fetch("https://api.aryankeluskar.com/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: fallback_prompt,
            },
          ],
        },
      ],
    }),
  });

  let finalResponse = await response.json();
  console.log("finalResponse", finalResponse);

  let title = finalResponse.candidates[0].content.parts[0].text.trim();

  console.log("title", title);

  // Find matching reference
  let matchingReference = null;
  for (const reference of cachedReference) {
    // console.log("1title", reference.citedPaper.title);
    // console.log("2title", title);
    if (
      reference.citedPaper.title.trim().toLowerCase() ===
      title.trim().toLowerCase()
    ) {
      console.log("found reference", reference);
      matchingReference = reference;
      break;
    }
  }

  if (matchingReference && matchingReference.citedPaper.paperId) {
    const semanticScholarId = matchingReference.citedPaper.paperId;
    try {
      // Fetch data from Semantic Scholar API with retry logic and proper headers
      const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/${semanticScholarId}?fields=title,abstract,year,openAccessPdf,authors`;
      
      // Add headers to make the request look more like a browser request
      const requestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      };
      
      const response = await queuedFetch(apiUrl, requestOptions, 5); // Use queued fetch to prevent concurrent requests

      if (!response.ok) {
        throw new Error(
          `Semantic Scholar API request failed: ${response.status}`
        );
      }

      const paperData = await response.json();
      console.log("Semantic Scholar data", paperData);

      // Create ArxivInfo object with the data
      const paperUrl =
        paperData.openAccessPdf?.url || matchingReference.citedPaper.url || "";
      const authorsString =
        paperData.authors?.map(author => author.name).join(", ") || "";

      const arxivInfo = new ArxivInfo(
        paperData.title,
        authorsString,
        paperData.year?.toString() || "",
        paperData.abstract || "",
        paperUrl
      );

      // Cache the final reference data
      const citationKey = linkHref.split("cite.")[1];
      if (citationKey) {
        const cachedFinalRefs = JSON.parse(
          localStorage.getItem("cached_final_refs") || "{}"
        );
        cachedFinalRefs[citationKey] = {
          title: paperData.title,
          abstract: paperData.abstract || "",
          authors: authorsString,
          year: paperData.year,
          link: paperUrl,
        };
        localStorage.setItem(
          "cached_final_refs",
          JSON.stringify(cachedFinalRefs)
        );
        console.log(
          "Stored paper data in cached_final_refs for citation:",
          citationKey
        );
      }

      // Success message
      console.log(
        "Successfully retrieved paper data from Semantic Scholar",
        arxivInfo
      );

      // Create XML representation
      const currentDate = new Date().toISOString();
      const xmlDoc = document.implementation.createDocument(
        "http://www.w3.org/2005/Atom",
        "entry",
        null
      );
      const entry = xmlDoc.documentElement;

      // Add namespace
      entry.setAttribute("xmlns", "http://www.w3.org/2005/Atom");

      // Create and append id element
      const idElement = xmlDoc.createElement("id");
      idElement.textContent = arxivInfo.link;
      entry.appendChild(idElement);

      // Create and append updated element
      const updatedElement = xmlDoc.createElement("updated");
      updatedElement.textContent = currentDate;
      entry.appendChild(updatedElement);

      // Create and append published element
      const publishedElement = xmlDoc.createElement("published");
      publishedElement.textContent = `${arxivInfo.year}-01-01T00:00:00Z`; // Default to start of year since we only have year
      entry.appendChild(publishedElement);

      // Create and append title element
      const titleElement = xmlDoc.createElement("title");
      titleElement.textContent = arxivInfo.title;
      entry.appendChild(titleElement);

      // Create and append summary element
      const summaryElement = xmlDoc.createElement("summary");
      summaryElement.textContent = arxivInfo.abstract;
      entry.appendChild(summaryElement);

      // Create and append author elements
      const authors = arxivInfo.authors.split(", ");
      authors.forEach(authorName => {
        const authorElement = xmlDoc.createElement("author");
        const nameElement = xmlDoc.createElement("name");
        nameElement.textContent = authorName;
        authorElement.appendChild(nameElement);
        entry.appendChild(authorElement);
      });

      // Create and append link elements
      const htmlLink = xmlDoc.createElement("link");
      htmlLink.setAttribute("href", arxivInfo.link);
      htmlLink.setAttribute("rel", "alternate");
      htmlLink.setAttribute("type", "text/html");
      entry.appendChild(htmlLink);

      // Create PDF link (assuming PDF URL is same as HTML but with /pdf/ instead of /abs/)
      const pdfLink = xmlDoc.createElement("link");
      pdfLink.setAttribute("title", "pdf");
      pdfLink.setAttribute("href", arxivInfo.link.replace("/abs/", "/pdf/"));
      pdfLink.setAttribute("rel", "related");
      pdfLink.setAttribute("type", "application/pdf");
      entry.appendChild(pdfLink);

      return entry;
    } catch (error) {
      console.error("Error fetching Semantic Scholar data:", error);

      if (
        error.message.includes("rate limit") ||
        error.message.includes("429")
      ) {
        alert(
          "Semantic Scholar API is currently rate-limited. Alice will try to use cached data or alternative sources. This is temporary - please try again in a few minutes."
        );
        
        // Try to use cached reference data as fallback
        const citationKey = linkHref.split("cite.")[1];
        if (citationKey) {
          const cachedFinalRefs = JSON.parse(
            localStorage.getItem("cached_final_refs") || "{}"
          );
          const cachedRef = cachedFinalRefs[citationKey];
          
          if (cachedRef) {
            console.log("Using cached reference data as fallback:", cachedRef);
            
            // Create a minimal XML entry from cached data
            const xmlDoc = document.implementation.createDocument(
              "http://www.w3.org/2005/Atom",
              "entry",
              null
            );
            const entry = xmlDoc.documentElement;
            entry.setAttribute("xmlns", "http://www.w3.org/2005/Atom");
            
            // Add cached data to XML
            const titleElement = xmlDoc.createElement("title");
            titleElement.textContent = cachedRef.title || "Title not available";
            entry.appendChild(titleElement);
            
            const summaryElement = xmlDoc.createElement("summary");
            summaryElement.textContent = cachedRef.abstract || "Abstract not available";
            entry.appendChild(summaryElement);
            
            const idElement = xmlDoc.createElement("id");
            idElement.textContent = cachedRef.link || "#";
            entry.appendChild(idElement);
            
            const publishedElement = xmlDoc.createElement("published");
            publishedElement.textContent = `${cachedRef.year || "2023"}-01-01T00:00:00Z`;
            entry.appendChild(publishedElement);
            
            // Add authors
            if (cachedRef.authors) {
              const authors = cachedRef.authors.split(", ");
              authors.forEach(authorName => {
                const authorElement = xmlDoc.createElement("author");
                const nameElement = xmlDoc.createElement("name");
                nameElement.textContent = authorName;
                authorElement.appendChild(nameElement);
                entry.appendChild(authorElement);
              });
            }
            
            return entry;
          }
        }
        
        fail(currentElement, "Semantic Scholar temporarily unavailable - please try again in a few minutes");
      } else {
        alert(
          "Unable to fetch paper details. This may be due to network issues or the paper not being indexed."
        );
        fail(currentElement, `Failed to fetch paper details: ${error.message}`);
      }
    }
  } else {
    console.log("No matching reference found or missing paper ID");
    fail(currentElement, "No matching reference found");
  }
}

// Function to post content to online clipboard
async function postToOnlineClipboard(content, title) {
  console.log("Posting paper implementation to online clipboard...");

  try {
    // Format the content with a title and metadata
    const formattedContent = `# Implementation Guide for: ${title}\n\n${content}\n\n---\nGenerated by ArXiv Viewer Extension using Claude AI`;

    // Post to the online clipboard service
    const response = await fetch("https://online-clipboard-two.vercel.app/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: formattedContent }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to post to clipboard: ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();
    console.log("Successfully posted to online clipboard:", result);
    return result;
  } catch (error) {
    console.error("Error posting to online clipboard:", error);
    throw error;
  }
}

// Process Gemini API response
async function processGeminiResponse(geminiResult) {
  if (
    !geminiResult.candidates ||
    !geminiResult.candidates[0] ||
    !geminiResult.candidates[0].content ||
    !geminiResult.candidates[0].content.parts
  ) {
    throw new Error("Unexpected response structure from Gemini API");
  }

  console.log(
    "Received response parts:",
    JSON.stringify(geminiResult.candidates[0].content.parts)
  );

  // Check if we got a function call response
  const functionCall = geminiResult.candidates[0].content.parts.find(
    part => part.functionCall && part.functionCall.name === "summarizePaper"
  );

  if (
    functionCall &&
    functionCall.functionCall &&
    functionCall.functionCall.args
  ) {
    const args = functionCall.functionCall.args;
    // Format the content with main points and concise summary, ensure all markdown is rendered
    return `<div class="main-points">${cleanAIIntroText(
      renderMarkdown(args.mainPoints)
    )}</div>
                <div class="concise-summary" style="margin-top: 15px;">${cleanAIIntroText(
                  renderMarkdown(args.conciseSummary)
                )}</div>`;
  } else {
    // Check for text response
    const textParts = geminiResult.candidates[0].content.parts.filter(
      part => part.text
    );

    if (!textParts || textParts.length === 0) {
      throw new Error("No text content found in Gemini response");
    }

    const textContent = textParts[0].text || "";
    const cleanedContent = cleanAIIntroText(textContent);

    // Handle a non-function call response (particularly for direct prompts after retries)
    if (
      cleanedContent.includes("MAIN POINTS") &&
      cleanedContent.includes("CONCISE SUMMARY")
    ) {
      // Extract the two sections
      const mainPointsMatch = cleanedContent.match(
        /MAIN POINTS[:\s]+([\s\S]+?)(?=CONCISE SUMMARY|$)/i
      );
      const conciseSummaryMatch = cleanedContent.match(
        /CONCISE SUMMARY[:\s]+([\s\S]+?)(?=$)/i
      );

      if (mainPointsMatch && conciseSummaryMatch) {
        const mainPoints = cleanAIIntroText(mainPointsMatch[1].trim());
        const conciseSummary = cleanAIIntroText(conciseSummaryMatch[1].trim());

        return `<div class="main-points">${renderMarkdown(mainPoints)}</div>
                    <div class="concise-summary" style="margin-top: 15px;">${renderMarkdown(
                      conciseSummary
                    )}</div>`;
      }
    }

    // Check if the text appears to be a function call
    if (
      cleanedContent.includes("summarizePaper(") ||
      cleanedContent.includes("summarizePaper ")
    ) {
      console.log("Detected function-like response in text:", cleanedContent);

      // Try to extract mainPoints and conciseSummary using regex
      const mainPointsMatch = cleanedContent.match(
        /mainPoints\s*=\s*["'](.+?)["']/s
      );
      const conciseSummaryMatch = cleanedContent.match(
        /conciseSummary\s*=\s*["'](.+?)["']/s
      );

      if (mainPointsMatch && conciseSummaryMatch) {
        const mainPoints = mainPointsMatch[1];
        const conciseSummary = conciseSummaryMatch[1];

        console.log("Main points:", mainPoints);
        console.log("Concise summary:", conciseSummary);

        return `<div class="main-points">${renderMarkdown(mainPoints)}</div>
                    <div class="concise-summary" style="margin-top: 15px;">${renderMarkdown(
                      conciseSummary
                    )}</div>`;
      } else {
        // If we can't extract the parts properly, render the whole text as Markdown
        return renderMarkdown(
          cleanedContent
            .replace(/^.*?summarizePaper\(/, "")
            .replace(/\).*?$/, "")
        );
      }
    } else {
      // Regular text response, just render as markdown
      // Try to split it into two sections if we can identify them
      const lines = cleanedContent.split("\n");
      let mainPoints = "";
      let conciseSummary = "";
      let inMainPoints = true; // Assume we start with main points

      for (const line of lines) {
        if (
          line.match(/concise\s+summary|summary|conclusion/i) &&
          line.length < 50
        ) {
          inMainPoints = false;
          continue;
        }

        if (inMainPoints) {
          mainPoints += line + "\n";
        } else {
          conciseSummary += line + "\n";
        }
      }

      // If we were able to split it
      if (mainPoints && conciseSummary) {
        return `<div class="main-points">${renderMarkdown(
          mainPoints.trim()
        )}</div>
                    <div class="concise-summary" style="margin-top: 15px;">${renderMarkdown(
                      conciseSummary.trim()
                    )}</div>`;
      }

      // Otherwise just render the whole thing
      return renderMarkdown(cleanedContent);
    }
  }
}

// Function to clean up code remnants from response
function cleanupCodeFromResponse(text) {
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

// Enhanced function to clean up AI introduction text
function cleanAIIntroText(text) {
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

// Function to fetch all data for a paper (extract title -> get S2 -> store)
async function fetchDataForPaper(id) {
  console.log("Attempting to extract title from PDF for paper ID:", id);
  const pdfDocument = PDFViewerApplication.pdfDocument;

  if (pdfDocument) {
    try {
      const page = await pdfDocument.getPage(1);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      console.log(
        "Extracted text from first page for",
        id,
        ":",
        pageText.substring(0, 200) + "..."
      );

      // Call Gemini API to extract title from the first page text
      const extractedTitle = await extractTitleWithGemini(pageText);

      if (extractedTitle) {
        console.log("Extracted title from PDF for", id, ":", extractedTitle);
        // Now fetch Semantic Scholar data using the extracted title
        await fetchAndStoreSemanticScholarData(extractedTitle, id);
      } else {
        console.error("Could not extract title using Gemini for paper ID:", id);
        // Optionally call fail() here
        // fail(currentElement, "Failed to extract title from PDF");
      }
    } catch (error) {
      console.error(
        "Error getting page text content or extracting title for",
        id,
        ":",
        error
      );
      // Optionally call fail() here
      // fail(currentElement, "Failed to get PDF text or extract title");
    }
  } else {
    console.log("PDF document not loaded yet for paper ID:", id);
    // Optionally call fail() here
    // fail(currentElement, "PDF document not loaded");
  }
}

// Function to call Gemini API to extract title
async function extractTitleWithGemini(pageText) {
  try {
    const response = await fetch("https://api.aryankeluskar.com/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: PROMPT_EXTRACT_TITLE(pageText),
              },
            ],
          },
        ],
      }),
    });
    const result = await response.json();
    if (
      result.candidates &&
      result.candidates[0] &&
      result.candidates[0].content
    ) {
      const title = result.candidates[0].content.parts[0].text.trim();
      return title && title !== "NULL" ? title : null;
    }
    return null;
  } catch (error) {
    console.error("Error calling Gemini API for title extraction:", error);
    return null;
  }
}

// Function to fetch data from Semantic Scholar and store it
async function fetchAndStoreSemanticScholarData(title, paperId) {
  console.log(
    `Fetching Semantic Scholar data for title: "${title}", paper ID: ${paperId}`
  );
  try {
    // First get Semantic Scholar paper ID using title match
    const requestOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };
    
    const matchResponse = await queuedFetch(
      `https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(title)}`,
      requestOptions,
      5
    );

    if (!matchResponse.ok) {
      if (matchResponse.status === 404) {
        console.log("Semantic Scholar: Title match not found for", title);
        // Store minimal data indicating title but no S2 match
        const minimalData = {
          title: title,
          semantic_paper_id: null,
          references: [],
        };
        localStorage.setItem(
          `paper_data_${paperId}`,
          JSON.stringify(minimalData)
        );
        return; // Stop if no match
      } else {
        throw new Error(`Title match failed: ${matchResponse.status}`);
      }
    }

    const matchData = await matchResponse.json();
    const semanticPaperId = matchData.data[0].paperId;
    console.log(`Semantic Scholar ID found for "${title}": ${semanticPaperId}`);

    // Then get references using the Semantic Scholar paper ID
    const referencesResponse = await queuedFetch(
      `https://api.semanticscholar.org/graph/v1/paper/${semanticPaperId}/references?fields=abstract&offset=0&limit=999`,
      requestOptions,
      5
    );

    const referencesData = await referencesResponse.json();
    console.log(
      `Fetched ${referencesData.data ? referencesData.data.length : 0} references for ${semanticPaperId}`
    );

    // Store title, Semantic Scholar ID, and references together in localStorage
    const fullPaperData = {
      title: title,
      semantic_paper_id: semanticPaperId,
      references: referencesData.data || [], // Ensure references is always an array
    };

    localStorage.setItem(
      `paper_data_${paperId}`,
      JSON.stringify(fullPaperData)
    );
    console.log("Stored full paper data for", paperId, ":", fullPaperData);

    if (!referencesData.data || referencesData.data.length === 0) {
      alert("This paper cannot be indexed by Alice. Please try again later.");
      fail(currentElement, "Paper not indexed by Alice");
      return;
    }

    alert("Alice has completed indexing this paper.");

    // If there's an active link being hovered that is waiting for this data, trigger a hover event
    if (typeof $ !== "undefined") {
      const $activeHoveredLinks = $("a:hover");
      if ($activeHoveredLinks.length > 0) {
        console.log(
          "Found active hovered link, triggering hover event to show popup"
        );
        // Briefly unhover and then rehover to trigger the popup creation
        const $link = $activeHoveredLinks.first();
        $link.trigger("mouseleave");
        setTimeout(() => {
          $link.trigger("mouseenter");
        }, 100);
      }
    }
  } catch (error) {
    console.error(
      "Error fetching or storing Semantic Scholar data for",
      paperId,
      ":",
      error
    );
    // Optionally call fail() here
    // fail(currentElement, "Failed to fetch Semantic Scholar data");
  }
}

// Helper functions for code generation
async function fetchPaperText(arxivLink) {
  console.log("Fetching paper text from arXiv link:", arxivLink);

  try {
    // Extract the arXiv ID from the link
    const arxivIdMatch = arxivLink.match(/abs\/([^\/]+)/);
    if (!arxivIdMatch || !arxivIdMatch[1]) {
      throw new Error("Could not extract arXiv ID from link");
    }

    const arxivId = arxivIdMatch[1];
    console.log("Extracted arXiv ID:", arxivId);

    // Use ArXiv API to get paper details
    const apiEndpoint = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
    const apiResponse = await fetchWithRetry(apiEndpoint, {}, 2);

    const xmlData = await apiResponse.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, "text/xml");

    // Extract summary and other details
    const summary = xmlDoc.querySelector("summary")?.textContent || "";
    const title = xmlDoc.querySelector("title")?.textContent || "";
    const authors = Array.from(xmlDoc.querySelectorAll("author name"))
      .map(el => el.textContent)
      .join(", ");

    // Combine the data
    return `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
  } catch (error) {
    console.error("Error fetching paper text:", error);
    throw new Error(`Failed to fetch paper text: ${error.message}`);
  }
}

// Function to render markdown content
function renderMarkdown(text) {
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
function ensureMathJaxLoaded() {
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

// Function to detect Python code
function containsPythonCode(text) {
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

// Function to make the Gemini API call
async function callGeminiAPI(arxivText, retryCount = 0) {
  if (retryCount > 2) {
    throw new Error(
      "Failed to generate a proper summary after multiple attempts"
    );
  }

  // Update the LLM Prompt for better differentiation between main points and concise summary
  const llmPrompt = PROMPT_LLM_ANALYZE;

  // Use our proxy API endpoint instead of calling Gemini directly
  const geminiProxyEndpoint = "https://api.aryankeluskar.com/api/gemini";

  // Improved system prompt with clearer differentiation between main points and summary
  let systemPrompt = PROMPT_SYSTEM_BASE({ retryCount });
  // After 2 retries, fall back to a direct prompt instead of function calling
  if (retryCount >= 2) {
    console.log("Falling back to direct prompt after multiple retries");

    const directPromptResponse = await fetchWithRetry(
      geminiProxyEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: PROMPT_DIRECT_FALLBACK(llmPrompt, arxivText),
                },
              ],
            },
          ],
        }),
      },
      3
    );

    return await directPromptResponse.json();
  }

  const geminiResponse = await fetchWithRetry(
    geminiProxyEndpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: llmPrompt + arxivText }],
          },
        ],
        // Add generation parameters for better control
        generationConfig: {
          temperature: 0.2 + retryCount * 0.1, // Increase temperature slightly on retries
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 300,
        },
        systemInstruction: {
          role: "system",
          parts: [
            {
              text: systemPrompt,
            },
          ],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "summarizePaper",
                description:
                  "Summarize an academic paper in a structured format with analysis of key contributions and a factual summary",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    mainPoints: {
                      type: "STRING",
                      description:
                        "Focus ONLY on the key contributions of the paper and why they matter. What does this paper contribute to the field? Formatted in Markdown.",
                    },
                    conciseSummary: {
                      type: "STRING",
                      description:
                        "A factual summary of the paper in 50 words or less, with no overlap with the main points section. Formatted in Markdown.",
                    },
                  },
                  required: ["mainPoints", "conciseSummary"],
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: "AUTO",
          },
        },
      }),
    },
    3
  );

  return await geminiResponse.json();
}


function getBibtexReferenceFromInternalLink(link) {
  const chunks = link.split("#");
  if (chunks.length < 2) {
    return null;
  }
  if (!chunks[1].startsWith("cite.")) {
    return null;
  }
  return chunks[1].substr(5);
}

function parseBibtexReference(bibtexRef) {
  const regex = /^([a-zA-Z]+)(\d{4})([a-zA-Z]+)$/g;
  const match = regex.exec(bibtexRef);
  if (match) {
    return { author: match[1], year: match[2], title: match[3] };
  }
  return null;
}

// Utility function to add delay with exponential backoff
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Request queue to prevent concurrent API requests that trigger rate limits
const apiRequestQueue = {
  semanticScholar: [],
  arxiv: [],
  processing: {
    semanticScholar: false,
    arxiv: false
  }
};

// Simple cache for API responses to reduce redundant requests
const apiCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function getCacheKey(url, options) {
  return `${url}_${JSON.stringify(options || {})}`;
}

function getCachedResponse(url, options) {
  const key = getCacheKey(url, options);
  const cached = apiCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    console.log(`Using cached response for ${url}`);
    return Promise.resolve(cached.response.clone());
  }
  
  return null;
}

function setCachedResponse(url, options, response) {
  const key = getCacheKey(url, options);
  apiCache.set(key, {
    response: response.clone(),
    timestamp: Date.now()
  });
}

async function queuedFetch(url, options = {}, maxRetries = 3) {
  // Check cache first
  const cachedResponse = getCachedResponse(url, options);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  const apiType = url.includes('semanticscholar.org') ? 'semanticScholar' : 
                  url.includes('arxiv.org') ? 'arxiv' : 'other';
  
  if (apiType === 'other') {
    // For non-rate-limited APIs, proceed directly
    const response = await fetchWithRetry(url, options, maxRetries);
    setCachedResponse(url, options, response);
    return response;
  }
  
  return new Promise((resolve, reject) => {
    apiRequestQueue[apiType].push({ url, options, maxRetries, resolve, reject });
    processQueue(apiType);
  });
}

async function processQueue(apiType) {
  if (apiRequestQueue.processing[apiType] || apiRequestQueue[apiType].length === 0) {
    return;
  }
  
  apiRequestQueue.processing[apiType] = true;
  
  while (apiRequestQueue[apiType].length > 0) {
    const { url, options, maxRetries, resolve, reject } = apiRequestQueue[apiType].shift();
    
    try {
      const response = await fetchWithRetry(url, options, maxRetries);
      setCachedResponse(url, options, response);
      resolve(response);
    } catch (error) {
      reject(error);
    }
    
    // Add a small delay between requests to the same API
    if (apiRequestQueue[apiType].length > 0) {
      await delay(apiType === 'semanticScholar' ? 1000 : 500);
    }
  }
  
  apiRequestQueue.processing[apiType] = false;
}

// Retry function with exponential backoff
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let retries = 0;
  let lastError;

  // Add CORS proxy for ArXiv API requests if needed
  if (
    url.startsWith("https://export.arxiv.org") &&
    !url.startsWith("https://")
  ) {
    // Use HTTPS instead of HTTP
    url = url.replace("http://", "https://");
    console.log(`Converted ArXiv API URL to HTTPS: ${url}`);
  }

  while (retries < maxRetries) {
    try {
      console.log(`Fetching ${url} (attempt ${retries + 1}/${maxRetries})`);
      const response = await fetch(url, options);

      // If it's a rate limit error, retry with exponential backoff
      if (response.status === 429) {
        const isSemanticScholar = url.includes('semanticscholar.org');
        
        if (retries === 0 && isSemanticScholar) {
          alert("Alice has hit the Semantic Scholar API rate limit. Please wait while we retry...");
        }

        let waitTime;
        const retryAfterHeader = response.headers.get("Retry-After");
        
        if (retryAfterHeader) {
          // If server provides retry-after header, use it
          waitTime = parseInt(retryAfterHeader, 10) * 1000;
        } else {
          // Use exponential backoff with longer initial wait for Semantic Scholar
          const baseWait = isSemanticScholar ? 5000 : 1000; // 5 seconds for S2, 1 second for others
          waitTime = baseWait * Math.pow(2, retries);
        }
        
        // Cap the wait time at 60 seconds
        waitTime = Math.min(waitTime, 60000);

        console.log(`Rate limited (429). Retrying after ${waitTime}ms...`);
        await delay(waitTime);
        retries++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      // Success - clear any rate limit alerts for subsequent requests
      return response;
    } catch (error) {
      lastError = error;

      // Log more details about the error
      console.error(`Fetch error (attempt ${retries + 1}/${maxRetries}):`, {
        url,
        errorMessage: error.message,
        errorType: error.name,
      });

      if (retries === maxRetries - 1) {
        break;
      }

      // Wait with exponential backoff before retrying for other errors
      const waitTime = Math.pow(2, retries) * 1000;
      console.log(`Error fetching. Retrying after ${waitTime}ms...`, error);
      await delay(waitTime);
      retries++;
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError;
}

// Function to create and show the popup with paper data
async function createAndShowPopup({
  element,
  popupId,
  tipsyDirection,
  matchingEntry,
  currentScaleFactor = 1,
  onPopupCreated = null,
}) {
  // check if user is still hovering before adding to DOM
  if ($(element).parent().find("a:hover").length === 0) {
    return;
  }

  const paperData = {
    title: matchingEntry.getElementsByTagName("title")[0]?.textContent || "",
    authors: Array.from(matchingEntry.getElementsByTagName("author") || [])
      .map(a => a.children[0]?.textContent || "")
      .filter(Boolean),
    abstract:
      matchingEntry.getElementsByTagName("summary")[0]?.textContent || "",
    date: matchingEntry.getElementsByTagName("published")[0]?.textContent || "",
    link: matchingEntry.getElementsByTagName("id")[0]?.textContent || "",
  };

  // Check if abstract contains English alphabets
  const hasEnglishAlphabets = /[a-zA-Z]/.test(paperData.abstract);
  if (!hasEnglishAlphabets) {
    paperData.abstract =
      "This paper's abstract has been elided by the publisher. Paper or abstract should be available on the publisher's website, which is subject to the license by the author or copyright owner provided with this content.";
  }

  // Destructure paper data with defaults
  const {
    title: fullTitle = "",
    authors: rawAuthors = [],
    abstract = "",
    date = "",
    link = "",
  } = paperData;

  // Check if we have a valid ArXiv link
  let finalLink = link;
  if (!finalLink || !finalLink.includes("arxiv.org")) {
    // Create Google Scholar search URL
    const authorString = rawAuthors.join(", ");
    const searchQuery = encodeURIComponent(`${fullTitle} by ${authorString}`);
    finalLink = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C3&q=${searchQuery}&btnG=`;
    console.log(
      "No ArXiv link found, using Google Scholar fallback:",
      finalLink
    );
  }

  // Limit authors to 16 words
  let authorText = rawAuthors.join(", ");
  const authorWords = authorText.split(/\s+/);
  if (authorWords.length > 16) {
    // Find the last complete author name that fits within 16 words
    let wordCount = 0;
    let lastCompleteAuthorIndex = -1;

    for (let i = 0; i < rawAuthors.length; i++) {
      const authorWordCount = rawAuthors[i].split(/\s+/).length;

      if (wordCount + authorWordCount > 16) {
        break;
      }

      wordCount += authorWordCount;
      if (i < rawAuthors.length - 1) {
        wordCount += 2; // Count ", " as a word
      }

      lastCompleteAuthorIndex = i;
    }

    if (lastCompleteAuthorIndex >= 0) {
      const excessAuthorsCount =
        rawAuthors.length - (lastCompleteAuthorIndex + 1);
      authorText =
        rawAuthors.slice(0, lastCompleteAuthorIndex + 1).join(", ") +
        ` and ${excessAuthorsCount} others`;
    } else {
      // If even the first author has more than 16 words, truncate it
      const excessWordsCount = authorWords.length - 16;
      authorText =
        authorWords.slice(0, 16).join(" ") + ` and ${excessWordsCount} others`;
    }
  }

  let dateString = "Publication date not available";

  try {
    const dateStringOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    dateString = new Intl.DateTimeFormat("en-US", dateStringOptions).format(
      new Date(date)
    );
  } catch (error) {
    console.error("Error parsing date:", error);
    dateString = "Publication date not available";
  }

  // Load required libraries if not already loaded
  if (!window.marked && !$('script[src*="marked"]').length) {
    const script = document.createElement("script");
    script.src = "marked.min.js";
    script.async = true;
    document.head.appendChild(script);
  }

  // Add CSS for toggle switch
  if (!$("#arxiv-toggle-style").length) {
    const style = document.createElement("style");
    style.id = "arxiv-toggle-style";
    style.textContent = popup_style;
    document.head.appendChild(style);
  }

  // Add Solway font import if not already in the document
  if (!$('link[href*="Solway"]').length) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Solway:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }

  // Create the popup HTML
  const htmlString = TEMPLATE_POPUP({
    popupId,
    tipsyDirection,
    hasEnglishAlphabets,
    fullTitle,
    finalLink,
    dateString,
    authorText,
    abstract,
  });

  const $popup = $(htmlString);
  $(element).parent().append($popup);

  let summaryLoaded = false;
  let llmSummary = "";
  let codeLoaded = false;
  let codeContent = "";
  let isProcessing = false;
  let isButtonClicked = false;
  let showingSummary = false;
  let isMouseOverPopup = false;
  let isMouseOverLink = false;
  let activePopup = $popup;
  let activeLink = element;

  // Add hover state tracking for the popup
  $popup.on({
    mouseenter: function () {
      isMouseOverPopup = true;
    },
    mouseleave: function () {
      isMouseOverPopup = false;
      checkShouldClosePopup();
    },
    click: function (e) {
      // Prevent clicks on the popup from closing it
      e.stopPropagation();
    },
    mousedown: function (e) {
      // Allow text selection to work properly
      if (e.target.closest(".tipsy-inner")) {
        return true;
      }
      e.stopPropagation();
    },
  });

  // Add hover state tracking for the link
  $(element).on({
    mouseenter: function () {
      isMouseOverLink = true;
    },
    mouseleave: function () {
      isMouseOverLink = false;
      setTimeout(() => {
        checkShouldClosePopup();
      }, 100);
    },
  });

  // Function to check if popup should close
  function checkShouldClosePopup() {
    setTimeout(() => {
      if (!isMouseOverPopup && !isMouseOverLink && !isButtonClicked) {
        $popup.remove();
        activePopup = null;
        activeLink = null;
      }
    }, 100);
  }

  // Add click event listeners for buttons
  setupButtonEventListeners($popup, popupId, {
    link,
    abstract,
    fullTitle,
    isProcessing,
    isButtonClicked,
    summaryLoaded,
    llmSummary,
    showingSummary,
    codeLoaded,
    codeContent,
  });

  // Call the callback if provided
  if (onPopupCreated) {
    onPopupCreated($popup);
  }

  return {
    popup: $popup,
    destroy: () => {
      $popup.remove();
      activePopup = null;
      activeLink = null;
    },
  };
}

// Helper function to set up button event listeners
function setupButtonEventListeners($popup, popupId, state) {
  let {
    link,
    abstract,
    fullTitle,
    isProcessing,
    isButtonClicked,
    summaryLoaded,
    llmSummary,
    showingSummary,
    codeLoaded,
    codeContent,
  } = state;

  const parser = new DOMParser();

  // Add click event listener to the toggle button
  $(`#${popupId} .alice-toggle[data-view="abstract"]`).on(
    "click",
    async function (e) {
      e.stopPropagation();
      e.preventDefault();

      console.log("Summary/Abstract button clicked");

      // Mark that the button was clicked to prevent popup from closing
      isButtonClicked = true;
      setTimeout(() => {
        isButtonClicked = false;
      }, 500);

      if (isProcessing) return;

      // Toggle active state based on current view
      const currentView = $(this).attr("data-view");
      if (currentView === "abstract") {
        $(this).attr("data-view", "summary");
        $(this).text("‎Abstract‎");
        $(this).addClass("active");
        showingSummary = true;
      } else {
        $(this).attr("data-view", "abstract");
        $(this).text("Summary");
        $(this).removeClass("active");
        showingSummary = false;
      }

      $(this)
        .closest(".arxiv-controls")
        .find(".alice-toggle")
        .not(this)
        .removeClass("active");

      const contentDiv = $(this)
        .closest(".tipsy-inner")
        .find(".alice_main_content");
      const abstractDiv = contentDiv.find(".alice_main_abstract");

      $(`#${popupId}-code-content`).hide();
      $(`#${popupId}-abstract-content`).show();

      if (showingSummary && !summaryLoaded) {
        isProcessing = true;
        abstractDiv.html("<div>Fetching AI summary...</div>");

        try {
          let arxivText;
          try {
            const arxivEndpoint = link;
            const arxivIdMatch = arxivEndpoint.match(/abs\/([^\/]+)/);
            let arxivId = null;

            if (arxivIdMatch && arxivIdMatch[1]) {
              arxivId = arxivIdMatch[1];
              console.log("Extracted arXiv ID:", arxivId);

              const apiEndpoint = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
              console.log("Using ArXiv API endpoint:", apiEndpoint);

              const apiResponse = await fetchWithRetry(apiEndpoint, {}, 2);
              const xmlData = await apiResponse.text();
              const xmlDoc = parser.parseFromString(xmlData, "text/xml");

              const summary =
                xmlDoc.querySelector("summary")?.textContent || "";
              const title = xmlDoc.querySelector("title")?.textContent || "";
              const authors = Array.from(xmlDoc.querySelectorAll("author name"))
                .map(el => el.textContent)
                .join(", ");

              arxivText = `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
              console.log(
                "Successfully extracted paper data from ArXiv API:",
                arxivText
              );
            } else {
              // If we can't extract the ID, try searching by title
              console.log("Could not extract arXiv ID, searching by title");
              const titleWords = fullTitle.split(/\s+/);
              // Filter to words that are likely significant (longer than 3 chars or containing numbers)
              const keywords = titleWords
                .filter(word => word.length > 3 || /\d/.test(word))
                // Remove punctuation
                .map(word => word.replace(/[^\w\d]/g, ""))
                // Limit to 5 most relevant keywords to avoid over-constraining
                .slice(0, 5)
                .join(" ");

              console.log("Using keywords for search:", keywords);

              // Use all_fields search instead of just title for better matching
              const searchEndpoint = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keywords)}&start=0&max_results=1`;
              console.log("Using ArXiv search endpoint:", searchEndpoint);

              const searchResponse = await fetchWithRetry(
                searchEndpoint,
                {},
                2
              );
              const searchData = await searchResponse.text();
              const searchDoc = parser.parseFromString(searchData, "text/xml");

              const firstEntry = searchDoc.querySelector("entry");
              if (!firstEntry) {
                throw new Error("No matching papers found in ArXiv search");
              }

              // Extract all necessary information from the search result
              const title =
                firstEntry.querySelector("title")?.textContent || "";
              const summary =
                firstEntry.querySelector("summary")?.textContent || "";
              const authors = Array.from(
                firstEntry.querySelectorAll("author name")
              )
                .map(el => el.textContent)
                .join(", ");

              // Construct the arxivText in the same format as the direct API response
              arxivText = `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
              console.log(
                "Successfully extracted paper data from ArXiv search:",
                arxivText
              );
            }
          } catch (error) {
            console.error("Error fetching from ArXiv:", error);
            throw new Error(
              `Failed to fetch article from arXiv: ${error.message}. ArXiv blocks direct content access due to CORS restrictions.`
            );
          }

          if (!arxivText || arxivText.trim() === "") {
            throw new Error("Failed to extract paper content from ArXiv");
          }

          try {
            let geminiResult;
            let retryCount = 0;
            let llmSummaryContent = "";
            let containsCode = false;

            do {
              if (retryCount > 0) {
                abstractDiv.html(
                  `<div>Retry ${retryCount}/3: Improving summary format...</div>`
                );
              }

              geminiResult = await callGeminiAPI(arxivText, retryCount);
              console.log(
                `Gemini API response (attempt ${retryCount + 1}):`,
                geminiResult
              );

              llmSummaryContent = await processGeminiResponse(geminiResult);
              console.log("LLM summary content:", llmSummaryContent);

              containsCode = containsPythonCode(llmSummaryContent);

              if (containsCode) {
                console.log(
                  `Detected code in response, retry ${retryCount + 1}`
                );
                retryCount++;
              }
            } while (containsCode && retryCount < 3);

            if (containsCode) {
              llmSummaryContent = cleanupCodeFromResponse(llmSummaryContent);
            }

            llmSummary = llmSummaryContent;

            if (
              typeof llmSummary === "string" &&
              !llmSummary.startsWith('<div class="main-points">')
            ) {
              llmSummary = cleanAIIntroText(llmSummary);
            }

            summaryLoaded = true;
            abstractDiv.html(llmSummary);
          } catch (error) {
            if (error.message.includes("429")) {
              throw new Error(
                "AI summary service is currently busy. Please try again in a few minutes."
              );
            } else {
              throw error;
            }
          }
        } catch (error) {
          console.error("Error generating summary:", error);
          abstractDiv.html(
            `<div style="color: red;">Error: ${error.message}</div>`
          );
        } finally {
          isProcessing = false;
        }
      } else if (showingSummary && summaryLoaded) {
        abstractDiv.html(llmSummary);
      } else {
        abstractDiv.html(abstract);
      }
    }
  );

  // Add click event listener for BibTex button
  $(`#${popupId} .alice-toggle[data-view="bibtex"]`).on(
    "click",
    async function (e) {
      e.stopPropagation();
      e.preventDefault();

      console.log("BibTex button clicked");

      isButtonClicked = true;
      setTimeout(() => {
        isButtonClicked = false;
      }, 500);

      if (isProcessing) return;

      const isCurrentlyActive = $(this).hasClass("active");

      if (isCurrentlyActive) {
        $(this).removeClass("active");

        const contentDiv = $(this)
          .closest(".tipsy-inner")
          .find(".alice_main_content");
        const abstractDiv = contentDiv.find(".alice_main_abstract");

        abstractDiv.html(abstract);
      } else {
        $(this).addClass("active");

        $(this)
          .closest(".arxiv-controls")
          .find(".alice-toggle")
          .not(this)
          .removeClass("active");

        const contentDiv = $(this)
          .closest(".tipsy-inner")
          .find(".alice_main_content");
        const abstractDiv = contentDiv.find(".alice_main_abstract");

        $(`#${popupId}-code-content`).hide();
        $(`#${popupId}-abstract-content`).show();

        isProcessing = true;
        abstractDiv.html("<div>Fetching BibTex...</div>");

        try {
          const arxivEndpoint = link;
          const arxivIdMatch = arxivEndpoint.match(/abs\/([^\/]+)/);
          let arxivId = null;

          if (arxivIdMatch && arxivIdMatch[1]) {
            arxivId = arxivIdMatch[1];
            console.log("Extracted arXiv ID for BibTex:", arxivId);
          } else {
            // If we can't extract the ID, try searching by title
            console.log("Could not extract arXiv ID, searching by title");
            const titleWords = fullTitle.split(/\s+/);
            // Filter to words that are likely significant (longer than 3 chars or containing numbers)
            const keywords = titleWords
              .filter(word => word.length > 3 || /\d/.test(word))
              // Remove punctuation
              .map(word => word.replace(/[^\w\d]/g, ""))
              // Limit to 5 most relevant keywords to avoid over-constraining
              .slice(0, 5)
              .join(" ");

            console.log("Using keywords for search:", keywords);

            // Use all_fields search instead of just title for better matching
            const searchEndpoint = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keywords)}&start=0&max_results=1`;
            console.log("Using ArXiv search endpoint:", searchEndpoint);

            const searchResponse = await fetchWithRetry(searchEndpoint, {}, 2);
            const searchData = await searchResponse.text();
            const parser = new DOMParser();
            const searchDoc = parser.parseFromString(searchData, "text/xml");

            const firstEntry = searchDoc.querySelector("entry");
            if (!firstEntry) {
              throw new Error("No matching papers found in ArXiv search");
            }

            // Extract the ID from the first entry's ID field
            const idUrl = firstEntry.querySelector("id")?.textContent;
            const searchIdMatch = idUrl?.match(/abs\/([^\/]+)/);
            if (!searchIdMatch || !searchIdMatch[1]) {
              throw new Error("Could not extract arXiv ID from search result");
            }
            arxivId = searchIdMatch[1];
            console.log("Found arXiv ID from search:", arxivId);
          }

          if (arxivId) {
            const bibtexData = await fetchBibTexData(arxivId);

            abstractDiv.html(TEMPLATE_BIBTEX(popupId, bibtexData));

            $(`#${popupId}-copy-bibtex`).on("click", function (e) {
              e.stopPropagation();
              navigator.clipboard
                .writeText(bibtexData)
                .then(() => {
                  const originalText = $(this).text();
                  $(this).text("Copied!");
                  setTimeout(() => {
                    $(this).text(originalText);
                  }, 2000);
                })
                .catch(err => {
                  console.error("Failed to copy text: ", err);
                });
            });
          } else {
            abstractDiv.html(
              "<div>Could not find arXiv ID for this paper.</div>"
            );
          }
        } catch (error) {
          console.error("Error fetching BibTex:", error);
          abstractDiv.html("<div>Error fetching BibTex information.</div>");
        } finally {
          isProcessing = false;
        }
      }
    }
  );
}

// export all functions
export {
  fail,
  getGeminiFallbackReference,
  postToOnlineClipboard,
  processGeminiResponse,
  cleanupCodeFromResponse,
  cleanAIIntroText,
  fetchDataForPaper,
  extractTitleWithGemini,
  fetchAndStoreSemanticScholarData,
  fetchPaperText,
  renderMarkdown,
  ensureMathJaxLoaded,
  containsPythonCode,
  callGeminiAPI,
  fetchWithRetry,
  getBibtexReferenceFromInternalLink,
  parseBibtexReference,
  delay,
  fetchBibTexData,
  createAndShowPopup,
  setupButtonEventListeners,
};
