const studioTabs = document.getElementById("studioTabs");
const studioTabButtons = document.querySelectorAll(".studio-tab");
const studioPanes = document.querySelectorAll(".studio-pane");
const routeList = document.getElementById("routeList");
const routeButtons = document.querySelectorAll(".route-item");
const activityBox = document.getElementById("activityBox");
const selectedRouteLabel = document.getElementById("selectedRouteLabel");
const selectedRoutePurpose = document.getElementById("selectedRoutePurpose");

const routeMap = {
  home: {
    path: "/home",
    purpose: "Daily driver chat surface"
  },
  projects: {
    path: "/projects",
    purpose: "Promoted work registry"
  },
  pipelines: {
    path: "/pipelines",
    purpose: "Canonical workflow graph"
  },
  state: {
    path: "/state",
    purpose: "Local runtime control"
  }
};

function addActivity(text) {
  const line = document.createElement("div");
  line.className = "activity-line";
  line.textContent = text;
  activityBox.prepend(line);

  const lines = activityBox.querySelectorAll(".activity-line");
  if (lines.length > 8) {
    lines[lines.length - 1].remove();
  }
}

routeList?.addEventListener("click", (event) => {
  const button = event.target.closest(".route-item");
  if (!button) return;

  const routeKey = button.dataset.route;
  const route = routeMap[routeKey];
  if (!route) return;

  routeButtons.forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });

  selectedRouteLabel.textContent = route.path;
  selectedRoutePurpose.textContent = route.purpose;

  addActivity(`Route focus changed to ${route.path}.`);
});

studioTabs?.addEventListener("click", (event) => {
  const button = event.target.closest(".studio-tab");
  if (!button) return;

  const targetTab = button.dataset.tab;

  studioTabButtons.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === targetTab);
  });

  studioPanes.forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.pane === targetTab);
  });

  addActivity(`Workbench tab changed to ${targetTab}.`);
});

addActivity("Portal builder board loaded.");
