/* ═══════════════════════════════════════════════════════════
   SAYATHUB — app.js  (Main Application Logic)
   Requires: firebase-config.js loaded first
═══════════════════════════════════════════════════════════ */
"use strict";

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
const STATE = {
  user:            null,   // Firebase auth user
  role:            null,   // 'school' | 'student' | 'business'
  orgData:         null,   // Firestore org document data
  selectedClassId: null,   // School: currently selected class
  selectedClassData: null,
  editStudentId:   null,   // null = add new, string = edit
  editTxId:        null,
  confirmCallback: null,   // function to run on confirm delete
  studentVerified: null,   // Step 1 result during student reg
  otpConfirmation: null,   // Firebase phone auth confirmation
  recaptchaVerifier: null,
  unsubscribers:   [],     // Firestore listeners to clean up
  theme:           localStorage.getItem('sh-theme') || 'dark',
  sayaiKey:        'YOUR_ANTHROPIC_API_KEY', // 👉 paste your key here
};

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const s = $(id);
  if (s) s.classList.add('active');
}

function openModal(id)  { const m = $(id); if (m) m.classList.add('open'); }
function closeModal(id) { const m = $(id); if (m) m.classList.remove('open'); }
function closeAllModals() { $$('.modal-bg').forEach(m => m.classList.remove('open')); }

