(function () {
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
    summaryMode.textContent = jobMode.value || "Research";
    summaryOutput.textContent = outputType.value || "Research dossier";
    summaryIntent.textContent = runtimeIntent.value || "Run now";
    summaryDestination.textContent = destinationProject.value || "—";
    summaryWorkItem.textContent = workItem.value || "—";
  }

  function renderReceipt(type, actionLabel) {
    const title = document.getElementById("jobTitle").value.trim() || "Untitled research job";
    const mode = jobMode.value;
    const output = outputType.value;
    const destination = destinationProject.value;
    const selectedWorkItem = workItem.value;

    const stateClass =
      type === "saved" ? "saved" :
      type === "queued" ? "queued" :
      "success";

    const stateText =
      type === "saved" ? "Draft saved" :
      type === "queued" ? "Queued for pipeline" :
      "Job started";

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

  bindSegmentGroup("jobModeGroup", "jobMode");
  bindSegmentGroup("runtimeIntentGroup", "runtimeIntent");

  form.addEventListener("input", updateSummary);
  form.addEventListener("change", updateSummary);

  startJobBtn.addEventListener("click", () => {
    const intent = runtimeIntent.value;

    if (intent === "Save draft") {
      renderReceipt("saved", "Save draft");
      return;
    }

    if (intent === "Queue for pipeline") {
      renderReceipt("queued", "Queue for pipeline");
      return;
    }

    renderReceipt("success", "Start job");
  });

  saveDraftBtn.addEventListener("click", () => {
    runtimeIntent.value = "Save draft";

    const buttons = document.querySelectorAll("#runtimeIntentGroup .segment");
    buttons.forEach((b) => {
      b.classList.toggle("active", b.dataset.value === "Save draft");
    });

    updateSummary();
    renderReceipt("saved", "Save draft");
  });

  document.querySelectorAll(".action-tile").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action || button.textContent.trim();

      if (action === "Save reusable asset") {
        renderReceipt("saved", action);
        return;
      }

      if (action === "Send to review queue") {
        renderReceipt("queued", action);
        return;
      }

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
      if (nextOutput) {
        outputType.value = nextOutput;
        updateSummary();
      }
    });
  });

  updateSummary();
})();
