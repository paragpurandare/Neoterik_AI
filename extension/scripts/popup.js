// popup.js - Cleaned and Enhanced

const API_BASE_URL = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", async () => {
	console.log("✅ Popup loaded");
	initializeUI();
	setupEventListeners();
	await setUIFromStorage();
});

function initializeUI() {
	document.querySelectorAll(".tab-btn").forEach((btn) => {
		btn.addEventListener("click", () => switchTab(btn.dataset.tab));
	});
}

// Add global flags for agent and cover letter generation
let isAgentRunning = false;
let isGeneratingCoverLetter = false;

function setAgentProgressState(running, message = "") {
	const agentProgress = document.getElementById("agent-progress-container");
	if (agentProgress) {
		agentProgress.classList.toggle("hidden", !running);
		const agentStatus = document.getElementById("agent-progress-status");
		if (agentStatus) agentStatus.textContent = running ? message : "";
	}
	isAgentRunning = running;
}

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
	// Hide status/progress if agent is running
	if (isAgentRunning && !loading) {
		if (progressContainer) progressContainer.classList.add("hidden");
		if (status) status.textContent = "";
	}
}

function setupEventListeners() {
	document
		.getElementById("signout-btn")
		?.addEventListener("click", handleSignOut);
	document
		.getElementById("cover-letter-form")
		?.addEventListener("submit", handleGenerateCoverLetter);
	document
		.getElementById("signin-btn-header")
		?.addEventListener("click", handleSignIn);
	document
		.getElementById("signin-btn-welcome")
		?.addEventListener("click", handleSignIn);
	document
		.getElementById("do-something-link")
		?.addEventListener("click", doSomething);
    document
        .getElementById("upload-redirect-btn")
        ?.addEventListener("click", () => {
            chrome.tabs.create({ url: "http://localhost:3000/profile" });
        });

    // NEW: Event listeners for the new preview buttons
    document.getElementById("copy-btn")?.addEventListener("click", handleCopy);
    document.getElementById("edit-btn")?.addEventListener("click", handleEdit);
    document.getElementById("save-btn")?.addEventListener("click", handleSave); 
    document.getElementById("view-large-btn")?.addEventListener("click", viewLargeCoverLetter);
    document.getElementById("close-large-modal-btn")?.addEventListener("click", closeLargeModal);
    // NEW: Add listener to close modal on background click
    document.getElementById("large-modal")?.addEventListener('click', (e) => {
        if (e.target === document.getElementById("large-modal")) {
            closeLargeModal();
        }
    });

    // NEW: Listeners for the new "Save As" modal buttons
    document.getElementById("confirm-save-btn")?.addEventListener("click", handleConfirmSave);
    document.getElementById("cancel-save-btn")?.addEventListener("click", () => {
        document.getElementById("save-as-modal").style.display = 'none';
    });

	// Redirect to profile page when user profile is clicked
	document.getElementById("user-info")?.addEventListener("click", () => {
		chrome.tabs.create({ url: "http://localhost:3000/profile" });
	});

	// Redirect to about page when Neoterik logo is clicked
	document.getElementById("neoterik-logo")?.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		chrome.tabs.create({ url: "http://localhost:3000/about" });
	});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (
			area === "local" &&
			(changes.jobPagesByTab ||
				changes.isLoggedIn ||
				changes.user)
		) {
			setUIFromStorage();
			const jobPage = changes.jobPagesByTab?.newValue;
			if (jobPage?.agentError) {
				showError(jobPage.agentError);
				setLoadingState(false, "");
			}
			if (jobPage?.isLocked && !jobPage?.isCoverLetterGenerated) {
				window.sessionStorage.setItem("neoterik-locked-alert", "1");
			} else {
				window.sessionStorage.removeItem("neoterik-locked-alert");
			}
		}
		if (area === "local" && (changes.isLoggedIn || changes.user)) {
			const isLoggedIn = changes.isLoggedIn?.newValue;
			const user = changes.user?.newValue;
			updateUI(!!isLoggedIn, user);
		}
	});
	if (window.sessionStorage.getItem("neoterik-locked-alert") === "1") {
		alert(
			"You have already started generating a cover letter for this job. Please complete or skip before starting a new one."
		);
		window.sessionStorage.removeItem("neoterik-locked-alert");
	}
	chrome.runtime.onMessage.addListener((message) => {
		if (message.action === "loginStatusChanged") {
			chrome.storage.local.get(["isLoggedIn", "user"], (data) => {
				updateUI(data.isLoggedIn, data.user);
			});
		}
        // Add this new handler
        if (message.action === "signOutComplete") {
            updateUI(false, null);
            clearGenerateTabFields();
        }
		if (message.action === "coverLetterGenerated") {
			showCoverLetterPreview(message.coverLetter);
			switchTab("preview");
			setLoadingState(false, "");
		}
		if (message.action === "coverLetterError") {
			showError(message.error || "Failed to generate cover letter");
			setLoadingState(false, "");
		}
		if (message.action === "agentFinished") {
			setAgentProgressState(false);
			// If research data is provided, populate the fields
			if (message.researchData) {
				populateFieldsFromResearchData(message.researchData);
			}
			populateFieldsFromGraph();
		}
		if (message.action === "agentError") {
			setAgentProgressState(false);
			showError(message.error || "Agent failed");
		}
	});
}

