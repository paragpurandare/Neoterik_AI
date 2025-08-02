console.log("Neoterik Cover Letter Assistant: Content script loaded");

// Debounce helper
let lastDetectedUrl = null;
function debounce(func, wait) {
	let timeout;
	return function (...args) {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

// Debounced job page check
const checkCurrentUrlDebounced = debounce(function () {
    const url = window.location.href;
    if (lastDetectedUrl === url) {
        // If already detected, still inject the banner if not present
        if (!document.getElementById("neoterik-job-detected")) {
            chrome.runtime.sendMessage(
                { action: "shouldInjectBanner", url },
                (response) => {
                    if (response?.allow) {
                        injectJobPageNotification();
                    }
                }
            );
        }
        return;
    }
    chrome.runtime.sendMessage({ action: "checkUrl", url }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            return;
        }

        if (response?.success && response.isJobPage) {
            console.log("✅ Job page detected!");
            lastDetectedUrl = url; // Update last detected URL

            // Inject banner only once
            if (!document.getElementById("neoterik-job-detected")) {
                chrome.runtime.sendMessage(
                    { action: "shouldInjectBanner", url },
                    (response) => {
                        if (response?.allow) {
                            injectJobPageNotification();
                        }
                    }
                );
            }
        }
    });
}, 1000);

// Add a global flag
let isAgentRunning = false;

