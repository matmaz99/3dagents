import { NextRequest, NextResponse } from 'next/server';
import { Stagehand } from '@browserbasehq/stagehand';

// Browser tool actions
type BrowserAction =
    | 'browse'      // Navigate to URL and extract content
    | 'extract'     // Extract specific data from page
    | 'search';     // Search Google and return results

interface BrowserRequest {
    action: BrowserAction;
    url?: string;
    query?: string;
    instruction?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: BrowserRequest = await request.json();
        const { action, url, query, instruction } = body;

        // Determine environment based on available credentials
        const useBrowserbase = !!(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID);

        // Create Stagehand instance with explicit model config
        const stagehand = new Stagehand({
            env: useBrowserbase ? 'BROWSERBASE' : 'LOCAL',
            verbose: 0,
            disablePino: true, // Important for Next.js compatibility
            model: {
                provider: 'openai',
                modelName: 'gpt-4o-mini',
                apiKey: process.env.OPENAI_API_KEY,
            },
        });

        try {
            await stagehand.init();
            const page = stagehand.context.pages()[0];

            let result: unknown;

            switch (action) {
                case 'browse': {
                    if (!url) {
                        return NextResponse.json(
                            { error: 'URL is required for browse action' },
                            { status: 400 }
                        );
                    }

                    await page.goto(url, { waitUntil: 'domcontentloaded', timeoutMs: 30000 });

                    // Extract page content using V3 API
                    const extractInstruction = instruction || 'Extract the page title and main content summary';
                    const extraction = await stagehand.extract(extractInstruction);

                    result = {
                        url,
                        ...extraction,
                    };
                    break;
                }

                case 'extract': {
                    if (!url) {
                        return NextResponse.json(
                            { error: 'URL is required for extract action' },
                            { status: 400 }
                        );
                    }

                    await page.goto(url, { waitUntil: 'domcontentloaded', timeoutMs: 30000 });

                    // Extract using V3 API
                    const extractInstruction = instruction || query || 'Extract the relevant information from this page';
                    result = await stagehand.extract(extractInstruction);
                    break;
                }

                case 'search': {
                    if (!query) {
                        return NextResponse.json(
                            { error: 'Query is required for search action' },
                            { status: 400 }
                        );
                    }

                    // Go to Google and search
                    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeoutMs: 30000 });

                    // Accept cookies if prompted (for EU users)
                    try {
                        await stagehand.act('Accept cookies if there is a cookie consent dialog');
                    } catch {
                        // Ignore if no cookie dialog
                    }

                    // Perform search
                    await stagehand.act(`Type "${query}" in the search box and press Enter`);

                    // Wait for results
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Extract search results using V3 API
                    const searchResults = await stagehand.extract(
                        'Extract the top 5 search result titles, URLs, and descriptions from this Google search results page'
                    );

                    result = {
                        query,
                        ...searchResults,
                    };
                    break;
                }

                default:
                    return NextResponse.json(
                        { error: `Unknown action: ${action}` },
                        { status: 400 }
                    );
            }

            return NextResponse.json({ success: true, data: result });

        } finally {
            // Always close the browser
            await stagehand.close();
        }

    } catch (error) {
        console.error('Browser tool error:', error);
        return NextResponse.json(
            {
                error: 'Browser operation failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
