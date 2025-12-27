/**
 * Cached reference handling
 */

export function getCachedReference(linkHref) {
  const cachedFinalRefs = JSON.parse(
    localStorage.getItem("cached_final_refs") || "{}"
  );
  const citationKey = linkHref.split("cite.")[1];

  if (cachedFinalRefs[citationKey]) {
    return { cachedRef: cachedFinalRefs[citationKey], citationKey };
  }

  return { cachedRef: null, citationKey };
}

export function createXMLFromCachedRef(cachedRef) {
  const xmlDoc = document.implementation.createDocument(
    "http://www.w3.org/2005/Atom",
    "entry",
    null
  );
  const entry = xmlDoc.documentElement;
  entry.setAttribute("xmlns", "http://www.w3.org/2005/Atom");

  // Add id element (link)
  const idElement = xmlDoc.createElement("id");
  idElement.textContent = cachedRef.link || "";
  entry.appendChild(idElement);

  // Add title element
  const titleElement = xmlDoc.createElement("title");
  titleElement.textContent = cachedRef.title;
  entry.appendChild(titleElement);

  // Add summary element
  const summaryElement = xmlDoc.createElement("summary");
  summaryElement.textContent = cachedRef.abstract;
  entry.appendChild(summaryElement);

  // Add published element
  const publishedElement = xmlDoc.createElement("published");
  publishedElement.textContent = `${cachedRef.year}-01-01T00:00:00Z`;
  entry.appendChild(publishedElement);

  // Add author elements
  const authors = cachedRef.authors.split(", ");
  authors.forEach(authorName => {
    const authorElement = xmlDoc.createElement("author");
    const nameElement = xmlDoc.createElement("name");
    nameElement.textContent = authorName;
    authorElement.appendChild(nameElement);
    entry.appendChild(authorElement);
  });

  return entry;
}

export function calculatePopupDirection(element, currentScaleFactor) {
  let tipsyDirection;
  try {
    // Get the current scale factor directly rather than parsing the transform
    const zoomMultiplier = currentScaleFactor || 1;

    const leftPixels =
      parseFloat($(element).parent().css("left")) * zoomMultiplier;
    const topPixels =
      parseFloat($(element).parent().css("top")) * zoomMultiplier;
    const width = parseInt($(element).parent().parent().parent().css("width"));
    const height = parseInt(
      $(element).parent().parent().parent().css("height")
    );
    const northSouth = topPixels > height / 2 ? "s" : "n";
    const eastWest = leftPixels > width / 2 ? "e" : "w";
    tipsyDirection = `${northSouth}${eastWest}`;
  } catch (err) {
    console.log(err);
    tipsyDirection = "ne";
  }

  return tipsyDirection;
}