// Add a new function to populate fields from the research data
function populateFieldsFromResearchData(researchData) {
    if (!researchData) return;
    
    // Map the research data to form fields
    const fieldMappings = {
        "#company_name": researchData.company_name || "",
        "#job_title": researchData.job_title || "",
        "#job_description": researchData.job_description || "",
        "#company_summary": researchData.company_summary || "",
        "#company_vision": researchData.company_vision || "",
        "#additional_notes": researchData.additional_notes || "",
        "#preferred_skills": researchData.skillset ? researchData.skillset.join(", ") : "",
    };

    // Populate the fields
    Object.entries(fieldMappings).forEach(([selector, value]) => {
        const field = document.querySelector(selector);
        if (field && value) {
            field.value = value;
        }
    });
    
    console.log("📝 Populated fields with research data:", researchData);
}

function switchTab(tabId) {
	document
		.querySelectorAll(".tab-btn")
		.forEach((btn) => btn.classList.remove("active"));
	document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
	document
		.querySelectorAll('[id$="-tab"]')
		.forEach((el) => el.classList.add("hidden"));
	document.getElementById(`${tabId}-tab`)?.classList.remove("hidden");
	if (tabId !== "generate") setLoadingState(false);
}

/**
 * Copies the cover letter text to the clipboard and provides user feedback.
 */
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
            console.error("Failed to copy text: ", err);
            alert("Failed to copy text.");
        });
    }
}

/**
 * Switches back to the 'generate' tab so the user can edit the inputs.
 */
