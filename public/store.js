(() => {
  const CART_KEY = 'form-and-field-cart';
  let products = [];
  let productById = new Map();
  let currentUser = null;
  let registerMode = false;
  let pendingCheckout = false;
  let razorpayEnabled = false;
  let toastTimer;

  const readCart = () => {
    try {
      const value = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(value) ? value.filter((item) => Number.isSafeInteger(Number(item.id)) && Number(item.quantity) > 0) : [];
    } catch { return []; }
  };
  let cart = readCart();

  function money(value) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
  }

  function getCartCount() {
    return cart.reduce((sum, item) => sum + Number(item.quantity), 0);
  }

  function getSubtotal() {
    return cart.reduce((sum, item) => sum + (productById.get(Number(item.id))?.price || 0) * Number(item.quantity), 0);
  }

  function renderCart() {
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = String(getCartCount()); });
    const content = document.getElementById('cart-content');
    const subtotal = document.getElementById('cart-subtotal');
    const checkoutTotal = document.getElementById('checkout-total');
    if (subtotal) subtotal.textContent = money(getSubtotal());
    if (checkoutTotal) checkoutTotal.textContent = money(getSubtotal());
    if (!content) return;
    const available = cart.filter((item) => productById.has(Number(item.id)));
    if (!available.length) {
      content.innerHTML = '<p class="cart-empty">There is room for a good thing.</p>';
      return;
    }
    content.innerHTML = available.map((item) => {
      const product = productById.get(Number(item.id));
      const quantity = Number(item.quantity);
      const maxQuantity = Math.min(20, Number(product.stock));
      return `<article class="cart-item" data-item-id="${product.id}">
        <a href="/product.html?slug=${encodeURIComponent(product.slug)}"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"></a>
        <div class="cart-item-info"><small>${escapeHTML(product.category)}</small><strong>${escapeHTML(product.name)}</strong><div class="cart-line-controls"><button type="button" data-quantity="-1" aria-label="Remove one ${escapeHTML(product.name)}">−</button><span>${quantity}</span><button type="button" data-quantity="1" aria-label="Add one ${escapeHTML(product.name)}" ${quantity >= maxQuantity ? 'disabled' : ''}>+</button><button type="button" class="remove-item" data-remove-item>Remove</button></div></div>
        <span class="cart-line-price">${money(product.price * quantity)}</span>
      </article>`;
    }).join('');
  }

  async function loadProducts(params = '') {
    const rows = await api(`/api/products${params}`);
    products = rows;
    for (const product of products) productById.set(Number(product.id), product);
    renderCart();
    return products;
  }

  function addToCart(product, quantity = 1) {
    const stock = Number(product.stock);
    if (!Number.isSafeInteger(stock) || stock < 1) {
      showToast(`${product.name} is sold out right now.`);
      return false;
    }
    const existing = cart.find((item) => Number(item.id) === Number(product.id));
    const next = (existing?.quantity || 0) + quantity;
    const maxQuantity = Math.min(20, stock);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || next > maxQuantity) {
      showToast(`You can add up to ${maxQuantity} of this piece.`);
      return false;
    }
    if (existing) existing.quantity = next;
    else cart.push({ id: Number(product.id), quantity });
    saveCart();
    showToast(`${product.name} is in your bag.`);
    return true;
  }

  async function refreshUser() {
    try {
      const data = await api('/api/me');
      currentUser = data.user;
      return data;
    } catch {
      currentUser = null;
      return null;
    }
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  function openAccount() {
    const dialog = document.getElementById('auth-dialog');
    if (!dialog) return;
    dialog.showModal();
    refreshUser().then((data) => {
      const authView = document.getElementById('auth-view');
      const accountView = document.getElementById('account-view');
      if (!authView || !accountView) return;
      authView.hidden = Boolean(data);
      accountView.hidden = !data;
      if (!data) return;
      document.getElementById('account-title').textContent = `Hello, ${data.user.fullName.split(' ')[0]}.`;
      document.getElementById('account-email').textContent = data.user.email;
      const list = document.getElementById('order-list');
      list.innerHTML = '<h3>Your recent orders</h3>' + (data.orders.length
        ? data.orders.map((order) => `<div class="order-row"><div><strong>${escapeHTML(order.orderNumber)}</strong><br><span>${new Date(order.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${escapeHTML(order.status)} · ${escapeHTML(order.paymentStatus.replaceAll('_', ' '))}</span>${order.trackingUrl ? `<br><a class="text-link" href="${escapeHTML(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track ${escapeHTML(order.courierName || 'shipment')} ${order.awbCode ? `· ${escapeHTML(order.awbCode)}` : ''} ↗</a>` : `<br><span>Delivery: ${escapeHTML(order.shipmentStatus.replaceAll('_', ' '))}</span>`}</div><strong>${money(order.subtotal)}</strong></div>`).join('')
        : '<p class="order-empty">Your next favourite is still out there.</p>');
    });
  }

  function setAuthMode(isRegister) {
    registerMode = isRegister;
    const nameField = document.getElementById('name-field');
    if (!nameField) return;
    nameField.hidden = !registerMode;
    nameField.querySelector('input').required = registerMode;
    document.getElementById('auth-title').textContent = registerMode ? 'Make yourself at home.' : 'Come on in.';
    document.getElementById('auth-eyebrow').textContent = registerMode ? 'A place for your favourites' : 'Good to have you';
    document.getElementById('auth-submit').innerHTML = registerMode ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
    document.getElementById('switch-copy').textContent = registerMode ? 'Already have a place here?' : 'New around here?';
    document.getElementById('switch-auth').textContent = registerMode ? 'Sign in' : 'Create an account';
    document.querySelector('[name="password"]').autocomplete = registerMode ? 'new-password' : 'current-password';
    document.getElementById('auth-error').textContent = '';
  }

  function openCheckout() {
    const form = document.getElementById('checkout-form');
    const name = form?.elements.fullName;
    const email = form?.elements.email;
    if (name && currentUser) name.value = currentUser.fullName;
    if (email && currentUser) email.value = currentUser.email;
    const payment = form?.elements.paymentMethod;
    const razorpayOption = document.getElementById('razorpay-option');
    const paymentNote = document.getElementById('payment-setup-note');
    if (payment) {
      razorpayOption.disabled = !razorpayEnabled;
      if (!razorpayEnabled && payment.value === 'razorpay') payment.value = 'cod';
    }
    if (paymentNote) {
      paymentNote.hidden = razorpayEnabled;
      paymentNote.textContent = razorpayEnabled
        ? ''
        : 'Online payments are being set up. Cash on delivery is available.';
    }
    document.getElementById('checkout-error').textContent = '';
    document.getElementById('checkout-total').textContent = money(getSubtotal());
    document.getElementById('checkout-dialog').showModal();
  }

  const store = {
    api, money, escapeHTML, showToast, loadProducts, addToCart, renderCart,
    openAccount, openCheckout, closeDialog,
    get products() { return products; },
    get currentUser() { return currentUser; },
    get cart() { return cart; },
    getSubtotal, getCartCount
  };
  window.Store = store;

  document.querySelectorAll('.cart-trigger').forEach((button) => button.addEventListener('click', () => {
    renderCart();
    document.getElementById('cart-dialog').showModal();
  }));
  document.querySelectorAll('.account-trigger').forEach((button) => button.addEventListener('click', openAccount));
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.close)));
  document.querySelectorAll('.checkout-trigger').forEach((button) => button.addEventListener('click', async () => {
    if (!cart.length) return showToast('Your bag is waiting for a good thing.');
    await refreshUser();
    closeDialog('cart-dialog');
    if (!currentUser) {
      pendingCheckout = true;
      setAuthMode(false);
      document.getElementById('auth-view').hidden = false;
      document.getElementById('account-view').hidden = true;
      document.getElementById('auth-dialog').showModal();
      showToast('Sign in to place your order.');
      return;
    }
    openCheckout();
  }));
  document.getElementById('switch-auth')?.addEventListener('click', () => setAuthMode(!registerMode));
  document.getElementById('auth-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.getElementById('auth-error');
    const submit = document.getElementById('auth-submit');
    error.textContent = '';
    submit.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      const data = await api(registerMode ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify(body) });
      currentUser = data.user;
      form.reset();
      closeDialog('auth-dialog');
      showToast(`Welcome${currentUser.fullName ? `, ${currentUser.fullName.split(' ')[0]}` : ' back'}.`);
      if (pendingCheckout) {
        pendingCheckout = false;
        openCheckout();
      }
    } catch (exception) {
      error.textContent = exception.message;
    } finally { submit.disabled = false; }
  });
  document.getElementById('logout-button')?.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    currentUser = null;
    closeDialog('auth-dialog');
    showToast('You have signed out. See you soon.');
  });
  document.getElementById('cart-content')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-item-id]');
    if (!item) return;
    const id = Number(item.dataset.itemId);
    const entry = cart.find((row) => Number(row.id) === id);
    if (!entry) return;
    if (event.target.closest('[data-remove-item]')) {
      cart = cart.filter((row) => Number(row.id) !== id);
      saveCart();
      return;
    }
    const stepButton = event.target.closest('[data-quantity]');
    if (!stepButton) return;
    const next = entry.quantity + Number(stepButton.dataset.quantity);
    if (next < 1) cart = cart.filter((row) => Number(row.id) !== id);
    else {
      const product = productById.get(id);
      const maxQuantity = Math.min(20, Number(product?.stock));
      if (Number.isSafeInteger(maxQuantity) && next <= maxQuantity) entry.quantity = next;
      else return showToast(product?.stock ? `You can add up to ${maxQuantity} of this piece.` : 'This piece is sold out right now.');
    }
    saveCart();
  });
  document.getElementById('checkout-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.getElementById('checkout-error');
    const submit = form.querySelector('[type="submit"]');
    error.textContent = '';
    submit.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      body.items = cart.map((item) => ({ id: item.id, quantity: item.quantity }));
      const order = await api('/api/orders', { method: 'POST', body: JSON.stringify(body) });
      if (body.paymentMethod === 'razorpay') {
        if (!window.Razorpay || !order.razorpay) throw new Error('Online checkout could not load. Your order remains unpaid; please choose cash on delivery or try again.');
        const payment = await new Promise((resolve, reject) => {
          let settled = false;
          const cancel = () => {
            if (settled) return;
            settled = true;
            api(`/api/orders/${encodeURIComponent(order.orderNumber)}/cancel-payment`, { method: 'POST' })
              .catch((exception) => console.error('Could not release the cancelled payment reservation:', exception));
            reject(new Error('Payment was cancelled. Your reserved stock has been released.'));
          };
          const checkout = new window.Razorpay({
            key: order.razorpay.keyId,
            amount: order.razorpay.amount,
            currency: order.razorpay.currency,
            name: 'PashminaQash',
            description: 'Pashmina shawl order',
            order_id: order.razorpay.orderId,
            prefill: {
              name: body.fullName,
              email: body.email,
              contact: body.phone
            },
            theme: { color: '#a44e3e' },
            handler: async (response) => {
              if (settled) return;
              settled = true;
              try {
                resolve(await api('/api/payments/verify', {
                  method: 'POST',
                  body: JSON.stringify({ orderNumber: order.orderNumber, ...response })
                }));
              } catch (exception) {
                reject(exception);
              }
            },
            modal: { ondismiss: cancel }
          });
          checkout.on('payment.failed', cancel);
          checkout.open();
        });
        finishOrder(payment, form);
        return;
      }
      finishOrder(order, form);
    } catch (exception) {
      error.textContent = exception.message;
    } finally { submit.disabled = false; }
  });

  function finishOrder(order, form) {
      cart = [];
      saveCart();
      form.reset();
      closeDialog('checkout-dialog');
      closeDialog('cart-dialog');
      document.getElementById('success-message').textContent = `Your order ${order.orderNumber} is confirmed. You can follow its delivery status in your account.`;
      document.getElementById('success-dialog').showModal();
      refreshUser();
      loadProducts().catch(() => {});
  }

  loadProducts().catch(() => {});
  refreshUser();
  api('/api/payments/config').then((config) => {
    razorpayEnabled = Boolean(config.razorpayEnabled);
  }).catch((exception) => console.error('Could not load online payment availability:', exception));
  renderCart();

  const menu = document.querySelector('.menu-trigger');
  const globalSearch = document.getElementById('search-input');
  globalSearch?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && globalSearch.value.trim()) {
      window.location.href = `/?search=${encodeURIComponent(globalSearch.value.trim())}#shop`;
    }
  });
  menu?.addEventListener('click', () => {
    const nav = document.querySelector('.main-nav');
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', () => {
    document.querySelector('.main-nav')?.classList.remove('open');
    menu?.setAttribute('aria-expanded', 'false');
  }));
})();
