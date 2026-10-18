(() => {
  const shell = document.querySelector('.nav-inner, .nav-shell');
  if (!shell || shell.classList.contains('nav-collapsible')) return;
  const links = shell.querySelector('.nav-links');
  const actions = shell.querySelector('.nav-actions');
  const notice = shell.querySelector('.mobile-notice-strip');
  if (!links || !actions) return;

  const panel = document.createElement('div');
  panel.id = 'public-navigation-panel';
  panel.className = 'public-navigation-panel';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'public-menu-toggle';
  toggle.setAttribute('aria-controls', panel.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span class="public-menu-icon" aria-hidden="true"><i></i><i></i></span><span>메뉴</span>';

  const signup = document.createElement('a');
  signup.className = 'public-mobile-signup';
  signup.href = '/signup';
  signup.textContent = '회원가입';
  signup.addEventListener('click', event => {
    // Reuse the existing home-page handler so notice/consent behavior is unchanged.
    const existing = actions.querySelector('a[href="/signup"]');
    if (existing) { event.preventDefault(); existing.click(); }
  });

  shell.insertBefore(signup, links);
  shell.insertBefore(toggle, links);
  shell.insertBefore(panel, links);
  panel.append(links, actions);
  if (notice) panel.append(notice);
  shell.classList.add('nav-collapsible');

  const media = window.matchMedia('(max-width: 960px)');
  function setOpen(open) {
    shell.classList.toggle('public-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  shell.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  panel.addEventListener('click', event => {
    if (event.target.closest('a, button')) setOpen(false);
  });
  document.addEventListener('click', event => {
    if (!shell.contains(event.target)) setOpen(false);
  });
  media.addEventListener('change', () => setOpen(false));

  // The home page changes its existing account controls after session bootstrap.
  // Reflect that visibility; do not introduce a second authentication state.
  function syncSignupVisibility() {
    const original = actions.querySelector('a[href="/signup"]');
    signup.hidden = !original || original.hidden || original.classList.contains('is-hidden');
  }
  const observer = new MutationObserver(syncSignupVisibility);
  observer.observe(actions, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  syncSignupVisibility();
})();
