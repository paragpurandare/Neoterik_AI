 // === Configuration ===

const API_BASE_URL = "http://localhost:8000";
const EXTENSION_CALLBACK_URL = "http://localhost:3000/auth/extension-callback/";

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (
        changeInfo.status === "complete" &&
        tab.url &&
        tab.url.startsWith(EXTENSION_CALLBACK_URL)
    ) {
        console.log("Detected extension callback URL in tab", tabId, tab.url);
        handleAuthCallback(tabId, tab.url);
    }
});
// === In-memory per-tab cache ===
const tabsCache = {};
chrome.storage.local.get("jobPagesByTab", ({ jobPagesByTab }) => {
    if (jobPagesByTab) Object.assign(tabsCache, jobPagesByTab);
});
let activeAgentTab = null;

// Helper: persist only final payloads
const updateLocal = async (tabId, patch) => {
    tabsCache[tabId] = { ...(tabsCache[tabId] || {}), ...patch };
    await chrome.storage.local.set({ jobPagesByTab: tabsCache });
};

const sendToTab = (tabId, msg) =>
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});

// === URL detection per navigation ===
const runDetection = async (tabId, url) => {
    const cache = tabsCache[tabId];
    if (cache?.url === url) return;
    try {
        const resp = await fetch(`${API_BASE_URL}/check-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        await updateLocal(tabId, {
            url,
            detected: data.is_job_application,
            jobData: data.parsed_output || null,
            agent: { status: 'idle' }
        });
        if (data.is_job_application) {
            chrome.action.setBadgeText({ text: "JOB", tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#419D78", tabId });
            sendToTab(tabId, { action: "jobDetected" });
        } else {
            chrome.action.setBadgeText({ text: "", tabId });
        }
    } catch (err) {
        console.warn("[Detection] error:", err);
    }
};

// === Agent execution per tab ===
const fireAgent = async (tabId) => {
    const cache = tabsCache[tabId];
    if (!cache?.detected) return;
    if (cache.agent.status === 'running') return;
    if (cache.agent.status === 'finished') {
        sendToTab(tabId, {
            action: "agentState",
            tabId,
            state: "finished",
            data: cache.agent.data
        });
        return;
    }
    if (activeAgentTab && activeAgentTab !== tabId) {
        sendToTab(tabId, { action: "agentBlocked" });
        return;
    }
    activeAgentTab = tabId;
    await updateLocal(tabId, { agent: { status: "running" } });
    sendToTab(tabId, { action: "agentState", tabId, state: "running" });
    const payload = {
        url: cache.url || "",
        scraped_html: cache.jobData?.scraped_html || "",
        job_title: cache.jobData?.job_title || "",
        company_name: cache.jobData?.company_name || ""
    };
    try {
        const res = await fetch(`${API_BASE_URL}/run-agent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { task_id } = await res.json();
        await updateLocal(tabId, { agent: { ...tabsCache[tabId].agent, taskId: task_id } });
        pollAgent(tabId, task_id);
    } catch (err) {
        console.error("[Agent] start error:", err);
        await updateLocal(tabId, { agent: { status: "error", error: err.message } });
        sendToTab(tabId, { action: "agentState", tabId, state: "error", error: err.message });
        activeAgentTab = null;
    }
};

// === Polling for agent completion ===
const pollAgent = (tabId, taskId) => {
    const intv = setInterval(async () => {
        try {
            const r = await fetch(`${API_BASE_URL}/tasks/${taskId}`);
            const d = await r.json();
            if (d.status === "SUCCESS") {
                clearInterval(intv);
                await updateLocal(tabId, { agent: { status: "finished", data: d.result } });
                sendToTab(tabId, { action: "agentState", tabId, state: "finished", data: d.result });
                activeAgentTab = null;
            }
            if (d.status === "FAILURE") {
                clearInterval(intv);
                await updateLocal(tabId, { agent: { status: "error", error: d.error } });
                sendToTab(tabId, { action: "agentState", tabId, state: "error", error: d.error });
                activeAgentTab = null;
            }
        } catch (e) {
            console.warn("[Agent] poll error:", e);
        }
    }, 3000);
};

// === Cover Letter Generation ===
async function handleGenerateCoverLetter(tabId, data) {
    await updateLocal(tabId, {
        isCoverLetterGenerating: true,
        isCoverLetterGenerated: false,
        coverLetter: null,
        coverLetterError: null
    });
    try {
        const { authToken } = await chrome.storage.local.get("authToken");
        const res = await fetch(`${API_BASE_URL}/generate-cover-letter`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const errorResult = await res.json();
            throw new Error(errorResult.detail || "Failed to start the generation task.");
        }
        const taskInfo = await res.json();
        pollCoverLetterTask(tabId, taskInfo.task_id);
    } catch (err) {
        await updateLocal(tabId, {
            isCoverLetterGenerating: false,
            isCoverLetterGenerated: false,
            coverLetterError: err.message || "Network error"
        });
        sendToTab(tabId, { action: "coverLetterError", error: err.message || "Network error" });
    }
}

function pollCoverLetterTask(tabId, taskId) {
    const intv = setInterval(async () => {
        try {
            const { authToken } = await chrome.storage.local.get("authToken");
            const res = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
                headers: { "Authorization": `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.status === "SUCCESS") {
                clearInterval(intv);
                const finalResult = data.result;
                await updateLocal(tabId, {
                    isCoverLetterGenerating: false,
                    isCoverLetterGenerated: true,
                    coverLetter: finalResult.cover_letter?.cover_letter,
                    coverLetterError: null
                });
                sendToTab(tabId, { action: "coverLetterGenerated", coverLetter: finalResult.cover_letter?.cover_letter, });
            } else if (data.status === "FAILURE") {
                clearInterval(intv);
                await updateLocal(tabId, {
                    isCoverLetterGenerating: false,
                    isCoverLetterGenerated: false,
                    coverLetterError: data.error || "Failed to generate cover letter"
                });
                sendToTab(tabId, { action: "coverLetterError", error: data.error || "Failed to generate cover letter" });
            }
        } catch (error) {
            clearInterval(intv);
            await updateLocal(tabId, {
                isCoverLetterGenerating: false,
                isCoverLetterGenerated: false,
                coverLetterError: "Network error while checking status."
            });
            sendToTab(tabId, { action: "coverLetterError", error: "Network error while checking status." });
        }
    }, 2000);
}

// === Save Cover Letter to Backend ===
async function handleSaveCoverLetter(data, sendResponse) {
    try {
        const { authToken } = await chrome.storage.local.get("authToken");
        const res = await fetch(`${API_BASE_URL}/save-cover-letter`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authToken}`
            },
            body: JSON.stringify(data),
        });
        if (res.ok) {
            sendResponse({ success: true });
        } else {
            const errorResult = await res.json();
            sendResponse({ success: false, error: errorResult.detail || "Server error" });
        }
    } catch (err) {
        sendResponse({ success: false, error: err.message || "Network error" });
    }
}

// === Utility: Notify popup of login ===
function notifyLoginStatusChanged() {
    chrome.runtime
        .sendMessage({ action: "loginStatusChanged" })
        .catch((error) => {
            if (!error.message.includes("Could not establish connection")) {
                console.error(
                    "Background: Error sending login status message:",
                    error
                );
            }
        });
}

// === Sign Out Handler ===
function handleSignOut() {
    chrome.storage.local.clear(() => {
        notifyLoginStatusChanged();
    });
    chrome.tabs.create({
        url: "http://localhost:3000/api/auth/signout?callbackUrl=http://localhost:3000",
        active: true,
    });
}

// === Auth Callback Handler ===
const handledAuthTabs = new Set();
let signInInProgress = false;
async function handleAuthCallback(tabId, url) {
    console.log("handleAuthCallback called", tabId, url);
    if (signInInProgress) return;
    signInInProgress = true;
    if (handledAuthTabs.has(tabId)) {
        console.log("Tab already handled", tabId);
        signInInProgress = false;
        return;
    }
    handledAuthTabs.add(tabId);

    try {
        const response = await fetch("http://localhost:3000/api/auth/session", {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: "include",
        });
        console.log("Fetched session response:", response);

        if (response.ok) {
            const session = await response.json();
            console.log("Session JSON:", session);
            if (session && session.user) {
                const userPayload = {
                    id: session.user.id,
                    email: session.user.email || "",
                    name: session.user.name || "",
                    avatar_url: session.user.image || "",
                    github_username: session.user.github_username || ""
                };
                console.log("About to call /register-user with:", userPayload);
                try {
                    const regRes = await fetch(`${API_BASE_URL}/register-user`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(userPayload),
                    });
                    console.log("register-user response:", regRes.status);
                    if (!regRes.ok) {
                        console.warn("register-user failed:", await regRes.text());
                    }
                } catch (err) {
                    console.warn("Error calling register-user:", err);
                }
                await chrome.storage.local.set({
                    isLoggedIn: true,
                    user: session.user,
                    userId: session.user.id,
                    authToken: session.accessToken
                }, () => {
                    console.log("Auth: Set user in storage", session.user);
                    notifyLoginStatusChanged();
                    if (chrome.runtime.lastError) {
                        console.error("[AuthCallback] Failed to set session in storage:", chrome.runtime.lastError);
                    }
                });
               setTimeout(() => {
                chrome.tabs.update(tabId, { url: "http://localhost:3000/profile" }, (tab) => {
                    if (chrome.runtime.lastError || !tab) {
                // If tab doesn't exist, open a new one
                        chrome.tabs.create({ url: "http://localhost:3000/profile" });
                    }
                });
            }, 1000);
            } else {
                console.error("No session.user in response", session);
            }
        } else {
            console.error("Session fetch not ok", response.status);
        }
    } catch (error) {
        console.error("Error during auth callback:", error);
    }
    finally {
        signInInProgress = false;
    }
}

