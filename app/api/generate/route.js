export async function POST(request) {
  const { apiKey, prompt, systemPrompt } = await request.json();

  if (!apiKey || !prompt) {
    return Response.json({ error: "Missing apiKey or prompt" }, { status: 400 });
  }

  // Default system prompt if none provided
  const defaultSystemPrompt = `You are a senior executive search researcher with full web search capabilities.

YOUR CAPABILITIES:
- You CAN and MUST search the web for current information
- You CAN access company websites, LinkedIn, Crunchbase, news sites
- You CAN find real data about companies and people

YOUR RULES:
1. ALWAYS search before claiming data is unavailable
2. NEVER say "I cannot access" or "I don't have access" - you DO have search
3. Provide specific data with sources
4. Use markdown formatting
5. Be specific with names, numbers, and dates
6. If data truly unavailable after searching, explain what you searched`;

  const activeSystemPrompt = systemPrompt || defaultSystemPrompt;

  try {
    // Use Anthropic API with web search tool
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        tools: [
          {
            type: "web_search",
            name: "web_search",
            max_uses: 10
          }
        ],
        system: activeSystemPrompt,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    const responseText = await response.text();

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      // Response is not JSON (likely HTML error page)
      console.error('Anthropic returned non-JSON:', responseText.substring(0, 500));
      return Response.json({
        error: `Anthropic API returned invalid response. Status: ${response.status}. Check your API key.`
      }, { status: 500 });
    }

    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return Response.json({
        error: data.error?.message || `Anthropic API error (${response.status}): ${JSON.stringify(data.error || data)}`
      }, { status: response.status });
    }

    // Extract text content from Claude's response
    // Claude returns an array of content blocks (text, tool_use, tool_result, etc.)
    if (!data.content || !Array.isArray(data.content)) {
      console.error('Unexpected response structure:', data);
      return Response.json({ error: "No content in Anthropic response" }, { status: 500 });
    }

    // Combine all text blocks into a single response
    const textContent = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n');

    if (!textContent) {
      console.error('No text content in response:', data.content);
      return Response.json({ error: "No text content in Anthropic response" }, { status: 500 });
    }

    return Response.json({ content: textContent });
  } catch (error) {
    console.error('Generate API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
