// Supabase Client and Auth Variables
let supabaseClient = null;
let currentUser = null;

// Initialize Supabase client dynamically using values from /env.js
if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_URL.includes("PASTE_MY_SUPABASE_URL")) {
    supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

// Memory databases synchronized with Supabase
let contactsDatabase = [];
let trashDatabase = [];

let currentSystemView = "Dashboard"; 
let activeGroupFilterValue = "";
let currentSortingSequenceValue = "default";
let targetFormEditingIndex = null;

// DOM Selectors
const contactsMasterRenderingGrid = document.getElementById("contactsMasterRenderingGrid");
const mainSearchInput = document.getElementById("mainSearchInput");
const contactProcessingModalDialog = document.getElementById("contactProcessingModalDialog");
const systemContactEntitySubmissionForm = document.getElementById("systemContactEntitySubmissionForm");
const viewStateTitleLabel = document.getElementById("viewStateTitleLabel");
const appSystemNotificationToastBox = document.getElementById("appSystemNotificationToastBox");
const navbarAvatarDropdownTrigger = document.getElementById("navbarAvatarDropdownTrigger");
const avatarSelectorDropdown = document.getElementById("avatarSelectorDropdown");

// ==========================================
// AUTHENTICATION STATE & UI LOGIC
// ==========================================

function toggleAuthView(viewName) {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const forgotForm = document.getElementById("forgotForm");
    const resetForm = document.getElementById("resetForm");
    const subtitle = document.getElementById("authSubtitle");

    if (!loginForm || !signupForm || !forgotForm || !resetForm) return;

    loginForm.style.display = "none";
    signupForm.style.display = "none";
    forgotForm.style.display = "none";
    resetForm.style.display = "none";

    if (viewName === 'login') {
        loginForm.style.display = "flex";
        if (subtitle) subtitle.innerText = "Smart Contact Directory Access";
    } else if (viewName === 'signup') {
        signupForm.style.display = "flex";
        if (subtitle) subtitle.innerText = "Create Your NeoConnect Identity";
    } else if (viewName === 'forgot') {
        forgotForm.style.display = "flex";
        if (subtitle) subtitle.innerText = "Recover Account Password";
    } else if (viewName === 'reset') {
        resetForm.style.display = "flex";
        if (subtitle) subtitle.innerText = "Configure New Password Security";
    }
}

function showAuthScreen() {
    const appContainer = document.getElementById("appContainer");
    const authContainer = document.getElementById("authContainer");
    if (appContainer) appContainer.style.display = "none";
    if (authContainer) authContainer.style.display = "flex";
    toggleAuthView('login');
}

async function checkAuthSession() {
    if (!supabaseClient) {
        showConfigWarning();
        showAuthScreen();
        return;
    }

    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        
        if (session) {
            currentUser = session.user;
            await setupUserProfileAndFetchData();
        } else {
            showAuthScreen();
        }
    } catch (err) {
        console.error("Auth session check error:", err);
        showAuthScreen();
    }
}

async function setupUserProfileAndFetchData() {
    const appContainer = document.getElementById("appContainer");
    const authContainer = document.getElementById("authContainer");
    if (authContainer) authContainer.style.display = "none";
    if (appContainer) appContainer.style.display = "flex";

    await fetchUserProfile();
    await fetchContacts();
    subscribeToContactsRealtime();
}

function showConfigWarning() {
    setTimeout(() => {
        triggerNotificationToastBoxFeedback("Warning: Supabase keys not set. Configure your .env file!");
    }, 1000);
}

// ==========================================
// AUTHENTICATION REQUEST HANDLERS
// ==========================================

async function handleUserLogin(e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        triggerNotificationToastBoxFeedback("Logged in successfully!");
    } catch (err) {
        console.error("Login error:", err);
        triggerNotificationToastBoxFeedback(err.message || "Failed to log in.");
    }
}

async function handleUserSignup(e) {
    e.preventDefault();
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=Felix"
                }
            }
        });
        if (error) throw error;

        if (data.session) {
            triggerNotificationToastBoxFeedback("Registration successful!");
        } else {
            triggerNotificationToastBoxFeedback("Registration complete! Check email verify link.");
            toggleAuthView('login');
        }
    } catch (err) {
        console.error("Signup error:", err);
        triggerNotificationToastBoxFeedback(err.message || "Failed to sign up.");
    }
}