function handleEdit() {
    // The `populateFieldsFromGraph` function ensures the inputs are filled
    // with the data that generated the letter.
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

/**
 * Handles the final save action after the user confirms the file type.
 */
/**
 * Handles the final save action by calling the backend to generate the file.
 * This is the new, more robust implementation.
 */
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
        
        const { currentJobPage } = await chrome.storage.local.get(["currentJobPage"]);
        const jobData = currentJobPage?.jobData;

        const safeCompanyName = jobData?.company_name?.replace(/[\\/:*?"<>|]/g, '') || 'Company';
        const safeJobTitle = jobData?.job_title?.replace(/[\\/:*?"<>|]/g, '') || 'Job';
        const baseFilename = `Cover Letter - ${safeJobTitle} at ${safeCompanyName}`;

        // Call the backend to generate the file
        const response = await fetch(`${API_BASE_URL}/download-cover-letter`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileType: fileType,
                baseFilename: baseFilename,
                coverLetterText: coverLetterText
            }),
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        // Get the filename from the response header if available, otherwise create it
        const disposition = response.headers.get('Content-Disposition');
        let downloadFilename = `${baseFilename}.${fileType}`; // fallback filename
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) {
                downloadFilename = matches[1].replace(/['"]/g, '');
            }
        }

        // Create a blob from the response and trigger download
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
        console.error("Failed to download file from backend:", error);
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

/**
 * Generates and downloads a PDF file using jsPDF.
 * MODIFIED: Added checks to ensure the library is loaded and the input is valid.
 */
function generatePdf(filename, text) {
    // 1. Check if jsPDF library is loaded
    if (!window.jspdf || !window.jspdf.jsPDF) {
        // This provides a much more specific and helpful error message.
        throw new Error("jsPDF library not found. Please check the script tag in index.html.");
    }

    // 2. Check for valid input text
    if (typeof text !== 'string' || !text.trim()) {
        throw new Error("Cannot generate PDF from empty or invalid text.");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Set document properties
    doc.setProperties({
        title: filename
    });

    // Set font styles
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - (2 * margin);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    // Split text into lines that fit the page width
    const lines = doc.splitTextToSize(text, usableWidth);
    doc.text(lines, margin, margin);

    // Trigger the download
    doc.save(`${filename}.pdf`);
}

/**
 * Generates and downloads a .txt file.
 */
function generateTxt(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

let originalWidth = "420px";
let originalHeight = "600px";

/**
 * Displays the full cover letter in a large modal view.
 */
function viewLargeCoverLetter() {
    const previewElement = document.getElementById("cover-letter-preview");
    
    // Prevent multiple animations and check for valid content
    if (isAnimating || !previewElement || previewElement.querySelector("strong")) {
        if (!previewElement || previewElement.querySelector("strong")) {
            alert("Please generate a cover letter first.");
        }
        return;
    }
    
    isAnimating = true;
    
    // Store original dimensions
    originalWidth = document.body.style.width || "420px";
    originalHeight = document.body.style.height || "600px";
    
    // Add transition styles to body
    document.body.style.transition = "width 0.4s cubic-bezier(0.4, 0, 0.2, 1), height 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
    
    // Prepare modal content
    const text = previewElement.innerText;
    const modalContent = document.getElementById("large-modal-content");
    const modal = document.getElementById("large-modal");
    
    modalContent.innerText = text;
    
    // Show modal with initial opacity 0
    modal.style.display = "flex";
    modal.style.opacity = "0";
    modal.style.transition = "opacity 0.3s ease-in-out";
    
    // Start expansion animation
    requestAnimationFrame(() => {
        // Expand popup size with smooth transition
        document.body.style.width = "680px";
        document.body.style.height = "720px";
        
        // Fade in modal after a slight delay to sync with resize
        setTimeout(() => {
            modal.style.opacity = "1";
        }, 150);
        
        // Complete animation
        setTimeout(() => {
            isAnimating = false;
            // Remove transition after animation completes for better performance
            document.body.style.transition = "";
        }, 450);
    });
}

/**
 * Closes the large modal view.
 */
function closeLargeModal() {
    document.getElementById("large-modal").style.display = "none";
    
    // Restore original popup dimensions
    document.body.style.width = originalWidth;
    document.body.style.height = originalHeight;
}

function checkAuthState() {
	chrome.storage.local.get(["isLoggedIn", "user"], ({ isLoggedIn, user }) => {
		console.log("🔍 Auth check:", isLoggedIn, user);
		updateUI(isLoggedIn, user);
	});
}

function updateUI(isLoggedIn, user) {
	document
		.getElementById("signin-btn-header")
		?.classList.toggle("hidden", isLoggedIn);
	document
		.getElementById("signin-btn-welcome")
		?.classList.toggle("hidden", isLoggedIn);
	document
		.getElementById("signout-btn")
		?.classList.toggle("hidden", !isLoggedIn);
	document
		.getElementById("user-info")
		?.classList.toggle("hidden", !isLoggedIn);
	document
		.getElementById("welcome-state")
		?.classList.toggle("hidden", isLoggedIn);
	document
		.getElementById("generate-tab")
		?.classList.toggle("hidden", !isLoggedIn);
	document.getElementById("loading-indicator")?.classList.add("hidden");
    document
        .getElementById("upload-status-section")  // Add this line
        ?.classList.toggle("hidden", !isLoggedIn);
    document.getElementById("loading-indicator")?.classList.add("hidden");

	if (isLoggedIn && user) {
		document.getElementById("user-name").textContent =
			user.name?.split(" ")[0] || "User";
		const avatar = document.getElementById("user-avatar");
		if (avatar && user.image) {
			avatar.src = user.image;
			avatar.style.display = "block";
		}

        // Check upload status when user is logged in
        if (user.id) {
            checkUploadStatus(user.id);
        }
	}
}

function handleSignIn() {
	console.log("🔐 Sign in initiated");
	document.getElementById("loading-indicator")?.classList.remove("hidden");

	const width = 600,
		height = 700;
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
        // reset UI AFTER store is wiped
        updateUI(false, null);
        clearGenerateTabFields();
        document.getElementById("cover-letter-preview").innerHTML = "";
    });

	// Send signOut message to background for tightly coupled sign-out
	chrome.runtime.sendMessage({ action: "signOut" }, () => {
		document.getElementById("welcome-state")?.classList.remove("hidden");
		document
			.getElementById("signin-btn-header")
			?.classList.remove("hidden");
		document
			.getElementById("signin-btn-welcome")
			?.classList.remove("hidden");
		document.getElementById("signout-btn")?.classList.add("hidden");
		document.getElementById("user-info")?.classList.add("hidden");
		document.getElementById("generate-tab")?.classList.add("hidden");
		[
			"#company_name",
			"#job_title",
			"#job_description",
			"#company_summary",
			"#company_vision",
			"#additional_notes",
			"#preferred_skills",
		].forEach((id) => {
			const field = document.querySelector(id);
			if (field) field.value = "";
		});
		document.getElementById("cover-letter-preview").innerHTML = "";
	});
}

function populateFieldsFromGraph() {
	chrome.storage.local.get(["currentJobPage"], ({ currentJobPage }) => {
		const job = currentJobPage?.jobData;
		if (!job) return;

		const fill = (id, val) => {
			const field = document.querySelector(id);
			if (field && val) field.value = val;
		};

		fill("#company_name", job.company_name);
		fill("#job_title", job.job_title);
		fill("#job_description", job.job_description);
		fill("#company_summary", job.company_summary);
		fill("#company_vision", job.company_vision);
		fill("#additional_notes", job.additional_notes);

		const skills = [
			...(job.preferred_qualifications || []),
			...(job.skillset || []),
		];
		fill("#preferred_skills", skills.join(", "));
	});
}

async function handleGenerateCoverLetter(e) {
	e.preventDefault();
	if (isGeneratingCoverLetter) return; // Prevent double submit
    const { jobSession, currentJobPage, user } = await chrome.storage.local.get([
        "jobSession",
        "currentJobPage",
        "user"
    ]);
	await chrome.storage.local.set({
		jobSession: {
			...jobSession,
			isUserConfirmed: true,
			isCoverLetterGenerating: true,
			coverLetterError: null, // <-- Set flag here!
		},
	});
	const data = await getJobDataForCoverLetter();
	chrome.runtime.sendMessage({ action: "generateCoverLetter", data });
	setLoadingState(
		true,
		"⏳ Our AI assistant is preparing your personalized cover letter..."
	);
}
// try {
//     const data = await getJobDataForCoverLetter();
//     console.log("📨 Submitting data:", data);
//     const res = await fetch("http://localhost:8000/generate-cover-letter", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(data),
//     });
//     const result = await res.json();
//     setLoadingState(false);
//     if (res.ok && result.cover_letter) {
//         await chrome.storage.local.get("jobSession", ({ jobSession }) => {
//             chrome.storage.local.set({
//                 jobSession: {
//                     ...jobSession,
//                     isCoverLetterGenerated: true,
//                     isCoverLetterGenerating: false // <-- Clear flag on success
//                 }
//             });
//         });
//         showCoverLetterPreview(result.cover_letter);
//         [
//             "#company_name",
//             "#job_title",
//             "#job_description",
//             "#company_summary",
//             "#company_vision",
//             "#additional_notes",
//             "#preferred_skills",
//         ].forEach((id) => {
//             const field = document.querySelector(id);
//             if (field) field.value = "";
//         });
//         switchTab("preview");
//         chrome.runtime.sendMessage({ action: "coverLetterGeneratedCleanup" });
//     } else {
//         // Clear flag on error
//         await chrome.storage.local.get("jobSession", ({ jobSession }) => {
//             chrome.storage.local.set({
//                 jobSession: {
//                     ...jobSession,
//                     isCoverLetterGenerating: false
//                 }
//             });
//         });
//         showError(result.error || "Failed to generate cover letter");
//     }
// } catch (err) {
//     console.error("❌ Generation error:", err);
//     await chrome.storage.local.get("jobSession", ({ jobSession }) => {
//         chrome.storage.local.set({
//             jobSession: {
//                 ...jobSession,
//                 isCoverLetterGenerating: false
//             }
//         });
//     });
//     showError("Network error. Please try again.");
//     setLoadingState(false);
// }
//}

// async function handleGenerateCoverLetter(e) {
// 	e.preventDefault();
// 	if (isGeneratingCoverLetter) return; // Prevent double submit
// 	const { jobSession } = await chrome.storage.local.get("jobSession");
// 	await chrome.storage.local.set({ jobSession: { ...jobSession, isUserConfirmed: true } });
// 	setLoadingState(true, "⏳ Our AI assistant is preparing your personalized cover letter...");
// 	try {
// 		const data = await getJobDataForCoverLetter();
// 		console.log("📨 Submitting data:", data);
// 		const res = await fetch("http://localhost:8000/generate-cover-letter", {
// 			method: "POST",
// 			headers: { "Content-Type": "application/json" },
// 			body: JSON.stringify(data),
// 		});
// 		const result = await res.json();
// 		setLoadingState(false);
// 		if (res.ok && result.cover_letter) {
// 			await chrome.storage.local.get("jobSession", ({ jobSession }) => {
// 				chrome.storage.local.set({ jobSession: { ...jobSession, isCoverLetterGenerated: true } });
// 			});
// 			showCoverLetterPreview(result.cover_letter);
// 			// Clear all fields on generate tab
// 			[
// 				"#company_name",
// 				"#job_title",
// 				"#job_description",
// 				"#company_summary",
// 				"#company_vision",
// 				"#additional_notes",
// 				"#preferred_skills",
// 			].forEach((id) => {
// 				const field = document.querySelector(id);
// 				if (field) field.value = "";
// 			});
// 			// Switch to preview tab
// 			switchTab("preview");
// 			// Clear jobSession and currentJobPage after short delay
// 			chrome.runtime.sendMessage({ action: "coverLetterGeneratedCleanup" });
// 		} else {
// 			showError(result.error || "Failed to generate cover letter");
// 		}
// 	} catch (err) {
// 		console.error("❌ Generation error:", err);
// 		showError("Network error. Please try again.");
// 		setLoadingState(false);
// 	}
// }

function showCoverLetterPreview(text) {
	document.getElementById(
		"cover-letter-preview"
	).innerHTML = `<div style="white-space: pre-wrap; line-height: 1.6;">${text}</div>`;
}

function showError(msg) {
	alert(msg);
}

function copyToClipboard() {
	const text = document.getElementById("cover-letter-preview")?.textContent;
	if (text) navigator.clipboard.writeText(text).then(() => alert("Copied!"));
}

function editCoverLetter() {
	switchTab("generate");
}

function saveCoverLetter() {
	alert("Cover letter saved to your library!");
}

async function getJobDataForCoverLetter() {
	return new Promise((resolve) => {
		chrome.storage.local.get(
			["currentJobPage", "user"],
			({ currentJobPage, user }) => {
				const job = currentJobPage?.jobData || {};
				resolve({
					user_id: user?.id || "",
					job_title: job.job_title || "",
					hiring_company: job.company_name || "",
					applicant_name: user?.name?.split(" ")[0] || "",
					job_description: job.job_description || "",
					preferred_qualifications: [
						...(job.preferred_qualifications || []),
						...(job.skillset || []),
					].join("; "),
					company_culture_notes: `${job.company_vision || ""}\n${
						job.additional_notes || ""
					}`,
					github_username: user?.github_username || "",
					desired_tone:
						document.getElementById("desired_tone")?.value ||
						"professional",
					company_url: "",
				});
			}
		);
	});
}

function showGenerateTabAndPopulate() {
	switchTab("generate");
	populateFieldsFromGraph();
	setLoadingState(false, ""); // Ensure button is not loading
}

// Helper to get current tabId
function getCurrentTabId() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]?.id);
        });
    });
}

