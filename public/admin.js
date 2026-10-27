(() => {
  const loginPanel = document.getElementById('login-panel');
  const ordersPanel = document.getElementById('orders-panel');
  const ordersList = document.getElementById('orders-list');
  const loginError = document.getElementById('login-error');
  const ordersError = document.getElementById('orders-error');
  const logoutButton = document.getElementById('logout-button');
  const setupNotice = document.getElementById('setup-notice');

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function setAuthenticated() {
    loginPanel.hidden = true;
    ordersPanel.hidden = false;
    logoutButton.hidden = false;
    loadOrders();
  }

  function orderCard(order) {
    const items = order.items.map((item) => `<div>${item.quantity} × ${escapeHTML(item.name)} — ₹${item.price * item.quantity}</div>`).join('');
    const lineAddress = [order.address, order.city, order.state, order.postalCode].filter(Boolean).map(escapeHTML).join(', ');
    const paymentText = `${escapeHTML(order.paymentMethod)} · ${escapeHTML(order.paymentStatus.replaceAll('_', ' '))}`;
    const shipmentStatus = escapeHTML(order.shipmentStatus.replaceAll('_', ' '));
    const tracking = order.trackingUrl
      ? `<a href="${escapeHTML(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track ${escapeHTML(order.courierName || 'parcel')} · ${escapeHTML(order.awbCode)} ↗</a>`
      : order.awbCode ? `AWB ${escapeHTML(order.awbCode)}` : 'No AWB assigned yet';
    const options = [
      ['shipment_created', 'Shipment created'],
      ['packed', 'Packed'],
      ['shipped', 'Shipped'],
      ['in_transit', 'In transit'],
      ['delivered', 'Delivered']
    ].map(([value, label]) => `<option value="${value}" ${order.shipmentStatus === value ? 'selected' : ''}>${label}</option>`).join('');
    const notificationErrors = order.notifications.filter((notice) => notice.status === 'failed' || notice.status === 'not_configured');
    const notifications = notificationErrors.length
      ? `<p class="admin-order-meta admin-error">${notificationErrors.map((notice) => `${escapeHTML(notice.channel)} alert: ${escapeHTML(notice.status.replaceAll('_', ' '))}`).join(' · ')}</p>`
      : '';
    const error = order.shipmentError ? `<p class="admin-order-meta admin-error">${escapeHTML(order.shipmentError)}</p>` : '';
    return `<article class="admin-order" data-order-id="${order.id}">
      <div class="admin-order-head">
        <div><h2>${escapeHTML(order.orderNumber)}</h2><p>${new Date(order.createdAt.replace(' ', 'T') + 'Z').toLocaleString('en-IN')} · ${escapeHTML(order.status)}</p></div>
        <div class="admin-order-meta">${paymentText}<br><span class="admin-shipment-status">${shipmentStatus}</span></div>
      </div>
      <p class="admin-order-details"><strong>${escapeHTML(order.fullName)}</strong> · <a href="mailto:${encodeURIComponent(order.email)}">${escapeHTML(order.email)}</a> · <a href="tel:${encodeURIComponent(order.phone)}">${escapeHTML(order.phone)}</a><br>${lineAddress}${order.note ? `<br>Note: ${escapeHTML(order.note)}` : ''}<br>${tracking}</p>
      <div class="admin-order-lines">${items}</div>
      <div class="admin-order-total"><span>Order total</span><strong>₹${order.subtotal}</strong></div>
      ${error}${notifications}
      <div class="admin-actions">
        <div class="admin-action-row">
          <button class="create-shipment button-dark" type="button" ${order.shiprocketShipmentId ? 'disabled' : ''}>${order.shiprocketShipmentId ? 'Shiprocket shipment ready' : 'Create Shiprocket shipment'}</button>
          <button class="load-couriers" type="button" ${order.shiprocketShipmentId ? '' : 'disabled'}>Find courier rates</button>
          <button class="request-pickup" type="button" ${order.shiprocketShipmentId && order.awbCode ? '' : 'disabled'}>Request pickup</button>
        </div>
        <div class="courier-choice" hidden><select aria-label="Select a courier"><option value="">Choose an available courier</option></select><button class="assign-courier" type="button" disabled>Assign AWB</button></div>
        <div class="admin-action-row">
          <select class="shipment-status" aria-label="Delivery status">${options}</select>
          <input class="awb-input" maxlength="100" placeholder="Courier AWB / tracking number" value="${escapeHTML(order.awbCode)}">
          <input class="courier-input" maxlength="100" placeholder="Courier name" value="${escapeHTML(order.courierName)}">
          <input class="tracking-input" type="url" maxlength="500" placeholder="https://tracking link" value="${escapeHTML(order.trackingUrl)}">
          <button class="save-status button-dark" type="button">Save delivery status</button>
        </div>
      </div>
    </article>`;
  }

  async function loadOrders() {
    ordersError.textContent = '';
    ordersList.innerHTML = '<p class="admin-empty">Loading orders…</p>';
    try {
      const data = await api('/api/admin/orders');
      document.getElementById('admin-summary').textContent = `${data.orders.length} latest orders · ${data.orders.filter((order) => order.paymentStatus === 'paid' || order.paymentMethod === 'cod').length} ready for fulfillment`;
      setupNotice.hidden = data.paymentsConfigured && data.shippingConfigured;
      setupNotice.textContent = [
        data.paymentsConfigured ? '' : 'Online payments need Razorpay test/live keys in .env.',
        data.shippingConfigured ? '' : 'Shiprocket shipping needs your Shiprocket login in .env. Orders are saved and can be updated manually.'
      ].filter(Boolean).join(' ');
      ordersList.innerHTML = data.orders.length
        ? data.orders.map(orderCard).join('')
        : '<p class="admin-empty">No orders yet. New customer purchases will appear here.</p>';
    } catch (error) {
      if (/sign in/i.test(error.message)) {
        loginPanel.hidden = false;
        ordersPanel.hidden = true;
        logoutButton.hidden = true;
        return;
      }
      ordersList.innerHTML = '';
      ordersError.textContent = error.message;
    }
  }

  async function perform(button, action) {
    const card = button.closest('[data-order-id]');
    button.disabled = true;
    card.querySelector('.admin-error')?.remove();
    try {
      await action(card);
      await loadOrders();
    } catch (error) {
      const message = document.createElement('p');
      message.className = 'admin-order-meta admin-error';
      message.textContent = error.message;
      card.querySelector('.admin-actions').prepend(message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    loginError.textContent = '';
    submit.disabled = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      form.reset();
      setAuthenticated();
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch (error) { ordersError.textContent = error.message; }
    loginPanel.hidden = false;
    ordersPanel.hidden = true;
    logoutButton.hidden = true;
  });

  document.getElementById('refresh-orders').addEventListener('click', loadOrders);

  ordersList.addEventListener('change', (event) => {
    if (event.target.matches('.courier-choice select')) {
      event.target.closest('.courier-choice').querySelector('.assign-courier').disabled = !event.target.value;
    }
  });

  ordersList.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const card = button.closest('[data-order-id]');
    const id = encodeURIComponent(card.dataset.orderId);
    if (button.matches('.create-shipment')) {
      perform(button, () => api(`/api/admin/orders/${id}/shiprocket`, { method: 'POST', body: '{}' }));
    } else if (button.matches('.load-couriers')) {
      perform(button, async (orderCardElement) => {
        const result = await api(`/api/admin/orders/${id}/couriers`);
        const choices = orderCardElement.querySelector('.courier-choice');
        const select = choices.querySelector('select');
        select.innerHTML = '<option value="">Choose an available courier</option>' + result.couriers.map((courier) => `<option value="${escapeHTML(courier.id)}">${escapeHTML(courier.name)} · ₹${escapeHTML(courier.rate)} · ${escapeHTML(courier.estimatedDays)} days</option>`).join('');
        choices.hidden = false;
        if (!result.couriers.length) throw new Error('No courier services are available for this PIN code.');
      });
    } else if (button.matches('.assign-courier')) {
      perform(button, (orderCardElement) => api(`/api/admin/orders/${id}/shiprocket/assign`, {
        method: 'POST',
        body: JSON.stringify({ courierId: orderCardElement.querySelector('.courier-choice select').value })
      }));
    } else if (button.matches('.request-pickup')) {
      perform(button, () => api(`/api/admin/orders/${id}/shiprocket/pickup`, { method: 'POST', body: '{}' }));
    } else if (button.matches('.save-status')) {
      perform(button, (orderCardElement) => api(`/api/admin/orders/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          shipmentStatus: orderCardElement.querySelector('.shipment-status').value,
          awbCode: orderCardElement.querySelector('.awb-input').value,
          courierName: orderCardElement.querySelector('.courier-input').value,
          trackingUrl: orderCardElement.querySelector('.tracking-input').value
        })
      }));
    }
  });

  api('/api/admin/session').then(setAuthenticated).catch(() => {
    loginPanel.hidden = false;
  });
})();
