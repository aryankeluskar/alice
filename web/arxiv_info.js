/* eslint-disable no-undef */

// Helper functions moved outside of event handlers for better scoping
function getTipsyDirection(element) {
  try {
    const zoomMultiplier = parseFloat(
      $(element).parent().css("transform").substr(7)
    );
    const leftPixels =
      parseFloat($(element).parent().css("left")) * zoomMultiplier;
    const topPixels =
      parseFloat($(element).parent().css("top")) * zoomMultiplier;
    const width = parseInt(
      $(element).parent().parent().parent().css("width")
    );
    const height = parseInt(
      $(element).parent().parent().parent().css("height")
    );
    const northSouth = topPixels > height / 2 ? "s" : "n";
    const eastWest = leftPixels > width / 2 ? "e" : "w";
    return `${northSouth}${eastWest}`;
  } catch (err) {
    console.log(err);
    return "sw";
  }
}

function appendTipsyToElement(element, htmlString) {
  $(element).parent().append(htmlString);
  $(".tipsy").on({
    mouseleave() {
      $(".tipsy").remove();
    },
  });
}

function makeUrlsClickable(text) {
  if (!text) {
    return text;
  }

  if (!text.includes("http")) {
    return text;
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, url => `<a href="${url}" target="_blank">${url}</a>`);
}

function displayPopupInfo(element, { link, fullTitle, abstract, date, authors }) {
  // First check if the user is still hovering over the link
  if (!$(element).is(":hover")) {
    console.log("User no longer hovering, skipping popup display");
    return;
  }

  console.log("displaying info: ", { link, fullTitle, abstract, date, authors });

  if (!abstract) {
    abstract = "No abstract found";
  }

  if (abstract === "null") {
    abstract = "No abstract found";
  }

  if (!authors) {
    authors = ["No authors found"];
  }

  if (!date) {
    date = "No date found";
  }

  if (!link) {
    link = "#";
  }

  let dateString;
  let datePreposition;
  if (typeof date === 'number' || /^\d{4}$/.test(date)) {
    dateString = date.toString();
    datePreposition = 'in';
  } else {
    const dateStringOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    dateString = new Intl.DateTimeFormat(
      "en-US",
      dateStringOptions
    ).format(new Date(date));
    datePreposition = 'on';
  }
  const tipsyDirection = getTipsyDirection(element);

  const htmlString = `
    <div class="tipsy tipsy-${tipsyDirection}" style="pointer-events: none;">
    <div class="tipsy-arrow"></div>
    <div class="tipsy-inner" style="pointer-events: auto;">
    <div class="arxiv_info_title">
      ${fullTitle}
      ${link !== '#' ? `<a href="${link}" title="arXiv link" target="_blank"> <img src = "images/link-icon.svg" alt="Link Icon" width="12" height="12"/></a>` : ''}
    </div>
    <div class="arxiv_info_author">
      ${authors.join(", ")}
    </div>
    <div class="arxiv_info_date">
      Published ${datePreposition} ${dateString}.
    </div>
    <div class="arxiv_info_abstract">
      ${makeUrlsClickable(abstract)}
    </div>
    </div>
    </div>`;

  appendTipsyToElement(element, htmlString);
}

// Utility function for delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to handle API requests with retry logic
async function fetchWithRetry(url, options = {}, retries = 2) {
  await delay(300);
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        // Rate limit hit - wait exactly 1 second before retry
        await delay(1000);
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000); // Always wait 1 second between retries
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

