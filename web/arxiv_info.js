/* eslint-disable no-undef */

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

function initializeArxivInfo(pdfDocument) {
  console.log(pdfDocument);
  // current implementation calls this upon every viewer render,
  // so turn off callback before adding another one
  $("a").off();
  $("a").on({
    mouseenter() {
      function fail(el) {
        // can use this to add an error message to DOM
        // check if user is still hovering before adding to DOM
        // if ($(el).parent().find("a:hover").length === 0) {
        //   return;
        // }
        // $(el).parent().append(`<div class='arxiv_info'>:(</div>`);
      }

      const bibtexRef = getBibtexReferenceFromInternalLink(
        $(this).attr("href")
      );
      if (!bibtexRef) {
        return;
      }

      const parsedInfo = parseBibtexReference(bibtexRef);
      if (!parsedInfo) {
        fail(this);
        return;
      }

      const year = parsedInfo.year;
      const author = parsedInfo.author;
      const title = parsedInfo.title;

      const httpRequest = new XMLHttpRequest();
      if (!httpRequest) {
        fail(this);
        return;
      }
      // search strategy: pull lots of results since the
      // title/author combination might be ambiguous
      const arxivEndpoint = `http://export.arxiv.org/api/query?search_query=ti:${title}+AND+au:${author}&start=0&max_results=50`;
      httpRequest.onloadend = onLoadEnd.bind(this);
      httpRequest.open("GET", arxivEndpoint);
      httpRequest.send();

      function onLoadEnd() {
        if (
          httpRequest.readyState !== XMLHttpRequest.DONE ||
          httpRequest.status !== 200
        ) {
          fail(this);
          return;
        }

        const parser = new DOMParser();
        const xmlResponse = parser.parseFromString(
          httpRequest.response,
          "text/xml"
        );

        let matchingEntry = null;
        for (const entry of xmlResponse.children[0].children) {
          if (entry.nodeName !== "entry") {
            continue;
          }
          // search strategy: filter aggressively (must be published
          // on same year, first author must have given last name,
          // title must have given first word) since we've pulled lots of
          // candidates
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
              // multiple matches, bibtex is ambiguous
              fail(this);
              return;
            }
            matchingEntry = entry;
          }
        }

        if (!matchingEntry) {
          fail(this);
          return;
        }

        // check if user is still hovering before adding to DOM
        if ($(this).parent().find("a:hover").length === 0) {
          return;
        }
        if (
          matchingEntry.getElementsByTagName("id").length === 0 ||
          matchingEntry.getElementsByTagName("title").length === 0 ||
          matchingEntry.getElementsByTagName("author").length === 0 ||
          matchingEntry.getElementsByTagName("summary").length === 0 ||
          matchingEntry.getElementsByTagName("published").length === 0
        ) {
          fail(this);
          return;
        }
        const link = matchingEntry.getElementsByTagName("id")[0].textContent,
          fullTitle =
            matchingEntry.getElementsByTagName("title")[0].textContent,
          abstract =
            matchingEntry.getElementsByTagName("summary")[0].textContent,
          date = matchingEntry.getElementsByTagName("published")[0].textContent,
          authors = Array.from(
            matchingEntry.getElementsByTagName("author")
          ).map(a => a.children[0].textContent);
        const dateStringOptions = {
          year: "numeric",
          month: "short",
          day: "numeric",
        };
        const dateString = new Intl.DateTimeFormat(
          "en-US",
          dateStringOptions
        ).format(new Date(date));
        // get location relative to page for nicer display
        let tipsyDirection;
        try {
          const zoomMultiplier = parseFloat(
            $(this).parent().css("transform").substr(7)
          );
          const leftPixels =
            parseFloat($(this).parent().css("left")) * zoomMultiplier;
          const topPixels =
            parseFloat($(this).parent().css("top")) * zoomMultiplier;
          const width = parseInt(
            $(this).parent().parent().parent().css("width")
          );
          const height = parseInt(
            $(this).parent().parent().parent().css("height")
          );
          console.log(leftPixels, topPixels, width, height);
          const northSouth = topPixels > height / 2 ? "s" : "n";
          const eastWest = leftPixels > width / 2 ? "e" : "w";
          tipsyDirection = `${northSouth}${eastWest}`;
        } catch (err) {
          console.log(err);
          tipsyDirection = "sw";
        }
        // eslint-disable-next-line no-unsanitized/method
        const htmlString = `
          <div class="tipsy tipsy-${tipsyDirection}">
          <div class="tipsy-arrow"></div>
          <div class="tipsy-inner">
          <div class="arxiv_info_title">
            ${fullTitle}
            <a href="${link}" title="arXiv link" target="_blank"> <img src = "images/link-icon.svg" alt="Link Icon" width="12" height="12"/></a>
          </div>
          <div class="arxiv_info_author">
            ${authors.join(", ")}
          </div>
          <div class="arxiv_info_date">
            Published on ${dateString}.
          </div>
          <div class="arxiv_info_abstract">
            ${abstract}
          </div>
          </div>
          </div>`;
        $(this).parent().append(htmlString);
        $(".tipsy").on({
          mouseleave() {
            $(".tipsy").remove();
          },
        });
      }
    },
  });
}

export { initializeArxivInfo };
