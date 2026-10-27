(() => {
  const grid = document.getElementById('product-grid');
  const empty = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const categoryStrip = document.querySelector('.category-strip');
  let selectedCategory = 'All';
  let searchTimer;

  function card(product) {
    const oldPrice = product.compareAt ? `<span class="old-price">${Store.money(product.compareAt)}</span>` : '';
    const badge = product.badge ? `<span class="product-badge">${Store.escapeHTML(product.badge)}</span>` : '';
    const soldOut = product.stock < 1;
    return `<article class="product-card">
      <div class="product-image-wrap">
        ${badge}<a class="product-image-link" href="/product.html?slug=${encodeURIComponent(product.slug)}" aria-label="View ${Store.escapeHTML(product.name)}"><img class="product-image" src="${Store.escapeHTML(product.image)}" alt="${Store.escapeHTML(product.name)}" loading="lazy"></a>
        <button class="quick-add" type="button" data-add-product="${product.id}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold out' : 'Add to bag'} <span>${soldOut ? '—' : '+'}</span></button>
      </div>
      <div class="product-meta"><div><span class="product-category">${Store.escapeHTML(product.category)}</span><a class="product-name" href="/product.html?slug=${encodeURIComponent(product.slug)}">${Store.escapeHTML(product.name)}</a></div><span class="product-price">${oldPrice}${Store.money(product.price)}</span></div>
    </article>`;
  }

  async function updateProducts() {
    const params = new URLSearchParams();
    if (selectedCategory !== 'All') params.set('category', selectedCategory);
    if (searchInput?.value.trim()) params.set('search', searchInput.value.trim());
    const suffix = params.size ? `?${params.toString()}` : '';
    grid.innerHTML = '<div class="loading-state">Gathering the good things…</div>';
    try {
      const products = await Store.loadProducts(suffix);
      grid.innerHTML = products.map(card).join('');
      empty.hidden = products.length > 0;
      grid.hidden = products.length === 0;
    } catch {
      grid.innerHTML = '<p class="loading-state">The shop is taking a little breather. Please refresh in a moment.</p>';
      empty.hidden = true;
    }
  }

  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    selectedCategory = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((pill) => pill.classList.toggle('active', pill === button));
    updateProducts();
  }));
  document.querySelectorAll('[data-category-link]').forEach((link) => link.addEventListener('click', () => {
    selectedCategory = link.dataset.categoryLink;
    document.querySelectorAll('[data-filter]').forEach((pill) => pill.classList.toggle('active', pill.dataset.filter === selectedCategory));
    updateProducts();
  }));
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateProducts, 180);
  });
  document.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
    selectedCategory = 'All';
    searchInput.value = '';
    document.querySelectorAll('[data-filter]').forEach((pill) => pill.classList.toggle('active', pill.dataset.filter === 'All'));
    updateProducts();
  });
  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-product]');
    if (!button) return;
    const product = Store.products.find((item) => Number(item.id) === Number(button.dataset.addProduct));
    if (product && Store.addToCart(product)) {
      button.innerHTML = 'Added <span>✓</span>';
      setTimeout(() => { if (button.isConnected) button.innerHTML = 'Add to bag <span>+</span>'; }, 1100);
    }
  });

  categoryStrip?.addEventListener('click', (event) => {
    if (event.target === categoryStrip || event.target === categoryStrip.querySelector('p')) categoryStrip.classList.toggle('expanded');
  });

  const initialCategory = new URLSearchParams(location.search).get('category');
  const initialSearch = new URLSearchParams(location.search).get('search');
  if (initialSearch && searchInput) searchInput.value = initialSearch;
  if (initialCategory && [...document.querySelectorAll('[data-filter]')].some((button) => button.dataset.filter === initialCategory)) {
    selectedCategory = initialCategory;
    document.querySelectorAll('[data-filter]').forEach((pill) => pill.classList.toggle('active', pill.dataset.filter === selectedCategory));
  }
  updateProducts();
})();
