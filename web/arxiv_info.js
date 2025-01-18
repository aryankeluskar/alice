/* eslint-disable no-undef */

function getBibtexReferenceFromInternalLink(link) {
  const chunks = link.split("#");
  console.log("chunks", chunks);
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

function displayArxivInfo(element, { link, fullTitle, abstract, date, authors }) {
  console.log("displaying arxiv info", { link, fullTitle, abstract, date, authors });

  if (abstract === "null") {
    abstract = "No abstract available";
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
    <div class="tipsy tipsy-${tipsyDirection}">
    <div class="tipsy-arrow"></div>
    <div class="tipsy-inner">
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
async function fetchWithRetry(url, options = {}, retries = 6, backoffDelay = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        // Rate limit hit - wait and retry
        await delay(backoffDelay * Math.pow(2, i)); // Exponential backoff
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error; // Throw if last retry
      await delay(backoffDelay * Math.pow(2, i)); // Exponential backoff
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

    // Find text items near the destination coordinates
    const nearbyText = textContent.items.filter(item => {
      const dy = item.transform[5] - y;
      return dy < 0 && dy > -200;
    });

    const textString = nearbyText.map(item => item.str).join(' ');
    const citation = textString.substring(textString.indexOf(']') + 1, textString.indexOf('[', textString.indexOf(']') + 1));
    return citation ? citation.trim() : null;
  }
  return null;
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
      const bibtexRef = getBibtexReferenceFromInternalLink($(this).attr("href"));

      console.log("bibtexRef ", bibtexRef);

      // Try arXiv API if we have a valid bibtex reference
      if (bibtexRef) {
        const parsedInfo = parseBibtexReference(bibtexRef);
        if (!parsedInfo) {
          console.log("no matching entry found on arxiv");
          try {
            const citation = await extractCitationFromPdf(pdfDocument, pdfLink);
            if (citation) {
              console.log("trying the citation fallback with ", citation);
              handleCitationFallback(this, citation);
            }
          } catch (error) {
            console.error("Error processing destination:", error);
          }
          return;
        }

        if (parsedInfo) {
          const { year, author, title } = parsedInfo;

          try {
            const arxivEndpoint = `http://export.arxiv.org/api/query?search_query=ti:${title}+AND+au:${author}&start=0&max_results=50`;
            const response = await fetch(arxivEndpoint);

            if (!response.ok) {
              throw new Error('ArXiv API request failed');
            }

            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlResponse = parser.parseFromString(xmlText, "text/xml");

            let matchingEntry = null;
            for (const entry of xmlResponse.children[0].children) {
              if (entry.nodeName !== "entry") {
                continue;
              }

              if (
                entry.getElementsByTagName("published").length > 0 &&
                entry.getElementsByTagName("published")[0].textContent.includes(year) &&
                entry.getElementsByTagName("author").length > 0 &&
                entry.getElementsByTagName("author")[0].children[0].textContent.toLowerCase().endsWith(author) &&
                entry.getElementsByTagName("title").length > 0 &&
                entry.getElementsByTagName("title")[0].textContent.toLowerCase().startsWith(title)
              ) {
                if (matchingEntry) {
                  displayArxivInfo(this, matchingEntry);
                  return;
                }
                matchingEntry = entry;
              }
            }

            if (!matchingEntry) {
              console.log("no matching entry found on arxiv");
              try {
                const citation = await extractCitationFromPdf(pdfDocument, pdfLink);
                if (citation) {
                  console.log("trying the citation fallback with ", citation);
                  handleCitationFallback(this, citation);
                }
              } catch (error) {
                console.error("Error processing destination:", error);
              }
              return;
            }

            // check if user is still hovering before adding to DOM
            if ($(this).parent().find("a:hover").length === 0) {
              return;
            }

            if (
              !matchingEntry.getElementsByTagName("id").length ||
              !matchingEntry.getElementsByTagName("title").length ||
              !matchingEntry.getElementsByTagName("author").length ||
              !matchingEntry.getElementsByTagName("summary").length ||
              !matchingEntry.getElementsByTagName("published").length
            ) {
              return;
            }

            const displayData = {
              link: matchingEntry.getElementsByTagName("id")[0].textContent,
              fullTitle: matchingEntry.getElementsByTagName("title")[0].textContent,
              abstract: matchingEntry.getElementsByTagName("summary")[0].textContent,
              date: matchingEntry.getElementsByTagName("published")[0].textContent,
              authors: Array.from(matchingEntry.getElementsByTagName("author")).map(a => a.children[0].textContent)
            };

            displayArxivInfo(this, displayData);

          } catch (error) {
            console.error("Error processing arXiv API:", error);
            let citation = null;
            try {
              citation = await extractCitationFromPdf(pdfDocument, pdfLink);
              if (citation) {
                console.log("trying the citation fallback with ", citation);
                handleCitationFallback(this, citation);
              }
            } catch (error) {
              console.error("Error processing destination:", error);
            }
          }
        }
      }

      else {
        let citation = null;
        try {
          citation = await extractCitationFromPdf(pdfDocument, pdfLink);
          if (citation) {
            console.log("trying the citation fallback with ", citation);
            handleCitationFallback(this, citation);
          }
        } catch (error) {
          console.error("Error processing destination:", error);
        }
      }
    }
  });
}

