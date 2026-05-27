import puppeteer from 'puppeteer';

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('requestfailed', request =>
      console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText)
    );

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    
    // Wait a bit to let React render and potentially crash
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await browser.close();
  } catch (error) {
    console.error("Puppeteer Script Error:", error);
  }
})();
