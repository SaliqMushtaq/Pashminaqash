(() => {
  const detail = document.getElementById('product-detail');
  const slug = new URLSearchParams(location.search).get('slug');
  let selectedProduct = null;
  let quantity = 1;

  function render(product) {
    selectedProduct = product;
    document.title = `${product.name} — PashminaQash`;
    document.querySelector('meta[name="description"]').content = product.description;
    document.getElementById('breadcrumb-product').textContent = product.name;
    const sale = product.compareAt ? `<span class="old-price">${Store.money(product.compareAt)}</span>` : '';
    detail.innerHTML = `<div class="detail-image-wrap">${product.badge ? `<span class="product-badge">${Store.escapeHTML(product.badge)}</span>` : ''}<img class="detail-image" src="${Store.escapeHTML(product.image)}" alt="${Store.escapeHTML(product.name)}"></div>
      <div class="product-info"><p class="eyebrow"><span class="eyebrow-line"></span>${Store.escapeHTML(product.category)} / PashminaQash</p><h1>${Store.escapeHTML(product.name)}</h1><p class="detail-price">${sale}${Store.money(product.price)}</p><p class="description">${Store.escapeHTML(product.description)}</p><p class="detail-spec">${Store.escapeHTML(product.details)}</p><p class="stock-note">${product.stock > 0 ? '✳&nbsp; In stock and ready to be yours' : 'Currently finding its way back to us'}</p><div class="purchase-row"><div class="quantity-control"><button type="button" data-step="-1" aria-label="Remove one">−</button><output id="detail-quantity">1</output><button type="button" data-step="1" aria-label="Add one">+</button></div><button class="button button-dark" id="detail-add" type="button" ${product.stock < 1 ? 'disabled' : ''}>${product.stock > 0 ? 'Add to your bag' : 'Sold out'} <span>↗</span></button></div><p class="detail-note">Free delivery on orders over ₹5,000. Carefully packed, always.</p></div>`;
    detail.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
      quantity = Math.max(1, Math.min(Number(product.stock || 1), quantity + Number(button.dataset.step)));
      document.getElementById('detail-quantity').textContent = String(quantity);
    }));
    document.getElementById('detail-add').addEventListener('click', () => {
      if (Store.addToCart(product, quantity)) {
        quantity = 1;
        document.getElementById('detail-quantity').textContent = '1';
      }
    });
  }

  async function boot() {
    if (!slug) {
      detail.innerHTML = '<div class="detail-error">This piece could not be found.<br><a class="text-link" href="/#shop">Back to the shop <span>↗</span></a></div>';
      return;
    }
    try {
      const [product, all] = await Promise.all([Store.api(`/api/products/${encodeURIComponent(slug)}`), Store.loadProducts()]);
      render(product);
      const related = all.filter((item) => item.id !== product.id).slice(0, 4);
      document.getElementById('related-grid').innerHTML = related.map((item) => {
        const badge = item.badge ? `<span class="product-badge">${Store.escapeHTML(item.badge)}</span>` : '';
        const soldOut = item.stock < 1;
        return `<article class="product-card"><div class="product-image-wrap">${badge}<a class="product-image-link" href="/product.html?slug=${encodeURIComponent(item.slug)}"><img class="product-image" src="${Store.escapeHTML(item.image)}" alt="${Store.escapeHTML(item.name)}" loading="lazy"></a><button class="quick-add" type="button" data-add-product="${item.id}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold out' : 'Add to bag'} <span>${soldOut ? '—' : '+'}</span></button></div><div class="product-meta"><div><span class="product-category">${Store.escapeHTML(item.category)}</span><a class="product-name" href="/product.html?slug=${encodeURIComponent(item.slug)}">${Store.escapeHTML(item.name)}</a></div><span class="product-price">${Store.money(item.price)}</span></div></article>`;
      }).join('');
    } catch {
      detail.innerHTML = '<div class="detail-error">This piece is having a quiet moment.<br><a class="text-link" href="/#shop">Back to the shop <span>↗</span></a></div>';
    }
  }

  document.getElementById('related-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-product]');
    if (!button) return;
    const product = Store.products.find((item) => Number(item.id) === Number(button.dataset.addProduct));
    if (product) Store.addToCart(product);
  });
  boot();
})();
