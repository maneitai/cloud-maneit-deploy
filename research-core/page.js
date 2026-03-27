(function () {
  const PM_API_BASE = (window.PM_API_BASE || "https://pm-api.maneit.net").replace(/\/+$/, "");

  const form = document.getElementById("researchForm");
  const startJobBtn = document.getElementById("startJobBtn");
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const receipt = document.getElementById("jobReceipt");

  const summaryMode = document.getElementById("summaryMode");
  const summaryOutput = document.getElementById("summaryOutput");
  const summaryIntent = document.getElementById("summaryIntent");
  const summaryDestination = document.getElementById("summaryDestination");
  const summaryWorkItem = document.getElementById("summaryWorkItem");

  const outputType = document.getElementById("outputType");
  const runtimeIntent = document.getElementById("runtimeIntent");
  const destinationProject = document.getElementById("destinationProject");
  const workItem = document.getElementById("workItem");
  const jobMode = document.getElementById("jobMode");

  async function callApi(path, method = "GET", payload = null) {
    if (!PM_API_BASE) {
      return { ok: false, mock: true, error: "Missing PM_API_BASE" };
    }

    try {
      const response = await fetch(`${PM_API_BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined
      });

      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  function bindSegmentGroup(groupId, hiddenInputId) {
    const group = document.getElementById(groupId);
    const hidden = document.getElementById(hiddenInputId);
    if (!group || !hidden) return;

    const buttons = Array.from(group.querySelectorAll(".segment"));

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        hidden.value = button.dataset.value || button.textContent.trim();
        updateSummary();
      });
    });
  }

  function updateSummary() {
    if (summaryMode) summaryMode.textContent = jobMode?.value || "Research";
    if (summaryOutput) summaryOutput.textContent = outputType?.value || "Research dossier";
    if (summaryIntent) summaryIntent.textContent = runtimeIntent?.value || "Run now";
    if (summaryDestination) summaryDestination.textContent = destinationProject?.value || "—";
    if (summaryWorkItem) summaryWorkItem.textContent = workItem?.value || "—";
  }

  function renderReceipt(type, actionLabel) {
    const title = document.getElementById("jobTitle")?.value.trim() || "Untitled research job";
    const mode = jobMode?.value || "Research";
    const output = outputType?.value || "Research dossier";
    const destination = destinationProject?.value || "—";
    const selectedWorkItem = workItem?.value || "—";

    const stateClass =
      type === "saved" ? "saved" :
      type === "queued" ? "queued" :
      "success";

    const stateText =
      type === "saved" ? "Draft saved" :
      type === "queued" ? "Queued for pipeline" :
      "Job started";

    if (!receipt) return;

    receipt.innerHTML = `
      <div class="receipt-state ${stateClass}">
        <strong>${stateText}</strong><br />
        <br />
        <strong>Title:</strong> ${escapeHtml(title)}<br />
        <strong>Action:</strong> ${escapeHtml(actionLabel)}<br />
        <strong>Mode:</strong> ${escapeHtml(mode)}<br />
        <strong>Output:</strong> ${escapeHtml(output)}<br />
        <strong>Destination:</strong> ${escapeHtml(destination)}<br />
        <strong>Work item:</strong> ${escapeHtml(selectedWorkItem)}
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildPayload(actionLabel) {
    return {
      title: document.getElementById("jobTitle")?.value.trim() || "Untitled research job",
      action: actionLabel,
      mode: jobMode?.value || "Research",
      outputType: outputType?.value || "Research dossier",
      runtimeIntent: runtimeIntent?.value || "Run now",
      destinationProject: destinationProject?.value || "",
      workItem: workItem?.value || ""
    };
  }

  bindSegmentGroup("jobModeGroup", "jobMode");
  bindSegmentGroup("runtimeIntentGroup", "runtimeIntent");

  form?.addEventListener("input", updateSummary);
  form?.addEventListener("change", updateSummary);

  startJobBtn?.addEventListener("click", async () => {
    const intent = runtimeIntent?.value || "Run now";

    if (intent === "Save draft") {
      await callApi("/api/research-core/save-draft", "POST", buildPayload("Save draft"));
      renderReceipt("saved", "Save draft");
      return;
    }

    if (intent === "Queue for pipeline") {
      await callApi("/api/research-core/queue-job", "POST", buildPayload("Queue for pipeline"));
      renderReceipt("queued", "Queue for pipeline");
      return;
    }

    await callApi("/api/research-core/start-job", "POST", buildPayload("Start job"));
    renderReceipt("success", "Start job");
  });

  saveDraftBtn?.addEventListener("click", async () => {
    if (runtimeIntent) runtimeIntent.value = "Save draft";

    const buttons = document.querySelectorAll("#runtimeIntentGroup .segment");
    buttons.forEach((b) => {
      b.classList.toggle("active", b.dataset.value === "Save draft");
    });

    updateSummary();
    await callApi("/api/research-core/save-draft", "POST", buildPayload("Save draft"));
    renderReceipt("saved", "Save draft");
  });

  document.querySelectorAll(".action-tile").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action || button.textContent.trim();

      if (action === "Save reusable asset") {
        await callApi("/api/research-core/save-asset", "POST", buildPayload(action));
        renderReceipt("saved", action);
        return;
      }

      if (action === "Send to review queue") {
        await callApi("/api/research-core/review-queue", "POST", buildPayload(action));
        renderReceipt("queued", action);
        return;
      }

      await callApi("/api/research-core/action", "POST", buildPayload(action));
      renderReceipt("success", action);
    });
  });

  document.querySelectorAll(".object-card").forEach((card) => {
    card.addEventListener("click", () => {
      const map = {
        "source-stack": "Research dossier",
        "evidence-chain": "Evidence chain",
        "dossier": "Research dossier",
        "synthesis": "Synthesis notebook",
        "eval": "Eval pack",
        "training": "Training pack"
      };

      const nextOutput = map[card.dataset.object];
      if (nextOutput && outputType) {
        outputType.value = nextOutput;
        updateSummary();
      }
    });
  });

  updateSummary();
})();
