// popup.js - Cleaned and Enhanced

const API_BASE_URL = "http://localhost:8000";

let isAgentRunning = false;
let isGeneratingCoverLetter = false;
let isAnimating = false;

document.addEventListener("DOMContentLoaded", async () => {
    initializeUI();
    setupEventListeners();
    await setUIFromStorage();
});

function initializeUI() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
}

function setAgentProgressState(state, message = "", data = null) {
    const bar   = document.getElementById("agent-progress-container");
    const label = document.getElementById("agent-progress-status");
    const genBt = document.getElementById("generate-btn");
    if (!bar || !label) return;

    switch(state){
        case "running":
            bar.classList.remove("hidden");
            label.textContent = "Analyzing job details…";
            label.className = "text-blue-500";
            if (genBt) genBt.disabled = true;
            isAgentRunning = true;
            break;
        case "finished":
            bar.classList.add("hidden");
            if (genBt) genBt.disabled = false;
            isAgentRunning = false;
            if (data) populateFieldsFromJobData(data);
            break;
        case "error":
            bar.classList.remove("hidden");
            label.textContent = message || "Error fetching job info";
            label.className = "text-red-500";
            if (genBt) genBt.disabled = false;
            isAgentRunning = false;
            break;
        default:
            bar.classList.add("hidden");
            if (genBt) genBt.disabled = false;
            isAgentRunning = false;
    }
}

// Listen for agent state and cover letter messages from background
chrome.runtime.onMessage.addListener((msg) => {

    if (msg.action === "loginStatusChanged") {
        setUIFromStorage();
    }
    
    if (msg.action === "agentState") {
        getCurrentTabId().then((id) => {
            if (id !== msg.tabId) return;
            setAgentProgressState(msg.state, msg.error, msg.data);
            if (msg.state === "finished" || msg.state === 'running' || msg.state === 'error') switchTab("generate");
        });
    }
    if (msg.action === "coverLetterGenerated") {
        showCoverLetterPreview(msg.coverLetter);
        switchTab("preview");
        setLoadingState(false, "");
    }
    if (msg.action === "coverLetterError") {
        showError(msg.error || "Failed to generate cover letter");
        setLoadingState(false, "");
    }
});

function setLoadingState(loading, message = "") {
    const progressContainer = document.getElementById("progress-container");
    if (progressContainer)
        progressContainer.classList.toggle("hidden", !loading);
    document.getElementById("generate-btn-text").textContent = loading
        ? "Generating..."
        : "Generate Cover Letter";
    document
        .getElementById("generate-btn-spinner")
        ?.classList.toggle("hidden", !loading);
    const status = document.getElementById("status-message");
    if (status) status.textContent = loading ? message : "";
    isGeneratingCoverLetter = loading;
    const generateBtn = document.getElementById("generate-btn");
    if (generateBtn) generateBtn.disabled = loading;
    if (isAgentRunning && !loading) {
        if (progressContainer) progressContainer.classList.add("hidden");
        if (status) status.textContent = "";
    }
}

function setupEventListeners() {
    document.getElementById("signout-btn")?.addEventListener("click", handleSignOut);
    document.getElementById("cover-letter-form")?.addEventListener("submit", handleGenerateCoverLetter);
    document.getElementById("signin-btn-header")?.addEventListener("click", handleSignIn);
    document.getElementById("signin-btn-welcome")?.addEventListener("click", handleSignIn);
    document.getElementById("do-something-link")?.addEventListener("click", doSomething);
    document.getElementById("upload-redirect-btn")?.addEventListener("click", () => {
        chrome.tabs.create({ url: "http://localhost:3000/profile" });
    });
    document.getElementById("copy-btn")?.addEventListener("click", handleCopy);
    document.getElementById("edit-btn")?.addEventListener("click", handleEdit);
    document.getElementById("save-btn")?.addEventListener("click", handleSave);
    document.getElementById("view-large-btn")?.addEventListener("click", viewLargeCoverLetter);
    document.getElementById("close-large-modal-btn")?.addEventListener("click", closeLargeModal);
    document.getElementById("large-modal")?.addEventListener('click', (e) => {
        if (e.target === document.getElementById("large-modal")) closeLargeModal();
    });
    document.getElementById("confirm-save-btn")?.addEventListener("click", handleConfirmSave);
}

function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
    document.querySelectorAll('[id$="-tab"]').forEach((el) => el.classList.add("hidden"));
    document.getElementById(`${tabId}-tab`)?.classList.remove("hidden");
    if (tabId !== "generate") setLoadingState(false);
}

