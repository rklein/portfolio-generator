"use client";
import { useState } from "react";

const ALL_SECTIONS = [
  // Research sections first
  { id: "foundersStory", label: "Founders Story & Origin", type: "simple" },
  { id: "fundingHistory", label: "Funding History", type: "complex" },
  { id: "executiveSummary", label: "Executive Summary & The Moment", type: "simple" },
  { id: "topPriorities", label: "Top 3 Role Priorities", type: "simple" },
  { id: "leadershipTeam", label: "Leadership Team", type: "complex" },
  { id: "boardMembers", label: "Board of Directors", type: "complex" },
  { id: "salesLeadership", label: "Sales Leadership", type: "complex" },
  { id: "companyMetrics", label: "Company Metrics", type: "complex" },
  { id: "searchRequirements", label: "Search Requirements", type: "simple" },
  { id: "competitiveLandscape", label: "Competitive Landscape", type: "complex" },
  { id: "newsMedia", label: "News & Media", type: "complex" },
  { id: "cultureEnvironment", label: "Culture & Work Environment", type: "complex" },
  { id: "contradictions", label: "🚨 Contradictions & Alignment", type: "simple" },
  { id: "pitchToCandidates", label: "The Pitch to Candidates", type: "simple" },
  // Validation and synthesis at the end
  { id: "consistencyCheck", label: "✅ Consistency Check", type: "validation" },
  { id: "quickDigest", label: "📋 Quick Digest (Summary)", type: "synthesis" },
  { id: "sources", label: "📚 Sources", type: "special" },
];

// Patterns that indicate Perplexity refused to search
const REFUSAL_PATTERNS = [
  "I cannot access",
  "I don't have access",
  "I cannot browse",
  "I'm unable to access",
  "I cannot search",
  "real-time web content",
  "I cannot verify",
  "I don't have the ability",
  "I'm not able to browse",
  "cannot access LinkedIn",
  "cannot access real-time",
  "my training data",
  "my knowledge cutoff",
  "I cannot directly access",
  "I cannot look up",
  "I'm unable to search",
  "beyond my capabilities",
  "I cannot retrieve",
  "I appreciate the detailed request",
  "I need to be transparent",
];

