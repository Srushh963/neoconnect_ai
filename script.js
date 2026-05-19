// Initial Array set to empty to ensure starting layout renders with clean state
let contactsDatabase = JSON.parse(localStorage.getItem("neo_contacts")) || [];
let trashDatabase = JSON.parse(localStorage.getItem("neo_trash")) || [];

let currentSystemView = "Dashboard"; 
let activeGroupFilterValue = "";
let currentSortingSequenceValue = "default";
let targetFormEditingIndex = null;

const contactsMasterRenderingGrid = document.getElementById("contactsMasterRenderingGrid");
const mainSearchInput = document.getElementById("mainSearchInput");
const contactProcessingModalDialog = document.getElementById("contactProcessingModalDialog");
const systemContactEntitySubmissionForm = document.getElementById("systemContactEntitySubmissionForm");
const viewStateTitleLabel = document.getElementById("viewStateTitleLabel");
const appSystemNotificationToastBox = document.getElementById("appSystemNotificationToastBox");
const navbarAvatarDropdownTrigger = document.getElementById("navbarAvatarDropdownTrigger");
const avatarSelectorDropdown = document.getElementById("avatarSelectorDropdown");

function synchronizeInterfaceData() {
    if (!contactsMasterRenderingGrid) return;
    contactsMasterRenderingGrid.innerHTML = "";
    recalculateDashboardMetrics();

    if (currentSystemView === "Settings") {
        renderSettingsSubViewLayout();
        return;
    }

    let computationCollection = (currentSystemView === "Trash") ? [...trashDatabase] : [...contactsDatabase];
    
    if (currentSystemView === "Favorites") {
        computationCollection = computationCollection.filter(item => item.favorite);
    } else if (currentSystemView === "Group-Filter") {
        computationCollection = computationCollection.filter(item => item.category === activeGroupFilterValue);
    }

    const searchQueryToken = mainSearchInput ? mainSearchInput.value.toLowerCase().trim() : "";
    if (searchQueryToken !== "") {
        computationCollection = computationCollection.filter(item => 
            item.name.toLowerCase().includes(searchQueryToken) || 
            item.phone.includes(searchQueryToken)
        );
    }

    if (currentSortingSequenceValue === "az") {
        computationCollection.sort((x, y) => x.name.localeCompare(y.name));
    } else if (currentSortingSequenceValue === "za") {
        computationCollection.sort((x, y) => y.name.localeCompare(x.name));
    }

    if (computationCollection.length === 0) {
        contactsMasterRenderingGrid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-secondary); opacity:0.7;">
                <i class="fa-solid fa-folder-open" style="font-size:32px; margin-bottom:8px; display:block; color:#6366f1;"></i>
                <p>No profiles found.</p>
            </div>`;
        computeValueDrivenAiSuggestions();
        return;
    }

    computationCollection.forEach((item) => {
        let internalIndexPointer = (currentSystemView === "Trash") 
            ? trashDatabase.findIndex(t => t.phone === item.phone) 
            : contactsDatabase.findIndex(c => c.phone === item.phone);
            
        const surfaceCardNode = document.createElement("div");
        surfaceCardNode.className = "contact-surface-card";
        
        let matrixMarkup = (currentSystemView === "Trash") ? 
            `<div class="card-action-matrix-row" style="grid-template-columns:1fr 1fr;">
                <button class="act-wa" style="background:#10b981;" onclick="restoreDeletedContact(${internalIndexPointer})">Restore</button>
                <button class="act-delete" onclick="permanentDestroyTrashRecord(${internalIndexPointer})">Erase</button>
             </div>` :
            `<div class="card-action-matrix-row">
                <a href="tel:${item.phone}" class="act-call"><i class="fa-solid fa-phone"></i></a>
                <a href="https://wa.me/${item.phone}" target="_blank" class="act-wa"><i class="fa-brands fa-whatsapp"></i></a>
                <button class="act-edit" onclick="initiateContactCardModification(${internalIndexPointer})"><i class="fa-solid fa-pen"></i></button>
                <button class="act-delete" onclick="softDeleteContactEntity(${internalIndexPointer})"><i class="fa-solid fa-trash"></i></button>
             </div>`;

        surfaceCardNode.innerHTML = `
            <div class="card-top-profile">
                <img src="${item.avatar}">
                <div class="card-identity-text"><h3>${item.name}</h3><p>${item.email || 'No email registered'}</p></div>
                ${currentSystemView !== "Trash" ? `<i class="fa-solid fa-star card-star-fav-anchor ${item.favorite ? 'is-favorited' : ''}" onclick="toggleFavoritePropertyState(${internalIndexPointer})"></i>` : ''}
            </div>
            <div class="card-badge-row">
                <span class="badge badge-group">${item.category}</span>
                ${item.notes ? `<span class="badge badge-note">${item.notes}</span>` : ''}
            </div>
            ${matrixMarkup}`;
        contactsMasterRenderingGrid.appendChild(surfaceCardNode);
    });
    computeValueDrivenAiSuggestions();
}

function switchView(targetViewState) {
    currentSystemView = targetViewState; 
    activeGroupFilterValue = "";
    
    document.querySelectorAll(".nav-menu .menu-item").forEach(node => node.classList.remove("active"));
    const uiMetricsDashboardRow = document.getElementById("metricsCountersGridRow");
    if (uiMetricsDashboardRow) uiMetricsDashboardRow.style.display = "grid";

    if (targetViewState === "Dashboard" || targetViewState === "All-Contacts") {
        document.getElementById("side-dashboard").classList.add("active");
        if (viewStateTitleLabel) viewStateTitleLabel.innerText = "Recent Contacts";
    } else if (targetViewState === "Favorites") {
        document.getElementById("side-favorites").classList.add("active");
        if (viewStateTitleLabel) viewStateTitleLabel.innerText = "Favorite Directory";
    } else if (targetViewState === "Trash") {
        document.getElementById("side-trash").classList.add("active");
        if (viewStateTitleLabel) viewStateTitleLabel.innerText = "Trash Bin";
    } else if (targetViewState === "Settings") {
        const sideSettings = document.getElementById("side-settings");
        if (sideSettings) sideSettings.classList.add("active");
        if (viewStateTitleLabel) viewStateTitleLabel.innerText = "System Parameters";
        if (uiMetricsDashboardRow) uiMetricsDashboardRow.style.display = "none";
    }
    synchronizeInterfaceData();
}

function switchViewGroup(groupNameValue) {
    currentSystemView = "Group-Filter"; 
    activeGroupFilterValue = groupNameValue;
    if (viewStateTitleLabel) viewStateTitleLabel.innerText = `${groupNameValue} Group Segment`;
    synchronizeInterfaceData();
}

function toggleGroupsAccordionMenu() {
    document.getElementById("sidebarGroupsNestedList").classList.toggle("hidden-accordion-list");
    document.getElementById("accordionArrow").classList.toggle("rotated");
}

function triggerSortEngine(sortValueKey) { 
    currentSortingSequenceValue = sortValueKey; 
    synchronizeInterfaceData(); 
}

function launchContactModal() { 
    targetFormEditingIndex = null; 
    contactProcessingModalDialog.classList.remove("hidden-dialog-window"); 
    systemContactEntitySubmissionForm.reset(); 
    document.querySelectorAll(".modal-selectable-avatar-item").forEach((img, i) => {
        if(i === 0) img.classList.add("selected-active-avatar");
        else img.classList.remove("selected-active-avatar");
    });
    if (document.getElementById("contactModalActionTitleHeader")) {
        document.getElementById("contactModalActionTitleHeader").innerText = "Add New Contact";
    }
}

function dismissContactModal() { 
    contactProcessingModalDialog.classList.add("hidden-dialog-window"); 
}

function initiateContactCardModification(indexPointer) {
    targetFormEditingIndex = indexPointer;
    const targetEntity = contactsDatabase[indexPointer];
    contactProcessingModalDialog.classList.remove("hidden-dialog-window");
    
    if (document.getElementById("contactModalActionTitleHeader")) {
        document.getElementById("contactModalActionTitleHeader").innerText = "Modify Registered Node";
    }

    document.getElementById("inputFormContactName").value = targetEntity.name;
    document.getElementById("inputFormContactPhone").value = targetEntity.phone;
    document.getElementById("inputFormContactEmail").value = targetEntity.email;
    document.getElementById("inputFormContactCategory").value = targetEntity.category;
    document.getElementById("inputFormContactNotes").value = targetEntity.notes || "";
    
    document.querySelectorAll(".modal-selectable-avatar-item").forEach(img => {
        if(img.src === targetEntity.avatar) img.classList.add("selected-active-avatar");
        else img.classList.remove("selected-active-avatar");
    });
}

if (systemContactEntitySubmissionForm) {
    systemContactEntitySubmissionForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("inputFormContactName").value.trim();
        const phone = document.getElementById("inputFormContactPhone").value.trim();
        const email = document.getElementById("inputFormContactEmail").value.trim();
        const category = document.getElementById("inputFormContactCategory").value;
        const notes = document.getElementById("inputFormContactNotes").value.trim();
        
        const selectedAvatarNode = document.querySelector(".modal-selectable-avatar-item.selected-active-avatar");
        const avatar = selectedAvatarNode ? selectedAvatarNode.src : "https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80";

        if (targetFormEditingIndex !== null) {
            contactsDatabase[targetFormEditingIndex] = { ...contactsDatabase[targetFormEditingIndex], name, phone, email, category, notes, avatar };
            triggerNotificationToastBoxFeedback("Contact record entry altered.");
        } else {
            contactsDatabase.push({ name, phone, email, category, notes, avatar, favorite: false });
            triggerNotificationToastBoxFeedback("New communication profile mapped.");
        }
        commit(); dismissContactModal(); synchronizeInterfaceData();
    });
}

function softDeleteContactEntity(idx) { 
    trashDatabase.push(contactsDatabase.splice(idx, 1)[0]); 
    commit(); synchronizeInterfaceData(); 
    triggerNotificationToastBoxFeedback("Moved items to trash cache."); 
}

function restoreDeletedContact(idx) { 
    contactsDatabase.push(trashDatabase.splice(idx, 1)[0]); 
    commit(); synchronizeInterfaceData(); 
    triggerNotificationToastBoxFeedback("Profile returned to master database."); 
}

function permanentDestroyTrashRecord(idx) { 
    if (confirm("Purge profile completely from disk storage?")) {
        trashDatabase.splice(idx, 1); 
        commit(); synchronizeInterfaceData(); 
        triggerNotificationToastBoxFeedback("Data node destroyed.");
    }
}

function toggleFavoritePropertyState(idx) { 
    contactsDatabase[idx].favorite = !contactsDatabase[idx].favorite; 
    commit(); synchronizeInterfaceData(); 
}

function markSelectedFormAvatar(elementImgNode) {
    document.querySelectorAll(".modal-selectable-avatar-item").forEach(node => node.classList.remove("selected-active-avatar"));
    elementImgNode.classList.add("selected-active-avatar");
}

if (navbarAvatarDropdownTrigger) {
    navbarAvatarDropdownTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        avatarSelectorDropdown.classList.toggle("active-block-show");
    });
}

function updateMasterUserAvatar(imgUrlSrc) {
    const primaryNavImgNode = document.getElementById("activeNavbarAvatar");
    if (primaryNavImgNode) primaryNavImgNode.src = imgUrlSrc;
    triggerNotificationToastBoxFeedback("Session identity art configured.");
    if (avatarSelectorDropdown) avatarSelectorDropdown.classList.remove("active-block-show");
}

function commit() { 
    localStorage.setItem("neo_contacts", JSON.stringify(contactsDatabase)); 
    localStorage.setItem("neo_trash", JSON.stringify(trashDatabase)); 
}

function recalculateDashboardMetrics() {
    if(document.getElementById("counterTotalContacts")) document.getElementById("counterTotalContacts").innerText = contactsDatabase.length;
    if(document.getElementById("counterFavContacts")) document.getElementById("counterFavContacts").innerText = contactsDatabase.filter(i => i.favorite).length;
    if(document.getElementById("counterEmergencyContacts")) document.getElementById("counterEmergencyContacts").innerText = contactsDatabase.filter(i => i.category === "Emergency").length;
}

function computeValueDrivenAiSuggestions() {
    const box = document.getElementById("aiSmartSuggestionsWrapperBox");
    if(!box) return;
    if(contactsDatabase.length === 0) {
        box.innerHTML = `<div class="ai-advice-strip"><p>Directory index clear. Trigger additions via action pipeline pane.</p></div>`;
    } else {
        box.innerHTML = `<div class="ai-advice-strip"><p>Relationship database indexing active and optimized.</p></div>`;
    }
}

function renderSettingsSubViewLayout() {
    if (!contactsMasterRenderingGrid) return;
    contactsMasterRenderingGrid.innerHTML = `
        <div style="background:var(--card-surface); padding:24px; border-radius:14px; max-width:400px; border:1px solid var(--card-border);">
            <h4 style="margin-bottom:8px;">Active Context Engine Session</h4>
            <p style="font-size:12px; color:var(--text-secondary); margin-bottom:14px;">User: Srush Directory Matrix</p>
            <button style="background:#ef4444; border:none; color:white; padding:8px 16px; border-radius:8px; cursor:pointer;" onclick="alert('Cache Reset.')">Reset Store</button>
        </div>`;
}

document.getElementById("themeModeToggleBtn").addEventListener("click", () => {
    document.body.classList.toggle("light-mode");
    const iconNode = document.getElementById("themeModeToggleBtn").querySelector("i");
    iconNode.className = document.body.classList.contains("light-mode") ? "fa-solid fa-sun" : "fa-solid fa-moon";
});

window.addEventListener("click", () => { if (avatarSelectorDropdown) avatarSelectorDropdown.classList.remove("active-block-show"); });
if (mainSearchInput) mainSearchInput.addEventListener("input", synchronizeInterfaceData);
document.addEventListener("DOMContentLoaded", synchronizeInterfaceData);

function triggerNotificationToastBoxFeedback(str) {
    if (!appSystemNotificationToastBox) return;
    document.getElementById("appSystemNotificationToastMessageLabel").innerText = str;
    appSystemNotificationToastBox.classList.remove("functional-toast-hidden");
    setTimeout(() => { appSystemNotificationToastBox.classList.add("functional-toast-hidden"); }, 2000);
}