async function handleUserForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById("forgotEmail").value.trim();

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });
        if (error) throw error;
        triggerNotificationToastBoxFeedback("Password reset link sent to your email.");
        toggleAuthView('login');
    } catch (err) {
        console.error("Reset request error:", err);
        triggerNotificationToastBoxFeedback(err.message || "Failed to send reset link.");
    }
}

async function handleUserResetPassword(e) {
    e.preventDefault();
    const password = document.getElementById("resetPassword").value;

    try {
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) throw error;
        triggerNotificationToastBoxFeedback("Password updated! Accessing dashboard.");
        document.getElementById("resetPassword").value = "";
        await setupUserProfileAndFetchData();
    } catch (err) {
        console.error("Password reset error:", err);
        triggerNotificationToastBoxFeedback(err.message || "Failed to update password.");
    }
}

async function handleUserLogout() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        
        currentUser = null;
        contactsDatabase = [];
        trashDatabase = [];
        showAuthScreen();
        triggerNotificationToastBoxFeedback("Logged out successfully.");
    } catch (err) {
        console.error("Logout error:", err);
        triggerNotificationToastBoxFeedback("Logout failed.");
    }
}

// ==========================================
// USER PROFILE FETCH & EDITING
// ==========================================

async function fetchUserProfile() {
    if (!supabaseClient || !currentUser) return;

    try {
        let { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        // Handle case where auth user triggers did not execute fast enough or failed
        if (error && error.code === 'PGRST116') {
            const fallbackName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
            const fallbackAvatar = currentUser.user_metadata?.avatar_url || "https://api.dicebear.com/7.x/bottts/svg?seed=Felix";

            const { data: newProfile, error: insertError } = await supabaseClient
                .from('profiles')
                .insert({
                    id: currentUser.id,
                    full_name: fallbackName,
                    avatar_url: fallbackAvatar
                })
                .select()
                .single();

            if (!insertError) profile = newProfile;
        }

        if (profile) {
            const welcomeHeading = document.getElementById("welcomeHeadingText");
            if (welcomeHeading) welcomeHeading.innerText = `Welcome Back, ${profile.full_name} 👋`;

            const navbarAvatar = document.getElementById("activeNavbarAvatar");
            if (navbarAvatar) navbarAvatar.src = profile.avatar_url;
        }
    } catch (err) {
        console.error("Error loading user profile:", err);
    }
}

async function updateMasterUserAvatar(imgUrlSrc) {
    const primaryNavImgNode = document.getElementById("activeNavbarAvatar");
    if (primaryNavImgNode) primaryNavImgNode.src = imgUrlSrc;

    if (supabaseClient && currentUser) {
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ avatar_url: imgUrlSrc })
                .eq('id', currentUser.id);

            if (error) throw error;
            triggerNotificationToastBoxFeedback("Session identity art configured.");
        } catch (err) {
            console.error("Error updating avatar:", err);
            triggerNotificationToastBoxFeedback("Failed to update profile identity art.");
        }
    } else {
        triggerNotificationToastBoxFeedback("Session identity art configured.");
    }

    if (avatarSelectorDropdown) avatarSelectorDropdown.classList.remove("active-block-show");
}

async function handleSettingsProfileUpdate(e) {
    e.preventDefault();
    const newName = document.getElementById("settingsDisplayName").value.trim();
    if (!newName) return;

    if (supabaseClient && currentUser) {
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ full_name: newName })
                .eq('id', currentUser.id);

            if (error) throw error;
            triggerNotificationToastBoxFeedback("Profile name updated successfully.");
            await fetchUserProfile();
        } catch (err) {
            console.error("Profile name update error:", err);
            triggerNotificationToastBoxFeedback("Failed to update profile name.");
        }
    }
}