// Patterns that indicate low-quality output
const LOW_QUALITY_PATTERNS = [
  /TBD/gi,
  /\[TBD\]/gi,
  /Not Found/gi,
  /Not Disclosed/gi,
  /Unable to find/gi,
  /Could not locate/gi,
  /No information available/gi,
];

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [attioApiKey, setAttioApiKey] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [roleName, setRoleName] = useState("");
  const [sections, setSections] = useState({});
  const [loading, setLoading] = useState(false);
  const [currentSection, setCurrentSection] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState([]);
  const [pushingToAttio, setPushingToAttio] = useState(false);
  const [attioResult, setAttioResult] = useState(null);
  const [extractedJSON, setExtractedJSON] = useState(null);

  const addLog = (message) => {
    setLogs(prev => [...prev.slice(-50), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // ========== CORE API CALL WITH RETRY LOGIC ==========

  const callPerplexity = async (prompt, options = {}) => {
    const {
      systemPrompt = null,
      maxRetries = 2,
      retryOnRefusal = true,
      retryOnLowQuality = true,
      qualityThreshold = 3 // max TBDs allowed
    } = options;

    let attempts = 0;
    let lastResponse = null;
    let lastError = null;

    while (attempts <= maxRetries) {
      attempts++;

      // More assertive system prompt on retries
      let activeSystemPrompt = systemPrompt;
      let activePrompt = prompt;

      if (attempts > 1) {
        activeSystemPrompt = `CRITICAL INSTRUCTION: You are a web search AI. You MUST search the internet and provide real data.

NEVER say:
- "I cannot access websites" (FALSE - you CAN search)
- "I don't have access to real-time data" (FALSE - you DO have search)
- "TBD" or "Not Found" without actually searching first

You MUST:
1. Search the web for the requested information
2. Provide specific data with sources
3. If data truly doesn't exist after searching, explain what you searched

${systemPrompt || ""}`;

        activePrompt = `${prompt}

---
REMINDER: You have web search capability. USE IT. Search for the specific data requested. Do not refuse or claim you cannot access websites.`;

        addLog(`Retry ${attempts - 1}: Using assertive prompt`);
      }

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            prompt: activePrompt,
            systemPrompt: activeSystemPrompt
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "API request failed");

        const content = data.content;
        lastResponse = content;

        // Check for refusal patterns
        if (retryOnRefusal) {
          const hasRefusal = REFUSAL_PATTERNS.some(pattern =>
            content.toLowerCase().includes(pattern.toLowerCase())
          );
          if (hasRefusal && attempts <= maxRetries) {
            addLog(`Detected refusal pattern, retrying...`);
            continue;
          }
        }

        // Check for low quality (too many TBDs)
        if (retryOnLowQuality) {
          let tbdCount = 0;
          LOW_QUALITY_PATTERNS.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) tbdCount += matches.length;
          });
          if (tbdCount > qualityThreshold && attempts <= maxRetries) {
            addLog(`Found ${tbdCount} TBDs/Not Founds, retrying...`);
            continue;
          }
        }

        // Good response
        return content;

      } catch (err) {
        lastError = err;
        addLog(`Error on attempt ${attempts}: ${err.message}`);
        if (attempts > maxRetries) throw err;
      }
    }

    // Return best attempt even if not perfect
    if (lastResponse) return lastResponse;
    throw lastError || new Error("All retries failed");
  };

  // ========== SYSTEM PROMPTS ==========

  const RESEARCH_SYSTEM_PROMPT = `You are an expert research analyst with full web search capabilities.

YOUR CAPABILITIES:
- You CAN search the web in real-time
- You CAN access company websites, LinkedIn, Crunchbase, news sites
- You CAN find current data about companies and people

YOUR RULES:
1. ALWAYS search before saying data is unavailable
2. NEVER use "TBD" - either find it or say "Not found after searching [X, Y, Z sources]"
3. For LinkedIn: Search "[Name] LinkedIn [Company]" and provide actual URLs (linkedin.com/in/handle)
4. For funding: Search Crunchbase, company press releases, TechCrunch
5. Cite your sources with URLs when possible
6. If data conflicts, note both values and sources

CRITICAL - COMPANY DISAMBIGUATION:
When researching a company, ALWAYS verify you are looking at the correct company by checking their website URL. Many company names are common (e.g., "Jellyfish", "Ramp", "Scale"). Use the company URL provided in the query to ensure you're researching the right company, not a different company with the same name.

You are being paid to find this data. Do the work.`;

  // ========== SIMPLE SECTION PROMPTS ==========

  const getSimplePrompt = (sectionId) => {
    const prompts = {
      foundersStory: `Who are the founders of ${companyName} (${companyUrl}) and what's their background?

For each founder, I want to know:
- Their name and title
- Their LinkedIn profile URL
- Their education background
- Their career history before ${companyName} (previous companies and roles)
- Any notable achievements (exits, patents, awards)

Also tell me the origin story:
- What problem did they personally experience that led to starting this company?
- How and when did they start ${companyName}?
- What was their key insight or "aha moment"?
- Why are these founders uniquely qualified to solve this problem?

Finally, list any founder interviews, podcasts, or talks you can find with URLs.`,

      executiveSummary: `${companyName} (${companyUrl}) is hiring a ${roleName}. Help me understand why.

First, tell me where ${companyName} is right now:
- What's their current stage (funding raised, team size, customer base)?
- What recently happened (funding round, product launch, milestone)?
- Where are they headed?

Second, why does this ${roleName} role exist now?
- What triggered this hire?
- What gap will this person fill?
- Who will they report to?

Third, explain the timing - why is this role critical right now? Consider:
- How does recent funding enable this hire?
- What market or competitive pressure makes this urgent?
- What stage of growth demands this role?
- What customer needs are driving this?`,

      topPriorities: `Based on your research about ${companyName} (${companyUrl}), what should be the top 3 priorities for their new ${roleName} in the first 18-24 months?

For each priority, explain:
- What specifically needs to be accomplished (measurable outcome)
- Why this is critical for ${companyName} right now
- How success would be measured
- What resources or team would be needed

Make these specific to ${companyName}'s actual situation - not generic priorities that would apply to any company.`,

      searchRequirements: `What should ${companyName} (${companyUrl}) look for in their ${roleName} hire?

Based on their stage, industry, and situation, list:

1. Must-have requirements (8 items) - what skills, experiences, and backgrounds are essential? For each one, explain why it matters specifically for ${companyName}.

2. Nice-to-have requirements (5 items) - what would be bonus qualifications?

3. Target companies to source candidates from (8-10 companies) - which companies have people with relevant experience? Include competitors, companies at similar stage, portfolio companies of their investors, and companies in adjacent markets. For each, explain why they'd be a good source.`,

      contradictions: `Research ${companyName} (${companyUrl}) and identify potential strategic tensions a ${roleName} would need to navigate.

First, give me context on their investors - who are the lead investors, who's on the board, and what's known about the company's valuation expectations?

Then identify strategic tensions between what founders typically prioritize vs what investors expect. Consider areas like:
- Growth vs profitability
- Product investment vs sales investment
- Mid-market vs enterprise focus
- US vs international expansion
- Build vs buy/partner decisions

For each tension you identify, explain how a ${roleName} would need to navigate it.

Finally, suggest 3 specific questions a candidate should ask in interviews to understand how aligned the company is on these tensions.

Base this on actual research about ${companyName} and their investors, not generic advice.`,

      pitchToCandidates: `Write a compelling pitch to attract top candidates for the ${roleName} role at ${companyName} (${companyUrl}).

Cover these points:

1. The Opportunity - Why is ${companyName} exciting? Include specific proof points like funding raised, growth rate, notable customers, and market size.

2. The Mission - What will this person actually own? Be specific about scope, team size, budget authority, and key relationships.

3. Why Now - Why is this THE moment to join? What window is opening? What just happened that makes timing critical?

4. The Upside - What does success look like? Career trajectory, equity potential, impact on the industry.

Make it compelling and specific to ${companyName} - this should excite a top candidate.`,
    };
    return prompts[sectionId];
  };

  // ========== COMPLEX MULTI-QUERY SECTIONS ==========

  const generateFundingHistory = async () => {
    setCurrentStep("Searching Crunchbase & press releases...");
    addLog("Researching funding history");

    const fundingData = await callPerplexity(`What is the complete funding history for ${companyName} (${companyUrl})?

Search Crunchbase, PitchBook, and press releases.

For each funding round, tell me:
- Round type (Pre-Seed, Seed, Series A, B, C, etc.)
- Amount raised
- Date
- Lead investor(s)
- Other participating investors
- Source URL where you found this

List rounds in chronological order. At the end, summarize the total amount raised, the latest round details, and the latest known valuation if available.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 2
    });

    return fundingData;
  };

  const generateLeadershipTeam = async () => {
    // Step 1: Get list of executives
    setCurrentStep("Finding executives on LinkedIn...");
    addLog("Searching for executive team");

    const execList = await callPerplexity(`Who are the current executives at ${companyName} (${companyUrl})?

Search their company website, LinkedIn company page, and Crunchbase.

List all C-level and VP-level executives with:
- Their full name
- Their title
- Their LinkedIn profile URL (search for each person to find the actual URL)

Include roles like CEO, CTO, CFO, COO, CPO, CMO, CRO, VP Engineering, VP Sales, VP Marketing, VP Product, etc.

Only include people who currently work there.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 4
    });

    // Step 2: Get backgrounds for key execs
    setCurrentStep("Researching executive backgrounds...");
    addLog("Getting executive career histories");

    const execDetails = await callPerplexity(`Research the career backgrounds for the key executives at ${companyName} (${companyUrl}).

Here are the executives I found:
${execList}

For the 5 most senior executives, tell me about each person:
- What is their current role at ${companyName}?
- What was their most recent role before joining?
- What are 2-3 notable earlier career positions?
- Where did they go to school?
- Any notable achievements, exits, or board seats?

Search their LinkedIn profiles and press mentions. Make sure you're researching people who work at ${companyUrl}, not a different company with a similar name.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 3
    });

    return `## Executive Team\n\n${execList}\n\n## Key Executive Backgrounds\n\n${execDetails}`;
  };

  const generateBoardMembers = async () => {
    setCurrentStep("Finding board members from funding announcements...");
    addLog("Searching for board members");

    const boardData = await callPerplexity(`Who are the board members and board observers at ${companyName} (${companyUrl})?

IMPORTANT: I'm asking about the company at ${companyUrl}, not any other company with a similar name.

Search their Crunchbase page, funding announcements, and company website at ${companyUrl}.

For each board member, tell me:
- Their name and role (Board Member, Board Observer, Chairman, etc.)
- Their affiliation (the company/VC firm they represent, or "Founder" or "Independent")
- When they likely joined (which funding round or year)
- Their LinkedIn URL if you can find it
- A brief background (1-2 sentences about their experience)

Include founders who sit on the board, investor board members from VCs, and any independent board members.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 3
    });

    return boardData;
  };

  const generateSalesLeadership = async () => {
    setCurrentStep("Finding sales leadership...");
    addLog("Searching for CRO, VP Sales, Head of Sales");

    const salesData = await callPerplexity(`Who leads sales at ${companyName} (${companyUrl})?

Search LinkedIn, company website, and press releases.

I want to know:

**Sales Leadership:**
- CRO (Chief Revenue Officer) - name, LinkedIn URL, background
- VP Sales / Head of Sales - name, LinkedIn URL, background
- Any other sales leadership (VP Enterprise, VP Commercial, etc.)

**Sales Team Details:**
- Approximate sales team size (search LinkedIn for sales roles at ${companyName})
- Recent sales leadership hires or departures in last 12 months
- Sales methodology if mentioned (MEDDIC, Challenger, etc.)

**GTM Structure:**
- Is sales direct, channel, PLG, or hybrid?
- Do they have SDRs/BDRs? How many approximately?
- Any sales offices outside HQ?

If no dedicated sales leadership exists (common for PLG companies), note that and explain their GTM approach.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 3
    });

    return salesData;
  };

  const generateCultureEnvironment = async () => {
    setCurrentStep("Researching company culture...");
    addLog("Searching Glassdoor, company pages, interviews");

    const cultureData = await callPerplexity(`Research the company culture and work environment at ${companyName} (${companyUrl}).

Search Glassdoor, company website, LinkedIn, and founder interviews.

**Work Policy:**
- Is the company Remote, Hybrid, or In-Office? Be specific.
- What are the office locations (if any)?
- Any work-from-anywhere policies?

**Glassdoor & Employee Reviews:**
- Glassdoor overall rating (X.X out of 5)
- Number of reviews
- CEO approval rating if available
- Top pros mentioned by employees
- Top cons mentioned by employees
- "Recommend to a friend" percentage if available

**Compensation Insights:**
- Any salary data from Glassdoor or Levels.fyi for similar roles
- Known benefits (equity, 401k, health, perks)
- Compensation philosophy if publicly stated

**Company Culture:**
- Core values (from website or careers page)
- Notable culture traits mentioned in interviews
- Team size and growth trajectory
- Any notable cultural initiatives (DEI, remote-first, etc.)

**Engineering/Product Culture (if technical company):**
- Tech stack
- Engineering blog or open source contributions
- How product decisions are made

Cite your sources with URLs.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 3
    });

    return cultureData;
  };

  const generateCompanyMetrics = async () => {
    setCurrentStep("Gathering company metrics from multiple sources...");
    addLog("Researching company metrics");

    const metrics = await callPerplexity(`Research verified metrics for ${companyName} (${companyUrl}).

Search LinkedIn, Crunchbase, company website, and press releases.

**Company Metrics:**

| Metric | Value | Source |
|--------|-------|--------|
| Legal Name | [Full legal name] | [Website/Crunchbase] |
| Founded | [Year] | [Source] |
| Headquarters | [Full address or City, State] | [Source] |
| Other Offices | [List cities] | [Source] |
| Employee Count | [Number] | LinkedIn Company Page |
| Employee Growth | [% in last year, if available] | LinkedIn |
| Total Funding | [$X] | Crunchbase |
| Latest Round | [Type - $Amount - Date] | [Source] |
| Post-Money Valuation | [$X or "Not disclosed"] | [Source] |
| Revenue/ARR | [$X or "Private - not disclosed"] | [Source] |
| Key Customers | [Named customers] | [Website/Press] |
| TAM (Total Addressable Market) | [$X billion] | [Industry reports, analyst estimates] |

**All Investors:**
| Investor | Round(s) Participated | Board Seat? |
|----------|----------------------|-------------|
| [Investor 1] | Seed, Series A | Yes |
| [Investor 2] | Series A | No |
| [Continue...] | | |

**Key Integrations/Partners:**
- [Partner 1]: [Type of partnership]
- [Partner 2]: [Type of partnership]

Verify each data point. Include sources.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 2
    });

    return metrics;
  };

  // Dedicated JSON extraction - separate from research for reliability
  const extractStructuredJSON = async (metricsContent, competitorsContent) => {
    setCurrentStep("Extracting structured data...");
    addLog("Extracting JSON metrics");

    const jsonResponse = await callPerplexity(`Based on the research below, extract ONLY a JSON object. Do not include any other text.

---
COMPANY METRICS RESEARCH:
${metricsContent.substring(0, 3000)}

COMPETITORS RESEARCH:
${competitorsContent?.substring(0, 1000) || 'Not available'}
---

Return ONLY valid JSON in this exact format (no markdown, no explanation, just the JSON):
{
  "employee_count": <number or null>,
  "founded_year": <number or null>,
  "headquarters": "<City, State/Country>" or null,
  "total_funding_millions": <number or null>,
  "valuation_millions": <number or null>,
  "funding_stage": "<Seed|Series A|Series B|etc>" or null,
  "tam_billions": <number or null>,
  "top_competitors": ["Company1", "Company2", "Company3"]
}

Rules:
- Numbers only (no $ or M/B suffixes)
- total_funding_millions: convert to millions (e.g., $43M = 43, $1.2B = 1200)
- tam_billions: convert to billions (e.g., $50B = 50)
- headquarters: "City, State" or "City, Country" format only
- top_competitors: array of 3-5 direct competitor names
- Use null for unknown values, not strings like "Unknown"`, {
      systemPrompt: `You are a JSON extraction assistant. Return ONLY valid JSON, nothing else. No markdown code blocks, no explanations, just the raw JSON object.`,
      maxRetries: 1,
      retryOnRefusal: false,
      retryOnLowQuality: false
    });

    // Parse the JSON response
    try {
      // Try to extract JSON from the response (handle if wrapped in markdown)
      let jsonStr = jsonResponse.trim();

      // Remove markdown code blocks if present
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      // Remove any leading/trailing non-JSON content
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }

      const parsed = JSON.parse(jsonStr);
      console.log('Successfully extracted structured JSON:', parsed);
      return parsed;
    } catch (e) {
      console.error('Failed to parse extracted JSON:', e, jsonResponse.substring(0, 200));
      return null;
    }
  };

  const generateCompetitiveLandscape = async () => {
    // Step 1: Identify competitors
    setCurrentStep("Identifying competitors...");
    addLog("Finding competitors");

    const competitorList = await callPerplexity(`Identify 15 competitors to ${companyName} (${companyUrl}).

Search for companies in the same market, mentioned as alternatives, or in analyst comparisons.

**Direct Competitors** (same core product/market) - 6 companies:
1. [Company] - [1 sentence on what they do]
2. [Company] - [1 sentence]
3. [Company] - [1 sentence]
4. [Company] - [1 sentence]
5. [Company] - [1 sentence]
6. [Company] - [1 sentence]

**Adjacent Players** (related space, could expand) - 4 companies:
1. [Company] - [1 sentence on overlap]
2. [Company] - [1 sentence]
3. [Company] - [1 sentence]
4. [Company] - [1 sentence]

**Incumbents** (legacy players being disrupted) - 3 companies:
1. [Company] - [1 sentence]
2. [Company] - [1 sentence]
3. [Company] - [1 sentence]

**Emerging Threats** (newer startups) - 2 companies:
1. [Company] - [1 sentence]
2. [Company] - [1 sentence]`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 1
    });

    // Step 2: Get details on competitors
    setCurrentStep("Researching competitor metrics...");
    addLog("Getting competitor details");

    const competitorDetails = await callPerplexity(`Research detailed metrics for ${companyName}'s top 10 competitors.

Competitors:
${competitorList}

For each of the top 10 competitors, search LinkedIn for employees and Crunchbase for funding:

| Company | Type | HQ | Employees | Total Funding | Latest Round | Key Differentiator |
|---------|------|----|-----------| --------------|--------------|-------------------|
| [Company 1] | Direct | [City, Country] | [# from LinkedIn] | [$X] | [Type, $, Date] | [vs ${companyName}] |
| [Company 2] | Direct | [City] | [#] | [$X] | [Type, $, Date] | [Differentiator] |
| [Company 3] | Direct | [City] | [#] | [$X] | [Type, $, Date] | [Differentiator] |
| [Company 4] | Direct | [City] | [#] | [$X] | [Type, $, Date] | [Differentiator] |
| [Company 5] | Direct | [City] | [#] | [$X] | [Type, $, Date] | [Differentiator] |
| [Company 6] | Adjacent | [City] | [#] | [$X] | [Type, $, Date] | [Differentiator] |
| [Company 7] | Adjacent | [City] | [#] | [$X] | [Type, $, Date] | [Differentiator] |
| [Company 8] | Incumbent | [City] | [#] | Public | N/A | [Differentiator] |
| [Company 9] | Incumbent | [City] | [#] | Public | N/A | [Differentiator] |
| [Company 10] | Emerging | [City] | [#] | [$X] | [Type, $, Date] | [Differentiator] |

For public companies, write "Public" for funding.
Search each company on LinkedIn and Crunchbase separately.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 4
    });

    return `## Competitor Categories\n\n${competitorList}\n\n## Detailed Comparison\n\n${competitorDetails}`;
  };

  const generateNewsMedia = async () => {
    setCurrentStep("Finding press coverage...");
    addLog("Searching news articles");

    const news = await callPerplexity(`What are the recent news articles and press coverage about ${companyName} (${companyUrl})?

Search for articles from the past 18 months on TechCrunch, VentureBeat, Forbes, Bloomberg, and industry publications.

I'm looking for:
- Funding announcements
- Product launches or major feature releases
- Company milestones or executive hires
- Founder interviews or podcast appearances
- Notable blog posts from the company

For each article, include the headline, publication name, date, and the URL to the article.

List 10-15 articles total, with the most recent and significant ones first.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 2
    });

    return news;
  };

  // ========== QUALITY CHECK WITH GAP FILLING ==========

  // ========== CONSISTENCY CHECK (NO HALLUCINATED SEARCHES) ==========

  const runConsistencyCheck = async (allSections) => {
    setCurrentStep("Checking data consistency...");
    addLog("Running consistency check");

    const sectionText = Object.entries(allSections)
      .filter(([key]) => key !== 'consistencyCheck' && key !== 'quickDigest' && key !== 'sources')
      .map(([key, value]) => `### ${key}\n${value?.substring(0, 1200)}`)
      .join('\n\n');

    const consistency = await callPerplexity(`You are a fact-checker reviewing research about ${companyName}.

IMPORTANT: Do NOT search the web. Only analyze the text provided below for internal contradictions.

---
RESEARCH TO CHECK:
${sectionText}
---

Check for these specific issues:

**1. Conflicting Dates:**
- Is the founding year consistent across all sections?
- Are funding round dates in chronological order (Seed → A → B → C)?
- Do any dates conflict?

**2. Conflicting Numbers:**
- Employee counts: Are they consistent or do different sections say different numbers?
- Funding amounts: Do the individual rounds add up to the stated total?
- Valuation: Is it stated consistently?

**3. Conflicting Names/Titles:**
- Are executives listed with the same titles everywhere?
- Are investor names spelled consistently?

**4. Missing vs Stated:**
- Does one section say "Not found" for something another section has?

**OUTPUT FORMAT:**

## Contradictions Found

| Data Point | Section 1 Says | Section 2 Says | Which is Correct |
|------------|----------------|----------------|------------------|
| [e.g., Founded] | [2021] | [2023] | [Pick the one with better sourcing] |

If no contradictions: Write "✅ No contradictions found - data is internally consistent."

## Data Quality Summary

- **Founding Year:** [Value or "Not found"]
- **Headquarters:** [Value or "Not found"]
- **Total Funding:** [Value or "Not found"]
- **Latest Round:** [Value or "Not found"]
- **Employee Count:** [Value or "Not found"]
- **Valuation:** [Value or "Not found"]

## Gaps Identified (for manual follow-up)

List any important data marked as TBD/Not Found that should be findable:
- [Item 1]
- [Item 2]`, {
      systemPrompt: "You are a fact-checker. Analyze ONLY the text provided. Do NOT search the web. Do NOT attempt to call functions. Just identify contradictions in the existing research.",
      maxRetries: 1,
      retryOnRefusal: false,
      retryOnLowQuality: false
    });

    return consistency;
  };

  // ========== QUICK DIGEST SYNTHESIS ==========

  const generateQuickDigest = async (allSections) => {
    setCurrentStep("Synthesizing Quick Digest from research...");
    addLog("Creating Quick Digest synthesis");

    // Pass FULL sections (not truncated) for better extraction
    const digest = await callPerplexity(`You are a synthesis assistant. Your job is to EXTRACT and ORGANIZE data that already exists in the research below.

CRITICAL RULES:
1. Do NOT search the web
2. Do NOT say "not specified in search results" - the data IS in the research below
3. EXTRACT values directly from the sections provided
4. If a value truly isn't in any section, write "Not in research"

---
FUNDING HISTORY SECTION:
${allSections.fundingHistory || "Section not available"}

---
COMPANY METRICS SECTION:
${allSections.companyMetrics || "Section not available"}

---
LEADERSHIP TEAM SECTION:
${allSections.leadershipTeam || "Section not available"}

---
BOARD OF DIRECTORS SECTION:
${allSections.boardMembers || "Section not available"}

---
FOUNDERS STORY SECTION:
${allSections.foundersStory || "Section not available"}

---
COMPETITIVE LANDSCAPE SECTION (excerpt):
${allSections.competitiveLandscape?.substring(0, 800) || "Section not available"}

---
NEWS & MEDIA SECTION (excerpt):
${allSections.newsMedia?.substring(0, 600) || "Section not available"}

---
CONSISTENCY CHECK:
${allSections.consistencyCheck || "Section not available"}

---

NOW CREATE THIS OUTPUT by extracting from the sections above:

## Company Overview

[Write 3-4 sentences about what ${companyName} does. Extract from Founders Story and Company Metrics sections.]

## Key Facts

| Attribute | Value |
|-----------|-------|
| Founded | [EXTRACT from Company Metrics or Founders Story - look for "Founded" or year] |
| Headquarters | [EXTRACT from Company Metrics - look for "Headquarters" or "HQ"] |
| Employees | [EXTRACT from Company Metrics - look for "Employee" count] |
| Total Funding | [EXTRACT from Funding History - look for "Total" or sum the rounds] |
| Latest Round | [EXTRACT from Funding History - the most recent round with amount and date] |
| Valuation | [EXTRACT from Company Metrics or Funding History] |
| Key Investors | [EXTRACT from Funding History or Board - list top 3-4] |

## Leadership

[EXTRACT from Leadership Team section - list CEO and 2-3 other key executives with titles]

## Products/Services

[EXTRACT from Founders Story or Company Metrics - what does the company sell?]

## Target Customers

[EXTRACT from any section - who are their customers?]

## Key Differentiators

[EXTRACT from Competitive Landscape - what makes them unique?]

## Recent Highlights

[EXTRACT from News & Media - list 3 recent developments]

REMEMBER: All this data IS in the sections above. Extract it, don't search for it.`, {
      systemPrompt: "You are a data extraction assistant. Your ONLY job is to find and organize data that exists in the provided text. Never search the web. Never say data is unavailable if it appears anywhere in the provided sections. Read carefully and extract.",
      maxRetries: 1,
      retryOnRefusal: false,
      retryOnLowQuality: false
    });

    return digest;
  };

  const generateSources = async (allSections) => {
    setCurrentStep("Compiling all sources...");
    addLog("Generating source list");

    const sources = await callPerplexity(`Compile a comprehensive source list for ${companyName} (${companyUrl}) research.

**Primary Sources:**
- Company Website: ${companyUrl}
- LinkedIn Company Page: [Find and provide actual URL]
- Crunchbase: [Find and provide actual URL]
- Company Blog: [Find and provide actual URL if exists]

**Funding Sources:**
- [List each funding announcement article with URL]

**News Coverage:**
- [List each news article with URL]

**People Profiles:**
- [List LinkedIn URLs for executives and board researched]

**Data Sources:**
- [List Crunchbase, LinkedIn, etc. pages used]

Provide 15+ sources with actual, verified URLs.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 2
    });

    return sources;
  };

  // ========== MAIN GENERATE FUNCTION ==========

  const handleGenerate = async () => {
    if (!apiKey) {
      setError("Please enter your Perplexity API key");
      return;
    }
    if (!companyName || !companyUrl || !roleName) {
      setError("Please fill in all company fields");
      return;
    }

    setError("");
    setLoading(true);
    setSections({});
    setLogs([]);
    addLog("Starting portfolio generation v3.2");

    const newSections = {};

    try {
      // Phase 1: Simple research sections (excluding quickDigest which is now synthesis)
      const simpleSections = ALL_SECTIONS.filter(s => s.type === 'simple');
      for (const section of simpleSections) {
        setCurrentSection(section.label);
        setCurrentStep("Researching...");
        addLog(`Generating: ${section.label}`);

        const content = await callPerplexity(getSimplePrompt(section.id), {
          systemPrompt: RESEARCH_SYSTEM_PROMPT,
          qualityThreshold: 3
        });
        newSections[section.id] = content;
        setSections(prev => ({ ...prev, [section.id]: content }));
      }

      // Phase 2: Complex sections (multi-query)
      setCurrentSection("Funding History");
      addLog("Starting complex sections (multi-query)");
      newSections.fundingHistory = await generateFundingHistory();
      setSections(prev => ({ ...prev, fundingHistory: newSections.fundingHistory }));

      setCurrentSection("Leadership Team");
      newSections.leadershipTeam = await generateLeadershipTeam();
      setSections(prev => ({ ...prev, leadershipTeam: newSections.leadershipTeam }));

      setCurrentSection("Board of Directors");
      newSections.boardMembers = await generateBoardMembers();
      setSections(prev => ({ ...prev, boardMembers: newSections.boardMembers }));

      setCurrentSection("Sales Leadership");
      newSections.salesLeadership = await generateSalesLeadership();
      setSections(prev => ({ ...prev, salesLeadership: newSections.salesLeadership }));

      setCurrentSection("Company Metrics");
      newSections.companyMetrics = await generateCompanyMetrics();
      setSections(prev => ({ ...prev, companyMetrics: newSections.companyMetrics }));

      setCurrentSection("Competitive Landscape");
      newSections.competitiveLandscape = await generateCompetitiveLandscape();
      setSections(prev => ({ ...prev, competitiveLandscape: newSections.competitiveLandscape }));

      // Extract structured JSON from metrics and competitors (separate dedicated request)
      setCurrentSection("Extracting Structured Data");
      const structuredData = await extractStructuredJSON(
        newSections.companyMetrics,
        newSections.competitiveLandscape
      );
      setExtractedJSON(structuredData);
      if (structuredData) {
        addLog(`✅ Extracted JSON: ${Object.keys(structuredData).filter(k => structuredData[k] !== null).length} fields populated`);
      } else {
        addLog("⚠️ JSON extraction failed, will use regex fallbacks");
      }

      setCurrentSection("News & Media");
      newSections.newsMedia = await generateNewsMedia();
      setSections(prev => ({ ...prev, newsMedia: newSections.newsMedia }));

      setCurrentSection("Culture & Work Environment");
      newSections.cultureEnvironment = await generateCultureEnvironment();
      setSections(prev => ({ ...prev, cultureEnvironment: newSections.cultureEnvironment }));

      // Phase 3: Consistency check (validates data across sections)
      setCurrentSection("Consistency Check");
      addLog("Running consistency validation");
      newSections.consistencyCheck = await runConsistencyCheck(newSections);
      setSections(prev => ({ ...prev, consistencyCheck: newSections.consistencyCheck }));

      // Phase 4: Quick Digest synthesis (uses all completed sections)
      setCurrentSection("Quick Digest (Synthesis)");
      addLog("Synthesizing Quick Digest from all research");
      newSections.quickDigest = await generateQuickDigest(newSections);
      setSections(prev => ({ ...prev, quickDigest: newSections.quickDigest }));

      // Phase 5: Sources
      setCurrentSection("Sources");
      newSections.sources = await generateSources(newSections);
      setSections(prev => ({ ...prev, sources: newSections.sources }));

      addLog("✅ Portfolio generation complete!");

    } catch (err) {
      setError(`Error: ${err.message}`);
      addLog(`❌ ERROR: ${err.message}`);
    }

    setLoading(false);
    setCurrentSection("");
    setCurrentStep("");
  };

  const handleSectionChange = (sectionId, value) => {
    setSections(prev => ({ ...prev, [sectionId]: value }));
  };

  const regenerateSection = async (sectionId, sectionLabel) => {
    if (!apiKey) return;
    setLoading(true);
    setCurrentSection(sectionLabel);
    addLog(`Regenerating: ${sectionLabel}`);

    try {
      let content;
      const section = ALL_SECTIONS.find(s => s.id === sectionId);

      if (section?.type === 'complex') {
        if (sectionId === 'fundingHistory') content = await generateFundingHistory();
        else if (sectionId === 'leadershipTeam') content = await generateLeadershipTeam();
        else if (sectionId === 'boardMembers') content = await generateBoardMembers();
        else if (sectionId === 'salesLeadership') content = await generateSalesLeadership();
        else if (sectionId === 'companyMetrics') content = await generateCompanyMetrics();
        else if (sectionId === 'competitiveLandscape') content = await generateCompetitiveLandscape();
        else if (sectionId === 'newsMedia') content = await generateNewsMedia();
        else if (sectionId === 'cultureEnvironment') content = await generateCultureEnvironment();
      } else if (section?.type === 'validation') {
        // Consistency check
        content = await runConsistencyCheck(sections);
      } else if (section?.type === 'special') {
        if (sectionId === 'sources') content = await generateSources(sections);
      } else if (section?.type === 'synthesis') {
        // Quick Digest synthesis from existing sections
        content = await generateQuickDigest(sections);
      } else {
        // Simple research sections
        content = await callPerplexity(getSimplePrompt(sectionId), {
          systemPrompt: RESEARCH_SYSTEM_PROMPT,
          qualityThreshold: 3
        });
      }

      setSections(prev => ({ ...prev, [sectionId]: content }));
      addLog(`✅ Completed: ${sectionLabel}`);
    } catch (err) {
      setError(`Error: ${err.message}`);
      addLog(`❌ ERROR: ${err.message}`);
    }

    setLoading(false);
    setCurrentSection("");
    setCurrentStep("");
  };

  const generateFullMarkdown = () => {
    // Output in reading order (Quick Digest first), not generation order
    return `# Pitch Research & Portfolio: ${companyName} - ${roleName}

## Quick Digest
${sections.quickDigest || ""}

## Founders Story & Origin
${sections.foundersStory || ""}

## Funding History
${sections.fundingHistory || ""}

## Executive Summary & The Moment
${sections.executiveSummary || ""}

## Top 3 Role Priorities
${sections.topPriorities || ""}

## Leadership Team
${sections.leadershipTeam || ""}

## Board of Directors
${sections.boardMembers || ""}

## Sales Leadership
${sections.salesLeadership || ""}

## Company Metrics
${sections.companyMetrics || ""}

## Search Requirements
${sections.searchRequirements || ""}

## Competitive Landscape
${sections.competitiveLandscape || ""}

## News & Media
${sections.newsMedia || ""}

## Culture & Work Environment
${sections.cultureEnvironment || ""}

## 🚨 Contradictions & Alignment Issues
${sections.contradictions || ""}

## The Pitch to Candidates
${sections.pitchToCandidates || ""}

## ✅ Consistency Check
${sections.consistencyCheck || ""}

## 📚 Sources
${sections.sources || ""}
`;
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(generateFullMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to extract structured data from portfolio sections
  const extractStructuredData = (sections) => {
    const data = {};

    // First, try to extract JSON block from companyMetrics section
    if (sections.companyMetrics) {
      const metrics = sections.companyMetrics;

      // Look for JSON block in the response
      const jsonMatch = metrics.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          console.log('Parsed structured metrics JSON:', parsed);

          // Map the JSON fields to our data structure
          if (parsed.employee_count) data.employee_count = parsed.employee_count;
          if (parsed.founded_year) data.founded_year = parsed.founded_year;
          if (parsed.headquarters) data.headquarters = parsed.headquarters;
          if (parsed.total_funding_millions) data.total_funding = `${parsed.total_funding_millions}M`;
          if (parsed.valuation_millions) data.valuation = `${parsed.valuation_millions}M`;
          if (parsed.funding_stage) data.funding_stage = parsed.funding_stage;
          if (parsed.tam_billions) data.tam = `${parsed.tam_billions}B`;
          if (parsed.top_competitors && Array.isArray(parsed.top_competitors)) {
            data.top_competitors = parsed.top_competitors.join(', ');
          }
        } catch (e) {
          console.error('Failed to parse metrics JSON:', e);
        }
      }

      // Fallback to regex if JSON parsing failed or was incomplete
      // These are intentionally strict to avoid capturing garbage text
      if (!data.employee_count) {
        const empMatch = metrics.match(/(\d{1,3}(?:,\d{3})*)\s*employees/i);
        if (empMatch) data.employee_count = empMatch[1].replace(/,/g, '');
      }

      if (!data.founded_year) {
        const foundedMatch = metrics.match(/founded\s*(?:in\s*)?(\d{4})/i);
        if (foundedMatch) data.founded_year = foundedMatch[1];
      }

      // Headquarters regex - must look like a location (City, State/Country format)
      // Max 60 chars, must contain a comma or be a known city pattern
      if (!data.headquarters) {
        const hqMatch = metrics.match(/(?:headquarters?|hq)[:\s|]+([A-Z][A-Za-z\s]+,\s*[A-Z][A-Za-z\s]+)/i);
        if (hqMatch) {
          const hq = hqMatch[1].trim();
          // Validate it looks like a location (contains comma, reasonable length)
          if (hq.length < 60 && hq.includes(',')) {
            data.headquarters = hq;
          }
        }
      }
    }

    // Extract from fundingHistory section as fallback
    if (sections.fundingHistory) {
      const funding = sections.fundingHistory;

      if (!data.total_funding) {
        const totalMatch = funding.match(/total\s*(?:raised|funding)?[:\s]*\$?([\d.]+)\s*(million|billion|[mb])/i);
        if (totalMatch) {
          let amount = parseFloat(totalMatch[1]);
          const unit = totalMatch[2].toLowerCase();
          if (unit === 'billion' || unit === 'b') amount *= 1000;
          data.total_funding = `${amount}M`;
        }
      }

      if (!data.funding_stage) {
        // Find ALL funding stages mentioned, pick the latest
        const stageOrder = ['pre-seed', 'seed', 'series a', 'series b', 'series c', 'series d', 'series e', 'series f', 'growth', 'late stage'];
        let highestStageIndex = -1;
        let highestStage = null;

        const stageMatches = funding.matchAll(/(?:pre-seed|seed|series\s*[a-f]|growth|late[- ]stage)/gi);
        for (const match of stageMatches) {
          const stage = match[0].toLowerCase().replace(/\s+/g, ' ');
          const index = stageOrder.findIndex(s => stage.includes(s));
          if (index > highestStageIndex) {
            highestStageIndex = index;
            highestStage = match[0];
          }
        }
        if (highestStage) data.funding_stage = highestStage;
      }
    }

    // Extract competitors from competitiveLandscape (only if JSON didn't provide them)
    if (sections.competitiveLandscape && !data.top_competitors) {
      // Look for numbered list items that start with a company name (capitalized, short)
      // Must NOT contain common instruction words
      const instructionWords = ['search', 'open', 'click', 'find', 'the company', 'visit', 'go to', 'navigate'];
      const lines = sections.competitiveLandscape.split('\n');
      const competitors = [];

      for (const line of lines) {
        // Look for numbered list items: "1. CompanyName" or "1. **CompanyName**"
        const match = line.match(/^\s*\d+\.\s*\*?\*?([A-Z][A-Za-z0-9\s&.-]{1,30})/);
        if (match) {
          const name = match[1].trim().replace(/\*+$/, '').trim();
          // Skip if it looks like instructions
          const isInstruction = instructionWords.some(w => name.toLowerCase().includes(w));
          if (!isInstruction && name.length > 1 && name.length < 30) {
            competitors.push(name);
          }
        }
        if (competitors.length >= 5) break;
      }

      if (competitors.length > 0) {
        data.top_competitors = competitors.join(', ');
      }
    }

    // Extract work policy and Glassdoor rating from cultureEnvironment section
    if (sections.cultureEnvironment) {
      const culture = sections.cultureEnvironment;

      // Work Policy extraction
      if (/fully\s+remote|100%\s+remote|all[- ]remote|remote[- ]first/i.test(culture)) {
        data.work_policy = 'Remote';
      } else if (/hybrid/i.test(culture)) {
        data.work_policy = 'Hybrid';
      } else if (/in[- ]office|on[- ]?site|office[- ]based|return to office/i.test(culture)) {
        data.work_policy = 'In-Office';
      } else if (/flexible|remote[- ]friendly/i.test(culture)) {
        data.work_policy = 'Flexible';
      }

      // Glassdoor rating extraction
      const glassdoorPatterns = [
        /glassdoor[:\s]+(\d+\.?\d*)\s*(?:\/\s*5|out of 5|stars?|rating)?/i,
        /(\d+\.?\d*)\s*(?:\/\s*5|out of 5|stars?)\s*(?:on\s+)?glassdoor/i,
        /glassdoor\s+(?:overall\s+)?rating[:\s]+(\d+\.?\d*)/i,
        /overall\s+rating[:\s]+(\d+\.?\d*)\s*(?:\/\s*5)?/i,
      ];
      for (const pattern of glassdoorPatterns) {
        const match = culture.match(pattern);
        if (match) {
          const rating = parseFloat(match[1]);
          if (rating >= 1 && rating <= 5) {
            data.glassdoor_rating = rating;
            break;
          }
        }
      }
    }

    console.log('Extracted structured data:', data);
    return data;
  };

  // Validate and sanitize extracted data to prevent garbage from being pushed to Attio
  const sanitizeExtractedData = (data) => {
    const sanitized = { ...data };
    const garbagePatterns = [
      /not publicly/i,
      /not disclosed/i,
      /cannot be verified/i,
      /search the/i,
      /open the/i,
      /click/i,
      /navigate/i,
      /I cannot/i,
      /I don't have/i,
      /unavailable/i,
      /full funding history/i,
      /would require guessing/i,
      /other offices/i,
      /not found/i,
      /unknown/i,
      /\[.*\]/i,  // Brackets like [City] or [Source]
    ];

    // Check each text field for garbage patterns
    const textFields = ['headquarters', 'top_competitors'];
    for (const field of textFields) {
      if (sanitized[field]) {
        const hasGarbage = garbagePatterns.some(p => p.test(sanitized[field]));
        const tooLong = sanitized[field].length > 100;
        if (hasGarbage || tooLong) {
          console.log(`Removing garbage from ${field}:`, sanitized[field].substring(0, 50));
          delete sanitized[field];
        }
      }
    }

    // Validate numeric fields
    if (sanitized.employee_count && (isNaN(sanitized.employee_count) || sanitized.employee_count < 1)) {
      delete sanitized.employee_count;
    }
    if (sanitized.founded_year && (isNaN(sanitized.founded_year) || sanitized.founded_year < 1900 || sanitized.founded_year > 2025)) {
      delete sanitized.founded_year;
    }

    return sanitized;
  };

  const handlePushToAttio = async () => {
    if (!attioApiKey) {
      setError("Please enter your Attio API key");
      return;
    }

    setPushingToAttio(true);
    setAttioResult(null);

    try {
      // Use dedicated JSON extraction if available, fall back to regex extraction
      let structuredData = {};

      if (extractedJSON) {
        // Use the dedicated JSON extraction (more reliable)
        console.log('Using dedicated JSON extraction:', extractedJSON);
        structuredData = {
          employee_count: extractedJSON.employee_count,
          founded_year: extractedJSON.founded_year,
          headquarters: extractedJSON.headquarters,
          total_funding: extractedJSON.total_funding_millions ? `${extractedJSON.total_funding_millions}M` : null,
          valuation: extractedJSON.valuation_millions ? `${extractedJSON.valuation_millions}M` : null,
          funding_stage: extractedJSON.funding_stage,
          tam: extractedJSON.tam_billions ? `${extractedJSON.tam_billions}B` : null,
          top_competitors: extractedJSON.top_competitors?.join(', ') || null
        };
        // Remove null values
        Object.keys(structuredData).forEach(key => {
          if (structuredData[key] === null || structuredData[key] === undefined) {
            delete structuredData[key];
          }
        });
      }

      // Fall back to regex extraction for any missing fields
      const regexExtracted = sanitizeExtractedData(extractStructuredData(sections));
      const extractedData = { ...regexExtracted, ...structuredData }; // JSON takes precedence

      console.log('Final extracted data for Attio:', extractedData);

      const response = await fetch('/api/attio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attioApiKey,
          searchRecordId: null,
          portfolioData: {
            company_name: companyName,
            company_url: companyUrl,
            role_title: roleName,
            full_markdown: generateFullMarkdown(),
            sections: sections,
            // Structured data extracted from sections
            ...extractedData
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        setAttioResult({
          success: true,
          message: result.message,
          url: result.attioUrl
        });
        addLog(`✅ Pushed to Attio: ${result.attioUrl}`);
      } else {
        setAttioResult({ success: false, message: result.error });
        addLog(`ERROR: Attio push failed: ${result.error}`);
      }
    } catch (err) {
      setAttioResult({ success: false, message: err.message });
      addLog(`ERROR: Attio push failed: ${err.message}`);
    }

    setPushingToAttio(false);
  };

  const completedCount = Object.keys(sections).filter(k => sections[k] && !sections[k].startsWith("[Error")).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">📋 Client Portfolio Generator</h1>
          <p className="text-slate-400 text-sm">v3.4 — Sales Leadership • Culture & Glassdoor • Work Policy</p>
        </div>

        {/* API Keys */}
        <div className="bg-slate-800 rounded-lg p-4 mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Perplexity API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="pplx-..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Attio API Key (optional)</label>
            <input
              type="password"
              value={attioApiKey}
              onChange={(e) => setAttioApiKey(e.target.value)}
              placeholder="attio_..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Settings → Developers → API Keys</p>
          </div>
        </div>

        {/* Company Info */}
        <div className="bg-slate-800 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Rillet"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Company URL</label>
              <input
                type="text"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://rillet.com"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Role Title</label>
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="VP Marketing"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {currentSection}: {currentStep || "Processing..."}
              </span>
            ) : (
              "🔍 Generate Portfolio (17 sections • ~35-45 queries with retries)"
            )}
          </button>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Estimated time: 8-12 minutes • Auto-retries on failures • Includes gap-filling
          </p>
        </div>

        {/* Progress */}
        {Object.keys(sections).length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">Progress: {completedCount}/{ALL_SECTIONS.length} sections</span>
              <div className="flex gap-2 items-center">
                <button
                  onClick={handleCopyAll}
                  disabled={completedCount === 0}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors"
                >
                  {copied ? "✓ Copied!" : "📋 Copy Markdown"}
                </button>
                {attioApiKey && (
                  <button
                    onClick={handlePushToAttio}
                    disabled={completedCount === 0 || pushingToAttio}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors flex items-center gap-1"
                  >
                    {pushingToAttio ? (
                      <>
                        <span className="animate-spin">⏳</span> Pushing...
                      </>
                    ) : (
                      "🚀 Push to Attio"
                    )}
                  </button>
                )}
                {attioResult && (
                  <div className={`text-xs px-2 py-1 rounded ${
                    attioResult.success ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                  }`}>
                    {attioResult.success ? (
                      <a
                        href={attioResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-emerald-300"
                      >
                        ✓ Open in Attio →
                      </a>
                    ) : (
                      attioResult.message
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / ALL_SECTIONS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Activity Log */}
        {logs.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-slate-400">Activity Log</div>
              <div className="text-xs text-slate-500">{logs.length} events</div>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              {logs.slice(-8).map((log, i) => (
                <div key={i} className={`text-xs font-mono ${log.includes('ERROR') ? 'text-red-400' : log.includes('✅') ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sections */}
        {Object.keys(sections).length > 0 && (
          <div className="space-y-3">
            {ALL_SECTIONS.map((section) => (
              <div key={section.id} className="bg-slate-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="font-medium text-white text-sm flex items-center gap-2">
                    {section.label}
                    {section.type === 'complex' && <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">multi-query</span>}
                    {section.type === 'validation' && <span className="text-xs text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded">validation</span>}
                    {section.type === 'synthesis' && <span className="text-xs text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded">synthesis</span>}
                    {section.type === 'special' && <span className="text-xs text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">sources</span>}
                    {sections[section.id] && !sections[section.id].startsWith("[Error") && (
                      <span className="text-emerald-400 text-xs">✓</span>
                    )}
                  </h3>
                  {sections[section.id] && (
                    <button
                      onClick={() => regenerateSection(section.id, section.label)}
                      disabled={loading}
                      className="text-xs text-slate-400 hover:text-white disabled:opacity-50"
                    >
                      ↻ Regenerate
                    </button>
                  )}
                </div>
                <div className="p-3">
                  {sections[section.id] ? (
                    <textarea
                      value={sections[section.id]}
                      onChange={(e) => handleSectionChange(section.id, e.target.value)}
                      rows={12}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    />
                  ) : (
                    <div className="text-slate-500 italic py-3 text-center text-sm">
                      {loading && currentSection === section.label ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          {currentStep || "Researching..."}
                        </span>
                      ) : loading ? "Queued..." : "Waiting..."}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {Object.keys(sections).length === 0 && !loading && (
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-semibold text-white mb-2">Ready to Research</h3>
            <p className="text-slate-400 text-sm max-w-lg mx-auto mb-6">
              v3.3 now returns structured JSON metrics for accurate Attio field population. No more regex guessing.
            </p>
            <div className="grid grid-cols-4 gap-3 text-xs max-w-2xl mx-auto">
              <div className="bg-slate-700 rounded p-3">
                <div className="text-blue-400 font-medium mb-1">🔄 Auto-Retry</div>
                <div className="text-slate-400">Retries when refusals detected</div>
              </div>
              <div className="bg-slate-700 rounded p-3">
                <div className="text-blue-400 font-medium mb-1">🔗 Multi-Query</div>
                <div className="text-slate-400">Chains queries for complex sections</div>
              </div>
              <div className="bg-slate-700 rounded p-3">
                <div className="text-purple-400 font-medium mb-1">✅ Consistency</div>
                <div className="text-slate-400">Validates data across all sections</div>
              </div>
              <div className="bg-slate-700 rounded p-3">
                <div className="text-emerald-400 font-medium mb-1">📊 JSON Metrics</div>
                <div className="text-slate-400">Structured data for Attio</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-500">
          Portfolio Generator v3.4 • Sales Leadership • Culture & Glassdoor • Work Policy
        </div>
      </div>
    </div>
  );
}
