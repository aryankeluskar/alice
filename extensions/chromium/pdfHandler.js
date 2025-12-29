/*
Copyright 2012 Mozilla Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/* globals canRequestBody */ // From preserve-referer.js

"use strict";

var VIEWER_URL = chrome.runtime.getURL("content/web/viewer.html");

// Use in-memory storage to ensure that the DNR rules have been registered at
// least once per session. runtime.onInstalled would have been the most fitting
// event to ensure that, except there are cases where it does not fire when
// needed. E.g. in incognito mode: https://issues.chromium.org/issues/41029550
chrome.storage.session.get({ hasPdfRedirector: false }, async items => {
  if (items?.hasPdfRedirector) {
    return;
  }
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  if (rules.length) {
    // Dynamic rules persist across extension updates. We don't expect other
    // dynamic rules, so just remove them all.
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map(r => r.id),
    });
  }
  await registerPdfRedirectRule();

  // Only set the flag in the end, so that we know for sure that all
  // asynchronous initialization logic has run. If not, then we will run the
  // logic again at the next background wakeup.
  chrome.storage.session.set({ hasPdfRedirector: true });
});

/**
 * Registers declarativeNetRequest rules to redirect PDF requests to the viewer.
 * The caller should clear any previously existing dynamic DNR rules.
 *
 * The logic here is the declarative version of the runtime logic in the
 * webRequest.onHeadersReceived implementation at
 * https://github.com/mozilla/pdf.js/blob/0676ea19cf17023ec8c2d6ad69a859c345c01dc1/extensions/chromium/pdfHandler.js#L34-L152
 */
async function registerPdfRedirectRule() {
  // "allow" means to ignore rules (from this extension) with lower priority.
  const ACTION_IGNORE_OTHER_RULES = { type: "allow" };

  // Redirect to viewer. The rule condition is expected to specify regexFilter
  // that matches the full request URL.
  const ACTION_REDIRECT_TO_VIEWER = {
    type: "redirect",
    redirect: {
      // DNR does not support transformations such as encodeURIComponent on the
      // match, so we just concatenate the URL as is without modifications.
      // TODO: use "?file=\\0" when DNR supports transformations as proposed at
      // https://github.com/w3c/webextensions/issues/636#issuecomment-2165978322
      regexSubstitution: VIEWER_URL + "?DNR:\\0",
    },
  };

  // All general PDF redirect rules have been removed to prevent interference
  // with local PDFs and PDFs from other sources.
  // The content script will handle arxiv/biorxiv PDFs directly.
  const addRules = [];
  for (const [i, rule] of addRules.entries()) {
    // id must be unique and at least 1, but i starts at 0. So add +1.
    rule.id = i + 1;
    rule.priority = addRules.length - i;
  }
  try {
    // Note: condition.responseHeaders is only supported in Chrome 128+, but
    // does not trigger errors in Chrome 123 - 127 as explained at:
    // https://github.com/w3c/webextensions/issues/638#issuecomment-2181124486
    // We need to detect this and avoid registering rules, because otherwise all
    // requests are redirected to the viewer instead of just PDF requests,
    // because Chrome accepts rules while ignoring the responseHeaders condition
    // - also reported at https://crbug.com/347186592
    if (!(await isHeaderConditionSupported())) {
      throw new Error("DNR responseHeaders condition is not supported.");
    }
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
  } catch (e) {
    // When we do not register DNR rules for any reason, fall back to catching
    // PDF documents via maybeRenderPdfDoc in contentscript.js.
    console.error("Failed to register rules to redirect PDF requests.");
    console.error(e);
  }
}

// For the source and explanation of this logic, see
// https://github.com/w3c/webextensions/issues/638#issuecomment-2181124486
async function isHeaderConditionSupported() {
  const ruleId = 123456; // Some rule ID that is not already used elsewhere.
  try {
    // Throws synchronously if not supported.
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id: ruleId,
          condition: {
            responseHeaders: [{ header: "whatever" }],
            urlFilter: "|does_not_match_anything",
          },
          action: { type: "block" },
        },
      ],
    });
  } catch {
    return false; // responseHeaders condition not supported.
  }
  // Chrome may recognize the properties but have the implementation behind a
  // flag. When the implementation is disabled, validation is skipped too.
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [
        {
          id: ruleId,
          condition: {
            responseHeaders: [],
            urlFilter: "|does_not_match_anything",
          },
          action: { type: "block" },
        },
      ],
    });
    return false; // Validation skipped = feature disabled.
  } catch {
    return true; // Validation worked = feature enabled.
  } finally {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
    });
  }
}

function getViewerURL(pdf_url) {
  // |pdf_url| may contain a fragment such as "#page=2". That should be passed
  // as a fragment to the viewer, not encoded in pdf_url.
  var hash = "";
  var i = pdf_url.indexOf("#");
  if (i > 0) {
    hash = pdf_url.slice(i);
    pdf_url = pdf_url.slice(0, i);
  }
  return VIEWER_URL + "?file=" + encodeURIComponent(pdf_url) + hash;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.action === "getParentOrigin") {
    // getParentOrigin is used to determine whether it is safe to embed a
    // sensitive (local) file in a frame.
    if (!sender.tab) {
      sendResponse("");
      return undefined;
    }
    // TODO: This should be the URL of the parent frame, not the tab. But
    // chrome-extension:-URLs are not visible in the webNavigation API
    // (https://crbug.com/326768), so the next best thing is using the tab's URL
    // for making security decisions.
    var parentUrl = sender.tab.url;
    if (!parentUrl) {
      sendResponse("");
      return undefined;
    }
    if (parentUrl.lastIndexOf("file:", 0) === 0) {
      sendResponse("file://");
      return undefined;
    }
    // The regexp should always match for valid URLs, but in case it doesn't,
    // just give the full URL (e.g. data URLs).
    var origin = /^[^:]+:\/\/[^/]+/.exec(parentUrl);
    sendResponse(origin ? origin[1] : parentUrl);
    return true;
  }
  if (message && message.action === "isAllowedFileSchemeAccess") {
    chrome.extension.isAllowedFileSchemeAccess(sendResponse);
    return true;
  }
  if (message && message.action === "openExtensionsPageForFileAccess") {
    var url = "chrome://extensions/?id=" + chrome.runtime.id;
    if (message.data.newTab) {
      chrome.tabs.create({
        windowId: sender.tab.windowId,
        index: sender.tab.index + 1,
        url,
        openerTabId: sender.tab.id,
      });
    } else {
      chrome.tabs.update(sender.tab.id, {
        url,
      });
    }
    return undefined;
  }
  if (message && message.action === "canRequestBody") {
    sendResponse(canRequestBody(sender.tab.id, sender.frameId));
    return undefined;
  }
  return undefined;
});
