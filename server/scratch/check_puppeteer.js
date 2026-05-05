const puppeteer = require('puppeteer');

(async () => {
  console.log('Attempting to launch Puppeteer...');
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox'],
      headless: 'new'
    });
    console.log('SUCCESS: Puppeteer launched successfully!');
    console.log('Executable path:', puppeteer.executablePath());
    await browser.close();
  } catch (err) {
    console.error('FAILURE: Puppeteer could not launch.');
    console.error('Error message:', err.message);
    if (err.message.includes('Could not find Chromium')) {
      console.log('\nSUGGESTION: The Chromium binary is missing. Try running:');
      console.log('cd server && npm install');
    }
  }
})();
