import { useState } from "react";
import CleanupView from "./CleanupView";
import OrganizeCategoriesView from "./OrganizeCategoriesView";
import RelationshipCleanupView from "./RelationshipCleanupView";

const SUB_TABS = [
  { id: "cleanup", label: "Cleanup", icon: "\u{1F9F9}", description: "Scan for duplicates, garbage, and orphaned data" },
  { id: "relationships", label: "Relationships", icon: "\u{1F517}", description: "Review and fix relationship quality issues" },
  { id: "organize", label: "Organize Categories", icon: "\u{1F3F7}\uFE0F", description: "Re-categorize entities using AI" },
];

export default function MaintenanceView() {
  const [activeSubTab, setActiveSubTab] = useState("cleanup");

  return (
    <div className="maintenance-view">
      <div className="maintenance-tabs">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`maintenance-tab ${activeSubTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveSubTab(tab.id)}
          >
            <span className="maintenance-tab-icon">{tab.icon}</span>
            <div className="maintenance-tab-text">
              <span className="maintenance-tab-label">{tab.label}</span>
              <span className="maintenance-tab-desc">{tab.description}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="maintenance-content">
        {activeSubTab === "cleanup" && <CleanupView />}
        {activeSubTab === "relationships" && <RelationshipCleanupView />}
        {activeSubTab === "organize" && <OrganizeCategoriesView />}
      </div>
    </div>
  );
}