// Refactor setUIFromStorage to use jobPagesByTab[tabId]
async function setUIFromStorage() {
    const tabId = await getCurrentTabId();
    chrome.storage.local.get([
        "isLoggedIn", "user", "jobPagesByTab"
    ], ({ isLoggedIn, user, jobPagesByTab }) => {
        // Restore authentication UI
        updateUI(!!isLoggedIn, user);
        const jobPage = (jobPagesByTab || {})[tabId];
        // Job/agent/cover letter state
        const isAgentInProgress = jobPage?.agentStatus === "in_progress";
        const isAgentFinished = jobPage?.agentStatus === "finished";
        const isCoverLetterGenerating = jobPage?.isCoverLetterGenerating;
        const isCoverLetterGenerated = jobPage?.isCoverLetterGenerated;
        const jobData = jobPage?.jobData;
        // 1. Show preview if cover letter is generated
        if (isCoverLetterGenerated && jobPage?.coverLetter) {
            showCoverLetterPreview(jobPage.coverLetter);
            switchTab("preview");
            setLoadingState(false, "");
            return;
        }
        // 2. Show loading if generating
        if (isCoverLetterGenerating && jobData) {
            populateFieldsFromGraph(jobPage);
            setLoadingState(
                true,
                "⏳ Our AI assistant is preparing your personalized cover letter..."
            );
            return;
        }
        if (isAgentInProgress) {
            setAgentProgressState(
                true,
                "NeoterikAi's Agent Fetching Job Details.."
            );
            setLoadingState(false, "");
            switchTab("generate");
            return;
        } else {
            setAgentProgressState(false);
        }
        if (isAgentFinished && jobData) {
            showGenerateTabAndPopulate(jobPage);
            return;
        }
        if (jobData) {
            populateFieldsFromGraph(jobPage);
            switchTab("generate");
            setLoadingState(false, "");
            return;
        }
        // 6. Default: clear fields in generate tab if no jobData or after cover letter generated
        clearGenerateTabFields();
        setLoadingState(false, "");
    });
}

