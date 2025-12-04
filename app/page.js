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
  { id: "companyMetrics", label: "Company Metrics", type: "complex" },
  { id: "searchRequirements", label: "Search Requirements", type: "simple" },
  { id: "competitiveLandscape", label: "Competitive Landscape", type: "complex" },
  { id: "newsMedia", label: "News & Media", type: "complex" },
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

You are being paid to find this data. Do the work.`;

  // ========== SIMPLE SECTION PROMPTS ==========

  const getSimplePrompt = (sectionId) => {
    const prompts = {
      foundersStory: `Research the founders of ${companyName} (${companyUrl}).

**Founder Profiles:**

For EACH founder, create a profile:

### [Founder Name] - [Title]
- **LinkedIn:** [Search "[Name] LinkedIn" and provide actual URL like linkedin.com/in/username]
- **Education:** [University, Degree, Year if available]
- **Career Path:**
  - [Company 1] - [Role] ([Years])
  - [Company 2] - [Role] ([Years])
  - [Company 3] - [Role] ([Years])
- **Notable:** [Any exits, patents, awards, publications]

**Origin Story:**

Write 2-3 paragraphs covering:
- What problem did they personally experience?
- When/how did they start ${companyName}?
- What was the key insight or "aha moment"?
- Any early struggles, pivots, or first customers?

**Founder-Market Fit:**
- Why are THESE founders uniquely qualified?
- What unfair advantages do they have?

**Interviews/Media:**
- [List any podcasts, talks, or interviews with actual URLs]

SEARCH their names on LinkedIn, podcasts, YouTube, and press.`,

      executiveSummary: `For ${companyName} (${companyUrl}) hiring a ${roleName}:

**Company Inflection Point**
(2 paragraphs on where ${companyName} is right now)
- Current stage: funding, ARR, team size, customers
- What just happened: recent funding, product launch, milestone
- Trajectory: where are they headed

**Why This ${roleName} Role Exists Now**
(2 paragraphs)
- What triggered this hire?
- What gap does it fill?
- Reporting structure and scope

**Why Now - The Four Reasons:**

1. **Capital/Resource:** [How does recent funding enable this hire?]
2. **Competitive/Market:** [What market timing makes this urgent?]
3. **Organizational:** [What growth stage demands this role?]
4. **Customer/Pipeline:** [What customer needs drive this?]

