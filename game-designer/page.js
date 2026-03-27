(function () {
  const PM_API_BASE = (window.PM_API_BASE || "https://jeff-api.maneit.net").replace(/\/+$/, "");

  const form = document.getElementById("gameDesignerForm");
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
    if (summaryProject) summaryProject.textContent = linkedProject?.value || "—";
    if (summaryWorkItem) summaryWorkItem.textContent = linkedWorkItem?.value || "—";
    if (summaryPipeline) summaryPipeline.textContent = pipelineSnapshot?.value || "—";
    if (summaryStage) summaryStage.textContent = stageFocus?.value || "—";
    if (summaryMode) summaryMode.textContent = executionMode?.value || "—";
  }

  function renderLog(type, actionLabel) {
    const title = document.getElementById("jobTitle")?.value.trim() || "Untitled design pass";
    const project = linkedProject?.value || "—";
    const workItem = linkedWorkItem?.value || "—";
    const pipeline = pipelineSnapshot?.value || "—";
    const stage = stageFocus?.value || "—";
    const mode = executionMode?.value || "—";

    const stateClass = type === "saved" ? "saved" : "success";
    const stateText = type === "saved" ? "Design notes saved" : "Design pass started";

    if (activityLog) {
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
    }

    if (type === "saved") {
      if (executionStatus) executionStatus.textContent = "Notes updated";
      if (executionSummary) executionSummary.textContent = "Design notes were saved without starting a production pass.";
      return;
    }

    if (executionStatus) executionStatus.textContent = "Running";
    if (executionSummary) executionSummary.textContent = `Started ${actionLabel.toLowerCase()} for ${project} using ${pipeline}.`;
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
      title: document.getElementById("jobTitle")?.value.trim() || "Untitled design pass",
      action: actionLabel,
      linkedProject: linkedProject?.value || "",
      linkedWorkItem: linkedWorkItem?.value || "",
      pipelineSnapshot: pipelineSnapshot?.value || "",
      stageFocus: stageFocus?.value || "",
      executionMode: executionMode?.value || ""
    };
  }

  bindSegmentGroup("executionModeGroup", "executionMode");

  form?.addEventListener("input", updateSummary);
  form?.addEventListener("change", updateSummary);

  runStageBtn?.addEventListener("click", async () => {
    const actionLabel = "Run selected pass";
    const result = await callApi("/api/game-designer/run-stage", "POST", buildPayload(actionLabel));
    renderLog(result.ok ? "success" : "saved", actionLabel);
  });

  saveWorkspaceBtn?.addEventListener("click", async () => {
    const actionLabel = "Save design notes";
    const result = await callApi("/api/game-designer/save-workspace", "POST", buildPayload(actionLabel));
    renderLog("saved", actionLabel);
  });

  document.querySelectorAll(".action-tile").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action || button.textContent.trim();
      await callApi("/api/game-designer/action", "POST", buildPayload(action));
      renderLog("success", action);
    });
  });

  updateSummary();
})();
