/**
 * Gemini API integration for paper analysis
 */

import { fetchWithRetry } from './api.js';
import { renderMarkdown, cleanAIIntroText } from './markdown.js';
import {
  PROMPT_EXTRACT_TITLE,
  PROMPT_LLM_ANALYZE,
  PROMPT_SYSTEM_BASE,
  PROMPT_DIRECT_FALLBACK,
} from '../alice_constants.js';

// Function to call Gemini API to extract title
export async function extractTitleWithGemini(pageText) {
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

// Function to make the Gemini API call
export async function callGeminiAPI(arxivText, retryCount = 0) {
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

// Process Gemini API response
export async function processGeminiResponse(geminiResult) {
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
