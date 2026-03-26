(function () {
  const form = document.getElementById("appCreatorForm");
  const runStageBtn = document.getElementById("runStageBtn");
  const saveWorkspaceBtn = document.getElementById("saveWorkspaceBtn");
  const activityLog = document.getElementById("activityLog");

  const linkedProject = document.getElementById("linkedProject");
  const linkedWorkItem = document.getElementById("linkedWorkItem");
  const pipelineSnapshot = document.getElementById("pipelineSnapshot");
  const stageFocus = document.getElementById("stageFocus");
  const executionMode = document.getElementById("executionMode");

  const summaryProject = document.getElementById("summaryProject");
  const summaryWorkItem = document.getElementById("summaryWorkItem");
  const summaryPipeline = document.getElementById("summaryPipeline");
  const summaryStage = document.getElementById("summaryStage");
  const summaryMode = document.getElementById("summaryMode");

  const executionStatus = document.getElementById("executionStatus");
  const executionSummary = document.getElementById("executionSummary");

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
    summaryProject.textContent = linkedProject.value || "—";
    summaryWorkItem.textContent = linkedWorkItem.value || "—";
    summaryPipeline.textContent = pipelineSnapshot.value || "—";
    summaryStage.textContent = stageFocus.value || "—";
    summaryMode.textContent = executionMode.value || "—";
  }

  function renderLog(type, actionLabel) {
    const title = document.getElementById("jobTitle").value.trim() || "Untitled app build pass";
    const project = linkedProject.value;
    const workItem = linkedWorkItem.value;
    const pipeline = pipelineSnapshot.value;
    const stage = stageFocus.value;
    const mode = executionMode.value;

    const stateClass =
      type === "saved" ? "saved" :
      type === "refresh" ? "refresh" :
      "success";

    const stateText =
      type === "saved" ? "Workspace notes saved" :
      type === "refresh" ? "Jobs refreshed" :
      "Stage run started";

    activityLog.innerHTML = `
      <div class="receipt-state ${stateClass}">
        <strong>${stateText}</strong><br /><br />
        <strong>Title:</strong> ${escapeHtml(title)}<br />
        <strong>Action:</strong> ${escapeHtml(actionLabel)}<br />
        <strong>Project:</strong> ${escapeHtml(project)}<br />
        <strong>Work item:</strong> ${escapeHtml(workItem)}<br />
        <strong>Pipeline:</strong> ${escapeHtml(pipeline)}<br />
        <strong>Stage:</strong> ${escapeHtml(stage)}<br />
        <strong>Mode:</strong> ${escapeHtml(mode)}
      </div>
    `;

    if (type === "saved") {
      executionStatus.textContent = "Notes updated";
      executionSummary.textContent = "Workspace notes were saved without starting a production stage.";
      return;
    }

    if (type === "refresh") {
      executionStatus.textContent = "Queue refreshed";
      executionSummary.textContent = "Production job state was refreshed for the current application workspace.";
      return;
    }

    executionStatus.textContent = "Running";
    executionSummary.textContent = `Started ${actionLabel.toLowerCase()} for ${project} using ${pipeline}.`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  bindSegmentGroup("executionModeGroup", "executionMode");

  form.addEventListener("input", updateSummary);
  form.addEventListener("change", updateSummary);

  runStageBtn.addEventListener("click", () => {
    renderLog("success", "Run selected stage");
  });

  saveWorkspaceBtn.addEventListener("click", () => {
    renderLog("saved", "Save workspace notes");
  });

  document.querySelectorAll(".action-tile").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action || button.textContent.trim();

      if (action === "Refresh jobs") {
        renderLog("refresh", action);
        return;
      }

      renderLog("success", action);
    });
  });

  updateSummary();
})();