function handleCopy() {
    const textToCopy = document.getElementById("cover-letter-preview")?.innerText;
    const copyBtn = document.getElementById("copy-btn");
    if (textToCopy && copyBtn) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            copyBtn.textContent = "✅ Copied!";
            copyBtn.style.color = "var(--success-color)";
            setTimeout(() => {
                copyBtn.textContent = "📋 Copy";
                copyBtn.style.color = "var(--secondary-color)";
            }, 2000);
        }).catch(err => {
            alert("Failed to copy text.");
        });
    }
}

function handleEdit() {
    showGenerateTabAndPopulate();
}

function handleSave() {
    const coverLetterText = document.getElementById("cover-letter-preview")?.innerText;
    if (!coverLetterText || coverLetterText.includes("No Cover Letter Yet")) {
        alert("Please generate a cover letter first.");
        return;
    }
    document.getElementById("save-as-modal").style.display = 'flex';
}

async function handleConfirmSave() {
    const saveBtn = document.getElementById("save-btn");
    const confirmBtn = document.getElementById("confirm-save-btn");
    const coverLetterText = document.getElementById("cover-letter-preview")?.innerText;
    const fileType = document.getElementById("file-type-select").value;

    saveBtn.disabled = true;
    confirmBtn.disabled = true;
    saveBtn.textContent = "Preparing...";

    document.getElementById("save-as-modal").style.display = 'none';

    try {
        await new Promise(resolve => setTimeout(resolve, 50));
        const tabId = await getCurrentTabId();
        const { jobPagesByTab } = await chrome.storage.local.get(["jobPagesByTab"]);
        const jobData = jobPagesByTab?.[tabId]?.jobData;
        const safeCompanyName = jobData?.company_name?.replace(/[\\/:*?"<>|]/g, '') || 'Company';
        const safeJobTitle = jobData?.job_title?.replace(/[\\/:*?"<>|]/g, '') || 'Job';
        const baseFilename = `Cover Letter - ${safeJobTitle} at ${safeCompanyName}`;
        const response = await fetch(`${API_BASE_URL}/download-cover-letter`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileType: fileType,
                baseFilename: baseFilename,
                coverLetterText: coverLetterText
            }),
        });
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        const disposition = response.headers.get('Content-Disposition');
        let downloadFilename = `${baseFilename}.${fileType}`;
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) {
                downloadFilename = matches[1].replace(/['"]/g, '');
            }
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        saveBtn.textContent = "✅ Saved!";
    } catch (error) {
        alert("An error occurred while preparing your file. Please ensure the backend server is running and try again.");
        saveBtn.textContent = "💾 Save";
    } finally {
        setTimeout(() => {
            saveBtn.disabled = false;
            confirmBtn.disabled = false;
            if (saveBtn.textContent !== "💾 Save") {
                saveBtn.textContent = "💾 Save";
            }
        }, 2500);
    }
}

let originalWidth = "420px";
let originalHeight = "600px";

function viewLargeCoverLetter() {
    const previewElement = document.getElementById("cover-letter-preview");
    if (isAnimating || !previewElement || previewElement.querySelector("strong")) {
        if (!previewElement || previewElement.querySelector("strong")) {
            alert("Please generate a cover letter first.");
        }
        return;
    }
    isAnimating = true;
    originalWidth = document.body.style.width || "420px";
    originalHeight = document.body.style.height || "600px";
    document.body.style.transition = "width 0.4s cubic-bezier(0.4, 0, 0.2, 1), height 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
    const text = previewElement.innerText;
    const modalContent = document.getElementById("large-modal-content");
    const modal = document.getElementById("large-modal");
    modalContent.innerText = text;
    modal.style.display = "flex";
    modal.style.opacity = "0";
    modal.style.transition = "opacity 0.3s ease-in-out";
    requestAnimationFrame(() => {
        document.body.style.width = "680px";
        document.body.style.height = "720px";
        setTimeout(() => {
            modal.style.opacity = "1";
        }, 150);
        setTimeout(() => {
            isAnimating = false;
            document.body.style.transition = "";
        }, 450);
    });
}

function closeLargeModal() {
    document.getElementById("large-modal").style.display = "none";
    document.body.style.width = originalWidth;
    document.body.style.height = originalHeight;
}

function updateUI(isLoggedIn, user) {
    console.log("updateUI", isLoggedIn, user);
    document.getElementById("signin-btn-header")?.classList.toggle("hidden", isLoggedIn);
    document.getElementById("signin-btn-welcome")?.classList.toggle("hidden", isLoggedIn);
    document.getElementById("signout-btn")?.classList.toggle("hidden", !isLoggedIn);
    document.getElementById("user-info")?.classList.toggle("hidden", !isLoggedIn);
    document.getElementById("welcome-state")?.classList.toggle("hidden", isLoggedIn);
    document.getElementById("generate-tab")?.classList.toggle("hidden", !isLoggedIn);
    document.getElementById("loading-indicator")?.classList.add("hidden");
    document.getElementById("upload-status-section")?.classList.toggle("hidden", !isLoggedIn);
    if (isLoggedIn && user) {
        document.getElementById("user-name").textContent = user.name?.split(" ")[0] || "User";
        const avatar = document.getElementById("user-avatar");
        if (avatar && user.image) {
            avatar.src = user.image;
            avatar.style.display = "block";
        }
        if (user.id) checkUploadStatus(user.id);
    }
}

function handleSignIn() {
    document.getElementById("loading-indicator")?.classList.remove("hidden");
    const width = 600, height = 700;
    chrome.windows.create({
        url: "http://localhost:3000/auth/signin?source=extension",
        type: "popup",
        width,
        height,
        left: Math.round((screen.width - width) / 2),
        top: Math.round((screen.height - height) / 2),
    });
}

function handleSignOut() {
    chrome.storage.local.clear(() => {
        updateUI(false, null);
        clearGenerateTabFields();
        document.getElementById("cover-letter-preview").innerHTML = "";
    });
    chrome.runtime.sendMessage({ action: "signOut" }, () => {
        document.getElementById("welcome-state")?.classList.remove("hidden");
        document.getElementById("signin-btn-header")?.classList.remove("hidden");
        document.getElementById("signin-btn-welcome")?.classList.remove("hidden");
        document.getElementById("signout-btn")?.classList.add("hidden");
        document.getElementById("user-info")?.classList.add("hidden");
        document.getElementById("generate-tab")?.classList.add("hidden");
        [
            "#company_name", "#job_title", "#job_description", "#company_summary",
            "#company_vision", "#additional_notes", "#preferred_skills"
        ].forEach((id) => {
            const field = document.querySelector(id);
            if (field) field.value = "";
        });
        document.getElementById("cover-letter-preview").innerHTML = "";
    });
}

function clearGenerateTabFields() {
    [
        "#company_name", "#job_title", "#job_description", "#company_summary",
        "#company_vision", "#additional_notes", "#preferred_skills"
    ].forEach((id) => {
        const field = document.querySelector(id);
        if (field) field.value = "";
    });
}

async function getJobDataForCoverLetter() {
    const tabId = await getCurrentTabId();
    const { jobPagesByTab, user } = await new Promise((resolve) => {
        chrome.storage.local.get(["jobPagesByTab", "user"], resolve);
    });
    const job = (jobPagesByTab?.[tabId]?.jobData) || {};
    return {
        user_id: user?.id || "",
        job_title: job.job_title || "",
        hiring_company: job.company_name || "",
        applicant_name: user?.name?.split(" ")[0] || "",
        job_description: job.job_description || "",
        preferred_qualifications: [
            ...(job.preferred_qualifications || []),
            ...(job.skillset || []),
        ].join("; "),
        company_culture_notes: `${job.company_vision || ""}\n${job.additional_notes || ""}`,
        github_username: user?.github_username || "",
        desired_tone: document.getElementById("desired_tone")?.value || "professional",
        company_url: "",
    };
}

async function populateFieldsFromJobData(jobData) {
    if (!jobData) return;
    const fieldMappings = {
        "#company_name": jobData.company_name || "",
        "#job_title": jobData.job_title || "",
        "#job_description": jobData.job_description || "",
        "#company_summary": jobData.company_summary || "",
        "#company_vision": jobData.company_vision || "",
        "#additional_notes": jobData.additional_notes || "",
        "#preferred_skills": jobData.skillset ? jobData.skillset.join(", ") : ""
    };
    Object.entries(fieldMappings).forEach(([selector, value]) => {
        const field = document.querySelector(selector);
        if (field && value) field.value = value;
    });
}

async function populateFieldsFromGraph() {
    const tabId = await getCurrentTabId();
    const { jobPagesByTab } = await new Promise((resolve) => {
        chrome.storage.local.get(["jobPagesByTab"], resolve);
    });
    const job = (jobPagesByTab?.[tabId]?.jobData) || {};
    await populateFieldsFromJobData(job);
}

async function showGenerateTabAndPopulate() {
    switchTab("generate");
    await populateFieldsFromGraph();
    setLoadingState(false, "");
}

async function handleGenerateCoverLetter(e) {
    e.preventDefault();
    if (isGeneratingCoverLetter) return;
    const data = await getJobDataForCoverLetter();
    const tabId = await getCurrentTabId();
    chrome.runtime.sendMessage({ action: "generateCoverLetter", tabId, data });
    setLoadingState(true, "⏳ Our AI assistant is preparing your personalized cover letter...");
}

function showCoverLetterPreview(text) {
    document.getElementById("cover-letter-preview").innerHTML =
        `<div style="white-space: pre-wrap; line-height: 1.6;">${text}</div>`;
}

function showError(msg) {
    alert(msg);
}

function getCurrentTabId() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]?.id);
        });
    });
}

