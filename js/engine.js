/* ===========================================================================
   engine.js
   A small, generic wizard engine that renders the screens defined in flow.js,
   handles Back history, keeps the collected answers, draws the progress rail,
   and wires up the demo control panel.
   =========================================================================== */

(function () {
  const SECTIONS = [
    { id: 'site', label: 'Site' },
    { id: 'supply', label: 'Supply' },
    { id: 'meter', label: 'Meter' },
    { id: 'billing', label: 'Billing' },
    { id: 'confirm', label: 'Confirm' },
  ];

  const answers = {};
  let current = FLOW.START;
  const history = [];
  let systemTimer = null; // pending auto-advance for a 'system' (background) screen

  const cardEl = document.getElementById('card');
  const progressEl = document.getElementById('progress');

  // Resolve a value that might be a function of `answers`.
  const val = (x) => (typeof x === 'function' ? x(answers) : x);

  // ------------------------------------------------------------ navigation
  function go(nextId, { push = true } = {}) {
    if (!FLOW.screens[nextId]) { console.warn('Unknown screen:', nextId); return; }
    if (push) history.push(current);
    current = nextId;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function back() {
    if (!history.length) return;
    current = history.pop();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ------------------------------------------------------------- rendering
  function render() {
    const s = FLOW.screens[current];
    // Cancel any pending auto-advance from a screen we're leaving.
    if (systemTimer) { clearTimeout(systemTimer); systemTimer = null; }
    // Background screens run their side effect (lookup / vision) as they mount.
    if (s.kind === 'system' && s.run) s.run(answers);
    renderProgress(s.section);

    const parts = [];
    const chips = val(s.chips) || [];
    if (chips.length) {
      parts.push(`<div class="chips">${chips.map(c =>
        `<span class="chip ${c.cls || ''}">${c.text}</span>`).join('')}</div>`);
    }
    if (s.eyebrow) parts.push(`<span class="screen__eyebrow">${val(s.eyebrow)}</span>`);
    if (s.title) parts.push(`<h1 class="screen__title">${val(s.title)}</h1>`);

    const notice = val(s.notice);
    if (notice) {
      parts.push(`<div class="notice notice--${notice.type}">
        ${notice.title ? `<p class="notice__title">${notice.title}</p>` : ''}
        <div>${notice.html}</div></div>`);
    }
    if (s.help) parts.push(`<p class="screen__help">${val(s.help)}</p>`);
    if (s.body) parts.push(val(s.body));

    if (s.kind === 'system') parts.push(renderSpinner());
    if (s.kind === 'form') parts.push(renderFields(val(s.fields) || []));
    if (s.kind === 'photo') parts.push(renderUpload());
    if (s.kind === 'choice') parts.push(renderChoices(val(s.choices) || []));
    // form screens may also carry an extra choice (e.g. "I don't know")
    if (s.kind === 'form' && s.choices) parts.push(renderChoices(val(s.choices), true));

    parts.push(renderNav(s));

    cardEl.innerHTML = parts.join('\n');
    wire(s);

    // Background screens pause briefly, then move on. push:false keeps them out
    // of the Back history, so Back skips straight over the "checking" step.
    if (s.kind === 'system') {
      systemTimer = setTimeout(() => {
        systemTimer = null;
        go(val(s.next), { push: false });
      }, s.delay || 1600);
    }
  }

  function renderSpinner() {
    return `<div class="sys"><div class="sys__spinner" aria-hidden="true"></div></div>`;
  }

  function renderProgress(activeSection) {
    const activeIdx = SECTIONS.findIndex(x => x.id === activeSection);
    progressEl.innerHTML = SECTIONS.map((sec, i) => {
      const cls = i < activeIdx ? 'is-done' : (i === activeIdx ? 'is-active' : '');
      return `<div class="progress__step ${cls}">
        <div class="progress__bar"><div class="progress__fill"></div></div>
        <div class="progress__label">${sec.label}</div>
      </div>`;
    }).join('');
  }

  // Group consecutive half-width fields into pairs.
  function renderFields(fields) {
    let html = '';
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.half && fields[i + 1] && fields[i + 1].half) {
        html += `<div class="grid-2">${fieldHtml(f)}${fieldHtml(fields[i + 1])}</div>`;
        i++;
      } else {
        html += fieldHtml(f);
      }
    }
    return html;
  }

  function fieldHtml(f) {
    const stored = readAnswer(f.name);
    const v = stored == null ? '' : stored;
    if (f.type === 'checkbox') {
      return `<div class="field" style="margin-bottom:12px">
        <label style="display:flex;gap:10px;align-items:flex-start;font-weight:600;cursor:pointer">
          <input type="checkbox" data-name="${f.name}" style="width:auto;margin-top:3px" ${v ? 'checked' : ''}/>
          <span>${f.label}</span>
        </label></div>`;
    }
    const input = f.type === 'textarea'
      ? `<textarea data-name="${f.name}" rows="3" placeholder="${f.placeholder || ''}">${escapeHtml(v)}</textarea>`
      : `<input data-name="${f.name}" type="${f.type || 'text'}" value="${escapeHtml(v)}" placeholder="${f.placeholder || ''}" ${f.required ? 'required' : ''}/>`;
    return `<div class="field" data-field="${f.name}">
      <label>${f.label}${f.required ? '' : ' <span style="color:#9a90ad;font-weight:600">(optional)</span>'}</label>
      ${input}
      ${f.hint ? `<div class="field__hint">${f.hint}</div>` : ''}
      <div class="field__error">Please complete this field.</div>
    </div>`;
  }

  function renderChoices(choices, ghostGroup) {
    return `<div class="choices" ${ghostGroup ? 'style="margin-top:14px"' : ''}>${choices.map((c, i) =>
      `<button class="choice ${c.ghost ? 'choice--ghost' : ''}" data-choice="${i}">
        ${c.icon ? `<span class="choice__icon">${c.icon}</span>` : ''}
        <span>${c.label}${c.sub ? `<span class="choice__sub">${c.sub}</span>` : ''}</span>
      </button>`).join('')}</div>`;
  }

  function renderUpload() {
    const has = answers._photoName;
    return `<label class="upload ${has ? 'is-filled' : ''}" id="uploadBox">
      <input type="file" accept="image/*" id="photoInput"/>
      <div class="upload__icon">${has ? '✅' : '📷'}</div>
      <div class="upload__title">${has ? escapeHtml(answers._photoName) : 'Tap to add a photo'}</div>
      <div class="upload__hint">${has ? 'Looks good — continue when ready.' : 'JPG or PNG. Any image is fine for this demo.'}</div>
    </label>`;
  }

  function renderNav(s) {
    if (s.kind === 'system') return ''; // background screens auto-advance
    const showBack = !s.hideBack && history.length > 0;
    const hasPrimary = s.kind === 'form' || s.kind === 'info' || s.kind === 'photo' ||
                       s.kind === 'success' || (s.kind === 'stop');
    let primary = '';
    if (s.kind === 'stop') {
      primary = `<button class="btn btn--stop" id="primaryBtn">Go back</button>`;
    } else if (s.kind === 'success') {
      primary = `<button class="btn btn--primary" id="primaryBtn">Start again</button>`;
    } else if (hasPrimary) {
      const disabled = s.kind === 'photo' && !answers._photoName ? 'disabled' : '';
      primary = `<button class="btn btn--primary" id="primaryBtn" ${disabled}>${s.primaryLabel || 'Continue'}</button>`;
    }
    if (!showBack && !primary) return '';
    const wide = (s.kind === 'stop' || s.kind === 'success') ? ' nav--wide' : '';
    return `<div class="nav${wide}">
      <div>${showBack ? `<button class="btn btn--ghost" id="backBtn">← Back</button>` : ''}</div>
      <div>${primary}</div>
    </div>`;
  }

  // ------------------------------------------------------------------ wire
  function wire(s) {
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.addEventListener('click', back);

    // choice buttons
    cardEl.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const list = s.kind === 'choice' ? val(s.choices) : val(s.choices);
        const c = list[Number(btn.dataset.choice)];
        const next = c.pick ? c.pick(answers) : c.goto;
        go(next);
      });
    });

    // photo upload
    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
      photoInput.addEventListener('change', () => {
        const file = photoInput.files[0];
        answers._photoName = file ? file.name : null;
        render(); // refresh to enable Continue + show filename
      });
    }

    // primary button
    const primaryBtn = document.getElementById('primaryBtn');
    if (primaryBtn) {
      primaryBtn.addEventListener('click', () => {
        if (s.kind === 'stop') {
          if (s.backTo) { go(s.backTo); } else { back(); }
          return;
        }
        if (s.kind === 'success') { restart(); return; }
        if (s.kind === 'form') {
          if (!collectForm(val(s.fields) || [], s)) return; // validation failed
        }
        go(val(s.next));
      });
    }
  }

  // ------------------------------------------------------- answers storage
  function scopeKey(s) { return s && s.fuelScoped ? currentFuel(answers) : null; }

  function readAnswer(name) {
    const s = FLOW.screens[current];
    const scope = scopeKey(s);
    return scope ? (answers[scope] ? answers[scope][name] : undefined) : answers[name];
  }
  function writeAnswer(s, name, value) {
    const scope = scopeKey(s);
    if (scope) { (answers[scope] = answers[scope] || { flags: [] })[name] = value; }
    else answers[name] = value;
  }

  function collectForm(fields, s) {
    let ok = true;
    fields.forEach((f) => {
      const el = cardEl.querySelector(`[data-name="${f.name}"]`);
      if (!el) return;
      let value;
      if (f.type === 'checkbox') value = el.checked;
      else value = el.value.trim();

      const wrap = cardEl.querySelector(`[data-field="${f.name}"]`);
      let invalid = false;
      if (f.required && (value === '' || value == null)) invalid = true;
      if (!invalid && value && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) invalid = true;

      if (wrap) {
        wrap.classList.toggle('is-invalid', invalid);
        if (invalid) {
          const errEl = wrap.querySelector('.field__error');
          if (errEl && f.type === 'email' && value) errEl.textContent = 'Please enter a valid email address.';
        }
      }
      if (invalid) { ok = false; return; }
      writeAnswer(s, f.name, value);
    });
    return ok;
  }

  // --------------------------------------------------------------- restart
  function restart() {
    Object.keys(answers).forEach((k) => delete answers[k]);
    history.length = 0;
    current = FLOW.START;
    render();
  }

  // ---------------------------------------------------------- demo panel
  function buildDemoPanel() {
    const body = document.getElementById('demoBody');
    const fuels = [
      { key: 'electricity', label: '⚡ Electricity (ECOES)' },
      { key: 'gas', label: '🔥 Gas (XO)' },
    ];
    body.innerHTML = fuels.map((fuel) => `
      <div class="demo-group">
        <p class="demo-group__title">${fuel.label}</p>
        ${DEMO_CONTROLS.map((ctrl) => {
          const values = ctrl.values || ['yes', 'no'];
          const cur = DemoState[fuel.key][ctrl.key];
          return `<div class="demo-ctrl">
            <span class="demo-ctrl__label">${ctrl.label}</span>
            <span class="seg" data-fuel="${fuel.key}" data-ctrl="${ctrl.key}">
              <button data-v="${values[0]}" class="${cur === values[0] ? 'is-on' : ''}">${ctrl.on}</button>
              <button data-v="${values[1]}" class="${cur === values[1] ? 'is-on' : ''}">${ctrl.off}</button>
            </span>
          </div>`;
        }).join('')}
      </div>`).join('');

    body.querySelectorAll('.seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          DemoState[seg.dataset.fuel][seg.dataset.ctrl] = b.dataset.v;
          seg.querySelectorAll('button').forEach(x => x.classList.remove('is-on'));
          b.classList.add('is-on');
        });
      });
    });
  }

  function wireDemoToggle() {
    const toggle = document.getElementById('demoToggle');
    const panel = document.getElementById('demoPanel');
    const close = document.getElementById('demoClose');
    const set = (open) => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => set(panel.hidden));
    close.addEventListener('click', () => set(false));
  }

  // ------------------------------------------------------------------ init
  buildDemoPanel();
  wireDemoToggle();
  render();
})();