// === Message port for detection/agent/cover letter ===
chrome.runtime.onMessage.addListener(async (req, sender, sendResp) => {
    const tabId = sender.tab?.id || req.tabId;
    switch (req.action) {
        case "checkUrl":
            runDetection(tabId, req.url).then(() => sendResp({ ok: true }));
            return true;
        case "startAgentForTab":
        case "run_job_agent":
            fireAgent(tabId);
            sendResp({ ok: true });
            return;
        case "getTabId":
            sendResp({ tabId });
            return;
        case "generateCoverLetter":
            const anyCoverLetterRunning = Object.values(tabsCache).some(
            t => t.isCoverLetterGenerating
            );
            if (anyCoverLetterRunning && !(tabsCache[tabId]?.isCoverLetterGenerating)) {
            sendToTab(tabId, { action: "coverLetterBlocked", reason: "Another cover letter is being generated in a different tab." });
            sendResp({ ok: false, error: "Cover letter generation running in another tab" });
            return true;
            }
            await handleGenerateCoverLetter(tabId, req.data);
            sendResp({ ok: true });
            return true;
        case "saveCoverLetter":
            handleSaveCoverLetter(req.data, sendResp);
            return true;
        case "signOut":
            handleSignOut();
            sendResp({ ok: true });
            return;
    }
});

// === Tab Updates ===
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.status === "complete" && /^https?:/.test(tab.url) &&
        !tab.url.startsWith(EXTENSION_CALLBACK_URL)) {
        runDetection(tabId, tab.url);
    }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    const c = tabsCache[tabId];
    if (!c) return;
    sendToTab(tabId, {
        action: "agentState",
        tabId,
        state: c.agent?.status,
        data: c.agent?.data,
        error: c.agent?.error
    });
});

// === Tab Removed Cleanup ===
chrome.tabs.onRemoved.addListener(async (tabId) => {
    delete tabsCache[tabId];
    await chrome.storage.local.set({ jobPagesByTab: tabsCache });
    if (activeAgentTab === tabId) activeAgentTab = null;
    chrome.action.setBadgeText({ text: "", tabId });
});

 