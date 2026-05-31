// Global Functions for UI interaction
window.openSettingsTab = (tabId) => {
    const userMenu = document.getElementById('aura-user-menu');
    const settingsModal = document.getElementById('settings-modal');
    if (userMenu) userMenu.classList.remove('active');
    if (settingsModal) {
        settingsModal.classList.add('active');
        let tabBtn = document.querySelector(`.settings-tab[data-target="${tabId}"]`);
        if (!tabBtn) {
            const rawName = tabId.replace('tab-', '').replace('panel-', '');
            tabBtn = document.querySelector(`.settings-tab[data-tab="${rawName}"]`);
        }
        if (tabBtn) {
            tabBtn.click();
        }
    }
};

window.setTheme = (theme, e) => {
    if(e) e.stopPropagation();
    const themeToApply = theme || 'dark';
    document.documentElement.setAttribute('data-theme', themeToApply);
    localStorage.setItem('aura_theme', themeToApply);
    
    // Update active swatch
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.themeValue === themeToApply || opt.getAttribute('data-theme-value') === themeToApply);
    });
    
    // Update submenu active state
    document.querySelectorAll('.submenu-item').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        btn.classList.toggle('active', onclickAttr.includes(`'${themeToApply}'`));
    });
    
    // Update submenu text
    const label = document.getElementById('menu-appearance-sub-unified') || document.getElementById('menu-appearance-sub');
    if (label) {
        const themeNames = {
            'dark': 'Dökkt (Blátt & Svart)',
            'light': 'Ljóst (Blátt & Hvítt)',
            'purple': 'Djúpblátt (Midnight)',
            'blue': 'Rafblátt (Electric)',
            'pink': 'Ísblátt (Ice Blue)'
        };
        label.textContent = themeNames[themeToApply] || themeToApply.charAt(0).toUpperCase() + themeToApply.slice(1);
    }
};

window.setLanguage = async (lang, e) => {
    if(e) e.stopPropagation();
    const names = { en: 'English', ku: 'Kurdish (Sorani)', ar: 'Arabic' };
    
    const sel = document.getElementById('setting-language');
    if (sel) sel.value = lang;
    
    if (window.applyLanguage) window.applyLanguage(lang);
    
    const label = document.getElementById('menu-language-sub');
    if (label) label.textContent = names[lang];
    
    if (e && e.target) {
        const parent = e.target.closest('.submenu');
        if (parent) {
            parent.querySelectorAll('.submenu-item').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
        }
    }
    
    try {
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang })
        });
    } catch(err) { console.error('Failed to save language', err); }
};

