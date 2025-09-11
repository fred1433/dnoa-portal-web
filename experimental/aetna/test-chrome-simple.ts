import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function testChromeAutomation() {
  console.log('🚀 Testing Chrome Automation with AppleScript');
  
  try {
    // Step 1: Activate Chrome
    console.log('\n1️⃣ Activating Chrome...');
    await execAsync(`osascript -e 'tell application "Google Chrome" to activate'`);
    console.log('✅ Chrome activated');
    
    // Step 2: Navigate to Aetna
    console.log('\n2️⃣ Navigating to Aetna...');
    const navigateScript = `
      tell application "Google Chrome"
        if (count of windows) = 0 then
          make new window
        end if
        set URL of active tab of front window to "https://www.aetna.com/provweb/"
      end tell
    `;
    await execAsync(`osascript -e '${navigateScript.replace(/\n/g, ' ')}'`);
    console.log('✅ Navigated to Aetna');
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Check if login form exists
    console.log('\n3️⃣ Checking for login form...');
    const checkLoginScript = `
      tell application "Google Chrome"
        set activeTab to active tab of front window
        return execute activeTab javascript "document.querySelector('input[name=\\"USER\\"]') !== null"
      end tell
    `;
    const { stdout: hasLogin } = await execAsync(`osascript -e '${checkLoginScript.replace(/\n/g, ' ')}'`);
    console.log(`Login form exists: ${hasLogin.trim()}`);
    
    if (hasLogin.trim() === 'true') {
      console.log('\n4️⃣ Filling login form...');
      
      // Fill username
      const fillUsernameScript = `
        tell application "Google Chrome"
          set activeTab to active tab of front window
          execute activeTab javascript "
            const userField = document.querySelector('input[name=\\"USER\\"]');
            if (userField) {
              userField.value = 'SmileyTooth4771';
              userField.dispatchEvent(new Event('input', {bubbles: true}));
              'Username filled';
            } else {
              'Username field not found';
            }
          "
        end tell
      `;
      const { stdout: usernameResult } = await execAsync(`osascript -e '${fillUsernameScript.replace(/\n/g, ' ')}'`);
      console.log(`Username: ${usernameResult.trim()}`);
      
      // Fill password
      const fillPasswordScript = `
        tell application "Google Chrome"
          set activeTab to active tab of front window
          execute activeTab javascript "
            const passField = document.querySelector('input[name=\\"PASSWORD\\"]');
            if (passField) {
              passField.value = 'sdbTX4771!!';
              passField.dispatchEvent(new Event('input', {bubbles: true}));
              'Password filled';
            } else {
              'Password field not found';
            }
          "
        end tell
      `;
      const { stdout: passwordResult } = await execAsync(`osascript -e '${fillPasswordScript.replace(/\n/g, ' ')}'`);
      console.log(`Password: ${passwordResult.trim()}`);
      
      // Click login button
      console.log('\n5️⃣ Clicking login button...');
      const clickLoginScript = `
        tell application "Google Chrome"
          set activeTab to active tab of front window
          execute activeTab javascript "
            const loginBtn = document.querySelector('input[type=\\"submit\\"][value=\\"Log In\\"]');
            if (loginBtn) {
              loginBtn.click();
              'Login button clicked';
            } else {
              'Login button not found';
            }
          "
        end tell
      `;
      const { stdout: loginResult } = await execAsync(`osascript -e '${clickLoginScript.replace(/\n/g, ' ')}'`);
      console.log(`Login: ${loginResult.trim()}`);
      
      // Wait for navigation
      console.log('\n⏳ Waiting for login to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check for captcha
      const checkCaptchaScript = `
        tell application "Google Chrome"
          set activeTab to active tab of front window
          return execute activeTab javascript "document.querySelector('iframe[src*=\\"hcaptcha\\"]') !== null"
        end tell
      `;
      const { stdout: hasCaptcha } = await execAsync(`osascript -e '${checkCaptchaScript.replace(/\n/g, ' ')}'`);
      
      if (hasCaptcha.trim() === 'true') {
        console.log('\n⚠️  CAPTCHA DETECTED!');
        console.log('Please solve the captcha manually in Chrome.');
        console.log('Press Enter when done...');
        
        // Wait for user input
        await new Promise((resolve) => {
          process.stdin.once('data', resolve);
        });
        
        console.log('Continuing after captcha...');
      }
      
      // Get current URL
      const getCurrentUrlScript = `
        tell application "Google Chrome"
          return URL of active tab of front window
        end tell
      `;
      const { stdout: currentUrl } = await execAsync(`osascript -e '${getCurrentUrlScript}'`);
      console.log(`\n📍 Current URL: ${currentUrl.trim()}`);
      
    } else {
      console.log('✅ Already logged in or login not required');
    }
    
    console.log('\n✅ Test completed successfully!');
    console.log('Chrome should now be on the Aetna portal.');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stderr) {
      console.error('Stderr:', error.stderr);
    }
  }
}

// Run the test
testChromeAutomation().catch(console.error);