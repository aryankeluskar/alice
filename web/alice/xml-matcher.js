/**
 * XML entry matching logic for arXiv search results
 */

import { getGeminiFallbackReference } from './reference-fallback.js';
import { createAndShowPopup } from './popup.js';
import { fail } from './data-models.js';

export async function findMatchingEntry(
  xmlResponse,
  currentElement,
  paperId,
  linkHref,
  popupId,
  tipsyDirection,
  currentScaleFactor,
  onPopupCreated
) {
  let matchingEntry = null;

  for (const entry of xmlResponse.children[0].children) {
    if (entry.nodeName !== "entry") {
      continue;
    }

    // Use the properties attached to the element
    const isFromTitleExtraction = currentElement.isFromTitleExtraction;
    const title = currentElement.searchTitle;
    const author = currentElement.searchAuthor;
    const year = currentElement.searchYear;

    // If we came from the Gemini title extraction path, be more flexible with matching
    // since we might not have author information
    if (isFromTitleExtraction) {
      matchingEntry = await findBestMatchByTitle(
        xmlResponse,
        title,
        paperId,
        linkHref,
        currentElement,
        popupId,
        tipsyDirection,
        currentScaleFactor,
        onPopupCreated
      );
      break;
    } else if (title && !author) {
      // For the title extraction path, just take the first entry
      // as we've already filtered by title in the API query
      console.log("Using title only (no author), taking first entry");
      matchingEntry = entry;
      break;
    } else {
      // Original matching logic for BibTeX references
      matchingEntry = await matchByBibtex(
        entry,
        title,
        author,
        year,
        matchingEntry,
        paperId,
        linkHref,
        currentElement,
        popupId,
        tipsyDirection,
        currentScaleFactor,
        onPopupCreated
      );
      if (matchingEntry === null) {
        // Error occurred, multiple matches found
        return null;
      }
    }
  }

  return matchingEntry;
}

async function findBestMatchByTitle(
  xmlResponse,
  title,
  paperId,
  linkHref,
  currentElement,
  popupId,
  tipsyDirection,
  currentScaleFactor,
  onPopupCreated
) {
  // For the title extraction path, we need to manually check if the title is a good match
  console.log("Using AI-extracted title, checking for best match");

  // Get all possible entries and score them
  const possibleEntries = [];

  for (const entry of xmlResponse.getElementsByTagName("entry")) {
    if (entry.getElementsByTagName("title").length > 0) {
      const entryTitle =
        entry.getElementsByTagName("title")[0].textContent;

      // Calculate a simple similarity score
      const entryTitleLower = entryTitle.toLowerCase();
      const searchTitleLower = title.toLowerCase();

      // Count how many words from our search title appear in the entry title
      const searchWords = searchTitleLower.split(/\s+/);
      let matchedWords = 0;

      for (const word of searchWords) {
        if (
          word.length > 3 &&
          entryTitleLower.includes(word.toLowerCase())
        ) {
          matchedWords++;
        }
      }

      const score = matchedWords / searchWords.length;
      console.log(`Entry: "${entryTitle}" - Score: ${score}`);

      // Add to possible entries if score is decent
      if (score > 0.3) {
        possibleEntries.push({ entry, score });
      }
    }
  }

  // Sort by score descending
  possibleEntries.sort((a, b) => b.score - a.score);

  // Take the best match if available
  if (possibleEntries.length > 0) {
    console.log(
      `Found best match with score ${possibleEntries[0].score}`
    );
    return possibleEntries[0].entry;
  } else {
    // Try a more lenient approach - take first entry if any exist
    const entries = xmlResponse.getElementsByTagName("entry");
    if (entries.length > 0) {
      console.log(
        "No good matches found, taking first available entry"
      );
      return entries[0];
    }
  }

  return null;
}

async function matchByBibtex(
  entry,
  title,
  author,
  year,
  matchingEntry,
  paperId,
  linkHref,
  currentElement,
  popupId,
  tipsyDirection,
  currentScaleFactor,
  onPopupCreated
) {
  if (
    entry.getElementsByTagName("published").length > 0 &&
    entry
      .getElementsByTagName("published")[0]
      .textContent.includes(year) &&
    entry.getElementsByTagName("author").length > 0 &&
    entry
      .getElementsByTagName("author")[0]
      .children[0].textContent.toLocaleLowerCase()
      .endsWith(author) &&
    entry.getElementsByTagName("title").length > 0 &&
    entry
      .getElementsByTagName("title")[0]
      .textContent.toLocaleLowerCase()
      .startsWith(title)
  ) {
    if (matchingEntry) {
      const result = await getGeminiFallbackReference(
        paperId,
        linkHref,
        currentElement
      );
      if (result) {
        await createAndShowPopup({
          element: currentElement,
          popupId,
          tipsyDirection,
          matchingEntry: result,
          currentScaleFactor,
          onPopupCreated,
        });
      }
      // multiple matches, bibtex is ambiguous
      fail(
        currentElement,
        "Multiple matching entries found for this reference"
      );
      return null;
    }
    matchingEntry = entry;
  }

  return matchingEntry;
}