async function setUIFromStorage() {
    // Always get user/profile info first
    const { isLoggedIn, user, jobPagesByTab } = await new Promise((resolve) => {
        chrome.storage.local.get(["isLoggedIn", "user", "jobPagesByTab"], resolve);
    });
    console.log("setUIFromStorage", { isLoggedIn, user });
    updateUI(!!isLoggedIn, user); // <-- Always update profile UI

    // Now handle job-specific UI (agent, cover letter) if there's a job for this tab
    const tabId = await getCurrentTabId();
    const jobPage = (jobPagesByTab || {})[tabId];
    if (jobPage) {
        switch (jobPage.agent?.status) {
            case "running":
                setAgentProgressState("running", "Analyzing job details…");
                switchTab("generate");
                break;
            case "finished":
                setAgentProgressState("finished");
                if (jobPage.agent?.data) await populateFieldsFromJobData(jobPage.agent.data);
                switchTab("generate");
                break;
            case "error":
                setAgentProgressState("error", jobPage.agent?.error || "An error occurred");
                switchTab("generate");
                break;
            default:
                setAgentProgressState(false);
        }
        if (jobPage.isCoverLetterGenerating) {
            setLoadingState(true, "Generating cover letter...");
        } else if (jobPage.isCoverLetterGenerated && jobPage.coverLetter) {
            showCoverLetterPreview(jobPage.coverLetter);
            switchTab("preview");
            setLoadingState(false, "");
        }
    } else {
        clearGenerateTabFields();
        setAgentProgressState(false);
        setLoadingState(false, "");
    }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
        changes.isLoggedIn || changes.user ||
        changes.jobPagesByTab
    ) {
        setUIFromStorage();
    }
});

