/**
 * Frontend TypeScript application for dental portal extraction
 */

// Type definitions (inline for browser compatibility)
type PortalType = 'DNOA' | 'DentaQuest' | 'MetLife' | 'Cigna' | 'Aetna' | 'UnitedHealthcare';

interface PortalTestData {
    firstName: string;
    lastName: string;
    subscriberId: string;
    dateOfBirth: string;
}

interface ExtractionRequest {
    portal: PortalType;
    subscriberId: string;
    dateOfBirth: string;
    firstName: string;
    lastName: string;
}

interface ExtractionResponse {
    success: boolean;
    data?: ExtractionResult;
    error?: string;
}

interface ExtractionResult {
    success: boolean;
    summary?: any;
    eligibility?: any;
    claims?: Claim[];
    patient?: any;
    error?: string;
    timestamp?: string;
}

interface Claim {
    number: string;
    serviceDate: string;
    status: string;
    patientName: string;
    patientId?: string;
    dateOfBirth?: string;
    providerName?: string;
    tin?: string;
    billed: number;
    paid: number;
    patientPay?: number;
    services: CDTCode[];
    detailUrl?: string;
    link?: string;
}

interface CDTCode {
    code: string;
    description: string;
    toothNumber?: string;
    tooth?: string;  // DNOA uses 'tooth'
    serviceDate?: string;
    date?: string;  // DNOA uses 'date'
    provider?: string;
    amountBilled?: number;
    amountPaid?: number;
    patientPay?: number;
}

interface LogEvent {
    message: string;
    timestamp: string;
    level?: 'info' | 'warning' | 'error';
}

// ============= Type Guards =============

function isInputElement(element: Element | null): element is HTMLInputElement {
    return element !== null && element instanceof HTMLInputElement;
}

function isSelectElement(element: Element | null): element is HTMLSelectElement {
    return element !== null && element instanceof HTMLSelectElement;
}

function isFormElement(element: Element | null): element is HTMLFormElement {
    return element !== null && element instanceof HTMLFormElement;
}

// ============= DOM Helper Functions =============

function safeGetElement<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function safeSetValue(id: string, value: string): void {
    const element = safeGetElement<HTMLInputElement>(id);
    if (element && isInputElement(element)) {
        element.value = value;
    }
}

function safeGetValue(id: string): string {
    const element = safeGetElement<HTMLElement>(id);
    if (element && isInputElement(element)) {
        return element.value;
    }
    if (element && isSelectElement(element)) {
        return element.value;
    }
    return '';
}

function safeSetHTML(id: string, html: string): void {
    const element = safeGetElement<HTMLElement>(id);
    if (element) {
        element.innerHTML = html;
    }
}

function safeShow(id: string): void {
    const element = safeGetElement<HTMLElement>(id);
    if (element) {
        element.style.display = 'block';
    }
}

function safeHide(id: string): void {
    const element = safeGetElement<HTMLElement>(id);
    if (element) {
        element.style.display = 'none';
    }
}

// ============= Configuration =============

// Get API key from URL params
const urlParams = new URLSearchParams(window.location.search);
const apiKey = urlParams.get('key') || 'demo2024secure';

// Test data for each portal
const testData: Record<PortalType, PortalTestData> = {
    'DNOA': {
        firstName: 'SOPHIE',
        lastName: 'ROBINSON',
        subscriberId: '825978894',
        dateOfBirth: '09/27/2016'
    },
    'DentaQuest': {
        firstName: 'Cason',
        lastName: 'Wright',
        subscriberId: '710875473',
        dateOfBirth: '03/29/2016'
    },
    'MetLife': {
        firstName: 'AVERLY',
        lastName: 'TEDFORD',
        subscriberId: '635140654',
        dateOfBirth: '06/15/2015'
    },
    'Cigna': {
        firstName: 'ELLIE',
        lastName: 'WILLIAMS',
        subscriberId: 'U72997972',
        dateOfBirth: '11/14/2017'
    },
    'Aetna': {
        firstName: '',
        lastName: '',
        subscriberId: '',
        dateOfBirth: ''
    },
    'UnitedHealthcare': {
        firstName: '',
        lastName: '',
        subscriberId: '',
        dateOfBirth: ''
    }
};

// ============= Global State =============