// Update populateFieldsFromGraph to accept jobPage
function populateFieldsFromGraph(jobPage) {
    const job = jobPage?.jobData;
    if (!job) return;
    const fill = (id, val) => {
        const field = document.querySelector(id);
        if (field && val) field.value = val;
    };
    fill("#company_name", job.company_name);
    fill("#job_title", job.job_title);
    fill("#job_description", job.job_description);
    fill("#company_summary", job.company_summary);
    fill("#company_vision", job.company_vision);
    fill("#additional_notes", job.additional_notes);
    const skills = [
        ...(job.preferred_qualifications || []),
        ...(job.skillset || []),
    ];
    fill("#preferred_skills", skills.join(", "));
}

// Update showGenerateTabAndPopulate to accept jobPage
function showGenerateTabAndPopulate(jobPage) {
    switchTab("generate");
    populateFieldsFromGraph(jobPage);
    setLoadingState(false, ""); // Ensure button is not loading
}

// Listen for storage changes and update UI for the current tab
chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.jobPagesByTab) {
        await setUIFromStorage();
    }
});

async function checkUploadStatus(userId) {
    console.log("🔍 Checking upload status for user:", userId);
    
    try {
        // Get auth token
        const { authToken } = await chrome.storage.local.get("authToken");
        const headers = authToken ? { "Authorization": `Bearer ${authToken}` } : {};
        
        // Check resume status
        const resumeResponse = await fetch(`http://localhost:8000/get-document?user_id=${userId}&type=resume`, {
            headers
        });
        const resumeData = await resumeResponse.json();
        
        // Check GitHub status  
        const githubResponse = await fetch(`http://localhost:8000/get-github?user_id=${userId}`, {
            headers
        });
        const githubData = await githubResponse.json();
        
        // Update UI
        updateUploadStatusUI(resumeData, githubData);
        
    } catch (error) {
        console.error("❌ Error checking upload status:", error);
        updateUploadStatusUI({}, {});
    }
}

function updateUploadStatusUI(resumeData, githubData) {
    const resumeIndicator = document.getElementById("resume-status-indicator");
    const githubIndicator = document.getElementById("github-status-indicator");
    const uploadBtn = document.getElementById("upload-redirect-btn");
    
    // Update resume status
    if (resumeData.filename) {
        resumeIndicator.textContent = "✅ Uploaded";
        resumeIndicator.className = "status-indicator status-success";
        resumeIndicator.style.color = "#10B981";
    } else {
        resumeIndicator.textContent = "❌ Not uploaded";
        resumeIndicator.className = "status-indicator";
        resumeIndicator.style.color = "#EF4444";
    }
    
    // Update GitHub status
    if (githubData.github_username) {
        githubIndicator.textContent = "✅ Added";
        githubIndicator.className = "status-indicator status-success";
        githubIndicator.style.color = "#10B981";
    } else {
        githubIndicator.textContent = "❌ Not added";
        githubIndicator.className = "status-indicator";
        githubIndicator.style.color = "#EF4444";
    }
    
    // Show/hide upload button based on status
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