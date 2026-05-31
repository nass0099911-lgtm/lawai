import sys

with open('templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<span class="model-name">Aura 3 Flash</span>', '<span class="model-name">Gemini 3.1 Pro</span>')

old_items = """<div class="model-picker-item active" data-model="gemini-3-flash-preview">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                        <span>Aura 3 Flash</span>
                                    </div>
                                    <span class="model-badge-mini">Default</span>
                                </div>
                                <div class="model-picker-item" data-model="gemini-2.5-flash-preview-05-20">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                                        <span>Aura 2.5 Flash</span>
                                    </div>
                                    <span class="model-badge-mini new">New</span>
                                </div>
                                <div class="model-picker-item" data-model="gemini-2.5-pro-preview-05-06">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                        <span>Aura 2.5 Pro</span>
                                    </div>
                                    <span class="model-badge-mini max">MAX</span>
                                </div>"""

new_items = """<div class="model-picker-item" data-model="sonar-2">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                        <span>Sonar 2</span>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>
                                <div class="model-picker-item" data-model="gpt-5.4">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                                        <span>GPT-5.4</span>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>
                                <div class="model-picker-item" data-model="gpt-5.5-max">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                                        <span>GPT-5.5</span>
                                        <span class="model-badge-mini max">MAX</span>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>
                                <div class="model-picker-item active" data-model="gemini-3.1-pro">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                        <span>Gemini 3.1 Pro</span>
                                    </div>
                                </div>
                                <div class="model-picker-item" data-model="claude-sonnet-4.6">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                        <span>Claude Sonnet 4.6</span>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>
                                <div class="model-picker-item" data-model="claude-opus-4.7">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                        <span>Claude Opus 4.7</span>
                                        <span class="model-badge-mini max">MAX</span>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>
                                <div class="model-picker-item" data-model="kimi-2.6">
                                    <div class="model-picker-item-main">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                        <span>Kimi K2.6</span>
                                        <span class="model-badge-mini new">New</span>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                </div>"""

if old_items in content:
    content = content.replace(old_items, new_items)
    with open('templates/index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced successfully")
else:
    print("Old items not found")