Research the company's recent announcements, funding, and job postings.`,

      topPriorities: `Research ${companyName} (${companyUrl}) and define the top 3 priorities for their new ${roleName}:

**Priority 1: [Specific Title]**
- **Objective:** [What exactly needs to be accomplished - measurable outcome]
- **Why It Matters:** [Why this is critical for ${companyName} specifically right now]
- **Success Metrics:** [How will success be measured]
- **Timeline:** [18-24 month expectation]
- **Resources Needed:** [Team, budget, tools]

**Priority 2: [Specific Title]**
- **Objective:** [Measurable outcome]
- **Why It Matters:** [Company-specific reason]
- **Success Metrics:** [Measurements]
- **Timeline:** [Expectation]
- **Resources Needed:** [Requirements]

**Priority 3: [Specific Title]**
- **Objective:** [Measurable outcome]
- **Why It Matters:** [Company-specific reason]
- **Success Metrics:** [Measurements]
- **Timeline:** [Expectation]
- **Resources Needed:** [Requirements]

Make these SPECIFIC to ${companyName}'s actual situation based on your research. Not generic.`,

      searchRequirements: `For ${companyName}'s ${roleName} role, based on their stage and situation:

**Must-Have Requirements (8 items):**

| Requirement | Why Critical for ${companyName} |
|-------------|-------------------------------|
| 1. [Specific requirement] | [Tied to their stage/situation] |
| 2. [Specific requirement] | [Tied to their industry] |
| 3. [Specific requirement] | [Tied to their growth targets] |
| 4. [Specific requirement] | [Tied to their competitive position] |
| 5. [Specific requirement] | [Tied to their team needs] |
| 6. [Specific requirement] | [Tied to their customer base] |
| 7. [Specific requirement] | [Tied to their product] |
| 8. [Specific requirement] | [Tied to their investors' expectations] |

**Nice-to-Have Requirements (5 items):**
1. [Preference with rationale]
2. [Preference with rationale]
3. [Preference with rationale]
4. [Preference with rationale]
5. [Preference with rationale]

**Target Companies to Source Candidates From:**

| Company | Stage | Why Good Fit |
|---------|-------|--------------|
| [Company 1] | [Series X, $YM ARR] | [Similar GTM, market, etc.] |
| [Company 2] | ... | ... |
| [Company 3] | ... | ... |
| [Company 4] | ... | ... |
| [Company 5] | ... | ... |
| [Company 6] | ... | ... |
| [Company 7] | ... | ... |
| [Company 8] | ... | ... |

Include: competitors, companies at similar stage, same investors' portfolio companies, adjacent markets.`,

      contradictions: `Research ${companyName} (${companyUrl}), their investors, stage, and situation. Identify strategic tensions:

**Investor Context:**
- Lead investors: [Who]
- Board members: [Who from which firms]
- Stage/Valuation: [Details]

**Strategic Tensions Matrix:**

| Topic | CEO/Founder Likely Prioritizes | Board/Investor Likely Prioritizes | How ${roleName} Navigates |
|-------|-------------------------------|----------------------------------|--------------------------|
| Growth vs Profitability | [Research CEO statements] | [Research investor thesis] | [Recommended approach] |
| Product vs Sales Investment | [Founder background suggests...] | [Investor portfolio pattern suggests...] | [Balance point] |
| Mid-market vs Enterprise | [Current customer base suggests...] | [Valuation expectations suggest...] | [Strategy] |
| US vs International | [Current footprint] | [Investor expectations] | [Approach] |
| Build vs Buy/Partner | [Company DNA suggests...] | [Time pressure suggests...] | [Framework] |

**Key Alignment Questions for the ${roleName}:**
1. [Specific question to ask in interviews]
2. [Specific question to ask in interviews]
3. [Specific question to ask in interviews]

Base this on actual research about the company and investors, not generic advice.`,

      pitchToCandidates: `Write a compelling pitch for the ${roleName} role at ${companyName} (${companyUrl}):

**The Opportunity**

[2-3 paragraph pitch that would excite a top candidate. Include specific proof points: funding, growth rate, customers, market size. Make it compelling and specific to ${companyName}.]

**Your Mission**

[What will this person actually own? Scope, team size, budget authority, key relationships. Be specific about the mandate.]

**Why Now**

[Why is this THE moment to join? What window is opening? What just happened that makes timing critical?]

**The Upside**

[What does success look like? Career trajectory, equity potential, impact on the industry, legacy opportunity]

**The Team**

[Who will they work with? CEO background, leadership team caliber, board members, investors]

Research the company thoroughly. Make this pitch specific and compelling, not generic.`,
    };
    return prompts[sectionId];
  };

  // ========== COMPLEX MULTI-QUERY SECTIONS ==========

  const generateFundingHistory = async () => {
    setCurrentStep("Searching Crunchbase & press releases...");
    addLog("Researching funding history");

    const fundingData = await callPerplexity(`Research ALL funding rounds for ${companyName} (${companyUrl}).

Search Crunchbase, PitchBook, company press releases, and TechCrunch.

**Funding Rounds Table:**

| Round | Amount | Date | Lead Investor(s) | Other Investors | Source URL |
|-------|--------|------|------------------|-----------------|------------|
| Pre-Seed | $X | Month Year | [Investor] | [Others] | [URL] |
| Seed | $X | Month Year | [Investor] | [Others] | [URL] |
| Series A | $X | Month Year | [Investor] | [Others] | [URL] |
| Series B | $X | Month Year | [Investor] | [Others] | [URL] |
| [Continue...] | | | | | |

**Summary:**
- **Total Raised:** $X
- **Latest Round:** [Type] - $X - [Date]
- **Latest Valuation:** $X (or "Not publicly disclosed")

IMPORTANT:
- Rounds should be in CHRONOLOGICAL order (Seed before A before B before C)
- Include source URLs for verification
- If a round didn't happen, don't include it`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 2
    });

    return fundingData;
  };

  const generateLeadershipTeam = async () => {
    // Step 1: Get list of executives
    setCurrentStep("Finding executives on LinkedIn...");
    addLog("Searching for executive team");

    const execList = await callPerplexity(`Find ALL current executives at ${companyName} (${companyUrl}).

Search:
1. Company website /about or /team page
2. LinkedIn company page → People section
3. Recent press releases
4. Crunchbase people section

Create a table of ALL C-level and VP-level people:

| Name | Title | LinkedIn URL |
|------|-------|--------------|
| [Full Name] | CEO/Co-founder | linkedin.com/in/[actual-handle] |
| [Full Name] | CTO/Co-founder | linkedin.com/in/[actual-handle] |
| [Full Name] | CFO | linkedin.com/in/[actual-handle] |
| [Full Name] | COO | linkedin.com/in/[actual-handle] |
| [Full Name] | CPO | linkedin.com/in/[actual-handle] |
| [Full Name] | CMO | linkedin.com/in/[actual-handle] |
| [Full Name] | CRO | linkedin.com/in/[actual-handle] |
| [Full Name] | VP Engineering | linkedin.com/in/[actual-handle] |
| [Full Name] | VP Sales | linkedin.com/in/[actual-handle] |
| [Full Name] | VP Marketing | linkedin.com/in/[actual-handle] |
| [Full Name] | VP Product | linkedin.com/in/[actual-handle] |
| [Full Name] | General Counsel | linkedin.com/in/[actual-handle] |

TO FIND LINKEDIN URLs:
1. Search Google: "[Person Name] LinkedIn ${companyName}"
2. The URL format is: linkedin.com/in/[username]
3. Include the ACTUAL handle, not a placeholder

Only include people you can verify currently work there.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 4
    });

    // Step 2: Get backgrounds for key execs
    setCurrentStep("Researching executive backgrounds...");
    addLog("Getting executive career histories");

    const execDetails = await callPerplexity(`Research backgrounds for ${companyName}'s key executives.

Executives found:
${execList}

For the 5 most senior executives, provide career backgrounds:

### [Name] - [Title]
- **LinkedIn:** [URL from list above]
- **Current Role:** [What they do at ${companyName}]
- **Previous:** [Most recent role before ${companyName}] at [Company]
- **Earlier Career:** [2-3 notable earlier roles]
- **Education:** [University, Degree]
- **Notable:** [Achievements, exits, board seats]

Search LinkedIn profiles and press mentions for each person.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 3
    });

    return `## Executive Team\n\n${execList}\n\n## Key Executive Backgrounds\n\n${execDetails}`;
  };

  const generateBoardMembers = async () => {
    setCurrentStep("Finding board members from funding announcements...");
    addLog("Searching for board members");

    const boardData = await callPerplexity(`Research the Board of Directors for ${companyName} (${companyUrl}).

Search:
1. Funding announcements - investors often take board seats with major rounds
2. Company website About/Team/Leadership page
3. Crunchbase → People → filter by Board Member
4. Press releases mentioning "joins board" or "board of directors"

**Board of Directors:**

| Name | Role | Affiliation | Joined With | LinkedIn URL |
|------|------|-------------|-------------|--------------|
| [Founder Name] | Board Member | Founder/CEO | Founding | linkedin.com/in/[handle] |
| [Investor Name] | Board Member | [VC Firm] | Series A | linkedin.com/in/[handle] |
| [Investor Name] | Board Member | [VC Firm] | Series B | linkedin.com/in/[handle] |
| [Independent] | Board Member | Independent | [Year] | linkedin.com/in/[handle] |
| [Observer Name] | Board Observer | [VC Firm] | Series X | linkedin.com/in/[handle] |

**Board Member Backgrounds:**

For each investor/independent board member:
- **[Name]** ([Firm]): [Title at firm]. [2 sentences on background, other notable boards/investments]

Search for each person's LinkedIn profile and include actual URLs.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 3
    });

    return boardData;
  };

  const generateCompanyMetrics = async () => {
    setCurrentStep("Gathering company metrics from multiple sources...");
    addLog("Researching company metrics");

    const metrics = await callPerplexity(`CRITICAL REQUIREMENT: Your response MUST end with a JSON block containing structured metrics. This is mandatory.

Research verified metrics for ${companyName} (${companyUrl}).

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

**All Investors:**
| Investor | Round(s) Participated | Board Seat? |
|----------|----------------------|-------------|
| [Investor 1] | Seed, Series A | Yes |
| [Investor 2] | Series A | No |
| [Continue...] | | |

**Key Integrations/Partners:**
- [Partner 1]: [Type of partnership]
- [Partner 2]: [Type of partnership]

Verify each data point. Include sources.

---
MANDATORY: End your response with this exact JSON block. Fill in the values you found (use null if not found):

\`\`\`json
{
  "employee_count": 150,
  "founded_year": 2020,
  "headquarters": "San Francisco, CA",
  "total_funding_millions": 50,
  "valuation_millions": 200,
  "funding_stage": "Series B"
}
\`\`\`

Replace the example values above with actual data for ${companyName}. This JSON block is REQUIRED.`, {
      systemPrompt: RESEARCH_SYSTEM_PROMPT,
      qualityThreshold: 2
    });

    return metrics;
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

    const news = await callPerplexity(`Find news articles about ${companyName} (${companyUrl}) from the past 18 months.

Search TechCrunch, VentureBeat, Forbes, Bloomberg, industry publications, and the company blog.

Return ONLY articles with verified, working URLs:

**Funding Announcements:**
- [Headline](https://actual-url.com/article) - Publication (Month Year)
- [Headline](https://actual-url.com/article) - Publication (Month Year)

**Product/Feature News:**
- [Headline](https://actual-url.com/article) - Publication (Month Year)

**Company News (Hires, Milestones):**
- [Headline](https://actual-url.com/article) - Publication (Month Year)

**Industry Features:**
- [Headline](https://actual-url.com/article) - Publication (Month Year)

**Founder Interviews/Podcasts:**
- [Title](https://actual-url.com) - Platform (Month Year)

**Company Blog:**
- [Post Title](https://company-blog-url) - (Month Year)

Target: 10-15 total articles
Only include URLs you have actually found and verified.`, {
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

      setCurrentSection("Company Metrics");
      newSections.companyMetrics = await generateCompanyMetrics();
      setSections(prev => ({ ...prev, companyMetrics: newSections.companyMetrics }));

      setCurrentSection("Competitive Landscape");
      newSections.competitiveLandscape = await generateCompetitiveLandscape();
      setSections(prev => ({ ...prev, competitiveLandscape: newSections.competitiveLandscape }));

      setCurrentSection("News & Media");
      newSections.newsMedia = await generateNewsMedia();
      setSections(prev => ({ ...prev, newsMedia: newSections.newsMedia }));

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
        else if (sectionId === 'companyMetrics') content = await generateCompanyMetrics();
        else if (sectionId === 'competitiveLandscape') content = await generateCompetitiveLandscape();
        else if (sectionId === 'newsMedia') content = await generateNewsMedia();
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

## Company Metrics
${sections.companyMetrics || ""}

## Search Requirements
${sections.searchRequirements || ""}

## Competitive Landscape
${sections.competitiveLandscape || ""}

## News & Media
${sections.newsMedia || ""}

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
        } catch (e) {
          console.error('Failed to parse metrics JSON:', e);
        }
      }

      // Fallback to regex if JSON parsing failed or was incomplete
      if (!data.employee_count) {
        const empMatch = metrics.match(/(\d{1,3}(?:,\d{3})*)\s*employees/i);
        if (empMatch) data.employee_count = empMatch[1].replace(/,/g, '');
      }

      if (!data.founded_year) {
        const foundedMatch = metrics.match(/founded\s*(?:in\s*)?(\d{4})/i);
        if (foundedMatch) data.founded_year = foundedMatch[1];
      }

      if (!data.headquarters) {
        const hqMatch = metrics.match(/(?:headquarters?|hq)[:\s]+([^|\n]+)/i);
        if (hqMatch) data.headquarters = hqMatch[1].trim();
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

    // Extract competitors from competitiveLandscape
    if (sections.competitiveLandscape && !data.top_competitors) {
      // Try to get first few company names from the direct competitors section
      const directMatch = sections.competitiveLandscape.match(/direct\s*competitors?[^:]*:?\s*([^\n]*(?:\n[^*\n][^\n]*)*)/i);
      if (directMatch) {
        // Extract company names (usually at start of list items)
        const companies = directMatch[1].match(/\d+\.\s*\*?\*?([A-Z][A-Za-z0-9\s&.-]+)/g);
        if (companies) {
          data.top_competitors = companies.slice(0, 5).map(c => c.replace(/^\d+\.\s*\*?\*?/, '').trim()).join(', ');
        }
      }
    }

    console.log('Extracted structured data:', data);
    return data;
  };

  const handlePushToAttio = async () => {
    if (!attioApiKey) {
      setError("Please enter your Attio API key");
      return;
    }

    setPushingToAttio(true);
    setAttioResult(null);

    try {
      // Extract structured data from sections
      const extractedData = extractStructuredData(sections);

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
          <p className="text-slate-400 text-sm">v3.3 — Structured JSON metrics • Auto-retry • Consistency validation</p>
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
              "🔍 Generate Portfolio (15 sections • ~30-40 queries with retries)"
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
          Portfolio Generator v3.3 • Structured JSON Metrics • Auto-Retry • Consistency Check
        </div>
      </div>
    </div>
  );
}
