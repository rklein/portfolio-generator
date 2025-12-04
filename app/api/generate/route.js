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
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content: activeSystemPrompt
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })
    });

    const responseText = await response.text();

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      // Response is not JSON (likely HTML error page)
      console.error('Perplexity returned non-JSON:', responseText.substring(0, 200));
      return Response.json({
        error: `Perplexity API returned invalid response. Status: ${response.status}. Check your API key.`
      }, { status: 500 });
    }

    if (!response.ok) {
      return Response.json({
        error: data.error?.message || `Perplexity API error (${response.status})`
      }, { status: response.status });
    }

    if (!data.choices?.[0]?.message?.content) {
      return Response.json({ error: "No content in Perplexity response" }, { status: 500 });
    }

    return Response.json({ content: data.choices[0].message.content });
  } catch (error) {
    console.error('Generate API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
