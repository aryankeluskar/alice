/**
 * Groq API integration for paper analysis
 */

import { fetchWithRetry } from './api.js';
import { renderMarkdown, cleanAIIntroText } from './markdown.js';
import {
  PROMPT_EXTRACT_TITLE,
  PROMPT_LLM_ANALYZE,
  PROMPT_SYSTEM_BASE,
  PROMPT_DIRECT_FALLBACK,
} from '../alice_constants.js';

// Function to call Groq API to extract title
export async function extractTitleWithGroq(pageText) {
  try {
    const response = await fetch("https://api.aryankeluskar.com/api/groq", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: PROMPT_EXTRACT_TITLE(pageText),
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 100,
      }),
    });
    const result = await response.json();
    if (
      result.choices &&
      result.choices[0] &&
      result.choices[0].message
    ) {
      const title = result.choices[0].message.content.trim();
      return title && title !== "NULL" ? title : null;
    }
    return null;
  } catch (error) {
    console.error("Error calling Groq API for title extraction:", error);
    return null;
  }
}

// Function to make the Groq API call
export async function callGroqAPI(arxivText, retryCount = 0) {
  if (retryCount > 2) {
    throw new Error(
      "Failed to generate a proper summary after multiple attempts"
    );
  }

  // Update the LLM Prompt for better differentiation between main points and concise summary
  const llmPrompt = PROMPT_LLM_ANALYZE;

  // Use our proxy API endpoint instead of calling Groq directly
  const groqProxyEndpoint = "https://api.aryankeluskar.com/api/groq";

  // Improved system prompt with clearer differentiation between main points and summary
  let systemPrompt = PROMPT_SYSTEM_BASE({ retryCount });
  
  // After 2 retries, fall back to a direct prompt
  if (retryCount >= 2) {
    console.log("Falling back to direct prompt after multiple retries");

    const directPromptResponse = await fetchWithRetry(
      groqProxyEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: PROMPT_DIRECT_FALLBACK(llmPrompt, arxivText),
            },
          ],
          model: "llama-3.3-70b-versatile",
          temperature: 0.2 + retryCount * 0.1,
          max_tokens: 300,
        }),
      },
      3
    );

    return await directPromptResponse.json();
  }

  const groqResponse = await fetchWithRetry(
    groqProxyEndpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: llmPrompt + arxivText,
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.2 + retryCount * 0.1,
        max_tokens: 300,
        top_p: 0.8,
      }),
    },
    3
  );

  return await groqResponse.json();
}

// Process Groq API response
export async function processGroqResponse(groqResult) {
  if (
    !groqResult.choices ||
    !groqResult.choices[0] ||
    !groqResult.choices[0].message
  ) {
    throw new Error("Unexpected response structure from Groq API");
  }

  console.log(
    "Received response:",
    JSON.stringify(groqResult.choices[0].message)
  );

  const textContent = groqResult.choices[0].message.content || "";
  const cleanedContent = cleanAIIntroText(textContent);

  // Handle response - try to extract main points and concise summary
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

  // Try to split response into two sections if we can identify them
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