function toast(msg, type = 'success') {
  const el = $('toast');
  $('toastMsg').textContent = msg;
  $('toastIco').textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

function setLoading(btn, loading) {
  const text   = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  if (!text || !loader) return;
  text.style.display   = loading ? 'none'  : '';
  loader.style.display = loading ? ''      : 'none';
  btn.disabled = loading;
}

function formatCurrency(n) {
  if (n === undefined || n === null) return '৳0';
  return '৳' + Number(n).toLocaleString('en-IN');
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function shortName(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
}

function setBreadcrumb(a, b) {
  const bc = $('navBreadcrumb');
  if (!a) { bc.style.display = 'none'; return; }
  bc.style.display = 'flex';
  $('bc1').textContent = a;
  $('bcsep1').style.display = b ? '' : 'none';
  $('bc2').textContent = b || '';
}

function setWatermark(url) {
  const el = $('bgWatermark');
  if (url) {
    el.style.backgroundImage = `url('${url}')`;
    el.style.opacity = STATE.theme === 'dark' ? '0.035' : '0.055';
  } else {
    el.style.backgroundImage = '';
  }
}

function unsubAll() {
  STATE.unsubscribers.forEach(fn => { try { fn(); } catch(e) {} });
  STATE.unsubscribers = [];
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function getCurrentMonthKey() {
  const d = new Date();
  return `${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════
function applyTheme(theme) {
  STATE.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sh-theme', theme);
  $('iconMoon').style.display = theme === 'dark'  ? '' : 'none';
  $('iconSun').style.display  = theme === 'light' ? '' : 'none';
  const toggle = $('darkModeToggle');
  if (toggle) toggle.checked = theme === 'dark';
  // update watermark opacity
  const wm = $('bgWatermark');
  if (wm.style.backgroundImage) {
    wm.style.opacity = theme === 'dark' ? '0.035' : '0.055';
  }
}

// ═══════════════════════════════════════════════════════════
//  DOM READY
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(STATE.theme);
  initNav();
  initLanding();
  initSchoolAuth();
  initStudentAuth();
  initBusinessAuth();
  initModals();
  initSettings();
  initSayAI();
  watchAuth();
});

// ═══════════════════════════════════════════════════════════
//  NAV
// ═══════════════════════════════════════════════════════════
function initNav() {
  $('logoHome').addEventListener('click', () => {
    if (STATE.user) {
      // go to own dashboard
      goToDashboard();
    } else {
      showScreen('screen-landing');
      setBreadcrumb(null);
      $('globalBackBtn').style.display = 'none';
    }
  });

  $('globalBackBtn').addEventListener('click', () => history.back());

  $('themeToggleBtn').addEventListener('click', () => {
    applyTheme(STATE.theme === 'dark' ? 'light' : 'dark');
  });

  $('helpBtn').addEventListener('click', () => openModal('modal-help'));

  $('logoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) doLogout();
  });

  $('settingsBtn').addEventListener('click', () => openModal('modal-settings'));
}

function goToDashboard() {
  if (STATE.role === 'school')   { showScreen('screen-school-dash');   setBreadcrumb('School', 'Dashboard'); }
  if (STATE.role === 'student')  { showScreen('screen-student-dash');  setBreadcrumb('School', 'My Profile'); }
  if (STATE.role === 'business') { showScreen('screen-biz-dash');      setBreadcrumb('Business', 'Dashboard'); }
}

// ═══════════════════════════════════════════════════════════
//  LANDING
// ═══════════════════════════════════════════════════════════
function initLanding() {
  $$('.module-card').forEach(card => {
    card.addEventListener('click', () => {
      const mod = card.dataset.module;
      if (mod === 'school') {
        showScreen('screen-school-sub');
        setBreadcrumb('School', 'Choose Role');
        $('globalBackBtn').style.display = '';
        initSchoolSub();
      }
      if (mod === 'business') {
        showScreen('screen-business-auth');
        setBreadcrumb('Business', 'Login');
        $('globalBackBtn').style.display = '';
      }
    });
  });
}

function initSchoolSub() {
  $$('.sub-card').forEach(card => {
    card.addEventListener('click', () => {
      const sub = card.dataset.sub;
      if (sub === 'admin') {
        showScreen('screen-school-auth');
        setBreadcrumb('School', 'Admin Login');
      }
      if (sub === 'student') {
        showScreen('screen-student-auth');
        setBreadcrumb('School', 'Student Login');
        initRecaptcha();
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  AUTH TABS  (reusable)
// ═══════════════════════════════════════════════════════════
function initAuthTabs() {
  $$('.auth-tabs').forEach(tabsEl => {
    tabsEl.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const parent = tab.closest('.auth-card');
        parent.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const key = tab.dataset.tab;
        parent.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        const pane = parent.querySelector('#pane-' + key);
        if (pane) pane.classList.add('active');
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  SCHOOL AUTH
// ═══════════════════════════════════════════════════════════
function initSchoolAuth() {
  initAuthTabs();

  // Logo upload preview
  $('schoolLogoBtn').addEventListener('click', () => $('schoolLogoInput').click());
  $('schoolLogoInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const prev = $('schoolLogoPreview');
      prev.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
    };
    reader.readAsDataURL(file);
  });

  // Eye buttons
  initEyeBtns();

  // Login
  $('schoolLoginBtn').addEventListener('click', async () => {
    const email = $('sl-email').value.trim();
    const pass  = $('sl-pass').value;
    $('sl-error').textContent = '';
    if (!email || !pass) { $('sl-error').textContent = 'Please fill in all fields.'; return; }
    setLoading($('schoolLoginBtn'), true);
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged handles the rest
    } catch(e) {
      $('sl-error').textContent = friendlyAuthError(e.code);
      setLoading($('schoolLoginBtn'), false);
    }
  });

  // Register
  $('schoolRegBtn').addEventListener('click', async () => {
    const name     = $('sr-name').value.trim();
    const code     = $('sr-code').value.trim().toUpperCase();
    const district = $('sr-district').value.trim();
    const email    = $('sr-email').value.trim();
    const pass     = $('sr-pass').value;
    const pass2    = $('sr-pass2').value;
    $('sr-error').textContent = '';

    if (!name || !code || !email || !pass) { $('sr-error').textContent = 'Please fill in all required fields.'; return; }
    if (pass !== pass2)   { $('sr-error').textContent = 'Passwords do not match.'; return; }
    if (pass.length < 6)  { $('sr-error').textContent = 'Password must be at least 6 characters.'; return; }
    if (code.length < 3)  { $('sr-error').textContent = 'School code must be at least 3 characters.'; return; }

    setLoading($('schoolRegBtn'), true);
    try {
      // Check code uniqueness
      const snap = await db.collection('schools').where('uniqueCode','==',code).get();
      if (!snap.empty) { $('sr-error').textContent = 'This school code is already taken. Choose another.'; setLoading($('schoolRegBtn'), false); return; }

      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const uid  = cred.user.uid;

      // Upload logo if selected
      let logoUrl = '';
      const logoFile = $('schoolLogoInput').files[0];
      if (logoFile) {
        const ref  = storage.ref(`logos/schools/${uid}`);
        await ref.put(logoFile);
        logoUrl = await ref.getDownloadURL();
      }

      // Save to Firestore
      await db.collection('schools').doc(uid).set({
        name: name,
        uniqueCode: code,
        district: district,
        email: email,
        logoUrl: logoUrl,
        ownerId: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Save user profile
      await db.collection('users').doc(uid).set({
        role: 'school',
        name: name,
        email: email,
        orgId: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      toast('School registered successfully!');
      // onAuthStateChanged will handle redirect
    } catch(e) {
      $('sr-error').textContent = friendlyAuthError(e.code) || e.message;
      setLoading($('schoolRegBtn'), false);
    }
  });

  // Forgot password
  $('forgotPassSchool').addEventListener('click', () => sendPasswordReset($('sl-email').value.trim()));
}

// ═══════════════════════════════════════════════════════════
//  STUDENT AUTH
// ═══════════════════════════════════════════════════════════
function initRecaptcha() {
  if (STATE.recaptchaVerifier) return;
  try {
    STATE.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
      callback: () => {},
    });
  } catch(e) { console.warn('reCAPTCHA init error', e); }
}

function initStudentAuth() {
  // Toggle email login
  $('toggleStudentLogin').addEventListener('click', () => {
    $('studentEmailLoginPanel').style.display = '';
    $('studentRegPanel').style.display = 'none';
    $('toggleStudentLogin').style.display = 'none';
  });
  $('toggleStudentReg').addEventListener('click', () => {
    $('studentEmailLoginPanel').style.display = 'none';
    $('studentRegPanel').style.display = '';
    $('toggleStudentLogin').style.display = '';
  });

  // Email login
  $('studentEmailLoginBtn').addEventListener('click', async () => {
    const email = $('sel-email').value.trim();
    const pass  = $('sel-pass').value;
    $('sel-error').textContent = '';
    if (!email || !pass) { $('sel-error').textContent = 'Please fill in all fields.'; return; }
    setLoading($('studentEmailLoginBtn'), true);
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch(e) {
      $('sel-error').textContent = friendlyAuthError(e.code);
      setLoading($('studentEmailLoginBtn'), false);
    }
  });

  // Step 1: Verify school + ID card
  $('step1NextBtn').addEventListener('click', async () => {
    const code   = $('s1-code').value.trim().toUpperCase();
    const idCard = $('s1-idcard').value.trim();
    const cls    = $('s1-class').value;
    const roll   = parseInt($('s1-roll').value);
    $('s1-error').textContent = '';

    if (!code || !idCard || !cls || !roll) { $('s1-error').textContent = 'Please fill in all fields.'; return; }

    setLoading($('step1NextBtn'), true);
    try {
      // Find school
      const schoolSnap = await db.collection('schools').where('uniqueCode','==',code).get();
      if (schoolSnap.empty) { $('s1-error').textContent = 'School code not found.'; setLoading($('step1NextBtn'), false); return; }

      const schoolDoc  = schoolSnap.docs[0];
      const schoolId   = schoolDoc.id;
      const schoolData = schoolDoc.data();

      // Find student in that school's classes
      // Find all classes
      const classesSnap = await db.collection('schools').doc(schoolId).collection('classes').get();
      let foundStudent = null, foundClassId = null;

      for (const classDoc of classesSnap.docs) {
        const stuSnap = await db.collection('schools').doc(schoolId)
          .collection('classes').doc(classDoc.id)
          .collection('students')
          .where('idCardNo','==', idCard)
          .where('roll','==', roll)
          .get();

        if (!stuSnap.empty) {
          const stuDoc = stuSnap.docs[0];
          const stuData = stuDoc.data();
          // Also verify class name
          if (classDoc.data().name === cls) {
            foundStudent = { id: stuDoc.id, ...stuData };
            foundClassId = classDoc.id;
            break;
          }
        }
      }

      if (!foundStudent) {
        $('s1-error').textContent = 'No student found with these details. Check your ID card number, class, and roll number.';
        setLoading($('step1NextBtn'), false);
        return;
      }

      // Check if already registered
      if (foundStudent.registeredUid) {
        $('s1-error').textContent = 'This student account is already registered. Please use Email Login.';
        setLoading($('step1NextBtn'), false);
        return;
      }

      STATE.studentVerified = {
        schoolId, schoolData, classId: foundClassId,
        studentId: foundStudent.id, studentData: foundStudent,
      };

      // Show verified box
      const vBox = $('verifiedBox');
      vBox.style.display = '';
      $('verifiedBoxText').innerHTML = `
        <strong>${foundStudent.name}</strong><br>
        ${schoolData.name} · ${cls} · Roll ${roll}
      `;

      goToStep(2);
    } catch(e) {
      $('s1-error').textContent = 'Error: ' + e.message;
    }
    setLoading($('step1NextBtn'), false);
  });

  // Step 2: Send OTP
  $('sendOTPBtn').addEventListener('click', async () => {
    const phone = $('s2-phone').value.trim();
    $('s2-error').textContent = '';
    if (!phone || phone.length < 10) { $('s2-error').textContent = 'Please enter a valid phone number.'; return; }

    const expectedPhone = STATE.studentVerified?.studentData?.contact;
    if (expectedPhone) {
      const clean = expectedPhone.replace(/\D/g,'').slice(-10);
      const entered = phone.replace(/\D/g,'').slice(-10);
      if (clean !== entered) {
        $('s2-error').textContent = 'This phone number does not match the one registered by your school.';
        return;
      }
    }

    const fullPhone = '+880' + phone.replace(/^0/,'');
    setLoading($('sendOTPBtn'), true);
    try {
      STATE.otpConfirmation = await auth.signInWithPhoneNumber(fullPhone, STATE.recaptchaVerifier);
      $('otpInputArea').style.display = '';
      $('sendOTPBtn').style.display = 'none';
      // Focus first OTP box
      $$('.otp-box')[0].focus();
      toast('OTP sent to your phone!', 'info');
    } catch(e) {
      $('s2-error').textContent = 'Failed to send OTP: ' + (e.message || e.code);
    }
    setLoading($('sendOTPBtn'), false);
  });

  // OTP box auto-advance
  $$('.otp-box').forEach((box, i) => {
    box.addEventListener('input', () => {
      const val = box.value.replace(/\D/g,'');
      box.value = val.slice(-1);
      if (val && i < 5) $$('.otp-box')[i+1].focus();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) $$('.otp-box')[i-1].focus();
    });
  });

  // Verify OTP
  $('verifyOTPBtn').addEventListener('click', async () => {
    const code = Array.from($$('.otp-box')).map(b => b.value).join('');
    $('otp-error').textContent = '';
    if (code.length < 6) { $('otp-error').textContent = 'Please enter the full 6-digit OTP.'; return; }
    if (!STATE.otpConfirmation) { $('otp-error').textContent = 'Please send OTP first.'; return; }
    setLoading($('verifyOTPBtn'), true);
    try {
      const result = await STATE.otpConfirmation.confirm(code);
      // Phone verified — go to step 3
      // Pre-fill name from school record
      const sName = STATE.studentVerified?.studentData?.name || '';
      $('s3-name').value = sName;
      goToStep(3);
      // Delete phone auth user (we'll re-create with email)
      // Actually keep the phone auth user, link email later
    } catch(e) {
      $('otp-error').textContent = 'Invalid OTP. Please try again.';
    }
    setLoading($('verifyOTPBtn'), false);
  });

  // Resend OTP
  $('resendOTPBtn').addEventListener('click', () => {
    $('otpInputArea').style.display = 'none';
    $('sendOTPBtn').style.display = '';
    STATE.otpConfirmation = null;
  });

  // Step 3: Complete registration
  $('completeRegBtn').addEventListener('click', async () => {
    const name  = $('s3-name').value.trim();
    const email = $('s3-email').value.trim();
    const pass  = $('s3-pass').value;
    const pass2 = $('s3-pass2').value;
    $('s3-error').textContent = '';

    if (!name || !email || !pass) { $('s3-error').textContent = 'Please fill in all fields.'; return; }
    if (pass !== pass2)  { $('s3-error').textContent = 'Passwords do not match.'; return; }
    if (pass.length < 6) { $('s3-error').textContent = 'Password must be at least 6 characters.'; return; }

    setLoading($('completeRegBtn'), true);
    try {
      const { schoolId, classId, studentId, schoolData, studentData } = STATE.studentVerified;

      // Create email/pass account (phone user may exist)
      let uid;
      if (auth.currentUser) {
        // Link email/pass to existing phone auth user
        const emailCred = firebase.auth.EmailAuthProvider.credential(email, pass);
        await auth.currentUser.linkWithCredential(emailCred);
        uid = auth.currentUser.uid;
      } else {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        uid = cred.user.uid;
      }

      // Save user profile
      await db.collection('users').doc(uid).set({
        role:      'student',
        name:      name,
        email:     email,
        schoolId:  schoolId,
        classId:   classId,
        studentId: studentId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Mark student as registered in school
      await db.collection('schools').doc(schoolId)
        .collection('classes').doc(classId)
        .collection('students').doc(studentId)
        .update({ registeredUid: uid, registeredEmail: email });

      toast('Registration complete! Welcome to SayatHub 🎉');
      // onAuthStateChanged handles redirect
    } catch(e) {
      $('s3-error').textContent = friendlyAuthError(e.code) || e.message;
    }
    setLoading($('completeRegBtn'), false);
  });
}

function goToStep(num) {
  $$('.reg-step').forEach((s, i) => s.classList.toggle('active', i+1 === num));
  // Update step dots
  for (let i = 1; i <= 3; i++) {
    const dot  = $('stepDot' + i);
    const line = $('stepLine' + (i<3 ? i : ''));
    if (!dot) continue;
    dot.classList.remove('step-active','step-done');
    if (i < num)  dot.classList.add('step-done');
    if (i === num) dot.classList.add('step-active');
    if (line && i < num) line.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════════════
//  BUSINESS AUTH
// ═══════════════════════════════════════════════════════════
function initBusinessAuth() {
  // Logo upload
  $('bizLogoBtn').addEventListener('click', () => $('bizLogoInput').click());
  $('bizLogoInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const prev = $('bizLogoPreview');
      prev.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
    };
    reader.readAsDataURL(file);
  });

  // Login
  $('bizLoginBtn').addEventListener('click', async () => {
    const email = $('bl-email').value.trim();
    const pass  = $('bl-pass').value;
    $('bl-error').textContent = '';
    if (!email || !pass) { $('bl-error').textContent = 'Please fill in all fields.'; return; }
    setLoading($('bizLoginBtn'), true);
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch(e) {
      $('bl-error').textContent = friendlyAuthError(e.code);
      setLoading($('bizLoginBtn'), false);
    }
  });

  // Register
  $('bizRegBtn').addEventListener('click', async () => {
    const bizName  = $('br-bizname').value.trim();
    const type     = $('br-type').value;
    const phone    = $('br-phone').value.trim();
    const owner    = $('br-owner').value.trim();
    const district = $('br-district').value.trim();
    const address  = $('br-address').value.trim();
    const email    = $('br-email').value.trim();
    const pass     = $('br-pass').value;
    const pass2    = $('br-pass2').value;
    $('br-error').textContent = '';

    if (!bizName || !type || !phone || !owner || !email || !pass) { $('br-error').textContent = 'Please fill in all required fields.'; return; }
    if (pass !== pass2)  { $('br-error').textContent = 'Passwords do not match.'; return; }
    if (pass.length < 6) { $('br-error').textContent = 'Password must be at least 6 characters.'; return; }

    setLoading($('bizRegBtn'), true);
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const uid  = cred.user.uid;

      let logoUrl = '';
      const logoFile = $('bizLogoInput').files[0];
      if (logoFile) {
        const ref = storage.ref(`logos/businesses/${uid}`);
        await ref.put(logoFile);
        logoUrl = await ref.getDownloadURL();
      }

      await db.collection('businesses').doc(uid).set({
        name: bizName, type, phone, ownerName: owner,
        district, address, email, logoUrl, ownerId: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('users').doc(uid).set({
        role: 'business', name: owner, email, orgId: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      toast('Business account created!');
    } catch(e) {
      $('br-error').textContent = friendlyAuthError(e.code) || e.message;
      setLoading($('bizRegBtn'), false);
    }
  });

  $('forgotPassBiz').addEventListener('click', () => sendPasswordReset($('bl-email').value.trim()));
}

// ═══════════════════════════════════════════════════════════
//  AUTH STATE
// ═══════════════════════════════════════════════════════════
function watchAuth() {
  $('pageLoader').style.display = 'flex';
  auth.onAuthStateChanged(async user => {
    if (user) {
      STATE.user = user;
      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
          // New phone-only user, not yet in DB — let step 3 handle
          $('pageLoader').classList.add('hidden');
          return;
        }
        const userData = userDoc.data();
        STATE.role = userData.role;

        if (STATE.role === 'school') {
          await loadSchoolDashboard(user.uid);
        } else if (STATE.role === 'student') {
          await loadStudentDashboard(userData);
        } else if (STATE.role === 'business') {
          await loadBusinessDashboard(user.uid);
        }

        $('logoutBtn').style.display  = '';
        $('settingsBtn').style.display = '';
        $('globalBackBtn').style.display = 'none';
      } catch(e) {
        console.error('Auth load error', e);
      }
    } else {
      STATE.user = null; STATE.role = null; STATE.orgData = null;
      unsubAll();
      $('logoutBtn').style.display   = 'none';
      $('settingsBtn').style.display = 'none';
      showScreen('screen-landing');
      setBreadcrumb(null);
    }
    setTimeout(() => $('pageLoader').classList.add('hidden'), 400);
  });
}

async function doLogout() {
  unsubAll();
  await auth.signOut();
  setWatermark('');
  toast('Logged out.', 'info');
}

// ═══════════════════════════════════════════════════════════
//  SCHOOL DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadSchoolDashboard(schoolId) {
  const snap = await db.collection('schools').doc(schoolId).get();
  if (!snap.exists) return;
  STATE.orgData = { id: schoolId, ...snap.data() };

  $('schoolDashName').textContent = STATE.orgData.name;
  $('schoolDashMeta').textContent = `Code: ${STATE.orgData.uniqueCode}`;

  if (STATE.orgData.logoUrl) {
    setWatermark(STATE.orgData.logoUrl);
    $('schoolDashLogo').innerHTML = `<img src="${STATE.orgData.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
  }

  showScreen('screen-school-dash');
  setBreadcrumb('School', STATE.orgData.name);
  loadClasses(schoolId);
  initSchoolDashEvents(schoolId);
}

function loadClasses(schoolId) {
  const unsub = db.collection('schools').doc(schoolId).collection('classes')
    .orderBy('order','asc')
    .onSnapshot(snap => {
      STATE.classDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      $('s-stat-classes').textContent = snap.size;
      renderClassList(snap.docs, schoolId);
      updateSchoolStats(schoolId);
    });
  STATE.unsubscribers.push(unsub);
}

function renderClassList(docs, schoolId) {
  const colors = ['#60A5FA','#A78BFA','#4ADE80','#FBBF24','#F472B6','#34D399','#FB923C','#38BDF8','#818CF8','#A3E635'];
  const list = $('classList');
  if (docs.length === 0) {
    list.innerHTML = `<div class="empty-hint"><span>📚</span><p>No classes yet.<br>Click "+ Add Class".</p></div>`;
    return;
  }
  list.innerHTML = docs.map((doc, i) => {
    const d = doc.data();
    const color = colors[i % colors.length];
    const selected = STATE.selectedClassId === doc.id ? 'selected' : '';
    return `
      <div class="class-item ${selected}" data-id="${doc.id}" data-name="${d.name}" data-fee="${d.defaultFee||0}">
        <div class="class-item-l">
          <div class="class-dot" style="background:${color}"></div>
          <span class="class-name">${d.name}${d.section?' — '+d.section:''}</span>
        </div>
        <span class="class-count" id="cc-${doc.id}">… students</span>
      </div>`;
  }).join('');

  // Attach clicks
  list.querySelectorAll('.class-item').forEach(item => {
    item.addEventListener('click', () => {
      STATE.selectedClassId   = item.dataset.id;
      STATE.selectedClassData = { name: item.dataset.name, defaultFee: item.dataset.fee };
      list.querySelectorAll('.class-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      $('studentsPanelTitle').textContent = `👥 ${item.dataset.name}`;
      $('addStudentBtn').style.display = '';
      $('deleteClassBtn').style.display = '';
      $('feeMonthBar').style.display = '';
      loadStudents(schoolId, item.dataset.id);
    });
  });

  // Count students per class
  docs.forEach(doc => {
    db.collection('schools').doc(schoolId).collection('classes').doc(doc.id)
      .collection('students').get()
      .then(s => {
        const el = $('cc-' + doc.id);
        if (el) el.textContent = s.size + ' student' + (s.size !== 1 ? 's' : '');
      });
  });
}

function loadStudents(schoolId, classId) {
  // Unsubscribe previous student listener
  if (STATE._stuUnsub) { STATE._stuUnsub(); STATE._stuUnsub = null; }

  const monthKey = getSelectedMonthKey();
  const unsub = db.collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('students').orderBy('roll','asc')
    .onSnapshot(snap => {
      renderStudentList(snap.docs, schoolId, classId, monthKey);
      updateSchoolStats(schoolId);
    });
  STATE._stuUnsub = unsub;
}

function renderStudentList(docs, schoolId, classId, monthKey) {
  const list = $('studentList');
  const search = $('studentSearch').value.toLowerCase();

  if (docs.length === 0) {
    list.innerHTML = `<div class="empty-hint"><span>👤</span><p>No students yet.<br>Click "+ Add Student".</p></div>`;
    return;
  }

  const filtered = docs.filter(d => {
    const name = (d.data().name || '').toLowerCase();
    const roll = String(d.data().roll || '');
    return !search || name.includes(search) || roll.includes(search);
  });

  list.innerHTML = '';
  filtered.forEach(doc => {
    const d = doc.data();
    const initial = shortName(d.name);
    const div = document.createElement('div');
    div.className = 'student-card';
    div.dataset.id = doc.id;

    div.innerHTML = `
      <div class="stu-avatar">
        ${d.photoUrl ? `<img src="${d.photoUrl}" alt="">` : initial}
      </div>
      <div class="stu-info">
        <div class="stu-name">${d.name || '—'}</div>
        <div class="stu-roll">Roll ${d.roll} · ID: ${d.idCardNo || '—'}</div>
      </div>
      <span class="fee-chip fee-not-set" id="fee-chip-${doc.id}">—</span>
      <button class="stu-toggle-btn" data-sid="${doc.id}" title="Toggle Fee">↕</button>
    `;

    // Load fee status async
    db.collection('schools').doc(schoolId)
      .collection('classes').doc(classId)
      .collection('students').doc(doc.id)
      .collection('fees').doc(monthKey).get()
      .then(feeDoc => {
        const chip = $(`fee-chip-${doc.id}`);
        if (!chip) return;
        if (!feeDoc.exists) {
          chip.textContent = 'Not Set'; chip.className = 'fee-chip fee-not-set';
        } else {
          const fd = feeDoc.data();
          if (fd.status === 'paid') {
            chip.textContent = '✓ Paid'; chip.className = 'fee-chip fee-paid';
          } else {
            chip.textContent = `৳${fd.amount||0} Due`; chip.className = 'fee-chip fee-unpaid';
          }
        }
      });

    // Open detail on card click
    div.addEventListener('click', e => {
      if (e.target.classList.contains('stu-toggle-btn')) return;
      openStudentDetail(doc.id, d, schoolId, classId, monthKey);
    });

    // Toggle fee paid/unpaid
    div.querySelector('.stu-toggle-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const feeRef = db.collection('schools').doc(schoolId)
        .collection('classes').doc(classId)
        .collection('students').doc(doc.id)
        .collection('fees').doc(monthKey);
      const feeDoc = await feeRef.get();
      if (!feeDoc.exists) { toast('Fee not set for this month. Use "Set Fee (All)" first.', 'error'); return; }
      const current = feeDoc.data().status;
      await feeRef.update({ status: current === 'paid' ? 'unpaid' : 'paid' });
      toast(current === 'paid' ? 'Marked as Unpaid' : 'Marked as Paid ✓');
    });

    list.appendChild(div);
  });
}

function openStudentDetail(stuId, stuData, schoolId, classId, monthKey) {
  STATE.editStudentId = stuId;
  $('detailModalName').textContent = stuData.name || 'Student Details';

  const initial = shortName(stuData.name);
  $('studentDetailBody').innerHTML = `
    <div class="detail-grid">
      <div class="detail-photo">
        ${stuData.photoUrl ? `<img src="${stuData.photoUrl}" alt="">` : initial}
      </div>
      <div class="detail-info-list">
        <div class="detail-info-item"><span class="detail-info-key">Full Name</span><span class="detail-info-val">${stuData.name||'—'}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">Roll Number</span><span class="detail-info-val">${stuData.roll||'—'}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">ID Card No.</span><span class="detail-info-val">${stuData.idCardNo||'—'}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">Date of Birth</span><span class="detail-info-val">${formatDate(stuData.dob)}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">Address</span><span class="detail-info-val">${stuData.address||'—'}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">Contact</span><span class="detail-info-val">${stuData.contact||'—'}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">Guardian</span><span class="detail-info-val">${stuData.guardian||'—'}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">Blood Group</span><span class="detail-info-val">${stuData.blood||'—'}</span></div>
        <div class="detail-info-item"><span class="detail-info-key">Monthly Fee</span><span class="detail-info-val">${formatCurrency(stuData.monthlyFee)}</span></div>
      </div>
    </div>
    <div class="detail-fee-section" id="detailFeeSection">
      <h4>💰 Recent Fee Status (loading...)</h4>
    </div>
  `;

  // Load fee rows
  loadDetailFees(stuId, schoolId, classId);
  openModal('modal-student-detail');

  $('detailDeleteBtn').onclick = () => {
    closeModal('modal-student-detail');
    showConfirm(`Delete student "${stuData.name}"? All their data will be removed.`, async () => {
      await db.collection('schools').doc(schoolId)
        .collection('classes').doc(classId)
        .collection('students').doc(stuId).delete();
      toast('Student deleted.', 'info');
    });
  };

  $('detailEditBtn').onclick = () => {
    closeModal('modal-student-detail');
    openEditStudentModal(stuId, stuData);
  };
}

async function loadDetailFees(stuId, schoolId, classId) {
  const section = $('detailFeeSection');
  if (!section) return;
  const year = new Date().getFullYear();
  let html = '<h4>💰 Fee Status — ' + year + '</h4>';
  let total = 0, paid = 0;
  for (let m = 1; m <= 12; m++) {
    const key = `${String(m).padStart(2,'0')}-${year}`;
    const feeDoc = await db.collection('schools').doc(schoolId)
      .collection('classes').doc(classId)
      .collection('students').doc(stuId)
      .collection('fees').doc(key).get();
    if (feeDoc.exists) {
      const fd = feeDoc.data();
      total += fd.amount || 0;
      if (fd.status === 'paid') paid += fd.amount || 0;
      html += `
        <div class="detail-fee-row">
          <span>${MONTHS[m-1]}</span>
          <span>${formatCurrency(fd.amount)}</span>
          <span class="fee-chip ${fd.status==='paid'?'fee-paid':'fee-unpaid'}">${fd.status==='paid'?'✓ Paid':'Due'}</span>
        </div>`;
    }
  }
  if (total === 0) html += '<p style="font-size:12px;color:var(--txt3);padding:10px 0">No fee data for this year.</p>';
  else html += `<div style="margin-top:10px;font-size:13px;color:var(--txt2)">Total: ${formatCurrency(total)} &nbsp;·&nbsp; Paid: ${formatCurrency(paid)} &nbsp;·&nbsp; Due: ${formatCurrency(total-paid)}</div>`;
  section.innerHTML = html;
}

function openEditStudentModal(stuId, stuData) {
  $('stuFormTitle').textContent = '✏️ Edit Student';
  STATE.editStudentId = stuId;
  $('nsf-name').value    = stuData.name || '';
  $('nsf-roll').value    = stuData.roll || '';
  $('nsf-idcard').value  = stuData.idCardNo || '';
  $('nsf-dob').value     = stuData.dob || '';
  $('nsf-address').value = stuData.address || '';
  $('nsf-contact').value = stuData.contact || '';
  $('nsf-fee').value     = stuData.monthlyFee || '';
  $('nsf-guardian').value= stuData.guardian || '';
  $('nsf-blood').value   = stuData.blood || '';
  if (stuData.photoUrl) {
    $('photoPreviewImg').src = stuData.photoUrl;
    $('photoPreviewImg').style.display = '';
    $('photoDropDefault').style.display = 'none';
  }
  openModal('modal-student-form');
}

function initSchoolDashEvents(schoolId) {
  // Add class button
  $('addClassBtn').addEventListener('click', () => {
    $('nc-name').value = ''; $('nc-section').value = ''; $('nc-fee').value = '';
    $('nc-error').textContent = '';
    openModal('modal-add-class');
  });

  // Save class
  $('saveClassBtn').addEventListener('click', async () => {
    const name    = $('nc-name').value.trim();
    const section = $('nc-section').value.trim();
    const fee     = parseFloat($('nc-fee').value) || 0;
    $('nc-error').textContent = '';
    if (!name) { $('nc-error').textContent = 'Class name is required.'; return; }
    setLoading($('saveClassBtn'), true);
    try {
      const classesRef = db.collection('schools').doc(schoolId).collection('classes');
      const snap = await classesRef.get();
      await classesRef.add({
        name, section, defaultFee: fee,
        order: snap.size,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      closeModal('modal-add-class');
      toast('Class created!');
    } catch(e) { $('nc-error').textContent = e.message; }
    setLoading($('saveClassBtn'), false);
  });

  // Delete class
  $('deleteClassBtn').addEventListener('click', () => {
    if (!STATE.selectedClassId) return;
    showConfirm(`Delete class "${STATE.selectedClassData?.name}"? All students in this class will also be deleted.`, async () => {
      // Delete all students subcollection
      const stuRef = db.collection('schools').doc(schoolId).collection('classes').doc(STATE.selectedClassId).collection('students');
      const stuSnap = await stuRef.get();
      const batch = db.batch();
      stuSnap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      // Delete class doc
      await db.collection('schools').doc(schoolId).collection('classes').doc(STATE.selectedClassId).delete();
      STATE.selectedClassId = null;
      $('studentList').innerHTML = `<div class="empty-hint"><span>👈</span><p>Select a class from<br>the left panel.</p></div>`;
      $('studentsPanelTitle').textContent = '👥 Students';
      $('addStudentBtn').style.display = 'none';
      $('deleteClassBtn').style.display = 'none';
      $('feeMonthBar').style.display = 'none';
      toast('Class deleted.', 'info');
    });
  });

  // Add student button
  $('addStudentBtn').addEventListener('click', () => {
    STATE.editStudentId = null;
    $('stuFormTitle').textContent = '+ Add New Student';
    ['nsf-name','nsf-roll','nsf-idcard','nsf-address','nsf-contact','nsf-fee','nsf-guardian'].forEach(id => $(id).value = '');
    $('nsf-dob').value = ''; $('nsf-blood').value = '';
    $('nsf-error').textContent = '';
    $('photoPreviewImg').style.display = 'none';
    $('photoDropDefault').style.display = '';
    openModal('modal-student-form');
  });

  // Photo drop zone click
  $('photoDropZone').addEventListener('click', () => $('stuPhotoFile').click());
  $('stuPhotoFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      $('photoPreviewImg').src = ev.target.result;
      $('photoPreviewImg').style.display = '';
      $('photoDropDefault').style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  // Save student
  $('saveStudentBtn').addEventListener('click', async () => {
    if (!STATE.selectedClassId) { toast('Select a class first.', 'error'); return; }
    const name    = $('nsf-name').value.trim();
    const roll    = parseInt($('nsf-roll').value);
    const idCard  = $('nsf-idcard').value.trim();
    const dob     = $('nsf-dob').value;
    const address = $('nsf-address').value.trim();
    const contact = $('nsf-contact').value.trim();
    const fee     = parseFloat($('nsf-fee').value) || 0;
    const guardian= $('nsf-guardian').value.trim();
    const blood   = $('nsf-blood').value;
    $('nsf-error').textContent = '';

    if (!name || !roll || !idCard || !contact) { $('nsf-error').textContent = 'Name, Roll, ID Card No., and Contact are required.'; return; }

    setLoading($('saveStudentBtn'), true);
    try {
      const stuRef = db.collection('schools').doc(schoolId)
        .collection('classes').doc(STATE.selectedClassId)
        .collection('students');

      // Check duplicate roll
      if (!STATE.editStudentId) {
        const dup = await stuRef.where('roll','==',roll).get();
        if (!dup.empty) { $('nsf-error').textContent = `Roll ${roll} already exists in this class.`; setLoading($('saveStudentBtn'), false); return; }
      }

      // Upload photo
      let photoUrl = '';
      const photoFile = $('stuPhotoFile').files[0];
      if (photoFile) {
        const ref = storage.ref(`student-photos/${schoolId}/${STATE.selectedClassId}/${Date.now()}`);
        await ref.put(photoFile, { contentType: photoFile.type });
        photoUrl = await ref.getDownloadURL();
      }

      const data = { name, roll, idCardNo: idCard, dob, address, contact,
                     monthlyFee: fee, guardian, blood,
                     ...(photoUrl && { photoUrl }),
                     updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

      if (STATE.editStudentId) {
        await stuRef.doc(STATE.editStudentId).update(data);
        toast('Student updated!');
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await stuRef.add(data);
        toast('Student added!');
      }
      closeModal('modal-student-form');
    } catch(e) { $('nsf-error').textContent = e.message; }
    setLoading($('saveStudentBtn'), false);
  });

  // Fee month change → reload students
  $('feeMonthSelect').addEventListener('change', () => {
    if (STATE.selectedClassId) loadStudents(schoolId, STATE.selectedClassId);
  });
  $('feeYearSelect').addEventListener('change', () => {
    if (STATE.selectedClassId) loadStudents(schoolId, STATE.selectedClassId);
  });

  // Search
  $('studentSearch').addEventListener('input', () => {
    if (STATE.selectedClassId) loadStudents(schoolId, STATE.selectedClassId);
  });

  // Set Fee All
  $('setFeeAllBtn').addEventListener('click', () => {
    if (!STATE.selectedClassId) return;
    const monthKey = getSelectedMonthKey();
    const monthName = MONTHS[parseInt($('feeMonthSelect').value)-1] + ' ' + $('feeYearSelect').value;
    $('setFeeDesc').textContent = `Set fee for all students in "${STATE.selectedClassData?.name}" for ${monthName}`;
    $('feeAmtInput').value = STATE.selectedClassData?.defaultFee || '';
    $('fee-set-error').textContent = '';
    openModal('modal-set-fee');
  });

  $('saveFeeAllBtn').addEventListener('click', async () => {
    const amt = parseFloat($('feeAmtInput').value);
    $('fee-set-error').textContent = '';
    if (!amt || amt < 0) { $('fee-set-error').textContent = 'Please enter a valid amount.'; return; }
    setLoading($('saveFeeAllBtn'), true);
    try {
      const monthKey = getSelectedMonthKey();
      const stuSnap = await db.collection('schools').doc(schoolId)
        .collection('classes').doc(STATE.selectedClassId)
        .collection('students').get();
      const batch = db.batch();
      stuSnap.forEach(d => {
        const feeRef = d.ref.collection('fees').doc(monthKey);
        batch.set(feeRef, { amount: amt, status: 'unpaid', monthKey,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      closeModal('modal-set-fee');
      toast(`Fee set for ${stuSnap.size} students!`);
      loadStudents(schoolId, STATE.selectedClassId);
    } catch(e) { $('fee-set-error').textContent = e.message; }
    setLoading($('saveFeeAllBtn'), false);
  });
}

function getSelectedMonthKey() {
  const m = $('feeMonthSelect')?.value || String(new Date().getMonth()+1).padStart(2,'0');
  const y = $('feeYearSelect')?.value  || new Date().getFullYear();
  return `${m}-${y}`;
}

async function updateSchoolStats(schoolId) {
  const monthKey = getSelectedMonthKey();
  let totalStudents = 0, totalPaid = 0, totalPending = 0;

  const classes = await db.collection('schools').doc(schoolId).collection('classes').get();
  for (const cls of classes.docs) {
    const students = await cls.ref.collection('students').get();
    totalStudents += students.size;
    for (const stu of students.docs) {
      const fee = await stu.ref.collection('fees').doc(monthKey).get();
      if (fee.exists) {
        const fd = fee.data();
        if (fd.status === 'paid')   totalPaid    += fd.amount || 0;
        if (fd.status === 'unpaid') totalPending += fd.amount || 0;
      }
    }
  }

  $('s-stat-students').textContent = totalStudents;
  $('s-stat-paid').textContent     = formatCurrency(totalPaid);
  $('s-stat-pending').textContent  = formatCurrency(totalPending);

  if (totalPending > 0) {
    $('pendingBanner').style.display = '';
    $('pendingBannerText').textContent = `${formatCurrency(totalPending)} in fees pending for selected month`;
  } else {
    $('pendingBanner').style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
//  STUDENT DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadStudentDashboard(userData) {
  const { schoolId, classId, studentId } = userData;

  // Fetch school
  const schoolDoc = await db.collection('schools').doc(schoolId).get();
  const schoolData = schoolDoc.data();

  // Fetch student
  const stuDoc = await db.collection('schools').doc(schoolId)
    .collection('classes').doc(classId)
    .collection('students').doc(studentId).get();
  const stuData = stuDoc.data();

  if (!stuData) { toast('Student record not found.', 'error'); return; }

  STATE.orgData = { schoolId, schoolData, classId, studentId, stuData };

  // Set watermark (school logo)
  if (schoolData.logoUrl) setWatermark(schoolData.logoUrl);

  // Dash bar
  $('stuDashSchoolName').textContent = schoolData.name;
  $('stuDashClass').textContent = `Class ${stuData.roll ? stuData.roll : '—'} · Roll ${stuData.roll || '—'}`;
  if (schoolData.logoUrl) {
    $('stuDashSchoolLogo').innerHTML = `<img src="${schoolData.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
  }

  // Profile
  $('stuProfileName').textContent   = stuData.name || '—';
  $('stuProfileSchool').textContent = `${schoolData.name} · ${stuData.className || 'Class'}`;
  $('si-idcard').textContent   = stuData.idCardNo || '—';
  $('si-dob').textContent      = formatDate(stuData.dob);
  $('si-address').textContent  = stuData.address || '—';
  $('si-contact').textContent  = stuData.contact || '—';
  $('si-blood').textContent    = stuData.blood || '—';
  $('si-guardian').textContent = stuData.guardian || '—';
  $('stuPhotoFallback').textContent = shortName(stuData.name);

  if (stuData.photoUrl) {
    $('stuProfilePhoto').src = stuData.photoUrl;
    $('stuProfilePhoto').style.display = '';
    $('stuPhotoFallback').style.display = 'none';
  }

  // Load fees
  loadStudentFees(schoolId, classId, studentId, stuData);

  // Year change
  $('stuFeeYear').addEventListener('change', () => {
    loadStudentFees(schoolId, classId, studentId, stuData);
  });

  showScreen('screen-student-dash');
  setBreadcrumb(schoolData.name, 'My Profile');
}

async function loadStudentFees(schoolId, classId, studentId, stuData) {
  const year = $('stuFeeYear').value;
  $('stuMonthlyFee').textContent = formatCurrency(stuData.monthlyFee);
  let totalPaid = 0, totalDue = 0;
  const grid = $('stuFeeGrid');
  grid.innerHTML = '';

  for (let m = 1; m <= 12; m++) {
    const key = `${String(m).padStart(2,'0')}-${year}`;
    const feeDoc = await db.collection('schools').doc(schoolId)
      .collection('classes').doc(classId)
      .collection('students').doc(studentId)
      .collection('fees').doc(key).get();

    const card = document.createElement('div');
    card.className = 'fee-month-card';
    if (!feeDoc.exists) {
      card.classList.add('month-not-set');
      card.innerHTML = `<div class="month-card-name">${MONTHS[m-1].slice(0,3)}</div>
                        <div class="month-card-amt">—</div>
                        <div class="month-card-status">Not set</div>`;
    } else {
      const fd = feeDoc.data();
      const isPaid = fd.status === 'paid';
      card.classList.add(isPaid ? 'month-paid' : 'month-unpaid');
      if (isPaid) totalPaid += fd.amount || 0;
      else        totalDue  += fd.amount || 0;
      card.innerHTML = `<div class="month-card-name">${MONTHS[m-1].slice(0,3)}</div>
                        <div class="month-card-amt">${formatCurrency(fd.amount)}</div>
                        <div class="month-card-status">${isPaid?'✓ Paid':'Due'}</div>`;
    }
    grid.appendChild(card);
  }

  $('stuTotalPaid').textContent = formatCurrency(totalPaid);
  $('stuTotalDue').textContent  = formatCurrency(totalDue);
}

// ═══════════════════════════════════════════════════════════
//  BUSINESS DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadBusinessDashboard(bizId) {
  const snap = await db.collection('businesses').doc(bizId).get();
  if (!snap.exists) return;
  STATE.orgData = { id: bizId, ...snap.data() };

  $('bizDashName').textContent = STATE.orgData.name;
  $('bizDashMeta').textContent = `${STATE.orgData.type || 'Business'} · ${STATE.orgData.ownerName || ''}`;

  if (STATE.orgData.logoUrl) {
    setWatermark(STATE.orgData.logoUrl);
    $('bizDashLogo').innerHTML = `<img src="${STATE.orgData.logoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
  }

  showScreen('screen-biz-dash');
  setBreadcrumb('Business', STATE.orgData.name);
  loadTransactions(bizId);
  initBizDashEvents(bizId);
}

function loadTransactions(bizId) {
  const unsub = db.collection('businesses').doc(bizId)
    .collection('transactions').orderBy('date','desc')
    .onSnapshot(snap => {
      STATE.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTransactions();
      updateBizStats();
    });
  STATE.unsubscribers.push(unsub);
}

function renderTransactions() {
  const monthFilter = $('bizFilterMonth').value;
  const typeFilter  = $('txTypeFilter').value;
  const search      = $('txSearch').value.toLowerCase();

  let txs = STATE.transactions || [];

  if (monthFilter !== 'all') {
    txs = txs.filter(t => {
      const d = new Date(t.date);
      const key = `${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      return key === monthFilter;
    });
  }
  if (typeFilter !== 'all') txs = txs.filter(t => t.type === typeFilter);
  if (search) txs = txs.filter(t => (t.description||'').toLowerCase().includes(search) || (t.category||'').toLowerCase().includes(search));

  const list = $('txList');
  if (txs.length === 0) {
    list.innerHTML = `<div class="empty-hint"><span>📋</span><p>No entries found.</p></div>`;
    return;
  }

  const icons = {
    'Sales / Revenue':'🛒','Raw Materials':'📦','Staff Salary':'👤','Shop Rent':'🏢',
    'Utilities / Bills':'⚡','Transport':'🚛','Marketing':'📣','Equipment':'🔧',
    'Tax / VAT':'📑','Loan / EMI':'💳','Other':'📌',
  };

  list.innerHTML = txs.map(t => {
    const isIncome = t.type === 'income';
    const icon = icons[t.category] || (isIncome ? '📈' : '📉');
    return `
      <div class="tx-item">
        <div class="tx-ico ${isIncome?'tx-in-ico':'tx-out-ico'}">${icon}</div>
        <div class="tx-info">
          <div class="tx-desc-text">${t.description||'—'}</div>
          <div class="tx-meta">${formatDate(t.date)} ${t.category?'· '+t.category:''} ${t.method?'· '+t.method:''}</div>
        </div>
        <span class="tx-amt ${isIncome?'tx-inc-amt':'tx-exp-amt'}">${isIncome?'+':'−'}${formatCurrency(t.amount)}</span>
        <div class="tx-item-actions">
          <button class="tx-action-btn edt" data-id="${t.id}" title="Edit">✏</button>
          <button class="tx-action-btn del" data-id="${t.id}" title="Delete">🗑</button>
        </div>
      </div>`;
  }).join('');

  // Edit / Delete actions
  list.querySelectorAll('.tx-action-btn.del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const txId = btn.dataset.id;
      const tx = (STATE.transactions||[]).find(t => t.id === txId);
      showConfirm(`Delete "${tx?.description}"?`, async () => {
        await db.collection('businesses').doc(STATE.orgData.id).collection('transactions').doc(txId).delete();
        toast('Entry deleted.', 'info');
      });
    });
  });

  list.querySelectorAll('.tx-action-btn.edt').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tx = (STATE.transactions||[]).find(t => t.id === btn.dataset.id);
      if (tx) openTxModal(tx);
    });
  });
}

function updateBizStats() {
  const monthFilter = $('bizFilterMonth').value;
  let txs = STATE.transactions || [];
  if (monthFilter !== 'all') {
    txs = txs.filter(t => {
      const d = new Date(t.date);
      const key = `${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      return key === monthFilter;
    });
  }

  const income  = txs.filter(t=>t.type==='income').reduce((s,t)=>s+(t.amount||0),0);
  const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+(t.amount||0),0);
  const profit  = income - expense;
  const margin  = income > 0 ? Math.round((profit/income)*100) : 0;

  $('bizTotalIncome').textContent  = formatCurrency(income);
  $('bizTotalExpense').textContent = formatCurrency(expense);
  $('bizNetProfit').textContent    = formatCurrency(profit);
  $('bizNetProfit').style.color    = profit >= 0 ? 'var(--green)' : 'var(--red)';
  $('bizIncomeSub').textContent    = txs.filter(t=>t.type==='income').length + ' entries';
  $('bizExpenseSub').textContent   = txs.filter(t=>t.type==='expense').length + ' entries';
  $('bizMargin').textContent       = (profit>=0?'+':'')+margin+'% margin';

  // Category breakdown
  const cats = {};
  txs.forEach(t => {
    if (!t.category) return;
    cats[t.category] = (cats[t.category]||0) + (t.amount||0);
  });
  const maxAmt = Math.max(...Object.values(cats), 1);
  const catList = $('catList');
  const catKeys = Object.keys(cats).sort((a,b)=>cats[b]-cats[a]);
  if (catKeys.length === 0) {
    catList.innerHTML = `<div class="empty-hint"><span>📊</span><p>No data.</p></div>`;
    return;
  }
  const barColors = ['#60A5FA','#A78BFA','#4ADE80','#FBBF24','#F472B6','#F87171','#34D399'];
  catList.innerHTML = catKeys.map((cat, i) => {
    const amt = cats[cat];
    const pct = Math.round((amt/maxAmt)*100);
    const color = barColors[i % barColors.length];
    return `
      <div class="cat-row">
        <div class="cat-row-top">
          <span class="cat-name">${cat}</span>
          <span class="cat-val" style="color:${color}">${formatCurrency(amt)}</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');
}

function openTxModal(tx) {
  STATE.editTxId = tx ? tx.id : null;
  $('txModalTitle').textContent = tx ? '✏️ Edit Transaction' : '+ Add Transaction';
  $('tx-desc').value     = tx?.description || '';
  $('tx-amount').value   = tx?.amount || '';
  $('tx-date').value     = tx?.date || new Date().toISOString().split('T')[0];
  $('tx-category').value = tx?.category || '';
  $('tx-method').value   = tx?.method || '';
  $('tx-note').value     = tx?.note || '';
  $('tx-error').textContent = '';

  // Set type toggle
  const type = tx?.type || 'income';
  $$('.tx-type-btn').forEach(b => {
    b.classList.remove('tx-active');
    if (b.dataset.type === type) b.classList.add('tx-active');
  });
  openModal('modal-tx');
}

function initBizDashEvents(bizId) {
  $('addTxBtn').addEventListener('click', () => openTxModal(null));

  $$('.tx-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tx-type-btn').forEach(b => b.classList.remove('tx-active'));
      btn.classList.add('tx-active');
    });
  });

  $('saveTxBtn').addEventListener('click', async () => {
    const desc   = $('tx-desc').value.trim();
    const amt    = parseFloat($('tx-amount').value);
    const date   = $('tx-date').value;
    const cat    = $('tx-category').value;
    const method = $('tx-method').value;
    const note   = $('tx-note').value.trim();
    const type   = document.querySelector('.tx-type-btn.tx-active')?.dataset.type || 'income';
    $('tx-error').textContent = '';

    if (!desc || !amt || !date) { $('tx-error').textContent = 'Description, Amount, and Date are required.'; return; }
    if (amt <= 0) { $('tx-error').textContent = 'Amount must be greater than 0.'; return; }

    setLoading($('saveTxBtn'), true);
    try {
      const txRef = db.collection('businesses').doc(bizId).collection('transactions');
      const data  = { type, description: desc, amount: amt, date, category: cat, method, note,
                      updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (STATE.editTxId) {
        await txRef.doc(STATE.editTxId).update(data);
        toast('Entry updated!');
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await txRef.add(data);
        toast('Entry added!');
      }
      closeModal('modal-tx');
    } catch(e) { $('tx-error').textContent = e.message; }
    setLoading($('saveTxBtn'), false);
  });

  $('bizFilterMonth').addEventListener('change', () => { renderTransactions(); updateBizStats(); });
  $('txTypeFilter').addEventListener('change', renderTransactions);
  $('txSearch').addEventListener('input', renderTransactions);
}

// ═══════════════════════════════════════════════════════════
//  MODALS (close, confirm)
// ═══════════════════════════════════════════════════════════
function initModals() {
  // Close on X button
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  // Close on bg click
  $$('.modal-bg').forEach(bg => {
    bg.addEventListener('click', e => {
      if (e.target === bg) bg.classList.remove('open');
    });
  });
  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });
}

function showConfirm(msg, callback) {
  $('confirmMsg').textContent = msg;
  STATE.confirmCallback = callback;
  openModal('modal-confirm');
}

document.addEventListener('DOMContentLoaded', () => {
  // confirm delete button
  setTimeout(() => {
    $('confirmDeleteBtn')?.addEventListener('click', () => {
      closeModal('modal-confirm');
      if (STATE.confirmCallback) STATE.confirmCallback();
      STATE.confirmCallback = null;
    });
  }, 100);
});

// ═══════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════
function initSettings() {
  setTimeout(() => {
    // Dark mode toggle inside settings
    $('darkModeToggle')?.addEventListener('change', function() {
      applyTheme(this.checked ? 'dark' : 'light');
    });

    // Update logo
    $('updateLogoBtn')?.addEventListener('click', () => $('updateLogoInput').click());
    $('updateLogoInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file || !STATE.user || !STATE.orgData) return;
      try {
        const col = STATE.role === 'school' ? 'schools' : 'businesses';
        const ref = storage.ref(`logos/${col}/${STATE.user.uid}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        await db.collection(col).doc(STATE.user.uid).update({ logoUrl: url });
        STATE.orgData.logoUrl = url;
        setWatermark(url);
        closeModal('modal-settings');
        toast('Logo updated!');
      } catch(e) { toast('Logo update failed: ' + e.message, 'error'); }
    });

    // Change password
    $('changePassBtn')?.addEventListener('click', () => {
      closeModal('modal-settings');
      openModal('modal-change-pass');
    });
    $('saveNewPassBtn')?.addEventListener('click', async () => {
      const current = $('cp-current').value;
      const newPass = $('cp-new').value;
      const confirm = $('cp-confirm').value;
      $('cp-error').textContent = '';
      if (!current || !newPass) { $('cp-error').textContent = 'Please fill in all fields.'; return; }
      if (newPass !== confirm)   { $('cp-error').textContent = 'New passwords do not match.'; return; }
      if (newPass.length < 6)    { $('cp-error').textContent = 'Password must be at least 6 characters.'; return; }
      setLoading($('saveNewPassBtn'), true);
      try {
        const user  = auth.currentUser;
        const cred  = firebase.auth.EmailAuthProvider.credential(user.email, current);
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(newPass);
        closeModal('modal-change-pass');
        toast('Password updated!');
      } catch(e) { $('cp-error').textContent = friendlyAuthError(e.code) || e.message; }
      setLoading($('saveNewPassBtn'), false);
    });

    // Export CSV
    $('exportDataBtn')?.addEventListener('click', exportDataCSV);

    // Delete account
    $('deleteAccountBtn')?.addEventListener('click', () => {
      showConfirm('Delete your account permanently? All data will be lost. This cannot be undone.', async () => {
        try {
          const col = STATE.role === 'school' ? 'schools' : STATE.role === 'business' ? 'businesses' : 'users';
          if (STATE.role !== 'student') await db.collection(col).doc(STATE.user.uid).delete();
          await db.collection('users').doc(STATE.user.uid).delete();
          await auth.currentUser.delete();
          toast('Account deleted.', 'info');
        } catch(e) { toast('Error: ' + e.message + ' — Try re-logging in first.', 'error'); }
      });
    });
  }, 200);
}

async function exportDataCSV() {
  if (!STATE.user || !STATE.orgData) { toast('No data to export.', 'error'); return; }
  let csv = '', filename = 'sayathub-export.csv';

  if (STATE.role === 'business') {
    csv = 'Date,Type,Description,Amount,Category,Method,Note\n';
    (STATE.transactions || []).forEach(t => {
      csv += `"${t.date}","${t.type}","${t.description}","${t.amount}","${t.category||''}","${t.method||''}","${t.note||''}"\n`;
    });
    filename = `${STATE.orgData.name}-transactions.csv`;
  }
  if (STATE.role === 'school' && STATE.selectedClassId) {
    const stuSnap = await db.collection('schools').doc(STATE.orgData.id)
      .collection('classes').doc(STATE.selectedClassId)
      .collection('students').get();
    csv = 'Roll,Name,ID Card,DOB,Address,Contact,Guardian,Blood,Monthly Fee\n';
    stuSnap.forEach(d => {
      const s = d.data();
      csv += `"${s.roll}","${s.name}","${s.idCardNo||''}","${s.dob||''}","${s.address||''}","${s.contact||''}","${s.guardian||''}","${s.blood||''}","${s.monthlyFee||0}"\n`;
    });
    filename = `${STATE.orgData.name}-students.csv`;
  }

  if (!csv) { toast('Select a class first (for school) or view transactions (for business).', 'info'); return; }
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  toast('Data exported!');
}

// ═══════════════════════════════════════════════════════════
//  SAYAI CHAT
// ═══════════════════════════════════════════════════════════
function initSayAI() {
  $('openSayAIBtn')?.addEventListener('click', () => {
    closeModal('modal-help');
    openModal('modal-sayai');
    $('chatInput').focus();
  });

  $('chatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  $('chatSendBtn')?.addEventListener('click', sendChat);
}

const CHAT_HISTORY = []; // keep conversation context

async function sendChat() {
  const input = $('chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  appendChatMsg(msg, 'user');
  input.value = '';

  // Show typing
  const typingId = 'typing-' + Date.now();
  appendChatMsg('...', 'ai', typingId, true);

  $('chatSendBtn').disabled = true;
  $('chatLoader').style.display = '';

  CHAT_HISTORY.push({ role: 'user', content: msg });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `You are SayAI, the helpful assistant for SayatHub — a platform for managing schools (classes, students, fees) and businesses (income, expenses, profit/loss). 
Answer questions about the platform features. Keep responses concise. 
Context: ${STATE.role ? 'User is logged in as '+STATE.role : 'User is not logged in'}.
You can speak both English and Bengali (বাংলা). Reply in the same language the user writes in.`,
        messages: CHAT_HISTORY,
      }),
    });

    const data = await res.json();
    const reply = data.content?.[0]?.text || 'Sorry, I could not get a response. Please try again.';
    CHAT_HISTORY.push({ role: 'assistant', content: reply });

    // Remove typing
    document.getElementById(typingId)?.remove();
    appendChatMsg(reply, 'ai');
  } catch(e) {
    document.getElementById(typingId)?.remove();
    appendChatMsg('Sorry, SayAI is unavailable right now. Please check your connection.', 'ai');
  }

  $('chatSendBtn').disabled = false;
  $('chatLoader').style.display = 'none';
}

function appendChatMsg(text, role, id, isTyping) {
  const body = $('chatBody');
  const div = document.createElement('div');
  div.className = `chat-msg ${role === 'user' ? 'user-msg' : 'ai-msg'}`;
  if (id) div.id = id;
  const avatarHTML = role === 'user'
    ? `<div class="msg-avatar user-avatar">${shortName(STATE.orgData?.name || 'U')}</div>`
    : `<div class="msg-avatar ai-avatar">AI</div>`;
  const bubbleClass = role === 'user' ? 'user-bubble' : 'ai-bubble';
  const content = isTyping
    ? `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`
    : text.replace(/\n/g,'<br>');
  div.innerHTML = `${role==='ai'?avatarHTML:''}
    <div class="msg-bubble ${bubbleClass} ${isTyping?'typing-bubble':''}">${content}</div>
    ${role==='user'?avatarHTML:''}`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function initEyeBtns() {
  $$('.eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.for);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
}

async function sendPasswordReset(email) {
  if (!email) { toast('Enter your email first.', 'error'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    toast('Password reset email sent!', 'info');
  } catch(e) { toast(friendlyAuthError(e.code) || e.message, 'error'); }
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/weak-password':        'Password is too weak. Use at least 6 characters.',
    'auth/too-many-requests':    'Too many attempts. Please try again later.',
    'auth/network-request-failed':'Network error. Check your internet connection.',
    'auth/requires-recent-login':'Please logout and login again to do this.',
    'auth/credential-already-in-use':'This phone number is already linked to another account.',
  };
  return map[code] || '';
}

// Global eye button listener (for dynamically added inputs)
document.addEventListener('click', e => {
  const btn = e.target.closest('.eye-btn');
  if (!btn) return;
  const input = document.getElementById(btn.dataset.for);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
});

console.log("✅ SayatHub app.js loaded");
