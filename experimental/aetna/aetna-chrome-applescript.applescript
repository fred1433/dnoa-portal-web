#!/usr/bin/osascript

(*
Aetna Benefits Scraper using Chrome and AppleScript
This script controls Chrome directly on macOS to scrape Aetna benefits
*)

on run
	-- Configuration
	set username to "SmileyTooth4771"
	set password to "sdbTX4771!!"
	set patientFirstName to "Willow"
	set patientLastName to "Stewart"
	set patientDOB to "08/22/2018"
	set patientMemberId to "W186119850"
	
	log "🚀 Starting Aetna Benefits Scraper with Chrome"
	
	-- Step 1: Open Chrome and navigate to Aetna
	tell application "Google Chrome"
		activate
		
		-- Create new window or use existing
		if (count of windows) = 0 then
			make new window
		end if
		
		set targetWindow to front window
		set activeTab to active tab of targetWindow
		
		-- Navigate to Aetna provider portal
		set URL of activeTab to "https://www.aetna.com/provweb/"
		
		delay 3 -- Wait for page load
		
		-- Step 2: Check if login is needed and perform login
		set needsLogin to execute activeTab javascript "
			(() => {
				const userField = document.querySelector('input[name=\"USER\"]');
				return userField !== null;
			})()
		"
		
		if needsLogin then
			log "🔐 Logging in to Aetna..."
			
			-- Fill username
			execute activeTab javascript "
				document.querySelector('input[name=\"USER\"]').value = '" & username & "';
				document.querySelector('input[name=\"USER\"]').dispatchEvent(new Event('input', {bubbles: true}));
			"
			
			-- Fill password
			execute activeTab javascript "
				document.querySelector('input[name=\"PASSWORD\"]').value = '" & password & "';
				document.querySelector('input[name=\"PASSWORD\"]').dispatchEvent(new Event('input', {bubbles: true}));
			"
			
			-- Click login button
			execute activeTab javascript "
				const loginBtn = document.querySelector('input[type=\"submit\"][value=\"Log In\"]');
				if (loginBtn) loginBtn.click();
			"
			
			delay 3
			
			-- Check for captcha
			set hasCaptcha to execute activeTab javascript "
				document.querySelector('iframe[src*=\"hcaptcha\"]') !== null
			"
			
			if hasCaptcha then
				display dialog "⚠️ Captcha detected! Please solve it manually in Chrome, then click OK to continue." buttons {"OK"} default button "OK"
				
				-- Click Continue after captcha
				execute activeTab javascript "
					const continueBtn = document.querySelector('button:contains(\"Continue\")') || 
									   Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Continue'));
					if (continueBtn) continueBtn.click();
				"
			end if
			
			log "✅ Login successful"
		else
			log "✅ Already logged in"
		end if
		
		delay 2
		
		-- Step 3: Handle disclaimer if present
		set hasDisclaimer to execute activeTab javascript "
			document.querySelector('input[type=\"submit\"][value=\"Continue\"]') !== null
		"
		
		if hasDisclaimer then
			log "📄 Handling disclaimer page..."
			execute activeTab javascript "
				document.querySelector('input[type=\"submit\"][value=\"Continue\"]').click();
			"
			delay 2
		end if
		
		-- Step 4: Navigate to Eligibility & Benefits
		log "📋 Navigating to Eligibility & Benefits..."
		
		execute activeTab javascript "
			(() => {
				// Try menu item ID first
				const menuItem = document.querySelector('#menuItem-3 > a');
				if (menuItem) {
					menuItem.click();
					return true;
				}
				
				// Fallback to text search
				const links = Array.from(document.querySelectorAll('a'));
				const eligLink = links.find(link => link.textContent.includes('Eligibility & Benefits'));
				if (eligLink) {
					eligLink.click();
					return true;
				}
				return false;
			})()
		"
		
		delay 3
		
		-- Close any popups
		execute activeTab javascript "
			(() => {
				const closeBtn = Array.from(document.querySelectorAll('button')).find(btn => 
					btn.textContent.trim() === 'Close' || btn.getAttribute('aria-label') === 'Close');
				if (closeBtn) closeBtn.click();
			})()
		"
		
		-- Check for Continue link
		set hasContinue to execute activeTab javascript "
			Array.from(document.querySelectorAll('a')).some(link => 
				link.textContent.includes('Continue >'))
		"
		
		if hasContinue then
			log "📋 Clicking Continue link..."
			execute activeTab javascript "
				const continueLink = Array.from(document.querySelectorAll('a')).find(link => 
					link.textContent.includes('Continue >'));
				if (continueLink) continueLink.click();
			"
			delay 3
			
			-- Check if new window opened
			if (count of windows) > 1 then
				set targetWindow to window 2
				set activeTab to active tab of targetWindow
				log "✅ Switched to eligibility popup window"
			end if
		end if
		
		-- Step 5: Select billing provider
		log "🏥 Selecting billing provider..."
		
		execute activeTab javascript "
			(() => {
				const selectProviderLink = Array.from(document.querySelectorAll('a')).find(link => 
					link.textContent.includes('Select Billing Provider'));
				if (selectProviderLink) selectProviderLink.click();
			})()
		"
		
		delay 2
		
		execute activeTab javascript "
			(() => {
				const providers = Array.from(document.querySelectorAll('*'));
				const jenChou = providers.find(el => 
					el.textContent.includes('Jennifer Chou, Dds - P.O. BOX'));
				if (jenChou && jenChou.tagName !== 'BODY' && jenChou.tagName !== 'HTML') {
					jenChou.click();
				}
			})()
		"
		
		delay 2
		
		-- Step 6: Select payer
		log "💳 Selecting payer..."
		
		execute activeTab javascript "
			(() => {
				const selectPayerLink = Array.from(document.querySelectorAll('a')).find(link => 
					link.textContent.includes('Select a Payer'));
				if (selectPayerLink) selectPayerLink.click();
			})()
		"
		
		delay 2
		
		execute activeTab javascript "
			(() => {
				const payers = Array.from(document.querySelectorAll('*'));
				const aetnaDental = payers.find(el => 
					el.textContent.includes('Aetna Dental Plans -'));
				if (aetnaDental && aetnaDental.tagName !== 'BODY' && aetnaDental.tagName !== 'HTML') {
					aetnaDental.click();
				}
			})()
		"
		
		delay 2
		
		-- Step 7: Search for patient
		log "🔍 Searching for patient: " & patientFirstName & " " & patientLastName
		
		-- Fill last name
		execute activeTab javascript "
			(() => {
				const lastNameField = document.querySelector('input[aria-label*=\"Last Name\"]') ||
									  document.querySelector('input[placeholder*=\"Last Name\"]') ||
									  Array.from(document.querySelectorAll('input')).find(input => {
										  const label = document.querySelector('label[for=\"' + input.id + '\"]');
										  return label && label.textContent.includes('Last Name');
									  });
				if (lastNameField) {
					lastNameField.value = '" & patientLastName & "';
					lastNameField.dispatchEvent(new Event('input', {bubbles: true}));
					lastNameField.dispatchEvent(new Event('change', {bubbles: true}));
				}
			})()
		"
		
		-- Fill first name
		execute activeTab javascript "
			(() => {
				const firstNameField = document.querySelector('input[aria-label*=\"First Name\"]') ||
									   document.querySelector('input[placeholder*=\"First Name\"]') ||
									   Array.from(document.querySelectorAll('input')).find(input => {
										   const label = document.querySelector('label[for=\"' + input.id + '\"]');
										   return label && label.textContent.includes('First Name');
									   });
				if (firstNameField) {
					firstNameField.value = '" & patientFirstName & "';
					firstNameField.dispatchEvent(new Event('input', {bubbles: true}));
					firstNameField.dispatchEvent(new Event('change', {bubbles: true}));
				}
			})()
		"
		
		-- Fill DOB
		execute activeTab javascript "
			(() => {
				const dobField = document.querySelector('input[aria-label*=\"Date of Birth\"]') ||
								 document.querySelector('input[placeholder*=\"Date of Birth\"]') ||
								 Array.from(document.querySelectorAll('input')).find(input => {
									 const label = document.querySelector('label[for=\"' + input.id + '\"]');
									 return label && label.textContent.includes('Date of Birth');
								 });
				if (dobField) {
					dobField.value = '" & patientDOB & "';
					dobField.dispatchEvent(new Event('input', {bubbles: true}));
					dobField.dispatchEvent(new Event('change', {bubbles: true}));
				}
			})()
		"
		
		-- Set relationship to Child (value 19)
		execute activeTab javascript "
			(() => {
				const relationshipSelect = document.querySelector('select[aria-label*=\"Patient Relationship\"]') ||
										   Array.from(document.querySelectorAll('select')).find(select => {
											   const label = document.querySelector('label[for=\"' + select.id + '\"]');
											   return label && label.textContent.includes('Patient Relationship');
										   });
				if (relationshipSelect) {
					relationshipSelect.value = '19';
					relationshipSelect.dispatchEvent(new Event('change', {bubbles: true}));
				}
			})()
		"
		
		-- Fill member ID
		execute activeTab javascript "
			(() => {
				const memberIdField = document.querySelector('input[aria-label*=\"Member ID\"]') ||
									  document.querySelector('input[placeholder*=\"Member ID\"]') ||
									  Array.from(document.querySelectorAll('input')).find(input => {
										  const label = document.querySelector('label[for=\"' + input.id + '\"]');
										  return label && (label.textContent.includes('Member ID') || 
														   label.textContent.includes('SSN'));
									  });
				if (memberIdField) {
					memberIdField.value = '" & patientMemberId & "';
					memberIdField.dispatchEvent(new Event('input', {bubbles: true}));
					memberIdField.dispatchEvent(new Event('change', {bubbles: true}));
				}
			})()
		"
		
		delay 1
		
		-- Click Continue button
		execute activeTab javascript "
			(() => {
				const continueBtn = Array.from(document.querySelectorAll('button')).find(btn => 
					btn.textContent.includes('Continue')) ||
					document.querySelector('input[type=\"submit\"][value=\"Continue\"]');
				if (continueBtn) continueBtn.click();
			})()
		"
		
		delay 3
		
		-- Step 8: Click on subscriber link (STEWART)
		log "👤 Selecting subscriber..."
		
		execute activeTab javascript "
			(() => {
				const links = Array.from(document.querySelectorAll('a'));
				const stewartLink = links.find(link => link.textContent.includes('STEWART'));
				if (stewartLink) {
					stewartLink.click();
					return true;
				}
				return false;
			})()
		"
		
		delay 3
		
		-- Step 9: View Benefits
		log "📊 Viewing benefits..."
		
		execute activeTab javascript "
			(() => {
				const viewBenefitsLink = Array.from(document.querySelectorAll('a')).find(link => 
					link.textContent.includes('View Benefits'));
				if (viewBenefitsLink) viewBenefitsLink.click();
			})()
		"
		
		delay 5
		
		-- Step 10: Extract benefits data
		log "📊 Extracting benefits data..."
		
		set benefitsData to execute activeTab javascript "
			(() => {
				const pageText = document.body.innerText;
				const data = {
					patient: {},
					coverage: {},
					maximums: {},
					deductibles: {},
					coInsurance: {}
				};
				
				// Extract patient info
				const nameMatch = pageText.match(/Name:\\s+Member ID.*?\\s+([A-Z\\s]+)\\s+([A-Z0-9]+)/);
				if (nameMatch) {
					data.patient.name = nameMatch[1].trim();
					data.patient.memberId = nameMatch[2];
				}
				
				// Extract DOB
				const dobMatch = pageText.match(/Date of Birth:\\s+(\\d{2}\\/\\d{2}\\/\\d{4})/);
				if (dobMatch) {
					data.patient.dob = dobMatch[1];
				}
				
				// Extract coverage
				const coverageMatch = pageText.match(/Coverage:\\s+(\\w+)/);
				if (coverageMatch) {
					data.coverage.type = coverageMatch[1];
				}
				
				const groupMatch = pageText.match(/Group#:\\s+(\\d+)/);
				if (groupMatch) {
					data.coverage.groupNumber = groupMatch[1];
				}
				
				const groupNameMatch = pageText.match(/Group Name:\\s+([^\\n]+)/);
				if (groupNameMatch) {
					data.coverage.groupName = groupNameMatch[1].trim();
				}
				
				// Extract maximums
				const dentalMaxMatch = pageText.match(/DENTAL\\s+Individual\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
				if (dentalMaxMatch) {
					data.maximums.dental = {
						amount: dentalMaxMatch[1],
						remaining: dentalMaxMatch[2]
					};
				}
				
				const orthoMaxMatch = pageText.match(/Orthodontics\\s+Individual\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
				if (orthoMaxMatch) {
					data.maximums.orthodontics = {
						amount: orthoMaxMatch[1],
						remaining: orthoMaxMatch[2]
					};
				}
				
				// Extract deductibles
				const familyDeductMatch = pageText.match(/Dental\\s+Family\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
				if (familyDeductMatch) {
					data.deductibles.family = {
						amount: familyDeductMatch[1],
						remaining: familyDeductMatch[2]
					};
				}
				
				const indivDeductMatch = pageText.match(/Dental\\s+Individual\\s+\\$([0-9,\\.]+)\\s+\\$([0-9,\\.]+)/);
				if (indivDeductMatch) {
					data.deductibles.individual = {
						amount: indivDeductMatch[1],
						remaining: indivDeductMatch[2]
					};
				}
				
				// Extract co-insurance
				const prevMatch = pageText.match(/Preventative\\s+(\\d+%)\\s+\\/\\s+(\\d+%)/);
				if (prevMatch) {
					data.coInsurance.preventative = 'Patient: ' + prevMatch[1] + ' / Insurance: ' + prevMatch[2];
				}
				
				const basicMatch = pageText.match(/Basic\\s+(\\d+%)\\s+\\/\\s+(\\d+%)/);
				if (basicMatch) {
					data.coInsurance.basic = 'Patient: ' + basicMatch[1] + ' / Insurance: ' + basicMatch[2];
				}
				
				const majorMatch = pageText.match(/Major[,\\w]*\\s+(\\d+%)\\s+\\/\\s+(\\d+%)/);
				if (majorMatch) {
					data.coInsurance.major = 'Patient: ' + majorMatch[1] + ' / Insurance: ' + majorMatch[2];
				}
				
				// Also save raw text
				data.rawText = pageText;
				
				return JSON.stringify(data);
			})()
		"
		
		-- Display results
		log "✅ Benefits data extracted successfully!"
		log "============================="
		log benefitsData
		
		-- Save to file
		set timestamp to (do shell script "date +%s")
		set dataFolder to "/Users/frederic/Documents/ProjetsDev/portal-scraper-ai/data/aetna/"
		
		-- Create directory if needed
		do shell script "mkdir -p " & dataFolder
		
		-- Save JSON data
		set jsonFile to dataFolder & "aetna-benefits-" & timestamp & ".json"
		do shell script "echo " & quoted form of benefitsData & " | python3 -m json.tool > " & jsonFile
		
		log "💾 Data saved to: " & jsonFile
		
		display dialog "✅ Aetna benefits scraping completed! Data saved to: " & jsonFile buttons {"OK"} default button "OK"
		
	end tell
	
end run