document.addEventListener('DOMContentLoaded', () => {
    // Homepage Categories & CTAs
    window.selectCategory = (category) => {
        const currentChat = chats.find(c => c.id === currentChatId);
        if (currentChat && currentChat.messages.length > 0) {
            createNewChat();
        }
        
        const categoryPromptsMap = {
            'vinnurettur': [
                'Sæll Lögvist. Ég er með spurningu varðandi íslenskan vinnurétt. Getur þú útskýrt hvernig uppsagnarfrestur og réttur til vinnu er skilgreindur samkvæmt lögum nr. 55/1980 eða öðrum viðeigandi vinnulögum?',
                'Sæll. Ég vann yfirvinnu en atvinnurekandi vill ekki greiða mér samkvæmt taxta. Hver er réttur minn samkvæmt kjarasamningum og lögum nr. 55/1980?',
                'Góðan dag. Mig vantar upplýsingar um orlofsrétt. Á ég rétt á greiddu orlofi ef ég hef unnið í hlutastarfi í 6 mánuði?'
            ],
            'husaleiga': [
                'Sæll Lögvist. Mig vantar ráðgjöf varðandi húsaleigusamning og endurgreiðslu á tryggingarfé samkvæmt húsaleigulögum nr. 36/1994.',
                'Heill og sæll. Leigusali minn vill hækka leiguna einhliða um 20% án samþykkis míns. Er það löglegt samkvæmt húsaleigulögum nr. 36/1994?',
                'Góðan daginn. Hver er lágmarks uppsagnarfrestur á ótímabundnum leigusamningi íbúðarhúsnæðis samkvæmt íslenskum lögum?'
            ],
            'neytendarettur': [
                'Sæll Lögvist. Hver er réttur minn til að skila vöru eða fá úrbætur vegna gallaðrar vöru samkvæmt neytendakaupalögum nr. 48/2003?',
                'Sælir. Ég keypti síma sem bilaði eftir 6 mánuði. Seljandinn segir að ábyrgðin sé bara 3 mánuðir. Gilda ekki neytendakaupalög nr. 48/2003 um 2 ára frest?',
                'Góðan dag. Keypti vöru á netinu og sé eftir því. Get ég nýtt mér 14 daga afhendingarfrest/hverfunarrétt samkvæmt lögum um neytendasamninga?'
            ],
            'fjolskyldurettur': [
                'Sæll Lögvist. Getur þú útskýrt hvernig forsjá og umgengni barna er háttað við skilnað foreldra samkvæmt barnalögum nr. 76/2003?',
                'Sæl. Hvernig get ég sótt um breytingu á meðlagi eða forsjá barns ef sýslumaður hefur þegar úrskurðað um það?',
                'Góðan daginn. Hvernig er lögum háttað ef annað foreldrið vill flytja með barnið til útlanda án samþykkis hins?'
            ],
            'erfdarettur': [
                'Sæll Lögvist. Mig vantar upplýsingar um lögerfingja, skylduarf og hvernig arfi er skipt samkvæmt erfðalögum nr. 8/1962.',
                'Góðan dag. Get ég gert erfðaskrá þar sem ég ákveð að gefa allar eignir mínar til góðgerðarmála, eða á ég skylduerfingja samkvæmt erfðalögum nr. 8/1962?',
                'Sæll. Faðir minn lést nýlega og við systkinin erum að fara í einkaskipti. Hvað þurfum við að hafa í huga varðandi skatta og skiptabréf?'
            ],
            'skattarettur': [
                'Sæll Lögvist. Hvernig eru reglur um skattskyldu erlendra tekna og vinnu á Íslandi samkvæmt lögum um tekjuskatt nr. 90/2003?',
                'Heill og sæll. Hver er skattprósenta af fjármagnstekjum á Íslandi, t.d. af sölu hlutabréfa eða leigutekjum, og hvernig ber að telja þær fram?',
                'Góðan dag. Ég er með spurningu um virðisaukaskatt. Hvenær þarf ég að skrá fyrirtækið mitt á vsk-skrá og hver er almenna skattprósentan?'
            ],
            'fyrirtakjarettur': [
                'Sæll Lögvist. Hverjar eru helstu skyldur stjórnar og stofnun einkahlutafélags samkvæmt lögum um einkahlutafélög nr. 138/1994?',
                'Sælir. Hvað gerist ef einkahlutafélag (ehf.) getur ekki borgað skuldir sínar? Eru stofnendur persónulega ábyrgir samkvæmt lögum nr. 138/1994?',
                'Góðan dag. Hvernig fer fram ákvörðun um arðgreiðslur í einkahlutafélagi og hvaða takmarkanir gilda samkvæmt lögum nr. 138/1994?'
            ],
            'umferdarrettur': [
                'Sæll Lögvist. Hver eru viðurlög og réttarreglur um ökuleysisviðlög samkvæmt umferðarlögum nr. 77/2019?',
                'Heill og sæll. Ég var tekinn á 110 km/klst þar sem hámarkshraði er 90 km/klst. Hver er sektin og fæ ég punkta í ökuskírteinið samkvæmt umferðarlögum nr. 77/2019?',
                'Góðan dag. Hver ber ábyrgð á tjóni ef það verður árekstur í hringtorgi þar sem önnur bifreiðin ók inn á innri hringinn?'
            ]
        };
        
        const prompts = categoryPromptsMap[category] || ['Sæll Lögvist. Mig vantar lögfræðiaðstoð.'];
        const promptText = prompts[Math.floor(Math.random() * prompts.length)];
        
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = promptText;
            messageInput.dispatchEvent(new Event('input'));
            messageInput.focus();
        }
    };

    window.startChattingFromHero = () => {
        createNewChat();
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.focus();
        }
    };

    // Lagasafn & Skjöl Search Filter
    const docsSearchInput = document.getElementById('docs-search-input');
    if (docsSearchInput) {
        docsSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const docCards = document.querySelectorAll('.doc-card-link');
            
            docCards.forEach(card => {
                const title = card.querySelector('h4') ? card.querySelector('h4').textContent.toLowerCase() : '';
                const desc = card.querySelector('p') ? card.querySelector('p').textContent.toLowerCase() : '';
                const tags = card.getAttribute('data-tags') ? card.getAttribute('data-tags').toLowerCase() : '';
                
                if (title.includes(query) || desc.includes(query) || tags.includes(query)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    window.toggleDeepResearchMenu = () => {
        window.openSettingsTab('panel-help');
    };

    // DOM Elements
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const messagesWrapper = document.getElementById('messages-wrapper');
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatHistory = document.getElementById('chat-history');
    const newChatBtn = document.getElementById('new-chat-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettings = document.getElementById('save-settings');
    const toggleSidebar = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    const chatContainer = document.getElementById('chat-container');
    const fileInput = document.getElementById('file-input');
    const attachmentPreview = document.getElementById('attachment-preview');
    const micBtn = document.querySelector('.mic-btn');
    const profileBtn = document.getElementById('profile-btn');
    const userMenu = document.getElementById('aura-user-menu');
    const modelBtn = document.getElementById('model-btn');
    const modelPopover = document.getElementById('model-picker-popover');
    console.log("INIT: modelBtn =", modelBtn, "modelPopover =", modelPopover);
    const modelOptions = document.querySelectorAll('.model-picker-item');
    const modelNameDisplay = document.querySelector('.model-name');
    const profileModal = document.getElementById('profile-modal');
    const closeProfile = document.getElementById('close-profile');
    
    // Mobile Sidebar Toggle
    if (toggleSidebar && sidebar) {
        toggleSidebar.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        });

        // Close sidebar when clicking main content on mobile
        document.querySelector('.main-content').addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
        });
    }

    // User Menu Submenus for Mobile
    document.querySelectorAll('.menu-item.has-submenu').forEach(item => {
        item.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                e.preventDefault();
                e.stopPropagation();
                item.classList.toggle('active');
            }
        });
    });

    // Model picker disabled - Lögvist AI auto-selects the best model
    if (modelBtn) {
        modelBtn.style.pointerEvents = 'none';
    }
    if (modelPopover) {
        modelPopover.style.display = 'none';
    }
    
    let selectedModel = 'gemini-3-flash-preview';

    // State
    let chats = [];
    let currentChatId = null;
    let isGenerating = false;

    // Load initial chats from API
    async function initChats() {
        try {
            const res = await fetch('/api/chats');
            if (res.ok) {
                const apiChats = await res.json();
                // Mark as 'saved' so cleanup filters never delete them just because messages aren't loaded yet
                chats = apiChats.map(c => ({ id: c.chat_id, title: c.title, messages: [], saved: true }));
                renderChatHistory();
                if (chats.length > 0) {
                    await loadChat(chats[0].id);
                } else {
                    createNewChat();
                }
            }
        } catch (err) {
            console.error("Failed to load chats from API", err);
        } finally {
            const mc = document.querySelector('.main-content');
            if (mc) mc.classList.remove('loading');
        }
    }
    let activeAbortController = null;
    let typeWriterInterval = null;
    let pendingImage = null;
    let userPlan = { plan: 'free', msg_credits: 15, voice_credits: 0, upload_credits: 0 };

    // ===========================
    // PLAN & CREDITS
    // ===========================
    const upgradeModal   = document.getElementById('upgrade-modal');
    const upgradeTitle   = document.getElementById('upgrade-title');
    const upgradeDesc    = document.getElementById('upgrade-desc');
    const upgradeIcon    = document.getElementById('upgrade-icon');
    const upgradeClose   = document.getElementById('upgrade-close');
    const upgradeGotoSub = document.getElementById('upgrade-goto-sub');

    function showUpgradeModal(feature) {
        const configs = {
            msg:    { icon: '💬', title: 'Spurningamarki náð', desc: 'Þú hefur notað allar 5 ókeypis fyrirspurnir dagsins. Uppfærðu í Premium áskrift (2.290 kr. á mánuði) til að fá ótakmarkaðar spurningar, aðgang að stærri líkönum og djúprannsókn (Deep Research) virkjaða.' },
            voice:  { icon: '🎙️', title: 'Raddinnsláttur óvirkur', desc: 'Raddinnsláttur er aðeins í boði fyrir Premium notendur. Uppfærðu reikninginn þinn í áskriftarflipanum í stillingum.' },
            upload: { icon: '📎', title: 'Skráarupphali óvirkt', desc: 'Upphal skráa er aðeins í boði fyrir Premium notendur. Uppfærðu reikninginn þinn í áskriftarflipanum í stillingum.' },
            chat_limit: { icon: '🗂️', title: 'Hámarksfjölda samtala náð', desc: 'Þú hefur náð hámarksfjölda opinna samtala fyrir þína áskriftarleið. Vinsamlegast eyddu gömlum samtölum eða uppfærðu.' }
        };
        const c = configs[feature] || configs.msg;
        upgradeIcon.textContent  = c.icon;
        upgradeTitle.textContent = c.title;
        upgradeDesc.textContent  = c.desc;
        upgradeModal.classList.add('active');
    }

    if (upgradeClose && upgradeModal && upgradeGotoSub) {
        upgradeClose.addEventListener('click',   () => upgradeModal.classList.remove('active'));
        upgradeModal.addEventListener('click', e => { if (e.target === upgradeModal) upgradeModal.classList.remove('active'); });
        upgradeGotoSub.addEventListener('click', () => {
            upgradeModal.classList.remove('active');
            if (settingsModal) settingsModal.classList.add('active');
            // Switch to subscription tab
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            const subTab = document.querySelector('[data-target="tab-subscription"]');
            const subPanel = document.getElementById('tab-subscription');
            if (subTab) subTab.classList.add('active');
            if (subPanel) subPanel.classList.add('active');
            const settingsTitle = document.getElementById('settings-modal-title');
            if (settingsTitle) settingsTitle.textContent = 'Subscription';
        });
    }

    function updatePlanUI() {
        const badge    = document.getElementById('plan-badge');
        const title    = document.getElementById('plan-title');
        const note     = document.getElementById('plan-limits-note');
        const subText  = document.getElementById('profile-sub-text');
        const topBadge = document.getElementById('profile-badge');
        const isAdmin  = userPlan.is_admin;

        const names = { free: 'Ókeypis', pro: 'Premium', max: 'MAX' };
        const descs = {
            free: 'Ókeypis reikningur inniheldur 5 spurningar. Uppfærðu í Premium til að fá ótakmarkaðar spurningar.',
            pro:  'Premium áskrift (2.290 ISK/mán): Ótakmarkaðar spurningar og Djúprannsókn (Deep Research) virk.',
            max:  'MAX áskrift: Ótakmarkaðar spurningar, raddnotkun og skráarupphali.',
        };
        const subLabels = {
            free: { text: 'Ókeypis reikningur 🏔️', color: 'var(--text-secondary)' },
            pro:  { text: 'PREMIUM ÁSKRIFT (2.290 ISK/mán)', color: '#3898ec' },
            max:  { text: '✦ MAX ÁSKRIFT', color: '#00d2ff' },
        };

        if (badge) badge.textContent = isAdmin ? 'Kerfisstjóri' : (names[userPlan.plan] || userPlan.plan);
        if (title) title.textContent = isAdmin ? 'Lögvist — Kerfisstjóri' : `Lögvist ${names[userPlan.plan] || userPlan.plan}`;
        if (note)  note.textContent  = isAdmin ? 'Kerfisstjóraaðgangur — allir eiginleikar virkir.' : (descs[userPlan.plan] || '');

        if (topBadge) {
            if (isAdmin) {
                topBadge.textContent = '🛡️ Ótakmarkað';
            } else {
                topBadge.textContent = (userPlan.plan === 'max' ? '✦ ' : '') + (names[userPlan.plan] || userPlan.plan) + ' Áskrift';
            }
        }

        if (subText) {
            const sub = subLabels[userPlan.plan] || subLabels.free;
            subText.textContent = isAdmin ? '🛡️ Kerfisstjóri' : sub.text;
            subText.style.color = isAdmin ? '#e74c3c' : sub.color;
        }

        if (topBadge) {
            topBadge.textContent = isAdmin ? '🛡️ Kerfisstjóri' : ((userPlan.plan === 'max' ? '✦ ' : '') + (names[userPlan.plan] || userPlan.plan) + ' Áskrift');
            topBadge.className = `plan-badge ${isAdmin ? 'admin' : userPlan.plan}`;
        }

        const joinedEl = document.getElementById('profile-joined');
        const joinedTextEl = document.getElementById('profile-joined-text');
        if (userPlan.joined) {
            const date = new Date(userPlan.joined);
            const formatted = date.toLocaleDateString('is-IS', { year: 'numeric', month: 'long', day: 'numeric' });
            if (joinedEl) joinedEl.textContent = formatted;
            if (joinedTextEl) joinedTextEl.textContent = formatted;
        }

        const msgEl    = document.getElementById('credit-msg');
        const voiceEl  = document.getElementById('credit-voice');
        const uploadEl = document.getElementById('credit-upload');
        if (msgEl)    msgEl.textContent    = isAdmin || userPlan.plan === 'pro' || userPlan.plan === 'max' ? '∞' : userPlan.msg_credits;
        if (voiceEl)  voiceEl.textContent  = isAdmin || userPlan.plan === 'pro' || userPlan.plan === 'max' ? '∞' : userPlan.voice_credits;
        if (uploadEl) uploadEl.textContent = isAdmin || userPlan.plan === 'pro' || userPlan.plan === 'max' ? '∞' : userPlan.upload_credits;

        // Toggle Deep Research badge based on plan
        const drBadge = document.getElementById('deep-research-badge');
        if (drBadge) {
            if (isAdmin || userPlan.plan === 'pro' || userPlan.plan === 'max') {
                drBadge.classList.remove('hidden');
            } else {
                drBadge.classList.add('hidden');
            }
        }
    }

    const translations = {
        en: {
            newChat: "Nýtt spjall",
            recent: "Nýlegt",
            settings: "Stillingar",
            profile: "Prófíll",
            general: "Almennt",
            account: "Notandi",
            subscription: "Áskrift",
            credits: "Upplýsingar",
            language: "Tungumál",
            langDesc: "Íslenska er eina tungumálið í boði.",
            theme: "Þema útlit",
            themeDesc: "Veldu á milli dökks og ljóss útlits.",
            clearChats: "Hreinsa öll spjall",
            clearDesc: "Eyða öllum spjallsamtölum úr þessu tæki.",
            clearBtn: "Hreinsa",
            username: "Notendanafn",
            password: "Nýtt lykilorð",
            passDesc: "Skildu eftir autt til að halda óbreyttu",
            save: "Vista breytingar",
            redeem: "Virkja Premium með áskriftarkóða",
            redeemDesc: "Ertu með kóða? Sláðu hann inn hér að neðan til að uppfæra í Premium áskrift.",
            redeemBtn: "Virkja",
            msgLeft: "Spurningar eftir",
            voiceLeft: "Raddnotkun eftir",
            uploadLeft: "Skráarupphali eftir",
            howCanIHelp: "Hvernig get ég aðstoðað þig við lögfræðispurningar í dag?",
            messagePlaceholder: "Spyrðu Lögvist um íslensk lög...",
            manageUsers: "👥 Notendastýring",
            manageCodes: "🎟️ Kóðastýring",
            managePlans: "💎 Áskriftarstýring",
            manageSystem: "⚙️ Kerfisupplýsingar",
            system: "Kerfi",
            allSettings: "Stillingar",
            upgrade: "Uppfæra áskrift",
            install: "Sækja forrit",
            appearance: "Útlit þema",
            help: "Hjálp",
            signout: "Skrá út",
            newChatTitle: "Nýtt spjall"
        }
    };
    translations.ku = translations.en;
    translations.ar = translations.en;

    window.applyLanguage = function(lang) {
        // Force language to 'en' (which contains the Icelandic dictionary) to ensure no bilingual switching
        const t = translations.en;
        document.body.dir = 'ltr';
        document.body.classList.remove('rtl-mode');
        
        document.body.style.fontFamily = "'Inter', sans-serif";

        const safeSet = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        
        safeSet('txt-new-chat', t.newChat);
        safeSet('txt-recent', t.recent);
        safeSet('txt-settings', t.settings);
        safeSet('txt-profile', t.profile);
        safeSet('txt-welcome', t.howCanIHelp);
        safeSet('txt-lang', t.language);
        safeSet('txt-lang-desc', t.langDesc);
        safeSet('txt-clear-chats', t.clearChats);
        safeSet('txt-clear-desc', t.clearDesc);
        
        const clearBtn = document.getElementById('clear-chats-btn');
        if (clearBtn) clearBtn.textContent = t.clearBtn;
        
        const saveBtn = document.getElementById('save-settings');
        if (saveBtn) saveBtn.textContent = t.save;

        if (messageInput) messageInput.placeholder = t.messagePlaceholder;
        
        // Settings Tabs
        const tabMap = {
            'tab-general': t.general,
            'tab-account': t.account,
            'tab-subscription': t.subscription,
            'tab-credits': t.credits,
            'admin-tab-users': 'Notendur',
            'admin-tab-codes': 'Kóðar',
            'admin-tab-plans': 'Áætlanir',
            'admin-tab-system': 'Kerfi'
        };
        document.querySelectorAll('.settings-tab').forEach(tab => {
            const target = tab.dataset.target;
            if (tabMap[target]) {
                const icon = tab.querySelector('svg');
                tab.innerHTML = '';
                if (icon) tab.appendChild(icon);
                tab.appendChild(document.createTextNode(' ' + tabMap[target]));
            }
        });

        // Subscription section
        safeSet('txt-redeem-title', t.redeem);
        safeSet('txt-redeem-desc', t.redeemDesc);
        const redeemBtn = document.getElementById('redeem-btn');
        if (redeemBtn) redeemBtn.textContent = t.redeemBtn;

        // Titles in admin
        document.querySelectorAll('.admin-section-title').forEach(el => {
            if (el.textContent.includes('User')) el.textContent = t.manageUsers;
            if (el.textContent.includes('Code')) el.textContent = t.manageCodes;
            if (el.textContent.includes('Plan')) el.textContent = t.managePlans;
            if (el.textContent.includes('System')) el.textContent = t.manageSystem;
        });

        // Update user menu labels
        safeSet('txt-all-settings', t.allSettings);
        safeSet('txt-upgrade', t.upgrade);
        safeSet('txt-install', t.install);
        safeSet('txt-appearance', t.appearance);
        safeSet('txt-help', t.help);
        safeSet('txt-signout', t.signout);

        const menuLangSub = document.getElementById('menu-language-sub');
        if (menuLangSub) {
            menuLangSub.textContent = 'Íslenska';
        }

        const menuThemeSub = document.getElementById('menu-appearance-sub');
        if (menuThemeSub) {
            const currentTheme = localStorage.getItem('aura_theme') || 'dark';
            menuThemeSub.textContent = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
        }

        // Save to local storage for persistence
        localStorage.setItem('aura_lang', lang);
    }

    const langSel = document.getElementById('setting-language');
    if (langSel) {
        langSel.addEventListener('change', () => {
            applyLanguage(langSel.value);
            // Optionally auto-save to server here
            saveSettingsFn(); 
        });
    }

    async function fetchPlan() {
        try {
            const res  = await fetch('/api/plan');
            const data = await res.json();
            if (data.plan) {
                userPlan = data;
                updatePlanUI();
                applyLanguage(data.language || 'en');
                const langSel = document.getElementById('setting-language');
                if (langSel) langSel.value = data.language || 'en';

                if (data.is_admin) {
                    document.querySelectorAll('.admin-only-tab').forEach(el => el.style.display = 'flex');
                }
                
                // Clear guest counter if registered user
                if (!window.IS_GUEST) {
                    localStorage.removeItem('guest_message_count');
                }
            }
        } catch(e) { console.error('Could not fetch plan', e); }
    }
    fetchPlan();

    // Redeem code
    const redeemBtn = document.getElementById('redeem-btn');
    const redeemInput = document.getElementById('redeem-code-input');
    const redeemMsg = document.getElementById('redeem-message');
    if (redeemBtn) {
        redeemBtn.addEventListener('click', async () => {
            const code = redeemInput.value.trim();
            if (!code) return;
            redeemBtn.disabled = true;
            redeemMsg.textContent = '';
            redeemMsg.className = 'redeem-msg';
            try {
                const res  = await fetch('/api/redeem', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({code}) });
                const data = await res.json();
                if (data.success) {
                    redeemMsg.textContent = `✓ ${data.message}`;
                    redeemMsg.classList.add('success');
                    userPlan = { plan: data.plan, msg_credits: data.msg_credits, voice_credits: data.voice_credits, upload_credits: data.upload_credits };
                    updatePlanUI();
                    redeemInput.value = '';
                } else {
                    redeemMsg.textContent = `✗ ${data.error}`;
                    redeemMsg.classList.add('error');
                }
            } catch(e) {
                redeemMsg.textContent = '✗ Network error. Please try again.';
                redeemMsg.classList.add('error');
            }
            redeemBtn.disabled = false;
        });
    }





    async function adminLoadPlansDash() {
        const container = document.getElementById('admin-plans-config-list');
        if (!container) return;
        try {
            const res = await fetch('/api/admin/plans');
            const plans = await res.json();
            container.innerHTML = '';
            Object.entries(plans).forEach(([name, limits]) => {
                const card = document.createElement('div');
                card.className = 'admin-plan-edit-card';
                card.innerHTML = `
                    <div class="admin-plan-edit-header">${name} Plan</div>
                    <div class="admin-plan-edit-grid">
                        <div class="admin-plan-input-group">
                            <label>Messages</label>
                            <input type="number" class="plan-msg" value="${limits.msg_credits}">
                        </div>
                        <div class="admin-plan-input-group">
                            <label>Voice Credits</label>
                            <input type="number" class="plan-voice" value="${limits.voice_credits}">
                        </div>
                        <div class="admin-plan-input-group">
                            <label>Upload Credits</label>
                            <input type="number" class="plan-upload" value="${limits.upload_credits}">
                        </div>
                        <div style="display:flex;align-items:flex-end;">
                            <button class="btn-primary admin-save-plan-btn" data-plan="${name}" style="padding:8px 12px;font-size:12px;">Save</button>
                        </div>
                    </div>`;
                
                card.querySelector('.admin-save-plan-btn').addEventListener('click', async (e) => {
                    const btn = e.target;
                    const planName = btn.dataset.plan;
                    const card = btn.closest('.admin-plan-edit-card');
                    const newLimits = {
                        msg_credits: parseInt(card.querySelector('.plan-msg').value),
                        voice_credits: parseInt(card.querySelector('.plan-voice').value),
                        upload_credits: parseInt(card.querySelector('.plan-upload').value)
                    };
                    btn.disabled = true;
                    try {
                        const res = await fetch('/api/admin/plans/update', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({plan: planName, limits: newLimits})
                        });
                        const data = await res.json();
                        if(data.success) alert(`${planName.toUpperCase()} plan updated!`);
                    } catch(err) { console.error(err); }
                    btn.disabled = false;
                });
                container.appendChild(card);
            });
        } catch(e) { console.error('Load plans error', e); }
    }

    async function adminLoadUsersDash() {
        const tbody = document.getElementById('admin-users-body-dash');
        if (!tbody) return;
        try {
            const res  = await fetch('/api/admin/users');
            if (!res.ok) throw new Error('Fetch failed');
            const data = await res.json();
            if (!Array.isArray(data)) { tbody.innerHTML = '<tr><td colspan="7">Error: Data format incorrect</td></tr>'; return; }
            tbody.innerHTML = '';
            data.forEach(u => {
                const tr = document.createElement('tr');
                const planBadge = `<span class="admin-badge ${u.is_admin ? 'admin' : u.plan}">${u.is_admin ? 'Admin' : u.plan.toUpperCase()}</span>`;
                tr.innerHTML = `
                    <td><strong>${u.username}</strong></td>
                    <td>${planBadge}</td>
                    <td>${u.msg_credits}</td>
                    <td>${u.voice_credits}</td>
                    <td>${u.upload_credits}</td>
                    <td>${u.joined || '-'}</td>
                    <td>
                        <select class="admin-plan-select" data-user="${u.username}">
                            <option value="free"  ${u.plan==='free' ?'selected':''}>Free</option>
                            <option value="pro"   ${u.plan==='pro'  ?'selected':''}>Pro</option>
                            <option value="max"   ${u.plan==='max'  ?'selected':''}>MAX</option>
                        </select>
                        <button class="admin-apply-btn" data-user="${u.username}">Apply</button>
                        ${!u.is_admin ? `<button class="admin-del-btn" data-user="${u.username}">Del</button>` : ''}
                    </td>`;
                tbody.appendChild(tr);
            });
            // Wire apply
            tbody.querySelectorAll('.admin-apply-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const username = btn.dataset.user;
                    const sel = tbody.querySelector(`.admin-plan-select[data-user="${username}"]`);
                    const plan = sel.value;
                    btn.disabled = true;
                    btn.textContent = 'Saving...';
                    try {
                        await fetch(`/api/admin/users/${encodeURIComponent(username)}/plan`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({plan}) });
                        
                        // Success animation
                        btn.classList.add('btn-success-anim');
                        btn.textContent = '✓ Applied';
                        setTimeout(() => {
                            btn.classList.remove('btn-success-anim');
                            btn.textContent = 'Apply';
                            btn.disabled = false;
                            adminLoadUsersDash(); // Reload to reflect changes
                        }, 1500);
                    } catch(e) {
                        btn.textContent = 'Apply';
                        btn.disabled = false;
                    }
                });
            });
            // Wire delete
            tbody.querySelectorAll('.admin-del-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Delete user "${btn.dataset.user}"?`)) return;
                    await fetch(`/api/admin/users/${encodeURIComponent(btn.dataset.user)}`, { method: 'DELETE' });
                    adminLoadUsersDash();
                });
            });
        } catch(e) { console.error('Admin dashboard users load error', e); }
    }

    async function adminLoadCodesDash() {
        const container = document.getElementById('admin-codes-list-dash');
        if (!container) return;
        try {
            const res   = await fetch('/api/admin/codes');
            const codes = await res.json();
            container.innerHTML = '';
            Object.entries(codes).forEach(([code, info]) => {
                const row = document.createElement('div');
                row.className = 'admin-code-row';
                row.innerHTML = `
                    <span class="admin-code-text">${code}</span>
                    <span class="admin-badge ${info.plan}">${info.plan.toUpperCase()}</span>
                    <span class="admin-code-meta">${info.used}/${info.max_uses}</span>
                    <button class="admin-del-btn" style="margin-left:auto;">Del</button>`;
                row.querySelector('.admin-del-btn').addEventListener('click', async () => {
                    await fetch(`/api/admin/codes/${encodeURIComponent(code)}`, { method: 'DELETE' });
                    adminLoadCodesDash();
                });
                container.appendChild(row);
            });
            if (!Object.keys(codes).length) container.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">No active codes.</p>';
        } catch(e) { console.error('Admin dashboard codes load error', e); }
    }

    const adminGenBtnDash = document.getElementById('admin-gen-btn-dash');
    if (adminGenBtnDash) {
        adminGenBtnDash.addEventListener('click', async () => {
            const plan     = document.getElementById('admin-code-plan-dash').value;
            const maxUses  = parseInt(document.getElementById('admin-code-uses-dash').value) || 10;
            const resultEl = document.getElementById('admin-gen-result-dash');
            adminGenBtnDash.disabled = true;
            try {
                const res  = await fetch('/api/admin/codes/generate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({plan, max_uses: maxUses}) });
                const data = await res.json();
                if (data.code) {
                    resultEl.textContent = `✓ ${data.code} (Click to copy)`;
                    resultEl.classList.add('visible');
                    resultEl.style.cursor = 'pointer';
                    resultEl.onclick = () => {
                        navigator.clipboard.writeText(data.code);
                        resultEl.textContent = `✓ Copied! ${data.code}`;
                        setTimeout(() => { if(resultEl.classList.contains('visible')) resultEl.textContent = `✓ ${data.code} (Click to copy)`; }, 2000);
                    };
                    adminLoadCodesDash();
                }
            } catch(e) { console.error('Generate code error', e); }
            adminGenBtnDash.disabled = false;
        });
    }

    document.getElementById('admin-refresh-users-dash')?.addEventListener('click', adminLoadUsersDash);
    document.getElementById('admin-refresh-codes-dash')?.addEventListener('click', adminLoadCodesDash);

    // ===========================
    // FILE UPLOAD
    // ===========================
    function getMimeFromExtension(ext) {
        const mimes = {
            'pdf': 'application/pdf',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc': 'application/msword',
            'txt': 'text/plain'
        };
        return mimes[ext] || 'application/octet-stream';
    }

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;

        // Auto switch model to Lögvist AI (gemini-3-flash-preview) for file analysis
        selectedModel = 'gemini-3-flash-preview';
        const defaultModelOpt = document.querySelector('.model-picker-item[data-model="gemini-3-flash-preview"]');
        if (defaultModelOpt) {
            modelOptions.forEach(o => o.classList.remove('active'));
            defaultModelOpt.classList.add('active');
        }
        if (modelNameDisplay) {
            modelNameDisplay.textContent = 'Lögvist AI';
        }
        // Check upload credits
        if (userPlan.upload_credits <= 0) {
            fileInput.value = '';
            showUpgradeModal('upload');
            return;
        }
        
        const isImage = file.type.startsWith('image/');
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
        const fileExtension = file.name.slice((Math.max(0, file.name.lastIndexOf(".")) || Infinity) + 1).toLowerCase();
        
        if (!isImage && !allowedExtensions.includes('.' + fileExtension)) {
            alert('Aðeins myndir (.png, .jpg, .jpeg) og skjöl (.pdf, .doc, .docx, .txt) eru leyfileg.');
            fileInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const base64 = dataUrl.split(',')[1];
            pendingImage = { 
                base64, 
                mime: file.type || getMimeFromExtension(fileExtension), 
                objectUrl: isImage ? dataUrl : null, 
                name: file.name,
                isImage: isImage
            };
            renderAttachmentPreview();
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });

    function renderAttachmentPreview() {
        attachmentPreview.innerHTML = '';
        if (!pendingImage) return;

        const chip = document.createElement('div');
        chip.className = 'attachment-chip';

        if (pendingImage.isImage) {
            const img = document.createElement('img');
            img.src = pendingImage.objectUrl;
            img.alt = 'Attached image';
            chip.appendChild(img);
        } else {
            const docIcon = document.createElement('div');
            docIcon.className = 'document-chip-content';
            docIcon.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-surface);border-radius:10px;font-size:12px;font-weight:500;color:var(--text-primary);';
            docIcon.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> <span class="doc-name" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pendingImage.name}</span>`;
            chip.appendChild(docIcon);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-attachment';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => {
            pendingImage = null;
            renderAttachmentPreview();
        };

        chip.appendChild(removeBtn);
        attachmentPreview.appendChild(chip);
    }

    // ===========================
    // VOICE INPUT (Web Speech API)
    // ===========================
    let recognition = null;
    let isRecording = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'is-IS';

        let finalTranscript = '';

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    const chunk = transcript.trim();
                    if (chunk) {
                        finalTranscript += (finalTranscript && !finalTranscript.endsWith(' ') ? ' ' : '') + chunk;
                    }
                } else {
                    interim = transcript;
                }
            }
            messageInput.value = finalTranscript + interim;
            messageInput.dispatchEvent(new Event('input'));
        };

        recognition.onend = () => {
            isRecording = false;
            micBtn.classList.remove('recording');
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            isRecording = false;
            micBtn.classList.remove('recording');
            if (event.error === 'not-allowed') {
                alert('Microphone access was denied. Please allow microphone permissions in your browser.');
            }
        };

        micBtn.addEventListener('click', async () => {
            if (isRecording) {
                recognition.stop();
                isRecording = false;
                micBtn.classList.remove('recording');
            } else {
                // Check voice credits
                if (userPlan.voice_credits <= 0) {
                    showUpgradeModal('voice');
                    return;
                }
                finalTranscript = '';
                recognition.start();
                isRecording = true;
                micBtn.classList.add('recording');
                // Deduct voice credit
                try {
                    const res = await fetch('/api/use-voice-credit', { method: 'POST' });
                    const d = await res.json();
                    if (res.ok) {
                        userPlan.voice_credits = d.voice_credits;
                        updatePlanUI();
                    }
                } catch(e) { console.error('voice credit error', e); }
            }
        });
    } else {
        // Browser doesn't support speech recognition
        micBtn.addEventListener('click', () => {
            alert('Voice input is not supported in your browser. Please use Chrome or Edge.');
        });
        micBtn.title = 'Voice input not supported in this browser';
    }

    // Configure marked with highlight.js and custom link renderer
    const renderer = new marked.Renderer();
    renderer.link = function(token) {
        const href = token?.href || token || '#';
        const title = token?.title || '';
        const text = token?.text || href;
        if (!href || href === 'undefined' || href === '#') return text;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="legal-source-link" title="${title || text}">${text}</a>`;
    };
    marked.setOptions({
        renderer: renderer,
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        breaks: true
    });

    // Initialization
    initChats();

    // Event Listeners
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
        sendBtn.disabled = messageInput.value.trim() === '' || isGenerating;
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) {
                sendMessage();
            }
        }
    });

    sendBtn.addEventListener('click', sendMessage);
    stopBtn.addEventListener('click', stopGenerating);

    newChatBtn.addEventListener('click', createNewChat);

    // ===========================
    // MULTI-THEME PICKER
    // ===========================
    // Load saved theme on page load
    const savedTheme = localStorage.getItem('aura_theme') || 'dark';
    window.setTheme(savedTheme);

    // Wire up swatch clicks
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.addEventListener('click', (e) => window.setTheme(opt.dataset.themeValue, e));
    });

    // (Duplicate settingsBtn listener without null check removed)

    // Clear all chats
    const clearChatsBtn = document.getElementById('clear-chats-btn');
    if (clearChatsBtn) {
        clearChatsBtn.addEventListener('click', () => {
            if (confirm('Delete all chat history? This cannot be undone.')) {
                chats = [];
                localStorage.removeItem('gemini_chats');
                settingsModal.classList.remove('active');
                createNewChat();
            }
        });
    }

    // Sync active swatch when settings opens
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (settingsModal) settingsModal.classList.add('active');
            const msgEl = document.getElementById('settings-message');
            if (msgEl) msgEl.innerHTML = '';
            const passEl = document.getElementById('new-password');
            if (passEl) passEl.value = '';
            const current = localStorage.getItem('aura_theme') || 'dark';
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.themeValue === current);
            });
        });
    }

    // Settings Tabs Logic
    const settingsTabs = document.querySelectorAll('#settings-modal .settings-tab');
    const settingsPanels = document.querySelectorAll('#settings-modal .settings-panel');
    const settingsTitle = document.getElementById('settings-modal-title');

    settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs and panels
            settingsTabs.forEach(t => t.classList.remove('active'));
            settingsPanels.forEach(p => p.classList.remove('active'));
            
            // Add active to clicked tab and corresponding panel
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target') || tab.getAttribute('data-tab');
            let panel = document.getElementById(targetId);
            if (!panel) panel = document.getElementById(`panel-${targetId}`);
            if (!panel) panel = document.getElementById(`tab-${targetId}`);
            if (panel) panel.classList.add('active');
            
            // Update title
            if (settingsTitle) settingsTitle.textContent = tab.textContent.trim();

            // Trigger admin data loads if admin tab clicked
            if (targetId === 'admin-tab-users' || targetId === 'admin') adminLoadUsersDash();
            if (targetId === 'admin-tab-codes' || targetId === 'admin') adminLoadCodesDash();
            if (targetId === 'admin-tab-plans' || targetId === 'admin') adminLoadPlansDash();
        });
    });

    if (closeSettings && settingsModal) {
        closeSettings.addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });
    }

    if (toggleSidebar && sidebar) {
        toggleSidebar.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                if (!sidebar.contains(e.target) && e.target !== toggleSidebar) {
                    sidebar.classList.remove('open');
                }
            }
        });
    }

    // Sidebar collapse (desktop)
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn && sidebar) {
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
        });
        // Restore state on load
        if (localStorage.getItem('sidebar_collapsed') === '1') {
            sidebar.classList.add('collapsed');
        }
    }

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+, for settings
        if (e.ctrlKey && e.key === ',') {
            e.preventDefault();
            window.openSettingsTab('tab-general');
        }
    });

    // Close user menu on click outside
    if (userMenu) {
        document.addEventListener('click', (e) => {
            if (userMenu.classList.contains('active') && !e.target.closest('.profile-pill') && !userMenu.contains(e.target)) {
                userMenu.classList.remove('active');
            }
        });
    }

    // Moved to top

    modelOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            modelOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedModel = opt.dataset.model;
            if (modelNameDisplay) {
                modelNameDisplay.textContent = opt.querySelector('span').textContent;
            }
            modelPopover.classList.remove('active');
        });
    });

    // Profile modal (legacy or internal)
    if (closeProfile) {
        closeProfile.addEventListener('click', () => profileModal.classList.remove('active'));
    }
    if (profileModal) {
        profileModal.addEventListener('click', (e) => { if (e.target === profileModal) profileModal.classList.remove('active'); });
    }

    // Click outside modal to close
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
        });
    }
    
    // Close dropdowns if clicked outside
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.chat-dropdown').forEach(dropdown => {
            if (!dropdown.contains(e.target) && !e.target.closest('.chat-menu-btn')) {
                dropdown.classList.remove('active');
            }
        });
    });

    async function saveSettingsFn() {
        const usernameEl = document.getElementById('new-username');
        const username = usernameEl ? usernameEl.value.trim() : '';
        const passwordEl = document.getElementById('new-password');
        const password = passwordEl ? passwordEl.value : '';
        const languageEl = document.getElementById('setting-language');
        const language = languageEl ? languageEl.value : 'en';
        const msgDiv   = document.getElementById('settings-message');
        
        if (msgDiv) {
            msgDiv.innerHTML = 'Saving...';
            msgDiv.className = '';
        }
        
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, language })
            });
            const data = await res.json();
            
            if (res.ok) {
                if (msgDiv) {
                    msgDiv.innerHTML = 'Settings saved successfully!';
                    msgDiv.className = 'success-msg';
                }
                
                userPlan.language = language;
                applyLanguage(language);

                if (username && username !== window.CURRENT_USER) {
                    window.location.reload();
                    return;
                }
                
                if (settingsModal) {
                    setTimeout(() => settingsModal.classList.remove('active'), 1500);
                }
            } else {
                if (msgDiv) {
                    msgDiv.innerHTML = data.error || 'Failed to update settings';
                    msgDiv.className = 'error-msg';
                }
            }
        } catch (err) {
            if (msgDiv) {
                msgDiv.innerHTML = 'Network error occurred';
                msgDiv.className = 'error-msg';
            }
        }
    }

    if (saveSettings) {
        saveSettings.addEventListener('click', saveSettingsFn);
    }

    // Functions
    function createNewChat() {
        if (isGenerating) stopGenerating();

        // Check if the current chat is already empty. If so, just focus and reuse it!
        const currentChat = chats.find(c => c.id === currentChatId);
        if (currentChat && currentChat.messages.length === 0) {
            messageInput.value = '';
            messageInput.style.height = 'auto';
            sendBtn.disabled = true;
            messageInput.focus();
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
            }
            return;
        }

        // Clean up only UNSAVED empty chats (local-only, never sent to DB)
        // Never remove chats that are saved in the DB (saved: true)
        chats = chats.filter(c => c.saved || c.messages.length > 0);

        // Admin has no limits
        if (!userPlan.is_admin) {
            const limits = { free: 5, pro: 50, max: 500 };
            const limit = limits[userPlan.plan] || 5;
            if (chats.length >= limit) {
                showUpgradeModal('chat_limit');
                return;
            }
        }

        const currentLang = localStorage.getItem('aura_lang') || 'en';
        const t = translations[currentLang] || translations.en;
        const newChat = {
            id: Date.now().toString(),
            title: t.newChatTitle || 'New Chat',
            messages: [],
            saved: false  // not yet saved to DB
        };
        chats.unshift(newChat);
        renderChatHistory();
        loadChat(newChat.id);
        
        // Save to backend is DEFERRED to sendMessage() upon first message
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendBtn.disabled = true;

        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
        
        const preview = document.querySelector('.preview-panel');
        if (preview) {
            preview.remove();
        }
        
        document.body.classList.remove('preview-open');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.marginLeft = '';
            mainContent.style.marginRight = '';
        }
        
        messageInput.focus();
    }

    function saveChatTitle(chatId, title) {
        fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, title: title })
        }).catch(err => console.error('Failed to sync chat title to database:', err));
    }

    function isChatBookmarked(chatId) {
        const bookmarked = JSON.parse(localStorage.getItem('bookmarked_chats') || '[]');
        return bookmarked.includes(chatId);
    }
    
    function toggleChatBookmark(chatId) {
        let bookmarked = JSON.parse(localStorage.getItem('bookmarked_chats') || '[]');
        if (bookmarked.includes(chatId)) {
            bookmarked = bookmarked.filter(id => id !== chatId);
        } else {
            bookmarked.push(chatId);
        }
        localStorage.setItem('bookmarked_chats', JSON.stringify(bookmarked));
    }

    let showOnlyBookmarked = false;
    window.filterSavedChats = () => {
        showOnlyBookmarked = !showOnlyBookmarked;
        const btn = document.getElementById('sidebar-saved-btn');
        if (btn) btn.classList.toggle('active', showOnlyBookmarked);
        renderChatHistory();
    };

    function renderChatHistory() {
        chatHistory.innerHTML = '';
        const chatsToRender = showOnlyBookmarked ? chats.filter(c => isChatBookmarked(c.id)) : chats;
        chatsToRender.forEach(chat => {
            const wrapper = document.createElement('div');
            wrapper.className = `history-item-wrapper ${chat.id === currentChatId ? 'active' : ''}`;

            const currentLang = localStorage.getItem('aura_lang') || 'en';
            const t = translations[currentLang] || translations.en;
            const btn = document.createElement('button');
            btn.className = 'history-item';
            const isBookmarked = isChatBookmarked(chat.id);
            const titleText = (isBookmarked ? '⭐ ' : '') + (chat.title || t.newChatTitle || 'New Chat');
            btn.textContent = titleText;
            if (isRTLText(titleText)) {
                btn.style.direction = 'rtl';
                btn.style.textAlign = 'right';
            } else {
                btn.style.direction = 'ltr';
                btn.style.textAlign = 'left';
            }
            btn.onclick = () => {
                if (isGenerating) stopGenerating();
                loadChat(chat.id);
            };

            const menuBtn = document.createElement('button');
            menuBtn.className = 'chat-menu-btn';
            menuBtn.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>';
            
            const dropdown = document.createElement('div');
            dropdown.className = 'chat-dropdown';
            
            const renameBtn = document.createElement('button');
            renameBtn.textContent = 'Rename';
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('active');
                const newTitle = prompt('Enter new chat name:', chat.title);
                if (newTitle !== null && newTitle.trim() !== '') {
                    chat.title = newTitle.trim();
                    saveChatTitle(chat.id, chat.title);
                    renderChatHistory();
                }
            };
            
            const bookmarkActionBtn = document.createElement('button');
            bookmarkActionBtn.textContent = isBookmarked ? 'Unstar' : 'Star';
            bookmarkActionBtn.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('active');
                toggleChatBookmark(chat.id);
                renderChatHistory();
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'delete-action';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.remove('active');
                deleteChat(chat.id);
            };
            
            dropdown.appendChild(renameBtn);
            dropdown.appendChild(bookmarkActionBtn);
            dropdown.appendChild(deleteBtn);

            menuBtn.onclick = (e) => {
                e.stopPropagation();
                document.querySelectorAll('.chat-dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('active');
                });
                dropdown.classList.toggle('active');
            };

            wrapper.appendChild(btn);
            wrapper.appendChild(menuBtn);
            wrapper.appendChild(dropdown);
            chatHistory.appendChild(wrapper);
        });
    }

    function deleteChat(id) {
        chats = chats.filter(c => c.id !== id);
        fetch(`/api/chats/${id}`, { method: 'DELETE' });
        
        if (chats.length === 0) {
            createNewChat();
        } else if (currentChatId === id) {
            loadChat(chats[0].id);
        } else {
            renderChatHistory();
        }
    }

    async function loadChat(chatId) {
        // Clean up only UNSAVED empty chats when switching chats
        chats = chats.filter(c => c.saved || c.messages.length > 0 || c.id === chatId);

        currentChatId = chatId;
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return;
        
        renderChatHistory();
        messagesWrapper.innerHTML = '';
        welcomeScreen.style.display = 'none';
        
        // Fetch messages from backend if not already loaded
        try {
            const res = await fetch(`/api/chats/${chatId}/messages`);
            if (res.ok) {
                const msgs = await res.json();
                chat.messages = msgs;
            }
        } catch(e) { console.error(e); }
        
        // Fetch generation state to see if it was generating/interrupted/completed but unsaved
        let isInterrupted = false;
        let partialText = '';
        let lastUserMsg = '';
        let generationStatus = 'completed';
        try {
            const statusRes = await fetch(`/api/chats/${chatId}/status`);
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                generationStatus = statusData.generation_status;
                partialText = statusData.partial_assistant_response || '';
                lastUserMsg = statusData.last_user_message || '';
                if (generationStatus === 'generating') {
                    isInterrupted = true;
                }
            }
        } catch(e) { console.error("Failed to fetch chat status", e); }
        
        if (chat.messages.length > 0) {
            document.querySelector('.main-content').classList.remove('chat-empty');
            chat.messages.forEach(msg => {
                appendMessage(msg.role, msg.parts[0].text, false, true);
            });
        }
        
        // Check if there is an unsaved response from the AI (user message exists but no assistant message saved in db)
        const hasUserMessage = chat.messages.length > 0;
        const lastMsgIsUser = hasUserMessage && chat.messages[chat.messages.length - 1].role === 'user';
        
        if (lastMsgIsUser && (partialText.trim() !== '' || isInterrupted)) {
            document.querySelector('.main-content').classList.remove('chat-empty');
            if (isInterrupted) {
                // Restore the interrupted generation bubble in UI and resume streaming
                isGenerating = true;
                sendBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
                
                const loadingMsg = appendMessage('model', partialText, true);
                resumeChatStream(chatId, lastUserMsg, partialText, loadingMsg);
            } else if (generationStatus === 'completed') {
                // It completed on backend but was never saved in frontend (due to refresh right at completion)
                appendMessage('model', partialText, false, true);
                chat.messages.push({ role: 'model', parts: [{ text: partialText }] });
                
                // Save it to backend
                fetch(`/api/chats/${chatId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: 'model', content: partialText })
                });
            }
        } else if (chat.messages.length === 0) {
            welcomeScreen.style.display = 'flex';
            document.querySelector('.main-content').classList.add('chat-empty');
        }
        
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
        
        scrollToBottom();
    }

    async function resumeChatStream(chatId, lastUserMsg, partialText, loadingMsg) {
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return;
        
        try {
            activeAbortController = new AbortController();
            const body = { 
                messages: chat.messages, 
                model: selectedModel,
                chat_id: chatId,
                resume: true
            };
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: activeAbortController.signal
            });

            if (!response.ok) {
                const lm = document.getElementById('streaming-message');
                if (lm) lm.remove();
                isGenerating = false;
                sendBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                sendBtn.disabled = messageInput.value.trim() === '';
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            
            const contentDiv = loadingMsg.querySelector('.message-content');
            contentDiv.dataset.markdown = partialText;
            
            let statusCleared = partialText.trim() !== '';
            if (!statusCleared) {
                const isDeep = lastUserMsg.length > 300 || /djúprannsókn|dómar|samanburður/i.test(lastUserMsg);
                showThinkingAnimation(contentDiv, isDeep);
            }
            
            let buffer = '';
            let typeWriterQueue = '';
            let isReading = true;
            let currentDisplay = partialText;

            const typeWriterPromise = new Promise((resolve) => {
                let thinkingMsgIndex = 0;
                const thinkingTexts = [
                    '🔍 Leita að íslenskri löggjöf...',
                    '📚 Les viðeigandi lagaákvæði...',
                    '⚖️ Yfirfer dómafordæmi og dómvenjur...',
                    '📝 Undirbýr lögfræðilegt mat...',
                    '📋 Sannprófar heimildir og lagagreinar...'
                ];
                let thinkingTicks = 0;

                typeWriterInterval = setInterval(() => {
                    if (!statusCleared) {
                        thinkingTicks++;
                        if (thinkingTicks > 100) { // change every ~1.5s for faster feel
                            thinkingTicks = 0;
                            thinkingMsgIndex = (thinkingMsgIndex + 1) % thinkingTexts.length;
                            const tText = contentDiv.querySelector('.thinking-text');
                            if (tText) tText.textContent = thinkingTexts[thinkingMsgIndex];
                        }
                    } else if (typeWriterQueue.length > 0) {
                        // Flush up to 20 chars per tick for fast rendering
                        const chars = typeWriterQueue.substring(0, 20);
                        typeWriterQueue = typeWriterQueue.substring(20);
                        currentDisplay += chars;
                        contentDiv.dataset.markdown = currentDisplay;
                        const displayParts = currentDisplay.split(/---\s*METADATA:/i);
                        const visibleText = displayParts[0].replace(/---\s*$/, '').trim();
                        contentDiv.innerHTML = marked.parse(visibleText);
                        injectCopyButtons(contentDiv);
                        scrollToBottom();
                    } else if (!isReading) {
                        clearInterval(typeWriterInterval);
                        typeWriterInterval = null;
                        resolve();
                    }
                }, 15);
            });

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        isReading = false;
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); 
                    
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if (dataStr === '[DONE]') {
                                isReading = false;
                                break;
                            }
                            
                            let data;
                            try {
                                data = JSON.parse(dataStr);
                            } catch (e) {
                                continue;
                            }
                            
                            if (data.error) {
                                throw new Error(data.error);
                            }
                            if (data.status) {
                                const thinkingText = contentDiv.querySelector('.thinking-text');
                                const estTimeDiv = contentDiv.querySelector('.thinking-est-time');
                                if (thinkingText) {
                                    const statusMessages = {
                                        'analyzing': '🔍 Leita að íslenskri löggjöf...',
                                        'deep_research': '⚖️ Yfirfer dómafordæmi og dómvenjur...'
                                    };
                                    thinkingText.textContent = statusMessages[data.status] || 'Vinn úr fyrirspurn...';
                                }
                                if (estTimeDiv) {
                                    estTimeDiv.textContent = data.status === 'deep_research' 
                                        ? 'Áætlaður tími: ~25 sekúndur (ítarleg rannsókn)' 
                                        : 'Áætlaður tími: ~8 sekúndur';
                                }
                                continue;
                            }
                            if (data.text) {
                                if (!statusCleared) {
                                    statusCleared = true;
                                    const thinkingAnim = contentDiv.querySelector('.research-status-banner');
                                    if (thinkingAnim) thinkingAnim.remove();
                                    if (contentDiv.dataset.thinkingInterval) {
                                        clearInterval(parseInt(contentDiv.dataset.thinkingInterval));
                                        delete contentDiv.dataset.thinkingInterval;
                                    }
                                    contentDiv.innerHTML = '';
                                }
                                typeWriterQueue += data.text;
                            }
                        }
                    }
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    isReading = false;
                    typeWriterQueue = '';
                    throw error;
                }
            }

            await typeWriterPromise;

            if (isGenerating) {
                loadingMsg.removeAttribute('id');
                parseAndRenderMetadata(currentDisplay, contentDiv);
                injectCopyButtons(contentDiv);
                addMessageActions(loadingMsg, currentDisplay);
                chat.messages.push({ role: 'model', parts: [{ text: currentDisplay }] });
                fetch(`/api/chats/${chatId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: 'model', content: currentDisplay })
                });
                
                isGenerating = false;
                sendBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                sendBtn.disabled = messageInput.value.trim() === '';
                messageInput.focus();
            }

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Chat error:', error);
                const contentDiv = loadingMsg.querySelector('.message-content');
                contentDiv.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
                loadingMsg.removeAttribute('id');
                
                isGenerating = false;
                sendBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                sendBtn.disabled = messageInput.value.trim() === '';
            }
        }
    }
    
    function injectCopyButtons(element) {
        const preElements = element.querySelectorAll('pre');
        preElements.forEach(pre => {
            if (pre.querySelector('.code-header')) return;
            
            const header = document.createElement('div');
            header.className = 'code-header';
            
            const langLabel = document.createElement('span');
            const codeEl = pre.querySelector('code');
            let lang = '';
            if (codeEl) {
                const match = codeEl.className.match(/language-(\w+)/);
                if (match) lang = match[1];
            }
            langLabel.textContent = lang || 'code';
            
            // Right side actions wrapper
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;align-items:center;gap:6px;';

            // Preview button — only for previewable languages
            const previewLangs = ['html', 'htm', 'svg', 'xml', 'markdown', 'md', 'mermaid', 'mmd'];
            if (previewLangs.includes(lang.toLowerCase())) {
                const previewBtn = document.createElement('button');
                previewBtn.className = 'preview-code-btn';
                previewBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview`;
                previewBtn.onclick = () => openPreviewPanel(codeEl ? codeEl.innerText : '', lang);
                actions.appendChild(previewBtn);
            }

            // Download button
            const dlBtn = document.createElement('button');
            dlBtn.className = 'copy-code-btn';
            dlBtn.title = 'Download code';
            dlBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download';
            dlBtn.onclick = () => {
                const extMap = { html:'html', htm:'html', xml:'xml', svg:'svg', js:'js', javascript:'js', ts:'ts', typescript:'ts', python:'py', py:'py', css:'css', json:'json', md:'md', markdown:'md', mermaid:'mmd', sh:'sh', bash:'sh', c:'c', cpp:'cpp', java:'java', php:'php', go:'go', rs:'rs', ruby:'rb' };
                const ext = extMap[lang.toLowerCase()] || 'txt';
                const blob = new Blob([codeEl ? codeEl.innerText : ''], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `code.${ext}`; a.click();
                URL.revokeObjectURL(url);
            };
            actions.appendChild(dlBtn);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-code-btn';
            copyBtn.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy code';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(codeEl.innerText);
                copyBtn.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy code';
                }, 2000);
            };
            
            actions.appendChild(copyBtn);
            header.appendChild(langLabel);
            header.appendChild(actions);
            pre.insertBefore(header, codeEl);
        });
    }

    // ===========================
    // CODE PREVIEW PANEL
    // ===========================
    let previewPanel = null;
    let previewCurrentCode = '';
    let previewCurrentLang = '';

    function buildIframeDoc(code, lang) {
        const normalized = lang.toLowerCase();
        let content = '';

        const safetyScript = `<script>
            // Aggressive safety: Intercept all clicks and handle manually
            document.addEventListener('click', (e) => {
                const link = e.target.closest('a');
                if (link) {
                    const href = link.getAttribute('href');
                    if (!href) return;
                    
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    if (href.startsWith('#')) {
                        // Handle internal hash links manually to avoid any navigation
                        try {
                            const target = document.querySelector(href);
                            if (target) {
                                target.scrollIntoView({ behavior: 'smooth' });
                            } else if (href === '#') {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }
                        } catch(err) {}
                    } else if (href.startsWith('http') || href.startsWith('//')) {
                        window.open(href, '_blank');
                    }
                }
            }, true);
            // Disable forms and reloads
            document.addEventListener('submit', (e) => e.preventDefault(), true);
            window.onbeforeunload = () => { return "Navigation disabled"; };
        <\/script>`;

        if (normalized === 'html' || normalized === 'htm' || normalized === 'xml') {
            content = code;
            if (content.toLowerCase().includes('</body>')) {
                content = content.replace(/<\/body>/i, safetyScript + '</body>');
            } else {
                content += safetyScript;
            }
            return content;
        }
        if (normalized === 'svg') {
            return `<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;padding:16px;">${code}</body></html>`;
        }
        if (normalized === 'mermaid' || normalized === 'mmd') {
            const enc = encodeURIComponent(code);
            return `<!doctype html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:16px;background:#fff;font-family:sans-serif;}#diagram{width:100%;}</style></head><body><div id="diagram"></div><script type="module">import mermaid from "https://esm.sh/mermaid@11";mermaid.initialize({startOnLoad:false,securityLevel:"loose"});try{const id="m"+Math.random().toString(36).slice(2);const r=await mermaid.render(id,decodeURIComponent("${enc}"));document.getElementById("diagram").innerHTML=r.svg;}catch(e){document.body.innerHTML="<pre style='color:red'>"+e.message+"</pre>";}<\/script></body></html>`;
        }
        if (normalized === 'markdown' || normalized === 'md') {
            return `<!doctype html><html><head><meta charset="UTF-8"><style>body{font-family:system-ui,sans-serif;padding:20px;max-width:700px;margin:auto;line-height:1.6;}code{background:#f0f0f0;padding:2px 6px;border-radius:4px;}pre{background:#1a1a1a;color:#d4d4d4;padding:16px;border-radius:8px;overflow:auto;}</style></head><body id="content"></body><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script><script>document.getElementById("content").innerHTML=marked.parse(decodeURIComponent("${encodeURIComponent(code)}"))<\/script></html>`;
        }
        return '';
    }

    function openPreviewPanel(code, lang) {
        // Helper to fully close
        const closePanel = () => {
            if (previewPanel) previewPanel.remove();
            previewPanel = null;
            document.body.classList.remove('preview-open');
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.style.marginLeft = '';
                mainContent.style.marginRight = '';
            }
        };

        // Toggle off if clicking the preview button for the currently open code
        if (previewPanel && previewCurrentCode === code) {
            closePanel();
            return;
        }

        previewCurrentCode = code;
        previewCurrentLang = lang;

        // Remove existing panel
        if (previewPanel) previewPanel.remove();

        const isRtl = document.body.classList.contains('rtl-mode');
        const canPreview = ['html','htm','xml','svg','mermaid','mmd','markdown','md'].includes(lang.toLowerCase());

        previewPanel = document.createElement('div');
        previewPanel.className = 'preview-panel';
        
        const defaultWidth = window.innerWidth > 1200 ? 500 : window.innerWidth * 0.45;
        previewPanel.style.width = defaultWidth + 'px';

        // Drag handle
        const handle = document.createElement('div');
        handle.className = 'preview-resize-handle';
        previewPanel.appendChild(handle);

        // Header
        const header = document.createElement('div');
        header.className = 'preview-panel-header';

        const title = document.createElement('span');
        title.className = 'preview-panel-title';
        title.textContent = lang.toUpperCase() + ' Preview';

        const tabs = document.createElement('div');
        tabs.className = 'preview-panel-tabs';

        const previewTabBtn = document.createElement('button');
        previewTabBtn.className = 'preview-tab-btn' + (canPreview ? ' active' : '');
        previewTabBtn.textContent = 'Preview';
        previewTabBtn.disabled = !canPreview;

        const sourceTabBtn = document.createElement('button');
        sourceTabBtn.className = 'preview-tab-btn' + (!canPreview ? ' active' : '');
        sourceTabBtn.textContent = 'Source';

        tabs.appendChild(previewTabBtn);
        tabs.appendChild(sourceTabBtn);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'preview-panel-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = closePanel;

        header.appendChild(title);
        header.appendChild(tabs);
        header.appendChild(closeBtn);
        previewPanel.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'preview-panel-body';

        const iframe = document.createElement('iframe');
        iframe.className = 'preview-panel-iframe';
        // Remove allow-same-origin to isolate the preview completely from parent window location
        iframe.sandbox = 'allow-scripts allow-forms allow-popups allow-modals';
        if (canPreview) iframe.srcdoc = buildIframeDoc(code, lang);

        const sourcePre = document.createElement('pre');
        sourcePre.className = 'preview-panel-source';
        sourcePre.textContent = code;
        sourcePre.style.display = canPreview ? 'none' : 'block';
        iframe.style.display = canPreview ? 'block' : 'none';

        body.appendChild(iframe);
        body.appendChild(sourcePre);
        previewPanel.appendChild(body);

        // Tab switching
        previewTabBtn.onclick = () => {
            previewTabBtn.classList.add('active');
            sourceTabBtn.classList.remove('active');
            iframe.style.display = 'block';
            sourcePre.style.display = 'none';
        };
        sourceTabBtn.onclick = () => {
            sourceTabBtn.classList.add('active');
            previewTabBtn.classList.remove('active');
            sourcePre.style.display = 'block';
            iframe.style.display = 'none';
        };

        document.body.appendChild(previewPanel);
        document.body.classList.add('preview-open');

        // Adjust main content margin
        const mainContent = document.querySelector('.main-content');
        const updateMargin = (w) => {
            if (isRtl) { mainContent.style.marginLeft = w + 'px'; mainContent.style.marginRight = ''; }
            else { mainContent.style.marginRight = w + 'px'; mainContent.style.marginLeft = ''; }
        };
        updateMargin(defaultWidth);

        // Drag to resize
        let dragging = false;
        let startX, startW;

        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            startX = e.clientX;
            startW = previewPanel.offsetWidth;
            handle.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';
            iframe.style.pointerEvents = 'none'; // Prevent iframe from swallowing mouse events
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx = isRtl ? (e.clientX - startX) : (startX - e.clientX);
            const newW = Math.max(320, Math.min(window.innerWidth * 0.8, startW + dx));
            previewPanel.style.width = newW + 'px';
            updateMargin(newW);
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            iframe.style.pointerEvents = 'auto'; // Restore iframe interaction
        });
    }


    function addMessageActions(messageDiv, text) {
        if (messageDiv.querySelector('.message-actions')) return;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.title = "Copy message";
        copyBtn.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(text);
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            setTimeout(() => { copyBtn.innerHTML = originalIcon; }, 2000);
        };
        
        actionsDiv.appendChild(copyBtn);
        const contentDiv = messageDiv.querySelector('.message-content');
        contentDiv.appendChild(actionsDiv);
    }

    function parseAndRenderMetadata(text, contentDiv) {
        if (!text) return text;
        const metaRegex = /---\s*METADATA:\s*\n(?:Model:\s*[^\n]+\s*\n)?DeepResearch:\s*([^\n]+)\s*\nVerifiedSources:\s*([^\n]+)\s*\nConfidence:\s*([^\n]+)\s*\nRisk:\s*([^\n]+)/i;
        const match = text.match(metaRegex);
        
        if (match) {
            const cleanText = text.replace(metaRegex, '').replace(/---\s*$/, '').trim();
            const deepRes = (match[1] || '').trim();
            const sourcesCount = (match[2] || '').trim();
            const confidenceVal = (match[3] || '').trim();
            const risk = (match[4] || '').trim();
            
            contentDiv.innerHTML = marked.parse(cleanText);
            
            // Add Verified Seal / Stamp if sources found
            if (sourcesCount !== '0' && sourcesCount !== '') {
                const sealDiv = document.createElement('div');
                sealDiv.className = 'verified-seal-container';
                sealDiv.style.cssText = 'margin-top: 14px; margin-bottom: 8px;';
                sealDiv.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Lagaheimild Sannprófuð (Íslensk Lög)</span>
                `;
                contentDiv.appendChild(sealDiv);
            }
            
            // Add Confidence indicator bar
            if (confidenceVal) {
                const confDiv = document.createElement('div');
                confDiv.className = 'ai-confidence-bar-container';
                const pct = confidenceVal.includes('%') ? confidenceVal : (parseFloat(confidenceVal) * 100) + '%';
                confDiv.innerHTML = `
                    <span>Sannprófun öryggi: ${pct}</span>
                    <div class="ai-confidence-bar">
                        <div class="ai-confidence-fill" style="width: ${pct}"></div>
                    </div>
                `;
                contentDiv.appendChild(confDiv);
            }

            if (risk.toLowerCase().includes('há') || risk.toLowerCase().includes('high')) {
                const warningDiv = document.createElement('div');
                warningDiv.className = 'risk-warning-box';
                warningDiv.style.cssText = 'background: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444; padding: 10px 12px; margin-top: 10px; border-radius: 4px; font-size: 13px; color: #fca5a5;';
                warningDiv.innerHTML = '<strong>⚠️ VIÐVÖRUN:</strong> Þetta mál gæti haft alvarlegar lagalegar afleiðingar. Gefðu mér meiri upplýsingar svo ég geti hjálpað þér betur.';
                contentDiv.appendChild(warningDiv);
            }
            
            return cleanText;
        } else {
            contentDiv.innerHTML = marked.parse(text);
            return text;
        }
    }

    function showThinkingAnimation(contentDiv, isDeepResearch = false) {
        const estTime = isDeepResearch ? "~25 sekúndur" : "~8 sekúndur";
        
        contentDiv.innerHTML = `
            <div class="research-status-banner">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom: 8px;">
                    <div class="thinking-spinner" style="width: 14px; height: 14px; border: 2px solid var(--accent-color); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; flex-shrink: 0;"></div>
                    <div style="font-weight:700; font-size:11px; letter-spacing:0.5px; text-transform:uppercase; color:var(--accent-color);">Rannsaka íslensk lög...</div>
                </div>
                <div class="research-steps">
                    <div class="research-step active" id="step-1">
                        <span class="research-step-dot"></span>
                        <span>Greini fyrirspurn og lagaleg hugtök</span>
                    </div>
                    <div class="research-step" id="step-2">
                        <span class="research-step-dot"></span>
                        <span>Leita í lagasafni Alþingis og dómum</span>
                    </div>
                    <div class="research-step" id="step-3">
                        <span class="research-step-dot"></span>
                        <span>Sannprófa lagagildi og fordæmi</span>
                    </div>
                    <div class="research-step" id="step-4">
                        <span class="research-step-dot"></span>
                        <span>Móta lögfræðilegt mat (${estTime})</span>
                    </div>
                </div>
            </div>
        `;
        
        // Step progress simulation
        let step = 1;
        const progressInterval = setInterval(() => {
            if (step > 3) {
                clearInterval(progressInterval);
                return;
            }
            const currentStepEl = contentDiv.querySelector(`#step-${step}`);
            if (currentStepEl) {
                currentStepEl.classList.remove('active');
                currentStepEl.classList.add('completed');
            }
            step++;
            const nextStepEl = contentDiv.querySelector(`#step-${step}`);
            if (nextStepEl) {
                nextStepEl.classList.add('active');
            }
        }, isDeepResearch ? 6000 : 2000);
        
        // Cache the interval so it can be cleared when streaming stops/finishes
        contentDiv.dataset.thinkingInterval = progressInterval;
    }

    function appendMessage(role, text, isStreaming = false, isFinished = false, image = null) {
        welcomeScreen.style.display = 'none';
        document.querySelector('.main-content').classList.remove('chat-empty');
        let messageDiv;
        
        if (isStreaming) {
            messageDiv = document.getElementById('streaming-message');
            if (!messageDiv) {
                messageDiv = createMessageElement(role, text, image);
                messageDiv.id = 'streaming-message';
                messagesWrapper.appendChild(messageDiv);
            }
        } else {
            messageDiv = createMessageElement(role, text, image);
            if (role === 'model') {
                const contentDiv = messageDiv.querySelector('.message-content');
                contentDiv.dataset.markdown = text;
                parseAndRenderMetadata(text, contentDiv);
                
                // RTL detection
                if (isRTLText(text)) contentDiv.classList.add('rtl-msg');
                else contentDiv.classList.remove('rtl-msg');

                injectCopyButtons(contentDiv);
                if (isFinished) addMessageActions(messageDiv, text);
            }
            messagesWrapper.appendChild(messageDiv);
        }
        
        scrollToBottom();
        return messageDiv;
    }

    function createMessageElement(role, text, image = null) {
        const div = document.createElement('div');
        div.className = `message ${role === 'user' ? 'user' : 'bot'}`;
        
        const avatar = document.createElement('div');
        avatar.className = `avatar ${role === 'user' ? 'user' : 'bot'}`;
        
        if (role === 'user') {
            avatar.style.display = 'none';
        } else {
            avatar.innerHTML = '<img src="/static/logo.png" alt="Lögvist" style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover; display: block;">';
        }

        const content = document.createElement('div');
        content.className = 'message-content';

        if (role === 'user') {
            // Show image thumbnail or document card if attached
            if (image) {
                if (image.isImage && image.objectUrl) {
                    const imgEl = document.createElement('img');
                    imgEl.src = image.objectUrl;
                    imgEl.className = 'message-image';
                    imgEl.alt = 'Attached image';
                    content.appendChild(imgEl);
                } else if (!image.isImage) {
                    const docEl = document.createElement('div');
                    docEl.className = 'message-document-attachment';
                    docEl.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.06);border-radius:10px;font-size:13px;font-weight:500;margin-bottom:8px;border:1px solid var(--border-color);';
                    docEl.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> <span>${image.name}</span>`;
                    content.appendChild(docEl);
                }
            }
            if (text) {
                const p = document.createElement('p');
                p.textContent = text;
                if (isRTLText(text)) content.classList.add('rtl-msg');
                content.appendChild(p);
            }
        } else {
            content.dataset.markdown = text;
            if (role === 'model') {
                if (text) {
                    parseAndRenderMetadata(text, content);
                } else {
                    // Show a beautiful typing indicator for the model initially
                    content.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
                }
            } else {
                content.innerHTML = text ? marked.parse(text) : '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
            }
        }

        div.appendChild(avatar);
        div.appendChild(content);
        return div;
    }

    function isRTLText(text) {
        if (!text) return false;
        // Regex for Arabic/Kurdish characters
        const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
        return rtlRegex.test(text);
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function stopGenerating() {
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
        if (typeWriterInterval) {
            clearInterval(typeWriterInterval);
            typeWriterInterval = null;
        }
        
        const loadingMsg = document.getElementById('streaming-message');
        if (loadingMsg) {
            loadingMsg.removeAttribute('id');
            const contentDiv = loadingMsg.querySelector('.message-content');
            const currentDisplay = contentDiv.dataset.markdown || '';
            
            parseAndRenderMetadata(currentDisplay, contentDiv);
            injectCopyButtons(contentDiv);
            addMessageActions(loadingMsg, currentDisplay);
            
            const currentChat = chats.find(c => c.id === currentChatId);
            currentChat.messages.push({ role: 'model', parts: [{ text: currentDisplay }] });
            fetch(`/api/chats/${currentChatId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'model', content: currentDisplay })
            });
        }

        isGenerating = false;
        sendBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        sendBtn.disabled = messageInput.value.trim() === '';
    }

    async function sendMessage() {
        const text = messageInput.value.trim();
        const imageToSend = pendingImage ? { ...pendingImage } : null;

        if (!text && !imageToSend) return;

        // Check guest limits BEFORE anything
        if (window.IS_GUEST) {
            const guestCount = parseInt(localStorage.getItem('guest_message_count') || '0');
            if (guestCount >= 5) {
                const guestModal = document.getElementById('guest-limit-modal');
                if (guestModal) guestModal.classList.add('active');
                return;
            }
        }

        // Check message credits BEFORE anything
        if (userPlan.msg_credits <= 0) {
            showUpgradeModal('msg');
            return;
        }

        // Increment guest message count if guest
        if (window.IS_GUEST) {
            const guestCount = parseInt(localStorage.getItem('guest_message_count') || '0');
            localStorage.setItem('guest_message_count', (guestCount + 1).toString());
        }

        // Reset input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendBtn.disabled = true;
        isGenerating = true;

        // Clear pending image
        pendingImage = null;
        renderAttachmentPreview();

        // Toggle Send/Stop buttons
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');

        appendMessage('user', text, false, false, imageToSend);
        
        const currentChat = chats.find(c => c.id === currentChatId);
        const displayText = text || (imageToSend ? (imageToSend.isImage ? '📎 Image' : `📄 ${imageToSend.name}`) : '');
        
        // Save chat session and generate AI Title for first message
        const isFirstMessage = currentChat.messages.length === 0;
        if (isFirstMessage) {
            currentChat.title = 'Generating title...';
            renderChatHistory();
            
            // Sync with database first so the chat exists in SQLite
            try {
                await fetch('/api/chats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: currentChatId, title: 'Nýtt samtal' })
                });
                currentChat.saved = true;  // Mark as persisted in DB
            } catch (err) {
                console.error("Failed to pre-create chat session", err);
            }
            
            // Fire off background request for title
            fetch('/api/generate-title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text || 'Image' })
            }).then(res => res.json()).then(data => {
                if (data.title) {
                    currentChat.title = data.title;
                    renderChatHistory();
                    saveChatTitle(currentChatId, data.title);
                }
            }).catch(err => console.error('Title gen failed:', err));
        }
        
        currentChat.messages.push({ role: 'user', parts: [{ text: displayText }] });
        fetch(`/api/chats/${currentChatId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content: displayText })
        });

        const loadingMsg = appendMessage('model', '', true);

        try {
            activeAbortController = new AbortController();
            const body = { messages: currentChat.messages, model: selectedModel, chat_id: currentChatId };
            if (imageToSend) {
                if (imageToSend.isImage) {
                    body.image = imageToSend.base64;
                    body.image_mime = imageToSend.mime;
                } else {
                    body.file = imageToSend.base64;
                    body.file_name = imageToSend.name;
                    body.file_type = imageToSend.mime;
                }
            }
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: activeAbortController.signal
            });

            if (!response.ok) {
                const data = await response.json();
                // Remove the loading message
                const lm = document.getElementById('streaming-message');
                if (lm) lm.remove();
                isGenerating = false;
                sendBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                sendBtn.disabled = messageInput.value.trim() === '';
                if (data.error === 'no_msg_credits') {
                    userPlan.msg_credits = 0;
                    updatePlanUI();
                    showUpgradeModal('msg');
                } else if (data.error === 'no_upload_credits') {
                    userPlan.upload_credits = 0;
                    updatePlanUI();
                    showUpgradeModal('upload');
                } else {
                    throw new Error(data.error || 'Failed to connect to API');
                }
                return;
            }
            // Server deducted credits — update local count
            userPlan.msg_credits = Math.max(0, userPlan.msg_credits - 1);
            if (imageToSend) userPlan.upload_credits = Math.max(0, userPlan.upload_credits - 1);
            updatePlanUI();

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            
            const contentDiv = loadingMsg.querySelector('.message-content');
            const isDeep = text.length > 300 || /djúprannsókn|dómar|samanburður/i.test(text);
            showThinkingAnimation(contentDiv, isDeep);
            contentDiv.dataset.markdown = '';
            let statusCleared = false;

            let buffer = '';
            let typeWriterQueue = '';
            let isReading = true;
            let currentDisplay = '';

            const typeWriterPromise = new Promise((resolve) => {
                let thinkingMsgIndex = 0;
                const thinkingTexts = [
                    '🔍 Leita að íslenskri löggjöf...',
                    '📚 Les viðeigandi lagaákvæði...',
                    '⚖️ Yfirfer dómafordæmi og dómvenjur...',
                    '📝 Undirbýr lögfræðilegt mat...',
                    '📋 Sannprófar heimildir og lagagreinar...'
                ];
                let thinkingTicks = 0;

                typeWriterInterval = setInterval(() => {
                    if (!statusCleared) {
                        thinkingTicks++;
                        if (thinkingTicks > 100) { // change every ~1.5s for faster feel
                            thinkingTicks = 0;
                            thinkingMsgIndex = (thinkingMsgIndex + 1) % thinkingTexts.length;
                            const tText = contentDiv.querySelector('.thinking-text');
                            if (tText) tText.textContent = thinkingTexts[thinkingMsgIndex];
                        }
                    } else if (typeWriterQueue.length > 0) {
                        // Flush up to 20 chars per tick for fast rendering
                        const chars = typeWriterQueue.substring(0, 20);
                        typeWriterQueue = typeWriterQueue.substring(20);
                        currentDisplay += chars;
                        contentDiv.dataset.markdown = currentDisplay;
                        const displayParts = currentDisplay.split(/---\s*METADATA:/i);
                        const visibleText = displayParts[0].replace(/---\s*$/, '').trim();
                        contentDiv.innerHTML = marked.parse(visibleText);
                        injectCopyButtons(contentDiv);
                        scrollToBottom();
                    } else if (!isReading) {
                        clearInterval(typeWriterInterval);
                        typeWriterInterval = null;
                        resolve();
                    }
                }, 15);
            });

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        isReading = false;
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); 
                    
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if (dataStr === '[DONE]') {
                                isReading = false;
                                break;
                            }
                            
                            let data;
                            try {
                                data = JSON.parse(dataStr);
                            } catch (e) {
                                continue;
                            }
                            
                            if (data.error) {
                                throw new Error(data.error);
                            }
                            if (data.status) {
                                // Update the thinking animation based on status
                                const thinkingText = contentDiv.querySelector('.thinking-text');
                                const estTimeDiv = contentDiv.querySelector('.thinking-est-time');
                                if (thinkingText) {
                                    const statusMessages = {
                                        'analyzing': '🔍 Leita að íslenskri löggjöf...',
                                        'deep_research': '⚖️ Yfirfer dómafordæmi og dómvenjur...'
                                    };
                                    thinkingText.textContent = statusMessages[data.status] || 'Vinn úr fyrirspurn...';
                                }
                                if (estTimeDiv) {
                                    estTimeDiv.textContent = data.status === 'deep_research' 
                                        ? 'Áætlaður tími: ~25 sekúndur (ítarleg rannsókn)' 
                                        : 'Áætlaður tími: ~8 sekúndur';
                                }
                                continue;
                            }
                            if (data.text) {
                                // Clear thinking animation on first text
                                if (!statusCleared) {
                                    statusCleared = true;
                                    const thinkingAnim = contentDiv.querySelector('.research-status-banner');
                                    if (thinkingAnim) thinkingAnim.remove();
                                    if (contentDiv.dataset.thinkingInterval) {
                                        clearInterval(parseInt(contentDiv.dataset.thinkingInterval));
                                        delete contentDiv.dataset.thinkingInterval;
                                    }
                                    contentDiv.innerHTML = '';
                                }
                                typeWriterQueue += data.text;
                            }
                        }
                    }
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    isReading = false;
                    typeWriterQueue = '';
                    throw error;
                }
            }

            await typeWriterPromise;

            // Finalize streaming message if not already handled by stopGenerating()
            if (isGenerating) {
                loadingMsg.removeAttribute('id');
                parseAndRenderMetadata(currentDisplay, contentDiv);
                injectCopyButtons(contentDiv);
                addMessageActions(loadingMsg, currentDisplay);
                currentChat.messages.push({ role: 'model', parts: [{ text: currentDisplay }] });
                fetch(`/api/chats/${currentChatId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: 'model', content: currentDisplay })
                });
                
                // If this is the first exchange, generate a title
                if (currentChat.messages.length <= 2) {
                    fetch('/api/generate-title', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: displayText })
                    }).then(res => res.json()).then(data => {
                        if (data.title) {
                            currentChat.title = data.title;
                            fetch('/api/chats', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ chat_id: currentChatId, title: data.title })
                            });
                            renderChatHistory();
                        }
                    }).catch(console.error);
                }
                
                isGenerating = false;
                sendBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                sendBtn.disabled = messageInput.value.trim() === '';
                messageInput.focus();
            }

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Chat error:', error);
                const contentDiv = loadingMsg.querySelector('.message-content');
                contentDiv.innerHTML = `<p style="color: #ff6b6b;">Error: ${error.message}</p>`;
                loadingMsg.removeAttribute('id');
                
                isGenerating = false;
                sendBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                sendBtn.disabled = messageInput.value.trim() === '';
            }
        }
    }
    
    // ===========================
    // PROFILE PICTURE UPLOAD
    // ===========================
    const pfpInput = document.getElementById('pfp-upload-input');
    if (pfpInput) {
        pfpInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Update preview immediately
            const preview = document.getElementById('settings-avatar-preview');
            if (preview) preview.src = URL.createObjectURL(file);
            
            const formData = new FormData();
            formData.append('pfp', file);
            
            try {
                const res = await fetch('/api/upload-pfp', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    // Update all avatars across the UI
                    const avatarSelectors = ['#sidebar-avatar-img', '#menu-avatar-img', '#modal-avatar-img'];
                    avatarSelectors.forEach(selector => {
                        const img = document.querySelector(selector);
                        if (img) img.src = data.pfp_url;
                    });
                    
                    const msgDiv = document.getElementById('settings-message');
                    if (msgDiv) {
                        msgDiv.innerHTML = 'Profile picture updated!';
                        msgDiv.className = 'success-msg';
                        setTimeout(() => { msgDiv.innerHTML = ''; msgDiv.className = ''; }, 3000);
                    }
                } else {
                    alert(data.error || 'Failed to upload profile picture.');
                }
            } catch (err) {
                console.error(err);
                alert('Network error while uploading.');
            }
        });
    }

    // ==========================================
    // LÖGVIST PREMIUM — Luxury Features
    // ==========================================
    
    // 2. Floating Document Particles Generator
    function initFloatingParticles() {
        const container = document.getElementById('legal-particles');
        if (!container) return;
        container.innerHTML = '';
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'legal-particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 15}s`;
            particle.style.animationDuration = `${15 + Math.random() * 20}s`;
            particle.style.transform = `scale(${0.5 + Math.random() * 0.7})`;
            container.appendChild(particle);
        }
    }
    initFloatingParticles();

    // 3. Mouse Coordinate Spotlight Tracking
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.mouse-glow-card, .welcome-screen, .law-book-card, .subscription-card, .category-card, .login-card');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
    // Add spotlight cards styling support
    document.querySelectorAll('.welcome-screen, .law-book-card, .subscription-card, .category-card, .login-card').forEach(el => {
        el.classList.add('mouse-glow-card');
    });

    // 4. Spotlight Command Palette (Ctrl+K)
    const palette = document.getElementById('command-palette');
    const paletteInput = document.getElementById('command-palette-input');
    const paletteResults = document.getElementById('command-palette-results');
    
    const commandsList = [
        { name: 'Nýtt samtal (Nýtt spjall)', shortcut: 'Ctrl+N', action: () => {
            const btn = document.getElementById('new-chat-btn');
            if (btn) btn.click();
        }},
        { name: 'Opna stillingar', shortcut: 'Ctrl+,', action: () => openSettingsTab('panel-general') },
        { name: 'Breyta í Dökkt þema (Blátt & Svart)', shortcut: 'Þema', action: () => window.setTheme('dark') },
        { name: 'Breyta í Ljóst þema (Blátt & Hvítt)', shortcut: 'Þema', action: () => window.setTheme('light') },
        { name: 'Breyta í Djúpblátt þema', shortcut: 'Þema', action: () => window.setTheme('purple') },
        { name: 'Breyta í Rafblátt þema', shortcut: 'Þema', action: () => window.setTheme('blue') },
        { name: 'Breyta í Ísblátt þema', shortcut: 'Þema', action: () => window.setTheme('pink') },
        { name: 'Hreinsa öll spjallsamtöl', shortcut: 'Hreinsa', action: () => {
            const clearBtn = document.getElementById('clear-chats-btn');
            if (clearBtn) clearBtn.click();
        }},
        { name: 'Skoða lagasafn og skjöl', shortcut: 'Lagasafn', action: () => openSettingsTab('panel-documents') },
        { name: 'Skoða verðskrá og áskriftir', shortcut: 'Áskrift', action: () => openSettingsTab('panel-subscription') },
        { name: 'Opna aðstoð og FAQ', shortcut: 'Aðstoð', action: () => openSettingsTab('panel-help') }
    ];
    
    let selectedIndex = 0;
    let filteredCommands = [...commandsList];
    
    function togglePalette() {
        if (!palette) return;
        palette.classList.toggle('active');
        if (palette.classList.contains('active')) {
            paletteInput.value = '';
            selectedIndex = 0;
            filteredCommands = [...commandsList];
            renderPaletteResults();
            setTimeout(() => paletteInput.focus(), 50);
        }
    }
    
    function renderPaletteResults() {
        if (!paletteResults) return;
        paletteResults.innerHTML = '';
        if (filteredCommands.length === 0) {
            paletteResults.innerHTML = '<div style="padding:16px 20px; color:var(--text-muted); font-size:14px;">Engar skipanir fundust...</div>';
            return;
        }
        filteredCommands.forEach((cmd, idx) => {
            const div = document.createElement('div');
            div.className = `command-item ${idx === selectedIndex ? 'selected' : ''}`;
            div.innerHTML = `
                <div class="command-item-left">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <span>${cmd.name}</span>
                </div>
                <span class="command-shortcut">${cmd.shortcut}</span>
            `;
            div.addEventListener('click', () => {
                cmd.action();
                togglePalette();
            });
            paletteResults.appendChild(div);
        });
    }
    
    // Keyboard listener for palette activation
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            togglePalette();
        }
        
        if (palette && palette.classList.contains('active')) {
            if (e.key === 'Escape') {
                togglePalette();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % filteredCommands.length;
                renderPaletteResults();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
                renderPaletteResults();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredCommands[selectedIndex]) {
                    filteredCommands[selectedIndex].action();
                    togglePalette();
                }
            }
        }
    });
    
    paletteInput?.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        filteredCommands = commandsList.filter(cmd => cmd.name.toLowerCase().includes(val) || cmd.shortcut.toLowerCase().includes(val));
        selectedIndex = 0;
        renderPaletteResults();
    });
    
    palette?.addEventListener('click', (e) => {
        if (e.target === palette) {
            togglePalette();
        }
    });

    // 5. Onboarding Tour Layout steps
    const onboarding = document.getElementById('onboarding-overlay');
    const spotlight = document.getElementById('onboarding-spotlight');
    const tourCard = document.getElementById('onboarding-card');
    const tourTitle = document.getElementById('onboarding-title');
    const tourText = document.getElementById('onboarding-text');
    const nextBtn = document.getElementById('onboarding-next-btn');
    const skipBtn = document.getElementById('onboarding-skip-btn');
    
    const tourSteps = [
        {
            title: 'Velkomin(n) í Lögvist AI',
            text: 'Þetta er þinn nýi premium lögfræðiaðstoðarmaður. Leyfðu okkur að sýna þér helstu nýjungarnar í 4 einföldum skrefum.',
            target: '.sidebar-logo'
        },
        {
            title: 'Nýtt samtal',
            text: 'Smelltu hér til að hefja nýtt lögfræðilegt samtal eða hreinsa spjallsvæðið.',
            target: '#new-chat-btn'
        },
        {
            title: 'Spyrðu Lögfræðispurninga',
            text: 'Skrifaðu fyrirspurn þína hér (t.d. um húsaleigu eða vinnurétt). Þú getur einnig hengt við skjöl til greiningar.',
            target: '#message-input'
        },
        {
            title: 'Djúprannsókn (Deep Research)',
            text: 'Þegar mál eru flókin getur þú virkjað Djúprannsókn. Þá leitar kerfið ítarlegar og samkeyrir mörg lagaákkvæði.',
            target: '.sidebar-navigation button:nth-child(3)'
        }
    ];
    
    let currentStep = 0;
    
    function startOnboardingTour() {
        if (!onboarding) return;
        const hasCompletedTour = localStorage.getItem('has_completed_tour_v2');
        if (hasCompletedTour) return;
        
        onboarding.classList.add('active');
        currentStep = 0;
        showTourStep(0);
    }
    
    function showTourStep(stepIdx) {
        if (stepIdx >= tourSteps.length) {
            finishTour();
            return;
        }
        
        const step = tourSteps[stepIdx];
        tourTitle.textContent = step.title;
        tourText.textContent = step.text;
        nextBtn.textContent = stepIdx === tourSteps.length - 1 ? 'Ljúka' : 'Næsta';
        
        const targetEl = document.querySelector(step.target);
        if (targetEl && targetEl.offsetParent !== null) {
            const rect = targetEl.getBoundingClientRect();
            
            spotlight.style.width = `${rect.width + 16}px`;
            spotlight.style.height = `${rect.height + 16}px`;
            spotlight.style.top = `${rect.top - 8 + window.scrollY}px`;
            spotlight.style.left = `${rect.left - 8 + window.scrollX}px`;
            
            if (rect.top > window.innerHeight / 2) {
                tourCard.style.top = `${rect.top - 180 + window.scrollY}px`;
            } else {
                tourCard.style.top = `${rect.bottom + 20 + window.scrollY}px`;
            }
            tourCard.style.left = `${Math.min(window.innerWidth - 300, Math.max(20, rect.left - 8))}px`;
        } else {
            spotlight.style.width = '0';
            spotlight.style.height = '0';
            tourCard.style.top = '30%';
            tourCard.style.left = 'calc(50% - 140px)';
        }
    }
    
    function finishTour() {
        if (onboarding) onboarding.classList.remove('active');
        localStorage.setItem('has_completed_tour_v2', 'true');
    }
    
    nextBtn?.addEventListener('click', () => {
        currentStep++;
        showTourStep(currentStep);
    });
    
    skipBtn?.addEventListener('click', () => {
        finishTour();
    });
    
    setTimeout(startOnboardingTour, 2000);

});
