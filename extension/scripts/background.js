// === Configuration ===

const API_BASE_URL = "http://localhost:8000";
const EXTENSION_CALLBACK_URL = "http://localhost:3000/auth/extension-callback/";

// Used for debouncing URL checks per tab
const checkUrlTimers = {};
// Add a new structure for per-tab job info
const jobPagesByTab = {};

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
    console.log("[Extension] Opening sign out page with callback URL...");

    // 1. Clear local extension storage immediately.
    chrome.storage.local.clear(() => {
        console.log("[Extension] Local storage cleared.");
        notifyLoginStatusChanged();
    });

    // 2. Open the sign-out page with a callbackUrl to ensure proper redirection.
    // This tells NextAuth where to go after a successful sign-out.
    chrome.tabs.create({
        url: "http://localhost:3000/api/auth/signout?callbackUrl=http://localhost:3000",
        active: true,
    });
}

// === Auth Callback Handler ===
const handledAuthTabs = new Set();
let signInInProgress = false;
async function handleAuthCallback(tabId, url) {
    if (signInInProgress) return;
    signInInProgress = true;
    if (handledAuthTabs.has(tabId)) {
        console.warn("Auth callback already handled for tab:", tabId);
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

        if (response.ok) {
            const session = await response.json();
            if (session && session.user) {
                // 1. Ensure user is registered in our backend
                const userPayload = {
                    id: session.user.id,
                    email: session.user.email || "",
                    name: session.user.name || "",
                    avatar_url: session.user.image || "",
                    github_username: session.user.github_username || ""
                };
                try {
                    const regRes = await fetch(`${API_BASE_URL}/register-user`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(userPayload),
                    });
                    if (!regRes.ok) {
                        console.warn("register-user failed:", await regRes.text());
                    }
                } catch (err) {
                    console.warn("Error calling register-user:", err);
                }

                // 2. Store session + token locally
                await chrome.storage.local.set({
                    isLoggedIn: true,
                    user: session.user,
                    userId: session.user.id,
                    authToken: session.accessToken
                });
                console.log("🔑 Session result from server:", session);
                notifyLoginStatusChanged();
                setTimeout(() => {
                    chrome.tabs.update(tabId, { url: "http://localhost:3000/profile" }); // Redirect to profile or home
                }, 1000);
            }
        } else {
            console.error("Auth callback failed to fetch session");
        }
    } catch (error) {
        console.error("Error during auth callback:", error);
    }
    finally {
        signInInProgress = false;
    }
}

function shouldProceedWithDetection(url, callback) {
	chrome.storage.local.get("jobSession", (data) => {
		const session = data.jobSession;
		if (session?.isLocked && !session?.isCoverLetterGenerated) {
			console.warn("🔒 Detection blocked due to locked session.");
			return callback(false);
		}
		callback(true);
	});
}

// Helper to update jobPagesByTab in chrome.storage.local
async function updateJobPagesByTab(tabId, data) {
    const { jobPagesByTab: stored } = await chrome.storage.local.get("jobPagesByTab");
    const updated = { ...(stored || {}), [tabId]: { ...(stored?.[tabId] || {}), ...data } };
    await chrome.storage.local.set({ jobPagesByTab: updated });
    jobPagesByTab[tabId] = updated[tabId];
}

// Helper to get job info for a tab
async function getJobPageForTab(tabId) {
    const { jobPagesByTab: stored } = await chrome.storage.local.get("jobPagesByTab");
    return (stored || {})[tabId] || null;
}

function pollTaskStatus(taskId) {
	const interval = setInterval(async () => {
		try{
            const { authToken } = await chrome.storage.local.get("authToken"); 
            const res = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
                 headers: {
                    "Authorization": `Bearer ${authToken}`
                }
            });
			const data = await res.json();

			if (data.status === 'SUCCESS') {
                clearInterval(interval);
                // The task is complete. The result is in data.result
                const finalResult = data.result;

                const { jobSession } = await chrome.storage.local.get("jobSession");
                
                // Update storage with the final cover letter
                await chrome.storage.local.set({
                    jobSession: {
                        ...jobSession,
                        isLocked: false,
                        isCoverLetterGenerated: true,
                        isCoverLetterGenerating: false,
                        coverLetter: finalResult.cover_letter?.cover_letter, // Access nested property
                        coverLetterError: null,
                    },
                });

                // Send the final cover letter back to the popup
                chrome.runtime.sendMessage({
                    action: "coverLetterGenerated",
                    coverLetter: finalResult.cover_letter?.cover_letter,
                });
			} else if (data.status === "FAILURE") {
                clearInterval(interval);
                chrome.runtime.sendMessage({
                    action: "coverLetterError",
                    error: "Failed to generate cover letter on the server.",
                });
            }
		} catch (error) {
            clearInterval(interval);
            console.error("Error polling task status:", error);
            chrome.runtime.sendMessage({
                action: "coverLetterError",
                error: "Network error while checking status.",
            });
        }
	}, 1000)
}

