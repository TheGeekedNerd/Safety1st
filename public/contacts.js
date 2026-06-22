/* ========================================
   CONTACTS — Trusted contacts list
   CRUD against /api/contacts (MongoDB-backed)
   Renders into #contacts-list and #contact-form
   ======================================== */

const Contacts = (() => {
    let _contacts  = [];
    let _editingId = null;

    // ── API ───────────────────────────────────────────────────────────────────

    async function apiFetch(path, opts = {}) {
        const res = await fetch(path, {
            headers: { 'Content-Type': 'application/json' },
            ...opts,
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${res.status})`);
        }
        return res.json();
    }

    async function loadAll()          { return apiFetch('/api/contacts'); }
    async function create(data)       { return apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(data) }); }
    async function update(id, data)   { return apiFetch(`/api/contacts/${id}`, { method: 'PUT',  body: JSON.stringify(data) }); }
    async function destroy(id)        { return apiFetch(`/api/contacts/${id}`, { method: 'DELETE' }); }

    // ── Render: list ──────────────────────────────────────────────────────────

    function renderList() {
        const el = document.getElementById('contacts-list');
        if (!el) return;

        if (_contacts.length === 0) {
            el.innerHTML = `<p class="contacts-empty">No trusted contacts yet. Add someone who should receive your emergency alerts.</p>`;
            return;
        }

        el.innerHTML = _contacts.map(c => `
            <div class="contact-card" data-id="${c._id}">
                <div class="contact-info">
                    <span class="contact-name">${esc(c.name)}</span>
                    <span class="contact-phone">${esc(c.phone)}</span>
                    ${c.email ? `<span class="contact-email">${esc(c.email)}</span>` : ''}
                </div>
                <div class="contact-actions">
                    <button class="contact-btn-edit" onclick="Contacts.startEdit('${c._id}')" aria-label="Edit ${esc(c.name)}">Edit</button>
                    <button class="contact-btn-delete" onclick="Contacts.remove('${c._id}')" aria-label="Remove ${esc(c.name)}">Remove</button>
                </div>
            </div>
        `).join('');
    }

    // ── Render: form ──────────────────────────────────────────────────────────

    function renderForm(contact = null) {
        const el = document.getElementById('contact-form');
        if (!el) return;

        el.innerHTML = `
            <h3 class="contacts-form-title">${contact ? 'Edit contact' : 'Add trusted contact'}</h3>
            <div class="contacts-form-row">
                <label for="cf-name">Name</label>
                <input id="cf-name" type="text" placeholder="Full name" value="${contact ? esc(contact.name) : ''}" autocomplete="name" />
            </div>
            <div class="contacts-form-row">
                <label for="cf-phone">Phone number</label>
                <input id="cf-phone" type="tel" placeholder="+27 73 000 0000" value="${contact ? esc(contact.phone) : ''}" autocomplete="tel" />
            </div>
            <div class="contacts-form-row">
                <label for="cf-email">Email <span class="contacts-optional">(optional)</span></label>
                <input id="cf-email" type="email" placeholder="name@example.com" value="${contact ? esc(contact.email || '') : ''}" autocomplete="email" />
            </div>
            <p id="cf-error" class="contacts-form-error" hidden></p>
            <div class="contacts-form-actions">
                <button id="cf-submit" class="contacts-btn-submit">${contact ? 'Save changes' : 'Add contact'}</button>
                ${contact ? `<button id="cf-cancel" class="contacts-btn-cancel">Cancel</button>` : ''}
            </div>
        `;

        document.getElementById('cf-submit').addEventListener('click', () => handleSubmit(contact?._id));
        document.getElementById('cf-cancel')?.addEventListener('click', cancelEdit);
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    async function handleSubmit(id) {
        const name  = document.getElementById('cf-name')?.value.trim();
        const phone = document.getElementById('cf-phone')?.value.trim();
        const email = document.getElementById('cf-email')?.value.trim();

        const errEl = document.getElementById('cf-error');

        const setError = msg => {
            if (!errEl) return;
            errEl.textContent = msg;
            errEl.hidden = !msg;
        };

        if (!name || !phone) { setError('Name and phone number are required.'); return; }
        if (!/^\+?\d[\d\s\-]{6,14}$/.test(phone)) { setError('Enter a valid phone number, e.g. +27 73 000 0000'); return; }
        setError('');

        const submitBtn = document.getElementById('cf-submit');
        if (submitBtn) submitBtn.disabled = true;

        try {
            if (id) {
                const updated = await update(id, { name, phone, email });
                _contacts = _contacts.map(c => c._id === id ? updated : c);
                _editingId = null;
            } else {
                const created = await create({ name, phone, email });
                _contacts.push(created);
            }
            renderList();
            renderForm();
        } catch (err) {
            setError(err.message);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function startEdit(id) {
        const contact = _contacts.find(c => c._id === id);
        if (!contact) return;
        _editingId = id;
        renderForm(contact);
        document.getElementById('contact-form')?.scrollIntoView({ behavior: 'smooth' });
    }

    function cancelEdit() {
        _editingId = null;
        renderForm();
    }

    async function remove(id) {
        const contact = _contacts.find(c => c._id === id);
        if (!contact) return;
        if (!confirm(`Remove ${contact.name} from trusted contacts?`)) return;
        try {
            await destroy(id);
            _contacts = _contacts.filter(c => c._id !== id);
            renderList();
            if (_editingId === id) cancelEdit();
        } catch (err) {
            alert('Could not remove contact: ' + err.message);
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    async function init() {
        try {
            _contacts = await loadAll();
        } catch (_) {
            _contacts = [];
        }
        renderList();
        renderForm();
    }

    function getAll() { return _contacts; }

    // ── Util ──────────────────────────────────────────────────────────────────

    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return { init, getAll, startEdit, remove };
})();

window.Contacts = Contacts;