// Inject the banner
function injectJobPageNotification() {
    document
        .querySelectorAll("#neoterik-job-detected")
        .forEach((b) => b.remove());
    let clicked = false;
    const notification = document.createElement("div");
    notification.id = "neoterik-job-detected";
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1a1a1a;
        color: #E5E7EB;
        padding: 20px;
        border-radius: 16px;
        font-family: 'Inter', 'Segoe UI', Tahoma, sans-serif;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        cursor: pointer;
        max-width: 380px;
        border: 1px solid #30363D;
        transform: translateY(0);
        transition: all 0.3s ease;
        animation: slideIn 0.5s ease-out;
        backdrop-filter: blur(10px);
    `;

    notification.innerHTML = `
        <div style="
            margin-right: 16px; 
            background: linear-gradient(135deg, #419D78, #37876A); 
            border-radius: 12px; 
            width: 48px; 
            height: 48px; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            box-shadow: 0 4px 12px rgba(65, 157, 120, 0.3);
            position: relative;
            overflow: hidden;
        ">
            <div style="
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                animation: shimmer 2s infinite;
            "></div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 7V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7M21 7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7M21 7L12 13L3 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
            <div style="
                font-weight: 700; 
                margin-bottom: 6px; 
                font-size: 16px; 
                color: #F9FAFB;
                line-height: 1.2;
            ">Neoterik detected a job!</div>
            <div style="
                font-size: 13px; 
                color: #9CA3AF;
                line-height: 1.4;
            ">Click to generate a tailored cover letter</div>
            <div style="
                margin-top: 8px;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                background: rgba(65, 157, 120, 0.15);
                border: 1px solid rgba(65, 157, 120, 0.3);
                border-radius: 8px;
                font-size: 11px;
                font-weight: 600;
                color: #6EE7B7;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            ">
                <div style="
                    width: 6px;
                    height: 6px;
                    background: #419D78;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                "></div>
                AI-Powered
            </div>
        </div>
    `;

    // Enhanced CSS animations matching Next.js app style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { 
                transform: translateY(-20px) scale(0.95); 
                opacity: 0; 
            }
            to { 
                transform: translateY(0) scale(1); 
                opacity: 1; 
            }
        }
        @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        #neoterik-job-detected:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
            border-color: #419D78;
        }
        #neoterik-job-detected:hover .icon-container {
            transform: scale(1.05);
        }
    `;
    document.head.appendChild(style);

    // Run agent on click
    notification.addEventListener("click", () => {
        if (clicked || isAgentRunning) return;
        clicked = true;
        isAgentRunning = true;
        console.log("📧 Banner clicked: Starting job agent...");
        
        // Disable interaction and show loading state
        notification.style.pointerEvents = "none";
        notification.style.opacity = "0.9";
        notification.style.transform = "scale(0.98)";
        
        // Replace content with loading state
        notification.innerHTML = `
            <div style="
                margin-right: 16px; 
                background: linear-gradient(135deg, #419D78, #37876A); 
                border-radius: 12px; 
                width: 48px; 
                height: 48px; 
                display: flex; 
                align-items: center; 
                justify-content: center;
                box-shadow: 0 4px 12px rgba(65, 157, 120, 0.3);
            ">
                <div style="
                    width: 20px; 
                    height: 20px; 
                    border: 2px solid rgba(255,255,255,0.3); 
                    border-top: 2px solid white; 
                    border-radius: 50%; 
                    animation: spin 0.8s linear infinite;
                "></div>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="
                    font-weight: 700; 
                    margin-bottom: 6px; 
                    font-size: 16px; 
                    color: #F9FAFB;
                ">Analyzing job posting...</div>
                <div style="
                    font-size: 13px; 
                    color: #9CA3AF;
                ">AI is crafting your perfect cover letter</div>
                <div style="
                    margin-top: 8px;
                    width: 100%;
                    height: 4px;
                    background: #374151;
                    border-radius: 2px;
                    overflow: hidden;
                ">
                    <div style="
                        width: 60%;
                        height: 100%;
                        background: linear-gradient(90deg, #419D78, #6EE7B7);
                        border-radius: 2px;
                        animation: pulse 1.5s ease-in-out infinite;
                    "></div>
                </div>
            </div>
        `;

        chrome.runtime.sendMessage({ action: "run_job_agent" }, () => {
            isAgentRunning = false;
        });

        // Remove banner with nice animation
        setTimeout(() => {
            notification.style.opacity = "0";
            notification.style.transform = "translateY(-20px) scale(0.95)";
            setTimeout(() => notification.remove(), 300);
        }, 2000);

        // Open popup after delay
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: "openPopup" });
        }, 3000);
    });

    // Enhanced dismiss button
    const dismissBtn = document.createElement("button");
    dismissBtn.style.cssText = `
        background: rgba(156, 163, 175, 0.1);
        border: 1px solid rgba(156, 163, 175, 0.2);
        color: #9CA3AF;
        font-size: 14px;
        cursor: pointer;
        margin-left: 12px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        transition: all 0.2s ease;
        padding: 0;
        line-height: 1;
        font-weight: 500;
        flex-shrink: 0;
    `;
    dismissBtn.innerHTML = "×";
    
    dismissBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        notification.style.opacity = "0";
        notification.style.transform = "translateY(-20px) scale(0.95)";
        setTimeout(() => notification.remove(), 300);
        chrome.runtime.sendMessage({ action: "bannerDismissed" });
    });
    
    dismissBtn.addEventListener("mouseover", () => {
        dismissBtn.style.background = "rgba(248, 113, 113, 0.1)";
        dismissBtn.style.borderColor = "rgba(248, 113, 113, 0.3)";
        dismissBtn.style.color = "#F87171";
        dismissBtn.style.transform = "scale(1.05)";
    });
    
    dismissBtn.addEventListener("mouseout", () => {
        dismissBtn.style.background = "rgba(156, 163, 175, 0.1)";
        dismissBtn.style.borderColor = "rgba(156, 163, 175, 0.2)";
        dismissBtn.style.color = "#9CA3AF";
        dismissBtn.style.transform = "scale(1)";
    });
    
    notification.appendChild(dismissBtn);
    document.body.appendChild(notification);
}

// Run on initial load
setTimeout(() => {
	checkCurrentUrlDebounced();
}, 2000);

// Watch for URL changes (SPA, client routing)
let lastUrl = location.href;
new MutationObserver(() => {
	const url = location.href;
	if (url !== lastUrl) {
        lastUrl = url;
        lastDetectedUrl = null; // Reset last detected URL
		checkCurrentUrlDebounced();
	}
}).observe(document, { subtree: true, childList: true });

// For history navigation
window.addEventListener("popstate", checkCurrentUrlDebounced);

// Listen for messages from background script to inject banner
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "injectBanner") {
		injectJobPageNotification(); // or whatever function injects your banner
	}
});

 