let eventSource: EventSource | null = null;
let extractedData: ExtractionResult | null = null;

// ============= VPN Location Check =============

async function checkVPNLocation(): Promise<void> {
    // Only check location if running locally (not on Render)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        try {
            const response = await fetch('/api/location');
            const data = await response.json();
            
            if (data && data.isUS === false) {
                safeShow('vpnWarning');
            } else if (data && data.isUS === true) {
                safeHide('vpnWarning');
            }
        } catch (error) {
            // Silently fail if location check doesn't work
            console.debug('Location check failed:', error);
        }
    }
}

// ============= Form Handling =============

function fillFormWithTestData(portal: PortalType): void {
    const data = testData[portal];
    if (data) {
        safeSetValue('firstName', data.firstName);
        safeSetValue('lastName', data.lastName);
        safeSetValue('subscriberId', data.subscriberId);
        safeSetValue('dateOfBirth', data.dateOfBirth);
    }
}

function resetForm(): void {
    const form = safeGetElement<HTMLFormElement>('extractForm');
    if (form && isFormElement(form)) {
        form.reset();
    }
    
    // Clear sections
    safeSetHTML('logsContainer', '');
    const summaryGrid = safeGetElement<HTMLElement>('summaryGrid');
    const cdtCodesSection = safeGetElement<HTMLElement>('cdtCodesSection');
    if (summaryGrid) summaryGrid.innerHTML = '';
    if (cdtCodesSection) cdtCodesSection.innerHTML = '';
    
    // Hide sections
    safeHide('logsSection');
    safeHide('resultsSection');
    safeHide('errorMessage');
    safeHide('otpSection');
    
    // Reset button state
    const extractBtn = safeGetElement<HTMLButtonElement>('extractBtn');
    if (extractBtn) {
        extractBtn.disabled = false;
    }
    
    const btnText = safeGetElement<HTMLElement>('btnText');
    if (btnText) {
        btnText.textContent = 'Extract Data';
    }
    
    const statusBadge = safeGetElement<HTMLElement>('statusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Ready';
        statusBadge.className = 'status-badge ready';
    }
    
    // Pre-fill with default test data
    const portal = safeGetValue('portal') as PortalType;
    fillFormWithTestData(portal);
}

// ============= Error Handling =============

