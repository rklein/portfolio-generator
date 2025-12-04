export async function POST(request) {
  const { attioApiKey, portfolioData, searchRecordId } = await request.json();

  if (!attioApiKey || !portfolioData) {
    return Response.json({ error: "Missing attioApiKey or portfolioData" }, { status: 400 });
  }

  try {
    let recordId = searchRecordId;
    let companyRecordId = null;
    let isNewRecord = false;

    // Step 1: Auto-detect existing search by company name
    if (!recordId && portfolioData.company_name) {
      const existingSearchRes = await fetch('https://api.attio.com/v2/objects/searches/records/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${attioApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            name: { "$contains": portfolioData.company_name }
          },
          limit: 1
        })
      });

      const existingSearch = await existingSearchRes.json();
      if (existingSearch.data && existingSearch.data.length > 0) {
        recordId = existingSearch.data[0].id.record_id;
        // Also get the linked company ID from the existing search
        const linkedCompany = existingSearch.data[0].values?.client_2?.[0];
        if (linkedCompany) {
          companyRecordId = linkedCompany.target_record_id;
        }
        console.log('Found existing search:', recordId, 'with company:', companyRecordId);
      }
    }

    // If we have a search but no company yet, find the company by name
    if (recordId && !companyRecordId && portfolioData.company_name) {
      const searchCompanyRes = await fetch('https://api.attio.com/v2/objects/companies/records/query', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${attioApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            name: { "$contains": portfolioData.company_name }
          },
          limit: 1
        })
      });

      const companyData = await searchCompanyRes.json();
      if (companyData.data && companyData.data.length > 0) {
        companyRecordId = companyData.data[0].id.record_id;
      }
    }

    // Step 2: If no existing search, find or create the Company, then create Search
    if (!recordId) {
      isNewRecord = true;

      // Find or create Company
      if (portfolioData.company_name) {
        const searchCompanyRes = await fetch('https://api.attio.com/v2/objects/companies/records/query', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${attioApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filter: {
              name: { "$contains": portfolioData.company_name }
            },
            limit: 1
          })
        });

        const companyData = await searchCompanyRes.json();

        if (companyData.data && companyData.data.length > 0) {
          companyRecordId = companyData.data[0].id.record_id;
        } else {
          // Create new company
          const createCompanyRes = await fetch('https://api.attio.com/v2/objects/companies/records', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${attioApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              data: {
                values: {
                  name: [{ value: portfolioData.company_name }],
                  ...(portfolioData.company_url && {
                    domains: [{ domain: new URL(portfolioData.company_url).hostname }]
                  })
                }
              }
            })
          });

          const newCompany = await createCompanyRes.json();
          companyRecordId = newCompany.data?.id?.record_id;
        }
      }

      // Create the Search record
      const createSearchRes = await fetch('https://api.attio.com/v2/objects/searches/records', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${attioApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            values: {
              // REQUIRED: Name field (Company - Role format)
              name: [{ value: `${portfolioData.company_name || 'Unknown'} - ${portfolioData.role_title || 'Search'}` }],
              // Use existing fields
              position: [{ value: portfolioData.role_title || '' }],
              kickoff_date: [{ value: new Date().toISOString().split('T')[0] }],
              // Link to company if found/created (with target_object!)
              ...(companyRecordId && {
                client_2: [{ target_object: "companies", target_record_id: companyRecordId }]
              }),
              // New structured fields
              company_url: [{ value: portfolioData.company_url || '' }],
              portfolio_generated_date: [{ value: new Date().toISOString().split('T')[0] }]
            }
          }
        })
      });

      const createResult = await createSearchRes.json();
      recordId = createResult.data?.id?.record_id;

      if (!recordId) {
        throw new Error('Failed to create search record: ' + JSON.stringify(createResult));
      }
    }

    // Step 3: Build update payload with STRUCTURED fields only (for filtering)
    // Portfolio content goes in a Note (Step 4) for better readability
    const updatePayload = {
      data: {
        values: {
          // Use existing field for role
          position: [{ value: portfolioData.role_title || '' }],

          // Structured fields (filterable in Attio)
          company_url: [{ value: portfolioData.company_url || '' }],

          // Funding stage (select field)
          ...(portfolioData.funding_stage && {
            funding_stage: [{ option: mapFundingStage(portfolioData.funding_stage) }]
          }),

          // Currency fields
          ...(portfolioData.total_funding && {
            total_funding: [{ currency_value: parseCurrency(portfolioData.total_funding) }]
          }),
          ...(portfolioData.valuation && {
            valuation: [{ currency_value: parseCurrency(portfolioData.valuation) }]
          }),

          // Number fields
          ...(portfolioData.employee_count && {
            employee_count: [{ value: parseInt(portfolioData.employee_count) || null }]
          }),
          ...(portfolioData.founded_year && {
            founded_year: [{ value: parseInt(portfolioData.founded_year) || null }]
          }),

          // Text fields
          ...(portfolioData.headquarters && {
            headquarters: [{ value: portfolioData.headquarters }]
          }),
          ...(portfolioData.top_competitors && {
            top_competitors: [{ value: portfolioData.top_competitors }]
          }),

          // Metadata
          portfolio_last_updated: [{ value: new Date().toISOString().split('T')[0] }]
        }
      }
    };

    // Update the record
    const updateResponse = await fetch(`https://api.attio.com/v2/objects/searches/records/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${attioApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const err = await updateResponse.json();
      throw new Error(err.message || 'Failed to update search record');
    }

    // Step 4: Create/Update Note with full portfolio markdown (renders nicely)
    if (portfolioData.full_markdown) {
      const noteTitle = `Portfolio: ${portfolioData.company_name || 'Company'} - ${portfolioData.role_title || 'Search'}`;

      // Check if a portfolio note already exists for this search
      const existingNotesRes = await fetch(`https://api.attio.com/v2/notes?parent_object=searches&parent_record_id=${recordId}`, {
        headers: {
          'Authorization': `Bearer ${attioApiKey}`,
        }
      });

      const existingNotes = await existingNotesRes.json();
      const existingPortfolioNote = existingNotes.data?.find(note =>
        note.title?.startsWith('Portfolio:')
      );

      if (existingPortfolioNote) {
        // Delete old portfolio note and create fresh one
        await fetch(`https://api.attio.com/v2/notes/${existingPortfolioNote.id.note_id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${attioApiKey}`,
          }
        });
      }

      // Create new portfolio note on Search
      const noteRes = await fetch('https://api.attio.com/v2/notes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${attioApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            parent_object: "searches",
            parent_record_id: recordId,
            title: noteTitle,
            format: "markdown",
            content: portfolioData.full_markdown
          }
        })
      });

      if (!noteRes.ok) {
        console.error('Failed to create note on Search:', await noteRes.json());
      }

      // Also create/update portfolio note on Company record
      if (companyRecordId) {
        // Check if a portfolio note already exists for this company
        const existingCompanyNotesRes = await fetch(`https://api.attio.com/v2/notes?parent_object=companies&parent_record_id=${companyRecordId}`, {
          headers: {
            'Authorization': `Bearer ${attioApiKey}`,
          }
        });

        const existingCompanyNotes = await existingCompanyNotesRes.json();
        const existingCompanyPortfolioNote = existingCompanyNotes.data?.find(note =>
          note.title?.includes(portfolioData.role_title || 'Search')
        );

        if (existingCompanyPortfolioNote) {
          // Delete old portfolio note
          await fetch(`https://api.attio.com/v2/notes/${existingCompanyPortfolioNote.id.note_id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${attioApiKey}`,
            }
          });
        }

        // Create portfolio note on Company
        const companyNoteRes = await fetch('https://api.attio.com/v2/notes', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${attioApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: {
              parent_object: "companies",
              parent_record_id: companyRecordId,
              title: noteTitle,
              format: "markdown",
              content: portfolioData.full_markdown
            }
          })
        });

        if (!companyNoteRes.ok) {
          console.error('Failed to create note on Company:', await companyNoteRes.json());
        }
      }
    }

    // Step 5: Auto-link Collection to Search
    // Finds a Collection matching the company name and links it via list_id and list_url
    let collectionLinked = false;
    let collectionName = null;

    if (portfolioData.company_name) {
      try {
        // Fetch all Collections (Lists)
        const listsRes = await fetch('https://api.attio.com/v2/lists', {
          headers: {
            'Authorization': `Bearer ${attioApiKey}`,
          }
        });

        const listsData = await listsRes.json();
        const collections = listsData.data || [];

        // Find a Collection whose name contains the company name (case-insensitive)
        const companyNameLower = portfolioData.company_name.toLowerCase();
        const matchingCollection = collections.find(collection =>
          collection.name?.toLowerCase().includes(companyNameLower) ||
          companyNameLower.includes(collection.name?.toLowerCase())
        );

        if (matchingCollection) {
          const collectionId = matchingCollection.id.list_id;
          const collectionUrl = `https://app.attio.com/aperturesearch/collection/${collectionId}`;
          collectionName = matchingCollection.name;

          // Update the Search record with list_id and list_url
          const linkRes = await fetch(`https://api.attio.com/v2/objects/searches/records/${recordId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${attioApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              data: {
                values: {
                  list_id: [{ value: collectionId }],
                  list_url: [{ value: collectionUrl }]
                }
              }
            })
          });

          if (linkRes.ok) {
            collectionLinked = true;
            console.log(`Linked Collection "${collectionName}" to Search`);
          } else {
            console.error('Failed to link collection:', await linkRes.json());
          }
        } else {
          console.log(`No Collection found matching "${portfolioData.company_name}"`);
        }
      } catch (err) {
        console.error('Error auto-linking collection:', err);
        // Don't fail the whole request
      }
    }

    return Response.json({
      success: true,
      recordId: recordId,
      isNewRecord: isNewRecord,
      collectionLinked: collectionLinked,
      collectionName: collectionName,
      message: isNewRecord
        ? `Created new Search and pushed portfolio${collectionLinked ? ` (linked to "${collectionName}" collection)` : ''}`
        : `Updated existing Search with portfolio${collectionLinked ? ` (linked to "${collectionName}" collection)` : ''}`,
      attioUrl: `https://app.attio.com/aperturesearch/searches/${recordId}`
    });

  } catch (error) {
    console.error('Attio error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Helper: Map funding stage to exact option titles
function mapFundingStage(stage) {
  const mapping = {
    'pre-seed': 'Pre-Seed',
    'preseed': 'Pre-Seed',
    'seed': 'Seed',
    'series a': 'Series A',
    'a': 'Series A',
    'series b': 'Series B',
    'b': 'Series B',
    'series c': 'Series C',
    'c': 'Series C',
    'series d': 'Series D+',
    'series d+': 'Series D+',
    'd': 'Series D+',
    'growth': 'Growth/Late Stage',
    'late stage': 'Growth/Late Stage',
    'growth/late stage': 'Growth/Late Stage',
    'public': 'Public',
    'ipo': 'Public',
    'bootstrapped': 'Bootstrapped',
    'bootstrap': 'Bootstrapped'
  };

  const normalized = stage.toLowerCase().trim();
  return mapping[normalized] || stage;
}

// Helper: Parse currency string to number
function parseCurrency(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;

  // Remove currency symbols and commas
  const cleaned = String(value).replace(/[$,]/g, '').trim();

  // Handle M/B suffixes
  const multipliers = { 'k': 1000, 'm': 1000000, 'b': 1000000000 };
  const match = cleaned.match(/^([\d.]+)\s*([kmb])?$/i);

  if (match) {
    const num = parseFloat(match[1]);
    const suffix = (match[2] || '').toLowerCase();
    return num * (multipliers[suffix] || 1);
  }

  return parseFloat(cleaned) || null;
}

// GET endpoint to list existing searches (for dropdown)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const attioApiKey = searchParams.get('apiKey');

  if (!attioApiKey) {
    return Response.json({ error: "Missing API key" }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.attio.com/v2/objects/searches/records/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${attioApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sorts: [{ attribute: 'created_at', direction: 'desc' }],
        limit: 50
      })
    });

    const data = await response.json();

    // Transform for dropdown
    const searches = (data.data || []).map(record => ({
      id: record.id.record_id,
      name: record.values?.name?.[0]?.value || 'Untitled',
      position: record.values?.position?.[0]?.value || '',
      company: record.values?.client_2?.[0]?.target_object_id || '',
      created: record.values?.created_at?.[0]?.value || ''
    }));

    return Response.json({ searches });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