// Helper function to extract citation from PDF
async function extractCitationFromPdf(pdfDocument, pdfLink) {
  const destination = await pdfDocument.getDestination(pdfLink);
  console.log("destination", destination);
  if (destination && destination.length >= 4) {
    const pageRef = destination[0];
    const x = destination[2];
    const y = destination[3];

    // Convert the page reference to actual page number
    let pageNum;
    if (typeof pageRef === 'object' && pageRef !== null) {
      pageNum = await pdfDocument.getPageIndex(pageRef) + 1;
    } else {
      pageNum = pageRef;
    }

    console.log("Actual page number:", pageNum);

    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Find text items near the destination coordinates with wider range
    const nearbyText = textContent.items.filter(item => {
      const dy = item.transform[5] - y;
      return dy < 0 && dy > -300;
    });

    // Sort items by y-coordinate (top to bottom) and x-coordinate (left to right)
    nearbyText.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) < 5) { // If y-coordinates are close, sort by x
        return a.transform[4] - b.transform[4];
      }
      return yDiff;
    });

    // First try to extract text in the traditional way for bracket-based references
    const simpleText = nearbyText.map(item => item.str).join(' ');
    const bracketMatch = simpleText.match(/\[(.*?)\]/);
    if (bracketMatch) {
      // If we found brackets, use the existing logic
      return simpleText.substring(simpleText.indexOf(']') + 1, simpleText.indexOf('[', simpleText.indexOf(']') + 1));
    }

    // If no brackets found, try to extract a two-column format reference
    // Group items by lines (items with similar y-coordinates)
    const lines = [];
    let currentLine = [];
    let currentY = null;

    for (const item of nearbyText) {
      if (currentY === null || Math.abs(item.transform[5] - currentY) < 5) {
        currentLine.push(item);
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
      }
      currentY = item.transform[5];
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Combine lines into text, handling potential column breaks
    let textString = '';
    let inReference = false;
    let referenceStartY = null;

    for (const line of lines) {
      const lineText = line.map(item => item.str).join(' ');

      // Check if this line starts a new reference
      if (lineText.match(/^[A-Z][\w\s,\.]+?et al\.?|^[A-Z][\w\s,\.]+?\sand\s|^\d+\.\s+[A-Z]/)) {
        if (inReference && textString.trim()) {
          // We've found the start of the next reference
          break;
        }
        inReference = true;
        referenceStartY = line[0].transform[5];
      }

      // Only include lines that are part of the same reference (within reasonable vertical distance)
      if (inReference && (!referenceStartY || Math.abs(line[0].transform[5] - referenceStartY) < 100)) {
        textString += lineText + ' ';
      }
    }

    return textString.trim();
  }
  return null; ``
}

async function trySemanticScholar(paperTitle) {
  try {
    const apiEndpoint = `https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(paperTitle)}`;
    const apiResponse = await fetchWithRetry(apiEndpoint);
    const apiData = await apiResponse.json();

    if (apiData.data && apiData.data[0]) {
      const paperId = apiData.data[0].paperId;
      const paperEndpoint = `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=abstract,year,title,openAccessPdf,authors`;
      const paperResponse = await fetchWithRetry(paperEndpoint);
      const paperData = await paperResponse.json();

      return {
        link: paperData.openAccessPdf?.url || '#',
        fullTitle: paperData.title,
        abstract: paperData.abstract,
        date: paperData.year,
        authors: paperData.authors?.map(author => author.name) || []
      };
    }
  } catch (error) {
    console.log("Semantic Scholar search failed:", error);
  }
  return null;
}

