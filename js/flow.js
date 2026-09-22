/* ===========================================================================
   flow.js
   The flowchart, encoded. Each screen is a state; its `next`/choice `goto`
   decides where the journey goes, mirroring the attached diagram.

   A screen object may declare:
     section   'site' | 'supply' | 'meter' | 'billing' | 'confirm'
     eyebrow   small label above the title
     title     the question / headline
     help      supporting copy (HTML allowed)
     chips(a)  optional array of context chips (e.g. which fuel)
     kind      'choice' | 'form' | 'info' | 'stop' | 'success' | 'photo'
     choices(a)  -> [{ label, sub, icon, ghost, goto|pick }]
     fields(a)   -> [ field specs ] (for kind 'form')
     fuelScoped  store form fields under the current fuel
     body(a)     -> extra HTML injected above the buttons (info/photo/success)
     notice(a)   -> { type, title, html } banner (info/stop)
     primaryLabel  continue button text (default "Continue")
     next(a)     -> next screen id (for form/info/photo screens)
     hideBack    hide the Back button
   =========================================================================== */

// Which fuel are we currently gathering supply details for?
function currentFuel(a) { return a._queue && a._queue[a._currentIndex]; }
function fuelLabel(f) { return f === 'electricity' ? 'Electricity' : 'Gas'; }
function mpxnLabel(f) { return f === 'electricity' ? 'MPAN' : 'MPRN'; }
function networkLabel(f) { return f === 'electricity' ? 'DNO' : 'GDN'; }

// Chip row shown across the supply/meter screens so dual-fuel is legible.
function fuelChips(a) {
  const f = currentFuel(a);
  if (!f) return [];
  const chips = [{ text: fuelLabel(f), cls: f === 'electricity' ? 'chip--elec' : 'chip--gas' }];
  if (a._queue.length > 1) chips.push({ text: `Fuel ${a._currentIndex + 1} of ${a._queue.length}` });
  return chips;
}

// Ensure a per-fuel bucket exists.
function fuelBucket(a) {
  const f = currentFuel(a);
  if (!a[f]) a[f] = { flags: [] };
  return a[f];
}

// After a fuel's supply+meter details are done, move to the next fuel or billing.
function advanceFuel(a) {
  a._currentIndex += 1;
  return a._currentIndex < a._queue.length ? 'ASK_MPXN' : 'BILLING';
}