async function checkUploadStatus(userId) {
    try {
        const { authToken } = await chrome.storage.local.get("authToken");
        const headers = authToken ? { "Authorization": `Bearer ${authToken}` } : {};
        const resumeResponse = await fetch(`http://localhost:8000/get-document?user_id=${userId}&type=resume`, { headers });
        const resumeData = await resumeResponse.json();
        const githubResponse = await fetch(`http://localhost:8000/get-github?user_id=${userId}`, { headers });
        const githubData = await githubResponse.json();
        updateUploadStatusUI(resumeData, githubData);
    } catch (error) {
        updateUploadStatusUI({}, {});
    }
}

function updateUploadStatusUI(resumeData, githubData) {
    const resumeIndicator = document.getElementById("resume-status-indicator");
    const githubIndicator = document.getElementById("github-status-indicator");
    const uploadBtn = document.getElementById("upload-redirect-btn");

    if (resumeData.filename) {
        resumeIndicator.textContent = "✅ Uploaded";
        resumeIndicator.className = "status-indicator status-success";
        resumeIndicator.style.color = "#10B981";
    } else {
        resumeIndicator.textContent = "❌ Not uploaded";
        resumeIndicator.className = "status-indicator";
        resumeIndicator.style.color = "#EF4444";
    }

    if (githubData.github_username) {
        githubIndicator.textContent = "✅ Added";
        githubIndicator.className = "status-indicator status-success";
        githubIndicator.style.color = "#10B981";
    } else {
        githubIndicator.textContent = "❌ Not added";
        githubIndicator.className = "status-indicator";
        githubIndicator.style.color = "#EF4444";
    }

    const bothUploaded = resumeData.filename && githubData.github_username;
    if (bothUploaded) {
        uploadBtn.style.display = "none";
    } else {
        uploadBtn.style.display = "block";
        uploadBtn.textContent = resumeData.filename ? "Add GitHub Username" :
            githubData.github_username ? "Upload Resume" :
                "Go to Profile to Upload";
    }
}

// Optional: placeholder for future features
function doSomething() {
    alert("This feature is coming soon!");
}