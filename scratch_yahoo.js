async function test() {
    const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Step 1: Get cookies from fc.yahoo.com
    const cookieResp = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': YAHOO_UA },
        redirect: 'manual',
    });
    const setCookies = cookieResp.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: Get crumb
    const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
            'User-Agent': YAHOO_UA,
            'Cookie': cookieStr,
        },
    });
    const crumb = await crumbResp.text();

    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT&fields=targetMeanPrice,targetMedianPrice,targetHighPrice,targetLowPrice,recommendationMean,recommendationKey,numberOfAnalystOpinions&crumb=${encodeURIComponent(crumb)}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': YAHOO_UA,
            'Cookie': cookieStr,
        },
    });
    const data = await response.json();
    console.log(JSON.stringify(data.quoteResponse.result, null, 2));
}

test();