// Polling function per tab
function pollResearchTaskStatusPerTab(tabId, taskId) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/tasks/${taskId}`);
            const data = await res.json();
            if (data.status === 'SUCCESS') {
                clearInterval(interval);
                await updateJobPagesByTab(tabId, {
                    agentStatus: "finished",
                    agentResult: data.result,
                    agentError: null,
                });
                chrome.runtime.sendMessage({
                    action: "agentFinished",
                    tabId,
                    researchData: data.result
                });
                isAgentRunningPerTab[tabId] = false;
            } else if (data.status === "FAILURE") {
                clearInterval(interval);
                await updateJobPagesByTab(tabId, {
                    agentStatus: "error",
                    agentError: data.error || "Company research failed on the server."
                });
                chrome.runtime.sendMessage({
                    action: "agentError",
                    tabId,
                    error: data.error || "Company research failed on the server."
                });
                isAgentRunningPerTab[tabId] = false;
            }
        } catch (error) {
            clearInterval(interval);
            await updateJobPagesByTab(tabId, {
                agentStatus: "error",
                agentError: "Network error while checking research status."
            });
            chrome.runtime.sendMessage({
                action: "agentError",
                tabId,
                error: "Network error while checking research status."
            });
            isAgentRunningPerTab[tabId] = false;
        }
    }, 3000);
}

// === Core Job Page Detection ===
// Track cleanup timeouts per session
let sessionCleanupTimeout = null;

async function checkUrlWithApi(url, tabId) {
    const jobPage = await getJobPageForTab(tabId);
    if (jobPage && jobPage.url === url && jobPage.isJobDetected) {
        console.log(`\uD83D\uDD04 Already checked URL for tab ${tabId}: ${url}`)
        return true;
    }
    // Mark this URL as checked for this tab
    await updateJobPagesByTab(tabId, { isJobDetected: true });
	try {
		const response = await fetch(`${API_BASE_URL}/check-url`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});

		if (!response.ok) throw new Error(`Status ${response.status}`);

		const data = await response.json();

        if (data.is_job_application) {
			await updateJobPagesByTab(tabId, {
				url,
				jobData: data?.parsed_output || null,
				detectedAt: Date.now(),
				isJobDetected: true,
				agentStatus: "idle",
				agentResult: null,
				coverLetter: null,
			});
			chrome.action.setBadgeText({ text: "JOB", tabId });
			chrome.action.setBadgeBackgroundColor({ color: "#419D78", tabId });

			// Remove legacy chrome.storage.local.set({ jobSession, currentJobPage })
			// Clear any previous cleanup timeout if new job detected
			if (sessionCleanupTimeout) {
				clearTimeout(sessionCleanupTimeout);
				sessionCleanupTimeout = null;
			}

			return true;
		} else {
			chrome.action.setBadgeText({ text: "", tabId });
			await updateJobPagesByTab(tabId, { isJobDetected: false });
			return false;
		}
	} catch (error) {
		console.error("Error checking URL with API:", error);
		return false;
	}
}

async function handleGenerateCoverLetter(data) {
	// Set flag in storage
	const { jobSession, currentJobPage, user, authToken } = await chrome.storage.local.get([
		"jobSession",
		"currentJobPage",
		"user",
		"userId",
		"authToken"
	]);
	await chrome.storage.local.set({
		jobSession: {
			...jobSession,
			isLocked: true, // lock session while generating
			isCoverLetterGenerating: true,
			isCoverLetterGenerated: false,
			coverLetterError: null,
		},
	});
	try {
		const payload = { user_id: user?.id, ...data };
		const res = await fetch(`${API_BASE_URL}/generate-cover-letter`, {
			method: "POST",
			headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${authToken}`    // 👈 send the JWT
			},
			body: JSON.stringify(payload),
		});
        if (!res.ok) {
             const errorResult = await res.json();
            throw new Error(errorResult.detail || "Failed to start the generation task.");
        }

        const taskInfo = await res.json();
        
        // 2. Start polling for the result using the task ID
        pollTaskStatus(taskInfo.task_id);
	} catch (err) {
		await chrome.storage.local.set({
			jobSession: {
				...jobSession,
				isLocked: false,
				isCoverLetterGenerating: false,
				isCoverLetterGenerated: false,
				coverLetterError: err.message || "Network error",
			},
		});
		chrome.runtime.sendMessage({
			action: "coverLetterError",
			error: err.message || "Network error",
		});
	}
}