async function handleSettingsPasswordUpdate(e) {
    e.preventDefault();
    const newPassword = document.getElementById("settingsNewPassword").value;
    if (!newPassword || newPassword.length < 6) {
        triggerNotificationToastBoxFeedback("Password must be at least 6 characters.");
        return;
    }

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
            if (error) throw error;
            triggerNotificationToastBoxFeedback("Password changed successfully.");
            document.getElementById("settingsNewPassword").value = "";
        } catch (err) {
            console.error("Password update error:", err);
            triggerNotificationToastBoxFeedback(err.message || "Failed to change password.");
        }
    }
}

async function handleSettingsAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileNameLabel = document.getElementById("settingsAvatarFileName");
    if (fileNameLabel) fileNameLabel.innerText = file.name;

    if (!supabaseClient || !currentUser) return;

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/avatar-${Date.now()}.${fileExt}`;

        // Upload image file to Supabase Storage Bucket 'avatars'
        const { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        // Retrieve public access URL
        const { data: { publicUrl } } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);

        // Update avatar URL in the DB profiles table
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', currentUser.id);

        if (profileError) throw profileError;

        triggerNotificationToastBoxFeedback("Profile avatar uploaded!");
        await fetchUserProfile();
    } catch (err) {
        console.error("Avatar upload error:", err);
        triggerNotificationToastBoxFeedback("Failed to upload custom avatar.");
    }
}

// ==========================================
// DATABASE CRUD & REAL-TIME LOGIC
// ==========================================

async function fetchContacts() {
    if (!supabaseClient || !currentUser) return;

    try {
        const { data, error } = await supabaseClient
            .from('contacts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Populate lists
        contactsDatabase = data.filter(c => !c.is_deleted);
        trashDatabase = data.filter(c => c.is_deleted);

        synchronizeInterfaceData();
    } catch (err) {
        console.error("Fetch contacts error:", err);
        triggerNotificationToastBoxFeedback("Failed to sync contacts.");
    }
}

let contactsSubscription = null;

function subscribeToContactsRealtime() {
    if (!supabaseClient || !currentUser) return;

    if (contactsSubscription) {
        supabaseClient.removeChannel(contactsSubscription);
    }

    contactsSubscription = supabaseClient
        .channel('public-contacts-channel')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'contacts',
                filter: `user_id=eq.${currentUser.id}`
            },
            async (payload) => {
                console.log('Real-time synchronization change caught:', payload);
                await fetchContacts();
            }
        )
        .subscribe();
}

async function softDeleteContactEntity(idx) { 
    if (!supabaseClient || !contactsDatabase[idx]) return;
    const contactId = contactsDatabase[idx].id;

    try {
        const { error } = await supabaseClient
            .from('contacts')
            .update({ is_deleted: true })
            .eq('id', contactId);

        if (error) throw error;
        triggerNotificationToastBoxFeedback("Moved items to trash cache."); 
        await fetchContacts();
    } catch (err) {
        console.error("Soft delete error:", err);
        triggerNotificationToastBoxFeedback("Failed to trash contact.");
    }
}

async function restoreDeletedContact(idx) { 
    if (!supabaseClient || !trashDatabase[idx]) return;
    const contactId = trashDatabase[idx].id;

    try {
        const { error } = await supabaseClient
            .from('contacts')
            .update({ is_deleted: false })
            .eq('id', contactId);

        if (error) throw error;
        triggerNotificationToastBoxFeedback("Profile returned to master database."); 
        await fetchContacts();
    } catch (err) {
        console.error("Restore error:", err);
        triggerNotificationToastBoxFeedback("Failed to restore contact.");
    }
}

async function permanentDestroyTrashRecord(idx) { 
    if (!supabaseClient || !trashDatabase[idx]) return;
    if (confirm("Purge profile completely from disk storage?")) {
        const contactId = trashDatabase[idx].id;

        try {
            const { error } = await supabaseClient
                .from('contacts')
                .delete()
                .eq('id', contactId);

            if (error) throw error;
            triggerNotificationToastBoxFeedback("Data node destroyed.");
            await fetchContacts();
        } catch (err) {
            console.error("Permanent delete error:", err);
            triggerNotificationToastBoxFeedback("Failed to purge contact.");
        }
    }
}

async function toggleFavoritePropertyState(idx) { 
    if (!supabaseClient || !contactsDatabase[idx]) return;
    const contactId = contactsDatabase[idx].id;
    const currentFavoriteState = contactsDatabase[idx].favorite;

    try {
        const { error } = await supabaseClient
            .from('contacts')
            .update({ favorite: !currentFavoriteState })
            .eq('id', contactId);

        if (error) throw error;
        await fetchContacts();
    } catch (err) {
        console.error("Toggle favorite error:", err);
        triggerNotificationToastBoxFeedback("Failed to update favorite status.");
    }
}

// ==========================================
// DASHBOARD & SEARCH RENDERING ENGINE
// ==========================================

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
            ? trashDatabase.findIndex(t => t.id === item.id) 
            : contactsDatabase.findIndex(c => c.id === item.id);
            
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
        const sideDash = document.getElementById("side-dashboard");
        if (sideDash) sideDash.classList.add("active");
        if (viewStateTitleLabel) viewStateTitleLabel.innerText = "Recent Contacts";
    } else if (targetViewState === "Favorites") {
        const sideFavs = document.getElementById("side-favorites");
        if (sideFavs) sideFavs.classList.add("active");
        if (viewStateTitleLabel) viewStateTitleLabel.innerText = "Favorite Directory";
    } else if (targetViewState === "Trash") {
        const sideTrash = document.getElementById("side-trash");
        if (sideTrash) sideTrash.classList.add("active");
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
    const list = document.getElementById("sidebarGroupsNestedList");
    const arrow = document.getElementById("accordionArrow");
    if (list) list.classList.toggle("hidden-accordion-list");
    if (arrow) arrow.classList.toggle("rotated");
}

function triggerSortEngine(sortValueKey) { 
    currentSortingSequenceValue = sortValueKey; 
    synchronizeInterfaceData(); 
}

function launchContactModal() { 
    targetFormEditingIndex = null; 
    if (contactProcessingModalDialog) contactProcessingModalDialog.classList.remove("hidden-dialog-window"); 
    if (systemContactEntitySubmissionForm) systemContactEntitySubmissionForm.reset(); 
    document.querySelectorAll(".modal-selectable-avatar-item").forEach((img, i) => {
        if(i === 0) img.classList.add("selected-active-avatar");
        else img.classList.remove("selected-active-avatar");
    });
    const headerTitle = document.getElementById("contactModalActionTitleHeader");
    if (headerTitle) headerTitle.innerText = "Add New Contact";
}

function dismissContactModal() { 
    if (contactProcessingModalDialog) contactProcessingModalDialog.classList.add("hidden-dialog-window"); 
}

function initiateContactCardModification(indexPointer) {
    targetFormEditingIndex = indexPointer;
    const targetEntity = contactsDatabase[indexPointer];
    if (!targetEntity) return;

    if (contactProcessingModalDialog) contactProcessingModalDialog.classList.remove("hidden-dialog-window");
    
    const headerTitle = document.getElementById("contactModalActionTitleHeader");
    if (headerTitle) headerTitle.innerText = "Modify Registered Node";

    const nameInput = document.getElementById("inputFormContactName");
    const phoneInput = document.getElementById("inputFormContactPhone");
    const emailInput = document.getElementById("inputFormContactEmail");
    const categoryInput = document.getElementById("inputFormContactCategory");
    const notesInput = document.getElementById("inputFormContactNotes");

    if (nameInput) nameInput.value = targetEntity.name;
    if (phoneInput) phoneInput.value = targetEntity.phone;
    if (emailInput) emailInput.value = targetEntity.email || "";
    if (categoryInput) categoryInput.value = targetEntity.category;
    if (notesInput) notesInput.value = targetEntity.notes || "";
    
    document.querySelectorAll(".modal-selectable-avatar-item").forEach(img => {
        if(img.src === targetEntity.avatar) img.classList.add("selected-active-avatar");
        else img.classList.remove("selected-active-avatar");
    });
}

// Contact Submit Form Interceptor
if (systemContactEntitySubmissionForm) {
    systemContactEntitySubmissionForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("inputFormContactName").value.trim();
        const phone = document.getElementById("inputFormContactPhone").value.trim();
        const email = document.getElementById("inputFormContactEmail").value.trim();
        const category = document.getElementById("inputFormContactCategory").value;
        const notes = document.getElementById("inputFormContactNotes").value.trim();
        
        const selectedAvatarNode = document.querySelector(".modal-selectable-avatar-item.selected-active-avatar");
        const avatar = selectedAvatarNode ? selectedAvatarNode.src : "https://api.dicebear.com/7.x/bottts/svg?seed=Felix";

        if (!supabaseClient || !currentUser) {
            triggerNotificationToastBoxFeedback("Error: Not Authenticated.");
            return;
        }

        try {
            if (targetFormEditingIndex !== null) {
                const contactId = contactsDatabase[targetFormEditingIndex].id;
                const { error } = await supabaseClient
                    .from('contacts')
                    .update({ name, phone, email, category, notes, avatar })
                    .eq('id', contactId);
                
                if (error) throw error;
                triggerNotificationToastBoxFeedback("Contact record entry altered.");
            } else {
                const { error } = await supabaseClient
                    .from('contacts')
                    .insert({
                        user_id: currentUser.id,
                        name,
                        phone,
                        email,
                        category,
                        notes,
                        avatar,
                        favorite: false,
                        is_deleted: false
                    });
                
                if (error) throw error;
                triggerNotificationToastBoxFeedback("New communication profile mapped.");
            }
            dismissContactModal();
            await fetchContacts();
        } catch (err) {
            console.error("Save contact error:", err);
            triggerNotificationToastBoxFeedback("Failed to save contact.");
        }
    });
}

function markSelectedFormAvatar(elementImgNode) {
    document.querySelectorAll(".modal-selectable-avatar-item").forEach(node => node.classList.remove("selected-active-avatar"));
    elementImgNode.classList.add("selected-active-avatar");
}

if (navbarAvatarDropdownTrigger) {
    navbarAvatarDropdownTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (avatarSelectorDropdown) avatarSelectorDropdown.classList.toggle("active-block-show");
    });
}

function recalculateDashboardMetrics() {
    const total = document.getElementById("counterTotalContacts");
    const favs = document.getElementById("counterFavContacts");
    const emergency = document.getElementById("counterEmergencyContacts");

    if (total) total.innerText = contactsDatabase.length;
    if (favs) favs.innerText = contactsDatabase.filter(i => i.favorite).length;
    if (emergency) emergency.innerText = contactsDatabase.filter(i => i.category === "Emergency").length;
}

function computeValueDrivenAiSuggestions() {
    const box = document.getElementById("aiSmartSuggestionsWrapperBox");
    if (!box) return;
    if (contactsDatabase.length === 0) {
        box.innerHTML = `<div class="ai-advice-strip"><p>Directory index clear. Trigger additions via action pipeline pane.</p></div>`;
    } else {
        box.innerHTML = `<div class="ai-advice-strip"><p>Relationship database indexing active and optimized in Supabase.</p></div>`;
    }
}

async function renderSettingsSubViewLayout() {
    if (!contactsMasterRenderingGrid) return;
    
    let profileName = "User";
    let email = currentUser ? currentUser.email : "";

    if (supabaseClient && currentUser) {
        try {
            const { data } = await supabaseClient
                .from('profiles')
                .select('full_name')
                .eq('id', currentUser.id)
                .single();
            if (data) profileName = data.full_name;
        } catch (err) {
            console.error("Error fetching display name for settings:", err);
        }
    }
    
    contactsMasterRenderingGrid.innerHTML = `
        <div class="settings-card" style="background:var(--card-surface); padding:28px; border-radius:18px; max-width:480px; border:1px solid var(--card-border); backdrop-filter: blur(15px); display:flex; flex-direction:column; gap:20px;">
            <div>
                <h3 style="font-size:18px; font-weight:600; margin-bottom:4px; color:var(--text-primary);">Account Settings</h3>
                <p style="font-size:12px; color:var(--text-secondary);">Manage your profile parameters and security</p>
            </div>
            
            <form id="settingsProfileForm" style="display:flex; flex-direction:column; gap:12px;">
                <div class="input-form-control-group">
                    <label style="font-size:11px; color:var(--text-secondary); display:block; margin-bottom:4px;">Display Name</label>
                    <input type="text" id="settingsDisplayName" value="${profileName}" required style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--card-border); background:var(--input-fill); color:var(--text-primary);">
                </div>
                <div class="input-form-control-group">
                    <label style="font-size:11px; color:var(--text-secondary); display:block; margin-bottom:4px;">Email Address</label>
                    <input type="email" value="${email}" disabled style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--card-border); background:var(--input-fill); color:var(--text-secondary); cursor:not-allowed;">
                </div>
                <button type="submit" class="btn-submit-form-action" style="padding:10px; margin-top:6px;">Update Profile Name</button>
            </form>
            
            <div style="border-top: 1px solid var(--card-border); padding-top: 16px; margin-top: 8px;">
                <h4 style="font-size:14px; font-weight:600; margin-bottom:12px; color:var(--text-primary);">Upload Custom Profile Image</h4>
                <div style="display:flex; align-items:center; gap:12px;">
                    <input type="file" id="settingsAvatarFile" accept="image/*" style="display:none;">
                    <button type="button" class="btn-submit-form-action" style="padding:10px; background:#475569;" onclick="document.getElementById('settingsAvatarFile').click()">Choose File</button>
                    <span id="settingsAvatarFileName" style="font-size:12px; color:var(--text-secondary);">No file chosen</span>
                </div>
            </div>
            
            <div style="border-top: 1px solid var(--card-border); padding-top: 16px;">
                <h4 style="font-size:14px; font-weight:600; margin-bottom:12px; color:var(--text-primary);">Security</h4>
                <form id="settingsPasswordForm" style="display:flex; flex-direction:column; gap:12px;">
                    <div class="input-form-control-group">
                        <input type="password" id="settingsNewPassword" placeholder="New Password" required minlength="6" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--card-border); background:var(--input-fill); color:var(--text-primary);">
                    </div>
                    <button type="submit" class="btn-submit-form-action" style="padding:10px; background:linear-gradient(135deg, #4f46e5, #7c3aed);">Change Password</button>
                </form>
            </div>
            
            <div style="border-top: 1px solid var(--card-border); padding-top: 16px; display:flex; justify-content:space-between; align-items:center;">
                <button style="background:#ef4444; border:none; color:white; padding:10px 20px; border-radius:10px; cursor:pointer; font-weight:500; font-size:13px; display:flex; align-items:center; gap:8px;" onclick="handleUserLogout()">
                    <i class="fa-solid fa-right-from-bracket"></i> Log Out
                </button>
            </div>
        </div>
    `;

    // Hook listeners dynamically
    document.getElementById("settingsProfileForm").addEventListener("submit", handleSettingsProfileUpdate);
    document.getElementById("settingsPasswordForm").addEventListener("submit", handleSettingsPasswordUpdate);
    document.getElementById("settingsAvatarFile").addEventListener("change", handleSettingsAvatarUpload);
}

// Light / Dark Mode Toggle
const themeBtn = document.getElementById("themeModeToggleBtn");
if (themeBtn) {
    themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("light-mode");
        const iconNode = themeBtn.querySelector("i");
        if (iconNode) {
            iconNode.className = document.body.classList.contains("light-mode") ? "fa-solid fa-sun" : "fa-solid fa-moon";
        }
    });
}

// Global Closures & Initial Setup
window.addEventListener("click", () => { 
    if (avatarSelectorDropdown) avatarSelectorDropdown.classList.remove("active-block-show"); 
});

if (mainSearchInput) mainSearchInput.addEventListener("input", synchronizeInterfaceData);

// Initialize Client Session Checks
checkAuthSession();

// Toast Controller
function triggerNotificationToastBoxFeedback(str) {
    if (!appSystemNotificationToastBox) return;
    const msgNode = document.getElementById("appSystemNotificationToastMessageLabel");
    if (msgNode) msgNode.innerText = str;
    
    appSystemNotificationToastBox.classList.remove("functional-toast-hidden");
    setTimeout(() => { 
        appSystemNotificationToastBox.classList.add("functional-toast-hidden"); 
    }, 2500);
}