function showError(message: string): void {
    const errorMessage = safeGetElement<HTMLElement>('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
}

function hideError(): void {
    safeHide('errorMessage');
}

// ============= Log Display =============

function addLog(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    const logsContainer = safeGetElement<HTMLElement>('logsContainer');
    if (!logsContainer) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${level}`;
    logEntry.textContent = message;
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// ============= Results Display =============

function displayResults(data: ExtractionResult): void {
    if (!data.summary) {
        showError('No summary data available');
        return;
    }
    
    const summary = data.summary;
    
    // Debug: log the data structure
    console.log('Full data:', data);
    console.log('Summary:', summary);
    console.log('Summary.cdtCodes:', summary.cdtCodes);
    const summaryGrid = safeGetElement<HTMLElement>('summaryGrid');
    
    if (summaryGrid) {
        // Different display logic for different portals
        if (summary.planName) {
            // DNOA portal - has plan info and benefits
            const deductInfo = summary.deductible || {};
            const maxInfo = summary.annualMaximum || {};
            
            summaryGrid.innerHTML = `
                <div class="summary-card">
                    <h4>Patient</h4>
                    <div class="value">${summary.patientName}</div>
                    <div class="subtitle">ID: ${summary.memberId}</div>
                </div>
                <div class="summary-card">
                    <h4>Plan</h4>
                    <div class="value">${summary.status || 'Active'}</div>
                    <div class="subtitle">${summary.planName}</div>
                </div>
                <div class="summary-card">
                    <h4>Deductible</h4>
                    <div class="value">$${formatAmount(deductInfo.remaining || 0)}</div>
                    <div class="subtitle">Remaining of $${formatAmount(deductInfo.amount || 0)}</div>
                </div>
                <div class="summary-card">
                    <h4>Annual Maximum</h4>
                    <div class="value">$${formatAmount(maxInfo.remaining || 0)}</div>
                    <div class="subtitle">Remaining of $${formatAmount(maxInfo.amount || 0)}</div>
                </div>
                ${summary.benefitCategories !== undefined ? `
                <div class="summary-card">
                    <h4>Benefits</h4>
                    <div class="value">${summary.benefitCategories}</div>
                    <div class="subtitle">Coverage categories</div>
                </div>
                ` : ''}
                ${summary.totalCDTCodes !== undefined ? `
                <div class="summary-card">
                    <h4>✅ CDT Codes</h4>
                    <div class="value">${summary.totalCDTCodes}</div>
                    <div class="subtitle">Procedures extracted</div>
                </div>
                ` : ''}
            `;
        } else {
            // Other portals (Cigna, DentaQuest, MetLife) - have claims data
            summaryGrid.innerHTML = `
                <div class="summary-card">
                    <h4>Patient</h4>
                    <div class="value">${summary.patientName}</div>
                    <div class="subtitle">ID: ${summary.memberId}</div>
                </div>
                <div class="summary-card">
                    <h4>💰 Total Billed</h4>
                    <div class="value">$${formatAmount(calculateTotalBilled(data.claims))}</div>
                    <div class="subtitle">Submitted charges</div>
                </div>
                <div class="summary-card">
                    <h4>✅ Insurance Paid</h4>
                    <div class="value">$${formatAmount(calculateTotalPaid(data.claims))}</div>
                    <div class="subtitle">Approved amount</div>
                </div>
                <div class="summary-card">
                    <h4>Patient Balance</h4>
                    <div class="value">$${formatAmount(calculatePatientBalance(data.claims))}</div>
                    <div class="subtitle">Amount due</div>
                </div>
                <div class="summary-card">
                    <h4>📋 Claims Processed</h4>
                    <div class="value">${data.claims?.length || 0}</div>
                    <div class="subtitle">Historical claims</div>
                </div>
                <div class="summary-card">
                    <h4>Deductible</h4>
                    <div class="value">$${formatAmount(summary.deductibleRemaining || summary.deductible?.remaining || summary.deductible || 0)}</div>
                    <div class="subtitle">Remaining of $${formatAmount(summary.deductible?.amount || summary.deductible || 0)}</div>
                </div>
            `;
        }
    }
    
    // Display CDT codes if available
    if (data.claims && data.claims.length > 0) {
        displayCDTCodes(data.claims);
    } else if ((summary as any).cdtCodes && (summary as any).cdtCodes.length > 0) {
        // DNOA stores CDT codes in summary
        console.log('Found CDT codes in summary:', (summary as any).cdtCodes.length);
        displayCDTCodesFromArray((summary as any).cdtCodes);
    } else if ((data as any).cdtCodes && (data as any).cdtCodes.length > 0) {
        // Fallback: CDT codes at root level
        displayCDTCodesFromArray((data as any).cdtCodes);
    }
    
    // Show results section
    const resultsSection = safeGetElement<HTMLElement>('resultsSection');
    if (resultsSection) {
        resultsSection.classList.add('active');
    }
    
    // Update status
    const statusBadge = safeGetElement<HTMLElement>('statusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Success';
        statusBadge.className = 'status-badge success';
    }
}

function displayCDTCodesFromArray(cdtCodes: CDTCode[]): void {
    if (cdtCodes.length === 0) {
        return;
    }
    
    const existingCdtSection = safeGetElement<HTMLElement>('cdtSection');
    if (existingCdtSection) {
        existingCdtSection.remove();
    }
    
    const cdtSection = document.createElement('div');
    cdtSection.id = 'cdtSection';
    cdtSection.className = 'cdt-codes-section';
    cdtSection.innerHTML = `
        <div class="cdt-header">
            <h2>🦷 CDT PROCEDURE CODES</h2>
            <span class="cdt-count">${cdtCodes.length}</span>
            <p>Dental procedures successfully extracted!</p>
        </div>
        <div class="cdt-success-message">
            <span class="success-icon">✅</span>
            <span>CDT Codes Successfully Extracted - ${cdtCodes.length} Dental Procedures</span>
        </div>
        <p class="cdt-description">
            Complete dental procedure history for ${extractedData?.summary?.patientName || 'patient'}:
        </p>
        <table class="cdt-table">
            <thead>
                <tr>
                    <th>CDT Code</th>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Tooth</th>
                </tr>
            </thead>
            <tbody>
                ${cdtCodes.map(code => `
                    <tr>
                        <td class="code-cell">${code.code || '-'}</td>
                        <td>${code.description || 'Dental Procedure'}</td>
                        <td>${code.serviceDate || code.date || '-'}</td>
                        <td>${code.toothNumber || code.tooth || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    const cdtCodesSection = safeGetElement<HTMLElement>('cdtCodesSection');
    if (cdtCodesSection) {
        cdtCodesSection.appendChild(cdtSection);
    }
}

function displayCDTCodes(claims: Claim[]): void {
    const cdtCodes: CDTCode[] = [];
    
    // Extract all CDT codes from claims
    claims.forEach(claim => {
        if (claim.services && claim.services.length > 0) {
            cdtCodes.push(...claim.services);
        }
    });
    
    displayCDTCodesFromArray(cdtCodes);
}

// ============= Utility Functions =============

function formatAmount(value: any): string {
    if (value === null || value === undefined) return '0.00';
    
    // If it's an object, try to extract a numeric value
    if (typeof value === 'object') {
        // Try common property names
        if ('amount' in value) return formatAmount(value.amount);
        if ('value' in value) return formatAmount(value.value);
        if ('remaining' in value) return formatAmount(value.remaining);
        if ('total' in value) return formatAmount(value.total);
        return '0.00';
    }
    
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    return isNaN(num) ? '0.00' : num.toFixed(2);
}

function calculateTotalBilled(claims?: Claim[]): number {
    if (!claims) return 0;
    return claims.reduce((sum, claim) => sum + (claim.billed || 0), 0);
}

function calculateTotalPaid(claims?: Claim[]): number {
    if (!claims) return 0;
    return claims.reduce((sum, claim) => sum + (claim.paid || 0), 0);
}

function calculatePatientBalance(claims?: Claim[]): number {
    if (!claims) return 0;
    return claims.reduce((sum, claim) => sum + (claim.patientPay || 0), 0);
}

function downloadJSON(): void {
    if (!extractedData) return;
    
    const dataStr = JSON.stringify(extractedData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `dental-data-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

function viewJSON(): void {
    if (!extractedData) return;
    
    const jsonWindow = window.open('', '_blank');
    if (jsonWindow) {
        jsonWindow.document.write(`
            <html>
                <head>
                    <title>Extraction Data</title>
                    <style>
                        body { 
                            font-family: monospace; 
                            padding: 20px; 
                            background: #1e1e1e; 
                            color: #d4d4d4;
                        }
                        pre { 
                            white-space: pre-wrap; 
                            word-wrap: break-word; 
                        }
                    </style>
                </head>
                <body>
                    <pre>${JSON.stringify(extractedData, null, 2)}</pre>
                </body>
            </html>
        `);
    }
}

// ============= OTP Handling =============

async function submitOTP(): Promise<void> {
    const otpInput = safeGetElement<HTMLInputElement>('otpInput');
    const otp = otpInput ? otpInput.value : '';
    
    if (!otp || otp.length !== 6) {
        showError('Please enter a 6-digit OTP code');
        return;
    }
    
    try {
        const response = await fetch(`/api/submit-otp?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp })
        });
        
        if (response.ok) {
            safeHide('otpSection');
            if (otpInput) {
                otpInput.value = '';
            }
        } else {
            showError('Failed to submit OTP');
        }
    } catch (error) {
        showError('Error submitting OTP');
    }
}

// ============= Main Extraction Function =============

async function handleExtraction(event: Event): Promise<void> {
    event.preventDefault();
    
    hideError();
    safeSetHTML('logsContainer', '');
    
    const logsSection = safeGetElement<HTMLElement>('logsSection');
    const resultsSection = safeGetElement<HTMLElement>('resultsSection');
    
    if (logsSection) {
        logsSection.classList.add('active');
    }
    if (resultsSection) {
        resultsSection.classList.remove('active');
    }
    
    // Clear previous results
    const summaryGrid = safeGetElement<HTMLElement>('summaryGrid');
    const cdtCodesSection = safeGetElement<HTMLElement>('cdtCodesSection');
    if (summaryGrid) summaryGrid.innerHTML = '';
    if (cdtCodesSection) cdtCodesSection.innerHTML = '';
    
    const statusBadge = safeGetElement<HTMLElement>('statusBadge');
    if (statusBadge) {
        statusBadge.textContent = 'Running';
        statusBadge.className = 'status-badge running';
    }
    
    // Disable button
    const extractBtn = safeGetElement<HTMLButtonElement>('extractBtn');
    if (extractBtn) {
        extractBtn.disabled = true;
    }
    
    const btnText = safeGetElement<HTMLElement>('btnText');
    if (btnText) {
        btnText.textContent = 'Extracting...';
    }
    
    // Prepare request data
    const requestData: ExtractionRequest = {
        portal: safeGetValue('portal') as PortalType,
        firstName: safeGetValue('firstName'),
        lastName: safeGetValue('lastName'),
        subscriberId: safeGetValue('subscriberId'),
        dateOfBirth: safeGetValue('dateOfBirth')
    };
    
    // Close existing SSE connection
    if (eventSource) {
        eventSource.close();
    }
    
    // Create new SSE connection
    eventSource = new EventSource(`/api/stream?key=${apiKey}`);
    
    eventSource.addEventListener('log', (e: MessageEvent) => {
        const data: LogEvent = JSON.parse(e.data);
        addLog(data.message, data.level || 'info');
    });
    
    eventSource.addEventListener('otp_required', () => {
        safeShow('otpSection');
        const otpInput = safeGetElement<HTMLInputElement>('otpInput');
        if (otpInput) {
            otpInput.focus();
        }
    });
    
    eventSource.addEventListener('complete', () => {
        addLog('✅ Extraction complete', 'info');
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    });
    
    eventSource.addEventListener('error', () => {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    });
    
    // Send extraction request
    try {
        const response = await fetch(`/api/extract?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        const result: ExtractionResponse = await response.json();
        
        if (extractBtn) {
            extractBtn.disabled = false;
        }
        if (btnText) {
            btnText.textContent = 'Extract Data';
        }
        
        if (result.success && result.data) {
            extractedData = result.data;
            displayResults(result.data);
        } else {
            showError(result.error || 'Extraction failed');
            if (statusBadge) {
                statusBadge.textContent = 'Failed';
                statusBadge.className = 'status-badge error';
            }
        }
    } catch (error) {
        showError('Network error occurred');
        if (extractBtn) {
            extractBtn.disabled = false;
        }
        if (btnText) {
            btnText.textContent = 'Extract Data';
        }
        if (statusBadge) {
            statusBadge.textContent = 'Error';
            statusBadge.className = 'status-badge error';
        }
    } finally {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    }
}

// ============= Event Listeners =============

function initializeEventListeners(): void {
    // Portal change listener
    const portalSelect = safeGetElement<HTMLSelectElement>('portal');
    if (portalSelect && isSelectElement(portalSelect)) {
        portalSelect.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement;
            const portal = target.value as PortalType;
            fillFormWithTestData(portal);
        });
    }
    
    // Form submission
    const form = safeGetElement<HTMLFormElement>('extractForm');
    if (form && isFormElement(form)) {
        form.addEventListener('submit', handleExtraction);
    }
    
    // OTP submission
    const submitOtpBtn = safeGetElement<HTMLButtonElement>('submitOtpBtn');
    if (submitOtpBtn) {
        submitOtpBtn.addEventListener('click', submitOTP);
    }
    
    const otpInput = safeGetElement<HTMLInputElement>('otpInput');
    if (otpInput && isInputElement(otpInput)) {
        otpInput.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                submitOTP();
            }
        });
    }
}

// ============= Initialization =============

function initialize(): void {
    // Initialize event listeners first
    initializeEventListeners();
    
    // Then fill default values (after DOM is guaranteed to be ready)
    const portalSelect = safeGetElement<HTMLSelectElement>('portal');
    if (portalSelect && isSelectElement(portalSelect)) {
        const portal = portalSelect.value as PortalType || 'DNOA';
        fillFormWithTestData(portal);
    }
    
    // Check VPN location
    checkVPNLocation();
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', initialize);

// ============= Global Functions (for HTML onclick) =============

// Make functions available globally for HTML onclick handlers
(window as any).downloadJSON = downloadJSON;
(window as any).viewJSON = viewJSON;
(window as any).resetForm = resetForm;