// NEW: Handler to save the cover letter to the database
async function handleSaveCoverLetter(data, sendResponse) {
    console.log("[Background] Received saveCoverLetter message with data:", data);
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
            console.log("[Background] Cover letter saved successfully.");
            sendResponse({ success: true });
        } else {
            const errorResult = await res.json();
            console.error("[Background] Failed to save cover letter:", errorResult);
            sendResponse({ success: false, error: errorResult.detail || "Server error" });
        }
    } catch (err) {
        console.error("[Background] Network error during save:", err);
        sendResponse({ success: false, error: err.message || "Network error" });
    }
}

// Refactor agent running flag to be per-tab
const isAgentRunningPerTab = {};

// === Content Script Communication ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "generateCoverLetter") {
		console.log("[Background] Received generateCoverLetter message");
		handleGenerateCoverLetter(request.data);
		return true; // Indicates an async response
	}


	if (request.action === "signOut") {
		handleSignOut();
		sendResponse({ success: true });
		return true;
	}

	const tabId = sender.tab?.id;

	if (!tabId) {
		sendResponse({ success: false, error: "No tab ID" });
		return false;
	}

	// The rest of the actions that DO require a tabId can proceed.
	if (request.action === "removeBanner") {
		const banner = document.getElementById("neoterik-job-detected");
		if (banner) banner.remove();
	}

	if (request.action === "checkUrl") {
		shouldProceedWithDetection(request.url, (canProceed) => {
			if (!canProceed)
				return sendResponse({ success: false, blocked: true });

			checkUrlWithApi(request.url, tabId)
				.then((isJobPage) => sendResponse({ success: true, isJobPage }))
				.catch((error) =>
					sendResponse({ success: false, error: error.message })
				);
		});
		return true;
	}

	if (request.action === "shouldInjectBanner") {
		shouldProceedWithDetection(request.url, (canProceed) => {
			sendResponse({ allow: canProceed });
		});
		return true;
	}

    if (request.action === "run_job_agent") {
        const tabId = request.tabId || sender.tab?.id;
        if (!tabId) {
            sendResponse({ success: false, error: "No tab ID" });
            return false;
        }
        if (isAgentRunningPerTab[tabId]) {
            sendResponse({ success: false, error: "Agent already running for this tab" });
            return true;
        }
        isAgentRunningPerTab[tabId] = true;
        getJobPageForTab(tabId).then(async (job) => {
            if (!job || !job.url) {
                sendResponse({ success: false, error: "No job detected for this tab." });
                isAgentRunningPerTab[tabId] = false;
                return;
            }
            if (job.agentStatus === "finished" && job.agentResult) {
                // Already finished, just return cached result
                sendResponse({ success: true, cached: true, result: job.agentResult });
                isAgentRunningPerTab[tabId] = false;
                return;
            }
            const payload = {
                url: job.url,
                scraped_html: job.jobData?.scraped_html,
                job_title: job.jobData?.job_title,
                company_name: job.jobData?.company_name,
            };
            await updateJobPagesByTab(tabId, { agentStatus: "in_progress" });
            try {
                const response = await fetch(`${API_BASE_URL}/run-agent`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                
                if (!response.ok) {
                    const errorResult = await response.json();
                    throw new Error(errorResult.detail || "Failed to start the research task.");
                }

                const taskInfo = await response.json();
                // Poll for result
                pollResearchTaskStatusPerTab(tabId, taskInfo.task_id);
                sendResponse({ success: true, started: true });
            } catch (err) {
                await updateJobPagesByTab(tabId, { agentStatus: "error", agentError: err.message });
                sendResponse({ success: false, error: err.message });
                isAgentRunningPerTab[tabId] = false;
            }
        });
        return true;
    }

	if (request.action === "extractJobDescription") {
		chrome.scripting
			.executeScript({
				target: { tabId },
				function: () => {
					function findJobDescription() {
						const potentialLabels = Array.from(
							document.querySelectorAll(
								"h1, h2, h3, h4, h5, h6, strong, b, label, dt, .form-label"
							)
						);
						for (const label of potentialLabels) {
							const text = label.textContent.trim();
							if (
								/additional information|cover letter/i.test(
									text
								)
							) {
								let next =
									label.nextElementSibling ||
									label.parentElement?.nextElementSibling;
								if (next && next.textContent.trim().length > 50)
									return next.textContent.trim();

								let parent = label.parentElement;
								for (
									let i = 0;
									i < 3 && parent;
									i++, parent = parent.parentElement
								) {
									const textarea =
										parent.querySelector("textarea");
									if (textarea?.value.trim().length > 50)
										return textarea.value.trim();
									const div = parent.querySelector(
										"div[class*='content'], div[class*='description'], div.ProseMirror"
									);
									if (div?.textContent.trim().length > 50)
										return div.textContent.trim();
								}
							}
						}
						return document.body.innerText.substring(0, 5000);
					}
					return findJobDescription();
				},
			})
			.then((results) => {
				sendResponse({
					success: true,
					description: results?.[0]?.result || null,
				});
			})
			.catch((err) => {
				sendResponse({ success: false, error: err.message });
			});
		return true;
	}

	if (request.action === "authSuccess" && request.session) {
		chrome.storage.local.set(
			{
				isLoggedIn: true,
				user: request.session.user,
				authToken: request.session.token,
			},
			() => {
				chrome.tabs.query(
					{ url: "http://localhost:3000/*" },
					(tabs) => {
						if (tabs.length > 0) {
							chrome.tabs.update(tabs[0].id, { active: true });
						} else {
							chrome.tabs.create({
								url: "http://localhost:3000",
							});
						}
					}
				);
				notifyLoginStatusChanged();
				if (request.tabId) {
					setTimeout(() => {
						chrome.tabs.remove(request.tabId).catch((err) => {
							if (
								err &&
								err.message &&
								err.message.includes("No tab with id")
							) {
								// Silently ignore this error
								return;
							}
							// Log other errors
							console.warn("chrome.tabs.remove error:", err);
						});
					}, 2000);
				}
			}
		);
		sendResponse({ success: true });
		return true;
	}
});

