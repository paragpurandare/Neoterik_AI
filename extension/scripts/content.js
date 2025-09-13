// File: extension/scripts/content.js

const bannerId = "neoterik-job-detected";
let bannerTimeout = null;
let lastBannerUrl = null;
let lastBannerShownAt = 0;
let clicked = false;
let isAgentRunning = false;

// Debounce utility for URL-based banner display
function debounceBanner(url, delay = 1000) {
    if (lastBannerUrl === url && Date.now() - lastBannerShownAt < delay) return false;
    lastBannerUrl = url;
    lastBannerShownAt = Date.now();
    return true;
}

const ensureBanner = (show, opts = {}) => {
    document.querySelectorAll(`#${bannerId}`).forEach(b => b.remove());
    if (!show) return;

    // Debounce by URL if provided
    if (opts.url && !debounceBanner(opts.url, 1500)) return;

    const el = document.createElement("div");
    el.id = bannerId;
    el.style.cssText = `
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
    el.innerHTML = `
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
        <button id="neoterik-banner-dismiss" style="
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
        ">×</button>
    `;
    
    // Add CSS keyframes only once
    if (!document.getElementById("neoterik-banner-style")) {
        const style = document.createElement('style');
        style.id = "neoterik-banner-style";
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateY(-20px) scale(0.95); opacity: 0; }
                to   { transform: translateY(0) scale(1); opacity: 1; }
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
                to   { transform: rotate(360deg); }
            }
            #neoterik-job-detected:hover {
                transform: translateY(-4px);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
                border-color: #419D78;
            }
        `;
        document.head.appendChild(style);
    }

    // Banner click: start agent
    el.addEventListener("click", (e) => {
        if (clicked || isAgentRunning) return;
        clicked = true;
        isAgentRunning = true;
        if (e.target.id === "neoterik-banner-dismiss") return;
        el.style.pointerEvents = "none";
        el.style.opacity = "0.9";
        el.style.transform = "scale(0.98)";
        el.innerHTML = `
            <div style="margin-right: 16px; background: linear-gradient(135deg, #419D78, #37876A); border-radius: 12px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(65, 157, 120, 0.3);">
                <div style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; margin-bottom: 6px; font-size: 16px; color: #F9FAFB;">Analyzing job posting...</div>
                <div style="font-size: 13px; color: #9CA3AF;">AI is crafting your perfect cover letter</div>
                <div style="margin-top: 8px; width: 100%; height: 4px; background: #374151; border-radius: 2px; overflow: hidden;">
                    <div style="width: 60%; height: 100%; background: linear-gradient(90deg, #419D78, #6EE7B7); border-radius: 2px; animation: pulse 1.5s ease-in-out infinite;"></div>
                </div>
            </div>
        `;
        chrome.runtime.sendMessage({ action: "run_job_agent" });
        setTimeout(() => {
            el.style.opacity = "0";
            el.style.transform = "translateY(-20px) scale(0.95)";
            setTimeout(() => el.remove(), 300);
        }, 3000);
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: "openPopup" });
        }, 3000);
    });

    // Dismiss button
    el.querySelector("#neoterik-banner-dismiss").addEventListener("click", (e) => {
        e.stopPropagation();
        el.style.opacity = "0";
        el.style.transform = "translateY(-20px) scale(0.95)";
        setTimeout(() => el.remove(), 300);
        chrome.runtime.sendMessage({ action: "bannerDismissed" });
    });

    document.body.appendChild(el);
};

// --- Listen for background messages ---
chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.action) {
        case "jobDetected":
            ensureBanner(true, { url: window.location.href });
            break;
        case "agentState":
            if (msg.state === "running" || msg.state === "finished"){
                clicked = false;
                isAgentRunning = false;
                ensureBanner(false);
            }
            if (msg.state === "error") {
                clicked = false;
                isAgentRunning = false;
                ensureBanner(true, { url: window.location.href });
            } 
            break;
        case "agentBlocked":
            alert("Please wait: research is already running in another tab.");
            break;
    }
});

// --- On load, ask background if we should show banner (debounced by URL) ---
(async () => {
    const tabId = await new Promise((res) =>
        chrome.runtime.sendMessage({ action: "getTabId" }, (r) => res(r.tabId))
    );
    const { jobPagesByTab } = await chrome.storage.local.get("jobPagesByTab");
    const tabState = jobPagesByTab?.[tabId];
    if (tabState?.detected && tabState.url === window.location.href && tabState.agent?.status !== "running" && tabState.agent?.status !== "finished") {
        ensureBanner(true, { url: tabState.url || window.location.href });
    }
})();