const FLOW = {
  START: 'WELCOME',

  screens: {
    // ----------------------------------------------------------------- SITE
    WELCOME: {
      section: 'site',
      eyebrow: 'New connections',
      title: 'Let’s get your new connection set up',
      help: 'A few quick questions about the property and its meter(s). It takes around 5 minutes. ' +
            'Nothing here is submitted for real — it’s a demonstration of the onboarding journey.',
      kind: 'info',
      primaryLabel: 'Get started',
      hideBack: true,
      next: () => 'SITE_TYPE',
    },

    SITE_TYPE: {
      section: 'site',
      eyebrow: 'Your site',
      title: 'Is this a domestic or non-domestic site?',
      help: 'Domestic means a home. Non-domestic means a business or commercial premises.',
      kind: 'choice',
      choices: () => [
        { label: 'Domestic', sub: 'A home or residential property', icon: '🏠', goto: 'FUELS' },
        { label: 'Non-domestic', sub: 'A business or commercial premises', icon: '🏢', goto: 'STOP_NONDOMESTIC' },
      ],
    },

    STOP_NONDOMESTIC: {
      section: 'site',
      kind: 'stop',
      title: 'We can’t set this up here',
      notice: () => ({
        type: 'stop',
        title: 'Non-domestic new connections',
        html: 'We don’t offer non-domestic new connections through this journey. ' +
              'Please head to <a href="https://octopus.energy/business/" target="_blank" rel="noopener">Octopus Energy for Business</a>.',
      }),
    },

    FUELS: {
      section: 'site',
      eyebrow: 'Your site',
      title: 'Which new connection(s) do you need?',
      help: 'Choose the fuel(s) you need a new supply for.',
      kind: 'choice',
      choices: () => [
        { label: 'Electricity', sub: 'Electric supply only', icon: '⚡',
          pick: (a) => { startQueue(a, ['electricity']); return 'ASK_MPXN'; } },
        { label: 'Gas', sub: 'Gas supply only', icon: '🔥',
          pick: (a) => { startQueue(a, ['gas']); return 'ASK_MPXN'; } },
        { label: 'Dual fuel', sub: 'Both electricity and gas', icon: '⚡🔥',
          pick: (a) => { startQueue(a, ['electricity', 'gas']); return 'ASK_MPXN'; } },
      ],
    },

    // --------------------------------------------------------------- SUPPLY
    ASK_MPXN: {
      section: 'supply',
      chips: fuelChips,
      eyebrow: (a) => `${fuelLabel(currentFuel(a))} supply`,
      title: (a) => `What’s the ${mpxnLabel(currentFuel(a))} for this supply?`,
      help: (a) => currentFuel(a) === 'electricity'
        ? 'The MPAN (Meter Point Administration Number) is the long number on an electricity bill, sometimes shown as an “S” number.'
        : 'The MPRN (Meter Point Reference Number) is the number that identifies a gas supply point.',
      kind: 'form',
      fields: (a) => [
        { name: 'mpxn', label: mpxnLabel(currentFuel(a)), type: 'text',
          placeholder: currentFuel(a) === 'electricity' ? 'e.g. 20 0002 1234 567' : 'e.g. 1234567890',
          required: true, hint: 'Digits only is fine.' },
      ],
      fuelScoped: true,
      // extra "I don't know" escape hatch under the Continue button
      choices: () => [
        { label: 'I don’t know my number', ghost: true, icon: '🤔',
          pick: (a) => {
            const b = fuelBucket(a);
            b.mpxnKnown = false;
            b.flags.push('No number provided — do NOT auto-enrol, needs manual check');
            return 'FLAG_UNSURE';
          } },
      ],
      next: (a) => { fuelBucket(a).mpxnKnown = true; return 'LOOKUP'; },
    },

    FLAG_UNSURE: {
      section: 'supply',
      chips: fuelChips,
      kind: 'info',
      title: 'That’s OK — we’ll flag it for a manual check',
      notice: () => ({
        type: 'flag',
        title: 'Flag & continue',
        html: 'We’ll let you carry on, but we won’t auto-enrol this supply. Our team will check it manually before it’s set live.',
      }),
      next: () => 'SUPPLY_INSTALLED',
    },

    LOOKUP: {
      section: 'supply',
      chips: fuelChips,
      kind: 'info',
      eyebrow: (a) => `${fuelLabel(currentFuel(a))} supply`,
      title: (a) => `We looked up your ${mpxnLabel(currentFuel(a))}`,
      body: (a) => {
        const r = Simulate.lookup(currentFuel(a));
        fuelBucket(a)._lookup = r; // cache for next()
        const status = r.found
          ? `<span class="conf conf--high">Found ✓</span>`
          : `<span class="conf conf--low">Not found ✕</span>`;
        return `<div class="vision__read">
            <div class="vision__row"><span class="vision__k">Queried</span><span class="vision__v">${r.system}</span></div>
            <div class="vision__row"><span class="vision__k">${mpxnLabel(currentFuel(a))}</span><span class="vision__v">${escapeHtml(fuelBucket(a).mpxn || '—')}</span></div>
            <div class="vision__row"><span class="vision__k">Result</span><span class="vision__v">${status}</span></div>
          </div>`;
      },
      help: 'This step stands in for the real Kraken lookup. Use the demo controls to change the result.',
      next: (a) => (fuelBucket(a)._lookup.found ? 'NEW_CONN' : 'STOP_ADD_MPXN'),
    },

    STOP_ADD_MPXN: {
      section: 'supply',
      chips: fuelChips,
      kind: 'stop',
      title: 'We can’t find this supply point yet',
      notice: (a) => ({
        type: 'stop',
        title: `${mpxnLabel(currentFuel(a))} not on record`,
        html: `Please contact your <strong>${networkLabel(currentFuel(a))}</strong> to have the ` +
              `${mpxnLabel(currentFuel(a))} added, then come back and complete the form once it’s done.`,
      }),
    },

    NEW_CONN: {
      section: 'supply',
      chips: fuelChips,
      kind: 'info',
      title: 'Checking this is a new connection',
      body: (a) => {
        const isNew = fuelBucket(a)._lookup.newConnection;
        fuelBucket(a).newConnection = isNew;
        return `<div class="vision__read">
            <div class="vision__row"><span class="vision__k">new_connection flag</span>
              <span class="vision__v">${isNew ? '<span class="conf conf--high">True ✓</span>' : '<span class="conf conf--low">False ✕</span>'}</span></div>
          </div>`;
      },
      notice: (a) => fuelBucket(a)._lookup.newConnection ? null : ({
        type: 'flag',
        title: 'Flag & continue',
        html: 'This isn’t flagged as a new connection on record, so we won’t auto-enrol it — our team will check it manually. You can still carry on.',
      }),
      next: (a) => {
        if (!fuelBucket(a)._lookup.newConnection) {
          fuelBucket(a).flags.push('new_connection = FALSE — do NOT auto-enrol, needs manual check');
        }
        return 'ADDRESS';
      },
    },

    ADDRESS: {
      section: 'supply',
      chips: fuelChips,
      kind: 'info',
      title: 'Checking the address on record',
      body: (a) => {
        const match = fuelBucket(a)._lookup.addressMatch;
        return `<div class="vision__read">
            <div class="vision__row"><span class="vision__k">Address on record</span>
              <span class="vision__v">${match ? '<span class="conf conf--high">Matches ✓</span>' : '<span class="conf conf--low">Doesn’t match ✕</span>'}</span></div>
          </div>`;
      },
      help: 'This stands in for matching the property address held against the supply point.',
      next: (a) => (fuelBucket(a)._lookup.addressMatch ? 'SUPPLY_INSTALLED' : 'STOP_ADDRESS'),
    },

    STOP_ADDRESS: {
      section: 'supply',
      chips: fuelChips,
      kind: 'stop',
      title: 'The address doesn’t match',
      notice: (a) => ({
        type: 'stop',
        title: 'Address mismatch',
        html: `Please contact your <strong>${networkLabel(currentFuel(a))}</strong> to have the address fixed, ` +
              `then come back and complete the form once it’s been updated.`,
      }),
    },

    SUPPLY_INSTALLED: {
      section: 'supply',
      chips: fuelChips,
      eyebrow: (a) => `${fuelLabel(currentFuel(a))} supply`,
      title: 'Is the supply point installed?',
      help: (a) => currentFuel(a) === 'electricity'
        ? 'Is there already a cut-out / meter position physically installed at the property?'
        : 'Is there already an Emergency Control Valve (ECV) / meter position physically installed at the property?',
      kind: 'choice',
      choices: (a) => [
        { label: 'Yes, it’s installed', sub: 'I can take a photo of it', icon: '✅',
          pick: (x) => { fuelBucket(x).supplyInstalled = true; return 'PHOTO'; } },
        { label: 'No, not yet', sub: 'The network still needs to install it', icon: '🚧',
          pick: (x) => { fuelBucket(x).supplyInstalled = false; return 'SUPPLY_DATE'; } },
      ],
    },

    SUPPLY_DATE: {
      section: 'supply',
      chips: fuelChips,
      eyebrow: (a) => `${networkLabel(currentFuel(a))} works`,
      title: (a) => `When is the ${networkLabel(currentFuel(a))} due to install the supply point?`,
      help: 'Give the date the network operator has told you they’ll install the connection.',
      kind: 'form',
      fields: () => [
        { name: 'supplyInstallDate', label: 'Planned supply-point installation date', type: 'date', required: true },
      ],
      fuelScoped: true,
      next: () => 'METER_DEADLINE',
    },

    PHOTO: {
      section: 'supply',
      chips: fuelChips,
      eyebrow: (a) => `${fuelLabel(currentFuel(a))} supply`,
      title: (a) => currentFuel(a) === 'electricity'
        ? 'Upload a photo of the cut-out'
        : 'Upload a photo of the ECV / meter position',
      help: 'We’ll check the photo automatically. Any image works for this demo.',
      kind: 'photo',
      next: () => 'VISION',
    },

    VISION: {
      section: 'supply',
      chips: fuelChips,
      kind: 'info',
      title: 'Reading your photo',
      body: (a) => {
        const r = Simulate.visionRead(currentFuel(a));
        fuelBucket(a)._vision = r;
        const rows = r.items.map(i =>
          `<div class="vision__row"><span class="vision__k">${i.k}</span><span class="vision__v">${i.v}</span></div>`).join('');
        const conf = r.confidence === 'high'
          ? `<span class="conf conf--high">High (${r.pct}%)</span>`
          : `<span class="conf conf--low">Low (${r.pct}%)</span>`;
        return `<div class="vision__read">
            ${rows}
            <div class="vision__row"><span class="vision__k">Model confidence</span><span class="vision__v">${conf}</span></div>
          </div>`;
      },
      help: 'This stands in for the meter-photo vision model. Set its confidence in the demo controls.',
      next: (a) => (fuelBucket(a)._vision.confidence === 'high' ? 'METER_DEADLINE' : 'VISION_LOW'),
    },

    VISION_LOW: {
      section: 'supply',
      chips: fuelChips,
      kind: 'choice',
      title: 'We’re not confident about that photo',
      notice: () => ({
        type: 'flag',
        title: 'Low confidence',
        html: 'The image was hard to read. Try a clearer photo, or confirm the details yourself to carry on.',
      }),
      choices: () => [
        { label: 'Upload a different photo', sub: 'Try again with a clearer image', icon: '📸', goto: 'PHOTO' },
        { label: 'Override & continue', sub: 'I confirm the supply point is correct', icon: '👍', ghost: true,
          pick: (a) => { fuelBucket(a).flags.push('Vision low-confidence — customer override'); return 'METER_DEADLINE'; } },
      ],
    },

    // ---------------------------------------------------------------- METER
    METER_DEADLINE: {
      section: 'meter',
      chips: fuelChips,
      eyebrow: (a) => `${fuelLabel(currentFuel(a))} meter`,
      title: (a) => `When do you need the ${fuelLabel(currentFuel(a)).toLowerCase()} meter installed by?`,
      help: 'Tell us your deadline for having the meter fitted. We’ll do our best to meet it.',
      kind: 'form',
      fields: () => [
        { name: 'meterDeadline', label: 'Meter installation deadline', type: 'date', required: true },
      ],
      fuelScoped: true,
      next: (a) => advanceFuel(a),
    },

    // -------------------------------------------------------------- BILLING
    BILLING: {
      section: 'billing',
      eyebrow: 'Billing',
      title: 'Who should we bill?',
      help: 'Choose whether this account is billed to an individual or a business.',
      kind: 'choice',
      choices: () => [
        { label: 'An individual', sub: 'Billed to a named person', icon: '👤',
          pick: (a) => { a.billingType = 'individual'; return 'CUSTOMER'; } },
        { label: 'A business', sub: 'Billed to a company', icon: '🏢',
          pick: (a) => { a.billingType = 'business'; return 'BUSINESS'; } },
      ],
    },

    BUSINESS: {
      section: 'billing',
      eyebrow: 'Business details',
      title: 'Tell us about the business',
      kind: 'form',
      fields: () => [
        { name: 'companyName', label: 'Registered company name', type: 'text', required: true },
        { name: 'companyNumber', label: 'Company number', type: 'text', required: true, half: true,
          placeholder: 'e.g. 01234567' },
        { name: 'vatNumber', label: 'VAT number (optional)', type: 'text', half: true },
        { name: 'billingAddress', label: 'Billing address', type: 'textarea', required: true },
      ],
      next: () => 'AUTH_USER',
    },

    AUTH_USER: {
      section: 'billing',
      eyebrow: 'Business details',
      title: 'Who’s the authorised user?',
      help: 'The person authorised to manage this account on behalf of the business.',
      kind: 'form',
      fields: () => [
        { name: 'authName', label: 'Full name', type: 'text', required: true },
        { name: 'authRole', label: 'Role / job title', type: 'text', half: true },
        { name: 'authEmail', label: 'Email address', type: 'email', required: true, half: true },
      ],
      next: () => 'CUSTOMER',
    },

    CUSTOMER: {
      section: 'billing',
      eyebrow: 'Your details',
      title: (a) => a.billingType === 'business' ? 'Main contact details' : 'Your details',
      help: 'We’ll use these to set up the account and keep you updated.',
      kind: 'form',
      fields: () => [
        { name: 'firstName', label: 'First name', type: 'text', required: true, half: true },
        { name: 'lastName', label: 'Last name', type: 'text', required: true, half: true },
        { name: 'email', label: 'Email address', type: 'email', required: true },
        { name: 'phone', label: 'Phone number', type: 'tel', required: true, half: true },
        { name: 'dob', label: 'Date of birth', type: 'date', required: true, half: true },
      ],
      next: () => 'OCCUPIED',
    },

    // -------------------------------------------------------------- CONFIRM
    OCCUPIED: {
      section: 'confirm',
      eyebrow: 'The property',
      title: 'Is the property occupied?',
      kind: 'choice',
      choices: () => [
        { label: 'Yes, it’s occupied', sub: 'Someone lives / works there now', icon: '🏠',
          pick: (a) => { a.occupied = true; return 'PSR'; } },
        { label: 'No, it’s unoccupied', sub: 'Empty for now', icon: '📦',
          pick: (a) => { a.occupied = false; return 'MOVE_IN'; } },
      ],
    },

    MOVE_IN: {
      section: 'confirm',
      eyebrow: 'The property',
      title: 'When are you moving in?',
      help: 'Give the date you expect to move in or occupy the property.',
      kind: 'form',
      fields: () => [
        { name: 'moveInDate', label: 'Move-in date', type: 'date', required: true },
      ],
      next: () => 'PSR',
    },

    PSR: {
      section: 'confirm',
      eyebrow: 'Priority Services Register',
      title: 'Does anyone at the property need extra support?',
      help: 'The Priority Services Register (PSR) is a free service for extra help. Tick anything that applies — none is fine too.',
      kind: 'form',
      fields: () => [
        { name: 'psrMedical', label: 'Someone relies on medical equipment that needs power', type: 'checkbox' },
        { name: 'psrMobility', label: 'Someone has mobility, sight, hearing or mental-health needs', type: 'checkbox' },
        { name: 'psrOther', label: 'Other support needs (please describe)', type: 'textarea' },
        { name: 'psrContact', label: 'Best contact number for priority support (optional)', type: 'tel' },
      ],
      next: () => 'TERMS',
    },

    TERMS: {
      section: 'confirm',
      eyebrow: 'Almost there',
      title: 'Do you accept the terms?',
      help: 'Please confirm you’ve read and accept our terms and conditions and privacy policy.',
      kind: 'choice',
      choices: () => [
        { label: 'I accept the terms', sub: 'I’ve read and agree to the terms & privacy policy', icon: '✅',
          pick: (a) => { a.termsAccepted = true; return 'SUCCESS'; } },
        { label: 'I don’t accept', sub: 'I’m not ready to agree', icon: '✋', ghost: true,
          pick: (a) => { a.termsAccepted = false; return 'STOP_TERMS'; } },
      ],
    },

    STOP_TERMS: {
      section: 'confirm',
      kind: 'stop',
      title: 'We need your agreement to continue',
      notice: () => ({
        type: 'stop',
        title: 'Terms not accepted',
        html: 'The terms need to be accepted before we can set up your new connection. When you’re ready, head back and accept to finish.',
      }),
      backTo: 'TERMS',
    },

    SUCCESS: {
      section: 'confirm',
      kind: 'success',
      title: 'You’re all set! 🎉',
      notice: () => ({
        type: 'success',
        title: 'Sending you to Kraken',
        html: 'We’ve started your onboarding. In the real system this fires a hook to kick off the Kraken flow. ' +
              'Here’s the payload we’d send:',
      }),
      body: (a) => `<pre class="payload">${escapeHtml(JSON.stringify(buildPayload(a), null, 2))}</pre>`,
      hideBack: true,
    },
  },
};