// === Tab Updates ===
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status !== "complete" || !tab.url) return;

	if (tab.url.includes("/auth/extension-callback/")) {
		handleAuthCallback(tabId, tab.url);
		return;
	}

	if (
        tab.url.startsWith("http://") || tab.url.startsWith("https://") &&
        !tab.url.startsWith("chrome://") &&
        !tab.url.startsWith("chrome-extension://") &&
        !tab.url.startsWith("http://localhost:3000") &&
        !tab.url.startsWith("https://localhost:3000") &&
        !tab.url.startsWith("http://localhost:8000") &&
        !tab.url.startsWith("https://localhost:8000") &&
		!tab.url.startsWith(EXTENSION_CALLBACK_URL)
	)
		if (checkUrlTimers[tabId]) clearTimeout(checkUrlTimers[tabId]);
	checkUrlTimers[tabId] = setTimeout(() => {
		shouldProceedWithDetection(tab.url, (canProceed) => {
			if (canProceed) checkUrlWithApi(tab.url, tabId);
		});
	}, 1500); // Add 1.5s debounce
});

// On tab switch, inject banner if jobPagesByTab[tabId] exists and isJobDetected
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const jobInfo = await getJobPageForTab(tabId);
    if (jobInfo && jobInfo.isJobDetected) {
        chrome.tabs.sendMessage(tabId, { action: "injectBanner" });
    }
});

// === Tab Removed Cleanup ===
chrome.tabs.onRemoved.addListener(async (tabId) => {
    const { jobPagesByTab: stored } = await chrome.storage.local.get("jobPagesByTab");
    if (stored && stored[tabId]) {
        delete stored[tabId];
        await chrome.storage.local.set({ jobPagesByTab: stored });
    }
    delete isAgentRunningPerTab[tabId];
    chrome.action.setBadgeText({ text: "", tabId });
	if (checkUrlTimers[tabId]) {
		clearTimeout(checkUrlTimers[tabId]);
		delete checkUrlTimers[tabId];
	}
});

// function isPopupOpen(callback) {
// 	chrome.extension.getViews({ type: "popup" }).length > 0
// 		? callback(true)
// 		: callback(false);
// }
