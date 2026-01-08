import { fetchWithRetry } from './api.js';
import { renderMarkdown, cleanAIIntroText } from './markdown.js';
import {
  PROMPT_EXTRACT_TITLE,
  PROMPT_LLM_ANALYZE,
  PROMPT_SYSTEM_BASE,
  PROMPT_DIRECT_FALLBACK,
} from '../alice_constants.js';
import {
  getGeminiApiKey,
  buildGeminiDirectUrl,
  GEMINI_PROXY_ENDPOINT,
  createRateLimitError,
  createServerError,
} from './api-keys.js';

async function callGeminiEndpoint(requestBody) {
  const userApiKey = await getGeminiApiKey();
  
  let endpoint;
  let headers = { "Content-Type": "application/json" };
  
  if (userApiKey) {
    endpoint = buildGeminiDirectUrl(userApiKey);
    console.log("[Gemini] Using user's API key for direct API call");
  } else {
    endpoint = GEMINI_PROXY_ENDPOINT;
    console.log("[Gemini] Using proxy endpoint (no user API key configured)");
  }
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
  
  if (response.status === 429) {
    throw createRateLimitError('Gemini', 429);
  }
  
  if (response.status >= 500) {
    throw createServerError('Gemini', response.status);
  }
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }
  
  return response.json();
}

export async function extractTitleWithGemini(pageText) {
  try {
    const result = await callGeminiEndpoint({
      contents: [
        {
          parts: [
            {
              text: PROMPT_EXTRACT_TITLE(pageText),
            },
          ],
        },
      ],
    });
    
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
    if (error.isRateLimitError) {
      throw error;
    }
    return null;
  }
}

export async function callGeminiAPI(arxivText, retryCount = 0) {
  if (retryCount > 2) {
    throw new Error(
      "Failed to generate a proper summary after multiple attempts"
    );
  }

  const llmPrompt = PROMPT_LLM_ANALYZE;
  let systemPrompt = PROMPT_SYSTEM_BASE({ retryCount });
  
  if (retryCount >= 2) {
    console.log("Falling back to direct prompt after multiple retries");

    return await callGeminiEndpoint({
      contents: [
        {
          parts: [
            {
              text: PROMPT_DIRECT_FALLBACK(llmPrompt, arxivText),
            },
          ],
        },
      ],
    });
  }

  return await callGeminiEndpoint({
    contents: [
      {
        parts: [{ text: llmPrompt + arxivText }],
      },
    ],
    generationConfig: {
      temperature: 0.2 + retryCount * 0.1,
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
  });
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