// Set up the per-fuel processing queue when fuels are chosen.
function startQueue(a, fuels) {
  a._queue = fuels;
  a._currentIndex = 0;
  fuels.forEach((f) => { a[f] = { flags: [] }; });
}

// Assemble the "webhook" body from everything collected.
function buildPayload(a) {
  const supplies = (a._queue || []).map((f) => ({
    fuel: f,
    mpxn: a[f].mpxn || null,
    mpxnKnown: a[f].mpxnKnown !== false,
    newConnection: a[f].newConnection ?? null,
    supplyInstalled: a[f].supplyInstalled ?? null,
    supplyInstallDate: a[f].supplyInstallDate || null,
    photoAnalysed: !!a[f]._vision,
    visionConfidence: a[f]._vision ? a[f]._vision.confidence : null,
    meterDeadline: a[f].meterDeadline || null,
    flags: a[f].flags,
  }));
  const payload = {
    event: 'new_connection.onboarding.completed',
    site: { type: 'domestic' },
    supplies,
    billing: { type: a.billingType || null },
    property: { occupied: a.occupied ?? null, moveInDate: a.moveInDate || null },
    psr: {
      medicalEquipment: !!a.psrMedical,
      mobilitySensoryMentalHealth: !!a.psrMobility,
      other: a.psrOther || null,
      contact: a.psrContact || null,
    },
    termsAccepted: !!a.termsAccepted,
  };
  if (a.billingType === 'business') {
    payload.business = {
      companyName: a.companyName, companyNumber: a.companyNumber,
      vatNumber: a.vatNumber || null, billingAddress: a.billingAddress,
      authorisedUser: { name: a.authName, role: a.authRole || null, email: a.authEmail },
    };
  }
  payload.customer = {
    firstName: a.firstName, lastName: a.lastName,
    email: a.email, phone: a.phone, dateOfBirth: a.dob,
  };
  return payload;
}

// Tiny HTML escaper (used for injected values & the payload dump).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