async function tryCrossref(citation) {
  try {
    const crossrefEndpoint = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(citation)}&rows=1`;
    const crossrefResponse = await fetchWithRetry(crossrefEndpoint);
    const crossrefData = await crossrefResponse.json();

    if (crossrefData.message?.items?.[0]) {
      const paper = crossrefData.message.items[0];

      return {
        link: paper.URL || '#',
        fullTitle: paper.title?.[0] || 'Unknown Title',
        abstract: paper.abstract || 'No abstract available',
        date: paper.published?.['date-parts']?.[0]?.[0],
        authors: paper.author?.map(author =>
          `${author.given || ''} ${author.family || ''}`
        ) || []
      };
    }
  } catch (error) {
    console.log("Crossref search failed:", error);
  }
  return null;
}

// Helper function to handle citation fallback with Semantic Scholar API and Crossref
async function handleCitationFallback(element, citation) {
  // Clean up citation text
  citation = citation.trim().replace(/\s+/g, ' ');

  // Extract year if present
  let year = null;
  const yearMatch = citation.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[0]);
  }

  const patterns = [
    /(?:^|\.\s+)([^.]+?)(?=\.\s+(?:In|arXiv|URL|Advances|Nature|volume|pp\.))/,
    /(?:^|\.\s+)([^.]+?)(?=\.\s+(?:\d{4}|\(\d{4}\)))/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*(?:\s*,\s*et\s+al\.)?\s*\.\s*)([^.]+?)(?=\.\s+arXiv|\,\s+arXiv)/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*(?:\s*,\s*et\s+al\.)?\s*\.\s*)([^.]+?)(?=\.\s+In|\,\s+In)/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*(?:\s*,\s*et\s+al\.)?\s*\.\s*)([^.]+?)(?=\.\s+Proceedings|\,\s+Proceedings)/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+arXiv|\,\s+arXiv)/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+In\s+[A-Z]|\,\s+In\s+[A-Z])/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+Proceedings|\,\s+Proceedings)/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+[A-Z][a-z]+|\,\s+[A-Z][a-z]+)/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*\s*\.\s*)([^.]+?)(?=\.)/,
    /(?:(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+(?:\s*,\s*(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+)*\s*(?:,|,\s+and)\s+(?:[A-Z][a-z]*\.?\s+)*[A-Z][a-z]+\s*\.\s*)([^.]+?)(?=\.)/,
    /(?:[A-Za-z]+(?:\s+[A-Za-z]+)*(?:,\s*[A-Za-z]+(?:\s+[A-Za-z]+)*)*(?:\s*,\s*and\s+[A-Za-z]+(?:\s+[A-Za-z]+)*)?)\s*\.\s*([^.]+?)(?=,|\.|$)/,
  ];

  try {
    for (const pattern of patterns) {
      const match = citation.match(pattern);
      if (match && match[1]) {
        const paperTitle = match[1].trim();
        if (!paperTitle || paperTitle.length < 10) continue;

        console.log("Extracted paper title:", paperTitle);

        // Try Semantic Scholar if regex worked and we have a paper title
        const semanticScholarResult = await trySemanticScholar(paperTitle);
        console.log("semanticScholarResult", semanticScholarResult);
        if (semanticScholarResult) {
          displayPopupInfo(element, semanticScholarResult);
          return;
        }
      }
    }

    console.log("no regex match for ", citation);

    // Try Crossref if regex didn't work
    const crossrefResult = await tryCrossref(citation, year);
    console.log("crossrefResult", crossrefResult);
    if (crossrefResult) {
      displayPopupInfo(element, crossrefResult);
      return;
    }
    else {
      console.log("no crossref result for ", citation);
    }

  } catch (error) {
    console.error("Error in citation fallback: ", error);
  }
}

async function handleArxivCitation(element, citation) {
  // get the arxiv id
  let arxivId = citation.split("arXiv:")[1].split(" ")[0];
  arxivId = arxivId.split(",")[0];
  arxivId = arxivId.trim();
  console.log("arxivId", arxivId);

  const arxivIDEndpoint = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
  const arxivIDResponse = await fetch(arxivIDEndpoint);
  const xmlText = await arxivIDResponse.text();
  const parser = new DOMParser();
  const xmlResponse = parser.parseFromString(xmlText, "text/xml");

  const entry = xmlResponse.getElementsByTagName("entry")[0];
  if (entry) {
    const displayData = {
      link: entry.getElementsByTagName("id")[0]?.textContent || '#',
      fullTitle: entry.getElementsByTagName("title")[0]?.textContent || 'Unknown Title',
      abstract: entry.getElementsByTagName("summary")[0]?.textContent || 'No abstract available',
      date: entry.getElementsByTagName("published")[0]?.textContent || 'Unknown Date',
      authors: Array.from(entry.getElementsByTagName("author")).map(a => a.children[0].textContent)
    };

    displayPopupInfo(element, displayData);
    return;
  }
}


// Main initialization function
function initializeArxivInfo(pdfDocument) {
  // current implementation calls this upon every viewer render,
  // so turn off callback before adding another one
  $("a").off();

  $("a").on({
    async mouseenter() {
      console.log("this", $(this).attr("href"));

      if ($(this).attr("href").includes("subsection")) {
        return;
      }

      const pdfLink = $(this).attr("href").split("#")[1];

      try {
        const citation = await extractCitationFromPdf(pdfDocument, pdfLink);
        console.log("citation ", citation);

        if (citation) {
          // Special handling for arXiv citations since it has a much better API
          if (citation.includes("arXiv")) {
            handleArxivCitation(this, citation);
          } else {
            handleCitationFallback(this, citation);
          }
          return;
        }

      } catch (error) {
        console.error("Error processing destination: ", error);
      }
      return;

    }
  });
}

export { initializeArxivInfo };