// Helper function to handle citation fallback with Semantic Scholar API
async function handleCitationFallback(element, citation) {
  if (citation.includes("arXiv")) {
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

      displayArxivInfo(element, displayData);
      return;
    }
  }

  const patterns = [
    /(?:[A-Z]\.\s+[A-Za-z]+(?:\s*,\s*[A-Z]\.\s+[A-Za-z]+)*(?:\s*,\s*et\s+al\.)?\s*\.\s*)([^.]+?)(?=\.\s+arXiv|\,\s+arXiv)/,
    /(?:[A-Z]\.\s+[A-Za-z]+(?:\s*,\s*[A-Z]\.\s+[A-Za-z]+)*(?:\s*,\s*et\s+al\.)?\s*\.\s*)([^.]+?)(?=\.\s+In|\,\s+In)/,
    /(?:[A-Z]\.\s+[A-Za-z]+(?:\s*,\s*[A-Z]\.\s+[A-Za-z]+)*(?:\s*,\s*et\s+al\.)?\s*\.\s*)([^.]+?)(?=\.\s+Proceedings|\,\s+Proceedings)/,
    /(?:(?:[A-Z]\.\s*)+[A-Za-z]+(?:\s*,\s*(?:[A-Z]\.\s*)+[A-Za-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+arXiv|\,\s+arXiv)/,
    /(?:(?:[A-Z]\.\s*)+[A-Za-z]+(?:\s*,\s*(?:[A-Z]\.\s*)+[A-Za-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+In\s+[A-Z]|\,\s+In\s+[A-Z])/,
    /(?:(?:[A-Z]\.\s*)+[A-Za-z]+(?:\s*,\s*(?:[A-Z]\.\s*)+[A-Za-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+Proceedings|\,\s+Proceedings)/,
    /(?:(?:[A-Z]\.\s*)+[A-Za-z]+(?:\s*,\s*(?:[A-Z]\.\s*)+[A-Za-z]+)*\s*\.\s*)([^.]+?)(?=\.\s+[A-Z][a-z]+|\,\s+[A-Z][a-z]+)/,
    /(?:(?:[A-Z]\.\s*)+[A-Za-z]+(?:\s*,\s*(?:[A-Z]\.\s*)+[A-Za-z]+)*\s*\.\s*)([^.]+?)(?=\.)/,
    /(?:(?:[A-Z]\.\s*)+[A-Za-z]+(?:\s*,\s*(?:[A-Z]\.\s*)+[A-Za-z]+)*\s*(?:,|,\s+and)\s+(?:[A-Z]\.\s*)+[A-Za-z]+\s*\.\s*)([^.]+?)(?=\.)/,
    /(?:[A-Za-z]+(?:\s+[A-Za-z]+)*(?:,\s*[A-Za-z]+(?:\s+[A-Za-z]+)*)*(?:\s*,\s*and\s+[A-Za-z]+(?:\s+[A-Za-z]+)*)?)\s*\.\s*([^.]+?)(?=,|\.|$)/,
  ];

  try {
    for (const pattern of patterns) {
      const match = citation.match(pattern);
      if (match && match[1]) {
        const paperTitle = match[1].trim();
        if (!paperTitle) continue;

        console.log("Extracted paper title:", paperTitle);
        const apiEndpoint = `https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(paperTitle)}`;
        const apiResponse = await fetchWithRetry(apiEndpoint);
        const apiData = await apiResponse.json();

        if (!apiData.data || !apiData.data[0]) {
          continue;
        }

        const paperId = apiData.data[0].paperId;
        const paperEndpoint = `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=abstract,year,title,openAccessPdf`;
        const paperResponse = await fetchWithRetry(paperEndpoint);
        const paperData = await paperResponse.json();

        const display_info = {
          link: paperData.openAccessPdf?.url || '#',
          fullTitle: paperData.title,
          abstract: paperData.abstract,
          date: paperData.year,
          authors: citation.split(paperData.title)[0]
            .replace(/\.$/, '')
            .split(/,\s*|\sand\s+/)
            .map(author => author.trim())
            .filter(author => author.length > 0)
        };

        displayArxivInfo(element, display_info);
        return;
      }
    }

    console.log("no regex match for ", citation);

  } catch (error) {
    console.error("Error in citation fallback:", error);
  }
}

export { initializeArxivInfo };
