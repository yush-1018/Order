import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Check,
  AlertTriangle,
  Trash2,
  Plus,
  HelpCircle,
  Tag,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  Loader2,
  DollarSign,
  Layers,
  CheckCircle2,
  ExternalLink,
  Search,
  X
} from 'lucide-react';

export default function OrderReviewTable({
  initialParsed,
  customerId,
  customerName,
  transcript,
  onOrderConfirmed,
  onBackToVoice,
}) {
  const [items, setItems] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [catalogueProducts, setCatalogueProducts] = useState([]);
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);

  // Totals & Previews
  const [total, setTotal] = useState(0);
  const [totalMrp, setTotalMrp] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [paidNow, setPaidNow] = useState(0);
  const [paymentOption, setPaymentOption] = useState('full'); // 'full' | 'partial' | 'credit' | 'custom'
  const [paymentMethod, setPaymentMethod] = useState('simulated_cash');
  const [recalculating, setRecalculating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [warnings, setWarnings] = useState([]);

  // Modal 1: Add from catalogue modal state
  const [isAddFromCatModal, setIsAddFromCatModal] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [selectedCatProd, setSelectedCatProd] = useState(null);
  const [catAddQty, setCatAddQty] = useState(1);
  const [catAddPrice, setCatAddPrice] = useState('');

  // Modal 2: Custom item modal state
  const [isCustomModal, setIsCustomModal] = useState(false);
  const [customIndex, setCustomIndex] = useState(null);
  const [customForm, setCustomForm] = useState({
    name: '',
    quantity: 1,
    unit: 'piece',
    price: '',
    mrp: '',
    category: 'general',
    alsoSaveCatalogue: false,
  });
  const [customSubmitting, setCustomSubmitting] = useState(false);

  // Modal 3: Add to catalogue modal state (from unmatched row)
  const [isAddCatModal, setIsAddCatModal] = useState(false);
  const [addCatIndex, setAddCatIndex] = useState(null);
  const [catFormData, setCatFormData] = useState({
    name: '',
    category: '',
    mrp: '',
    price: '',
    stock: '50',
    unit: 'packet',
  });
  const [catSubmitting, setCatSubmitting] = useState(false);

  // Initialize from initial parsed result
  useEffect(() => {
    if (initialParsed) {
      setItems(initialParsed.items || []);
      setUnmatched(initialParsed.unmatched || []);
      setTotal(initialParsed.total || 0);
      setTotalMrp(initialParsed.totalMrp || initialParsed.total || 0);
      setTotalSavings(initialParsed.totalSavings || 0);

      // Initialize payment option from parsed intent
      const intent = initialParsed.paymentIntent || {};
      if (intent.type === 'partial') {
        setPaymentOption('partial');
        setPaidNow(initialParsed.suggestedPaidNow || Math.round(initialParsed.total * 0.5));
      } else if (intent.type === 'credit') {
        setPaymentOption('credit');
        setPaidNow(0);
      } else {
        setPaymentOption('full');
        setPaidNow(initialParsed.total || 0);
      }
    }
  }, [initialParsed]);

  // Fetch full catalogue for dropdowns
  useEffect(() => {
    const fetchCatalogue = async () => {
      try {
        const res = await api.get('/products');
        setCatalogueProducts(res.data.products || []);
      } catch (err) {
        console.error('Failed to load catalogue:', err);
      } finally {
        setLoadingCatalogue(false);
      }
    };
    fetchCatalogue();
  }, []);

  // Recalculate totals via backend preview whenever items change
  const recalculateBackendPreview = async (currentItems) => {
    if (currentItems.length === 0) {
      setTotal(0);
      setTotalMrp(0);
      setTotalSavings(0);
      if (paymentOption === 'full') setPaidNow(0);
      return;
    }

    try {
      setRecalculating(true);
      const payloadItems = currentItems.map((it) => ({
        productId: it.productId,
        name: it.productName || it.name,
        quantity: parseFloat(it.quantity) || 1,
        unit: it.unit,
        mrp: it.mrp !== undefined && it.mrp !== null ? Number(it.mrp) : Number(it.unitPrice),
        priceOverride: Number(it.unitPrice),
        unitPrice: Number(it.unitPrice),
        price: Number(it.unitPrice),
        isCustom: Boolean(it.isCustom),
        custom: Boolean(it.isCustom),
      }));

      const res = await api.post('/orders/preview', { items: payloadItems });
      if (res.data.success) {
        setTotal(res.data.total);
        setTotalMrp(res.data.totalMrp || res.data.total);
        setTotalSavings(res.data.totalSavings || 0);
        setWarnings(res.data.warnings || []);

        // Adjust paidNow based on active payment option
        if (paymentOption === 'full') {
          setPaidNow(res.data.total);
        } else if (paymentOption === 'partial') {
          setPaidNow(Math.round(res.data.total * 0.5));
        } else if (paymentOption === 'credit') {
          setPaidNow(0);
        } else {
          // Custom: ensure not exceeding new total
          setPaidNow((prev) => Math.min(prev, res.data.total));
        }
      }
    } catch (err) {
      console.error('Error previewing order:', err);
    } finally {
      setRecalculating(false);
    }
  };

  // Quantity change on an existing item row (supports decimals like 0.5, 1.5)
  const handleQuantityChange = (index, newQty) => {
    const val = parseFloat(newQty) || 0;
    const updated = [...items];
    const item = updated[index];
    item.quantity = val;
    item.lineTotal = Math.round(val * item.unitPrice * 100) / 100;
    const mrp = item.mrp !== undefined && item.mrp !== null ? item.mrp : item.unitPrice;
    item.saving = Math.max(0, Math.round((mrp - item.unitPrice) * val * 100) / 100);
    setItems(updated);
    if (val > 0) {
      recalculateBackendPreview(updated);
    }
  };

  // Editable selling price per row
  const handlePriceChange = (index, newPrice) => {
    const val = parseFloat(newPrice) || 0;
    const updated = [...items];
    const item = updated[index];
    const catProd = !item.isCustom ? catalogueProducts.find((p) => p._id === item.productId) : null;
    const catPrice = catProd ? catProd.price : item.unitPrice;
    const mrp = item.mrp !== undefined && item.mrp !== null ? item.mrp : item.unitPrice;

    item.unitPrice = val;
    item.priceOverride = val;
    item.isPriceEdited = catProd ? val !== catPrice : false;
    item.lineTotal = Math.round((item.quantity || 1) * val * 100) / 100;
    item.saving = Math.max(0, Math.round((mrp - val) * (item.quantity || 1) * 100) / 100);

    setItems(updated);
    if (val > 0 && val <= mrp) {
      recalculateBackendPreview(updated);
    }
  };

  // Remove an item row
  const handleRemoveItem = (index) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    recalculateBackendPreview(updated);
  };

  // Change matched product on a row
  const handleProductChange = (index, newProductId) => {
    const prod = catalogueProducts.find((p) => p._id === newProductId);
    if (!prod) return;

    const updated = [...items];
    const qty = updated[index].quantity || 1;
    const mrp = prod.mrp !== undefined && prod.mrp !== null ? prod.mrp : prod.price;
    const unitPrice = prod.price;

    if (updated[index].heardText) {
      learnProductAlias(prod._id, updated[index].heardText);
    }

    updated[index] = {
      ...updated[index],
      productId: prod._id,
      productName: prod.name,
      category: prod.category || 'general',
      unit: prod.unit || 'piece',
      mrp,
      unitPrice,
      priceOverride: unitPrice,
      lineTotal: Math.round(qty * unitPrice * 100) / 100,
      saving: Math.max(0, Math.round((mrp - unitPrice) * qty * 100) / 100),
      confidence: 'high',
      isCustom: false,
      isPriceEdited: false,
    };

    setItems(updated);
    recalculateBackendPreview(updated);
  };

  // Resolve an unmatched row via dropdown selection
  const handleResolveUnmatchedWithProduct = (unmatchedIndex, selectedProductId) => {
    const prod = catalogueProducts.find((p) => p._id === selectedProductId);
    if (!prod) return;

    const un = unmatched[unmatchedIndex];
    const qty = un.quantity || 1;
    const mrp = prod.mrp !== undefined && prod.mrp !== null ? prod.mrp : prod.price;
    const unitPrice = prod.price;

    if (un.heardText) {
      learnProductAlias(prod._id, un.heardText);
    }

    const newItem = {
      heardText: un.heardText,
      productId: prod._id,
      productName: prod.name,
      category: prod.category || 'general',
      quantity: qty,
      unit: prod.unit || un.unit || 'piece',
      mrp,
      unitPrice,
      priceOverride: unitPrice,
      lineTotal: Math.round(qty * unitPrice * 100) / 100,
      saving: Math.max(0, Math.round((mrp - unitPrice) * qty * 100) / 100),
      confidence: 'high',
      isCustom: false,
      isPriceEdited: false,
    };

    const nextItems = [...items, newItem];
    const nextUnmatched = unmatched.filter((_, i) => i !== unmatchedIndex);

    setItems(nextItems);
    setUnmatched(nextUnmatched);
    recalculateBackendPreview(nextItems);
  };

  // Open "From Catalogue" modal
  const handleOpenAddFromCat = () => {
    setCatSearch('');
    setSelectedCatProd(catalogueProducts[0] || null);
    setCatAddQty(1);
    setCatAddPrice(catalogueProducts[0] ? catalogueProducts[0].price : '');
    setIsAddFromCatModal(true);
  };

  // Submit adding item from catalogue
  const handleAddFromCatSubmit = (e) => {
    e.preventDefault();
    if (!selectedCatProd) {
      alert('Please select a product.');
      return;
    }

    const qty = parseFloat(catAddQty) || 1;
    if (qty <= 0) {
      alert('Quantity must be greater than 0.');
      return;
    }

    const catPrice = Number(selectedCatProd.price);
    const catMrp = selectedCatProd.mrp !== undefined && selectedCatProd.mrp !== null ? Number(selectedCatProd.mrp) : catPrice;
    const sellingPrice = catAddPrice !== '' ? parseFloat(catAddPrice) : catPrice;

    if (isNaN(sellingPrice) || sellingPrice <= 0) {
      alert('Selling price must be greater than 0.');
      return;
    }
    if (sellingPrice > catMrp) {
      alert(`Selling price cannot exceed MRP (₹${catMrp}).`);
      return;
    }

    const isPriceEdited = sellingPrice !== catPrice;
    const lineTotal = Math.round(qty * sellingPrice * 100) / 100;
    const saving = Math.max(0, Math.round((catMrp - sellingPrice) * qty * 100) / 100);

    const newItem = {
      productId: selectedCatProd._id,
      name: selectedCatProd.name,
      productName: selectedCatProd.name,
      category: selectedCatProd.category || 'general',
      quantity: qty,
      unit: selectedCatProd.unit || 'piece',
      mrp: catMrp,
      unitPrice: sellingPrice,
      priceOverride: sellingPrice,
      lineTotal,
      saving,
      isCustom: false,
      isPriceEdited,
      confidence: 'high',
    };

    const nextItems = [...items, newItem];
    setItems(nextItems);
    setIsAddFromCatModal(false);
    recalculateBackendPreview(nextItems);
  };

  // Open "Custom Item" modal
  const handleOpenAddCustomItem = (unmatchedIdx = null) => {
    setCustomIndex(unmatchedIdx);
    if (unmatchedIdx !== null) {
      const un = unmatched[unmatchedIdx];
      setCustomForm({
        name: un.heardText.charAt(0).toUpperCase() + un.heardText.slice(1),
        quantity: un.quantity || 1,
        unit: un.unit || 'piece',
        price: '',
        mrp: '',
        category: 'general',
        alsoSaveCatalogue: false,
      });
    } else {
      setCustomForm({
        name: '',
        quantity: 1,
        unit: 'piece',
        price: '',
        mrp: '',
        category: 'general',
        alsoSaveCatalogue: false,
      });
    }
    setIsCustomModal(true);
  };

  // Submit custom item
  const handleCustomItemSubmit = async (e) => {
    e.preventDefault();
    if (!customForm.name.trim() || customForm.price === '') {
      alert('Item name and selling price are required.');
      return;
    }

    const numQty = parseFloat(customForm.quantity) || 1;
    const numPrice = parseFloat(customForm.price) || 0;
    const numMrp = customForm.mrp !== '' && customForm.mrp !== null ? parseFloat(customForm.mrp) : numPrice;

    if (numQty <= 0) {
      alert('Quantity must be greater than 0.');
      return;
    }
    if (numPrice <= 0) {
      alert('Selling price must be greater than 0.');
      return;
    }
    if (numMrp <= 0) {
      alert('MRP must be greater than 0.');
      return;
    }
    if (numPrice > numMrp) {
      alert('Selling price cannot exceed MRP.');
      return;
    }

    setCustomSubmitting(true);
    try {
      let createdProduct = null;
      if (customForm.alsoSaveCatalogue) {
        const res = await api.post('/products', {
          name: customForm.name.trim(),
          category: (customForm.category || 'general').trim().toLowerCase(),
          aliases: [customForm.name.trim().toLowerCase()],
          mrp: numMrp,
          price: numPrice,
          unit: customForm.unit || 'piece',
          stock: 50,
          active: true,
        });
        createdProduct = res.data.product;
        setCatalogueProducts((prev) => [...prev, createdProduct]);
      }

      const lineTotal = Math.round(numQty * numPrice * 100) / 100;
      const saving = Math.max(0, Math.round((numMrp - numPrice) * numQty * 100) / 100);

      const newItem = {
        productId: createdProduct ? createdProduct._id : undefined,
        name: customForm.name.trim(),
        productName: customForm.name.trim(),
        category: customForm.category || 'general',
        quantity: numQty,
        unit: customForm.unit || 'piece',
        mrp: numMrp,
        unitPrice: numPrice,
        priceOverride: numPrice,
        lineTotal,
        saving,
        isCustom: !createdProduct,
        isPriceEdited: false,
        confidence: 'manual',
      };

      const nextItems = [...items, newItem];
      let nextUnmatched = unmatched;
      if (customIndex !== null) {
        nextUnmatched = unmatched.filter((_, i) => i !== customIndex);
      }

      setItems(nextItems);
      setUnmatched(nextUnmatched);
      setIsCustomModal(false);
      recalculateBackendPreview(nextItems);
    } catch (err) {
      console.error('Custom item error:', err);
      alert(err.response?.data?.message || 'Failed to add custom item.');
    } finally {
      setCustomSubmitting(false);
    }
  };

  // Open "Add to catalogue" modal for an unmatched row
  const handleOpenAddCatalogue = (unmatchedIndex) => {
    const un = unmatched[unmatchedIndex];
    setAddCatIndex(unmatchedIndex);
    setCatFormData({
      name: un.heardText.charAt(0).toUpperCase() + un.heardText.slice(1),
      category: 'general',
      mrp: '50',
      price: '50',
      stock: '50',
      unit: un.unit || 'packet',
    });
    setIsAddCatModal(true);
  };

  // Submit "Add to catalogue"
  const handleSaveToCatalogueAndAttach = async (e) => {
    e.preventDefault();
    if (!catFormData.name.trim() || !catFormData.mrp || !catFormData.price) return;

    const numMrp = Number(catFormData.mrp);
    const numPrice = Number(catFormData.price);
    if (numPrice > numMrp) {
      alert('Selling price cannot exceed MRP.');
      return;
    }
    if (numPrice <= 0 || numMrp <= 0) {
      alert('Price and MRP must be greater than 0.');
      return;
    }

    setCatSubmitting(true);
    try {
      const un = unmatched[addCatIndex];
      const res = await api.post('/products', {
        name: catFormData.name.trim(),
        category: catFormData.category.trim().toLowerCase(),
        aliases: [un.heardText.toLowerCase()],
        mrp: numMrp,
        price: numPrice,
        stock: Number(catFormData.stock || 0),
        unit: catFormData.unit,
        active: true,
      });

      const newProd = res.data.product;
      setCatalogueProducts((prev) => [...prev, newProd]);

      // Resolve row with this newly created product
      const qty = un.quantity || 1;
      const mrp = newProd.mrp !== undefined && newProd.mrp !== null ? newProd.mrp : newProd.price;
      const unitPrice = newProd.price;

      const newItem = {
        heardText: un.heardText,
        productId: newProd._id,
        productName: newProd.name,
        category: newProd.category,
        quantity: qty,
        unit: newProd.unit,
        mrp,
        unitPrice,
        priceOverride: unitPrice,
        lineTotal: Math.round(qty * unitPrice * 100) / 100,
        saving: Math.max(0, Math.round((mrp - unitPrice) * qty * 100) / 100),
        confidence: 'high',
        isCustom: false,
        isPriceEdited: false,
      };

      const nextItems = [...items, newItem];
      const nextUnmatched = unmatched.filter((_, i) => i !== addCatIndex);

      setItems(nextItems);
      setUnmatched(nextUnmatched);
      setIsAddCatModal(false);
      recalculateBackendPreview(nextItems);
    } catch (err) {
      alert(err.response?.data?.message || 'Error creating product.');
    } finally {
      setCatSubmitting(false);
    }
  };

  // Alias learning helper
  const learnProductAlias = async (productId, heardText) => {
    try {
      await api.post(`/products/${productId}/learn-alias`, { alias: heardText });
    } catch (err) {
      console.warn('Could not learn alias:', err.message);
    }
  };

  // Add a blank row manually
  const handleAddManualRow = () => {
    if (catalogueProducts.length === 0) return;
    const first = catalogueProducts[0];
    const mrp = first.mrp !== undefined && first.mrp !== null ? first.mrp : first.price;
    const unitPrice = first.price;

    const newItem = {
      productId: first._id,
      productName: first.name,
      category: first.category || 'general',
      quantity: 1,
      unit: first.unit || 'piece',
      mrp,
      unitPrice,
      lineTotal: unitPrice,
      saving: Math.max(0, mrp - unitPrice),
      confidence: 'manual',
      isCustom: false,
    };
    const nextItems = [...items, newItem];
    setItems(nextItems);
    recalculateBackendPreview(nextItems);
  };

  // Payment Option radio change
  const handlePaymentOptionChange = (opt) => {
    setPaymentOption(opt);
    if (opt === 'full') {
      setPaidNow(total);
    } else if (opt === 'partial') {
      setPaidNow(Math.round(total * 0.5));
    } else if (opt === 'credit') {
      setPaidNow(0);
    }
  };

  // Confirm order submission
  const handleConfirmOrder = async () => {
    if (unmatched.length > 0) {
      alert('Cannot confirm order while there are unresolved unmatched items. Please match or remove them.');
      return;
    }

    if (items.length === 0) {
      alert('Order must have at least one item.');
      return;
    }

    // Pre-validate item prices before submitting
    for (const it of items) {
      const price = Number(it.unitPrice);
      const mrp = it.mrp !== undefined && it.mrp !== null ? Number(it.mrp) : price;
      if (isNaN(price) || price <= 0) {
        alert(`Selling price for "${it.name || it.productName}" must be greater than 0.`);
        return;
      }
      if (price > mrp) {
        alert(`Selling price for "${it.name || it.productName}" (₹${price}) cannot exceed MRP (₹${mrp}).`);
        return;
      }
    }

    setConfirming(true);
    try {
      const payload = {
        customerId,
        items: items.map((it) => ({
          productId: it.productId,
          name: it.productName || it.name,
          quantity: parseFloat(it.quantity) || 1,
          unit: it.unit,
          mrp: it.mrp !== undefined && it.mrp !== null ? Number(it.mrp) : Number(it.unitPrice),
          priceOverride: Number(it.unitPrice),
          unitPrice: Number(it.unitPrice),
          price: Number(it.unitPrice),
          lineTotal: Number(it.lineTotal),
          isCustom: Boolean(it.isCustom),
          custom: Boolean(it.isCustom),
          isPriceEdited: Boolean(it.isPriceEdited),
        })),
        paidAmount: Number(paidNow) || 0,
        paymentMethod,
        transcript: transcript || '',
      };

      const res = await api.post('/orders', payload);
      if (res.data.success) {
        onOrderConfirmed(res.data);
      }
    } catch (err) {
      console.error('Confirm order error:', err);
      alert(err.response?.data?.message || 'Error confirming order.');
    } finally {
      setConfirming(false);
    }
  };

  const remainingDue = Math.max(0, Math.round((total - paidNow) * 100) / 100);
  const hasUnmatched = unmatched.length > 0;
  const isConfirmDisabled = hasUnmatched || items.length === 0 || confirming || recalculating;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-6 sm:p-8">
      {/* Review Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200">
              Order Review &amp; Confirmation
            </span>
            <span className="text-xs text-slate-500 font-medium">Merchant Confirmation Required</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            Review Voice Order for {customerName || 'Customer'}
          </h2>
          {transcript && (
            <p className="text-xs text-slate-500 mt-1 italic font-mono bg-slate-50 p-2 rounded-lg border border-slate-200">
              &ldquo;{transcript}&rdquo;
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onBackToVoice}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          &larr; Re-record / Edit Text
        </button>
      </div>

      {/* Warnings Bar */}
      {warnings.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>{warnings.join(' | ')}</span>
        </div>
      )}

      {/* UNMATCHED ITEMS SECTION (Addition to Phase 3) */}
      {hasUnmatched && (
        <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-rose-50 border-2 border-rose-300">
          <div className="flex items-center space-x-2 text-rose-800 font-bold text-sm mb-1">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <span>Unmatched Items ({unmatched.length}) — Action Required</span>
          </div>
          <p className="text-xs text-rose-700 mb-4">
            Confidence was above 0.5 distance. As per Kirana golden rules, the AI never guesses. Please resolve each item below before confirming.
          </p>

          <div className="space-y-4">
            {unmatched.map((un, uIdx) => (
              <div
                key={uIdx}
                className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-900 uppercase">Heard:</span>
                    <span className="text-sm font-black text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded">
                      &ldquo;{un.heardText}&rdquo;
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      ({un.quantity} {un.unit})
                    </span>
                  </div>
                  {un.similarByCategory && un.similarByCategory.length > 0 && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Similar in category: {un.similarByCategory.map((s) => s.name).join(', ')}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Option 1: Suggestions Dropdown */}
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleResolveUnmatchedWithProduct(uIdx, e.target.value);
                      }
                    }}
                    className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="" disabled>
                      Select matching product...
                    </option>
                    {un.suggestions && un.suggestions.length > 0 && (
                      <optgroup label="Fuzzy Suggestions">
                        {un.suggestions.map((s) => (
                          <option key={s.productId} value={s.productId}>
                            {s.name} (₹{s.price})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {un.similarByCategory && un.similarByCategory.length > 0 && (
                      <optgroup label="Category Matches">
                        {un.similarByCategory.map((s) => (
                          <option key={s.productId} value={s.productId}>
                            {s.name} (₹{s.price})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All Catalogue Products">
                      {catalogueProducts.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} (₹{p.price})
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  {/* Option 2: Add to Catalogue Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenAddCatalogue(uIdx)}
                    className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    + Add to Catalogue
                  </button>

                  {/* Option 3: Custom Item */}
                  <button
                    type="button"
                    onClick={() => handleOpenAddCustomItem(uIdx)}
                    className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Custom Item
                  </button>

                  {/* Dismiss */}
                  <button
                    type="button"
                    onClick={() => setUnmatched(unmatched.filter((_, i) => i !== uIdx))}
                    className="text-slate-400 hover:text-rose-600 p-1.5"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ITEMS TABLE OR EMPTY STATE */}
      {items.length === 0 ? (
        <div className="mt-6 p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <p className="text-base font-bold text-slate-800">No items in this order</p>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            All rows were removed. You can add items directly from your store catalogue or enter custom items below.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleOpenAddFromCat}
              className="inline-flex items-center text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2.5 rounded-xl shadow transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add From Catalogue
            </button>
            <button
              type="button"
              onClick={() => handleOpenAddCustomItem(null)}
              className="inline-flex items-center text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-4 py-2.5 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Custom Item
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Item / Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 w-24">Quantity</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">MRP (₹)</th>
                <th className="px-4 py-3">Selling Price (₹)</th>
                <th className="px-4 py-3">Total (₹)</th>
                <th className="px-4 py-3">Saving (₹)</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((it, idx) => {
                const itemMrp = it.mrp !== undefined && it.mrp !== null ? Number(it.mrp) : Number(it.unitPrice);
                const itemPrice = Number(it.unitPrice);
                const qty = Number(it.quantity) || 1;
                const hasDiscount = itemMrp > itemPrice;
                const itemSaving = hasDiscount ? Math.max(0, Math.round((itemMrp - itemPrice) * qty * 100) / 100) : 0;

                return (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    {/* Product Name / Dropdown */}
                    <td className="px-4 py-3.5">
                      {it.isCustom ? (
                        <div>
                          <span className="font-semibold text-slate-900">{it.productName || it.name}</span>
                          <span className="ml-2 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            Custom
                          </span>
                        </div>
                      ) : (
                        <select
                          value={it.productId}
                          onChange={(e) => handleProductChange(idx, e.target.value)}
                          className="text-sm font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none"
                        >
                          {catalogueProducts.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {it.heardText && (
                        <p className="text-[11px] text-slate-400 mt-0.5">Heard: &ldquo;{it.heardText}&rdquo;</p>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 capitalize">
                        {it.category || 'general'}
                      </span>
                    </td>

                    {/* Quantity Input (Allows any number/decimal) */}
                    <td className="px-4 py-3.5">
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        value={it.quantity}
                        onChange={(e) => handleQuantityChange(idx, e.target.value)}
                        className="w-20 px-2 py-1 text-sm font-bold border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </td>

                    {/* Unit */}
                    <td className="px-4 py-3.5 text-slate-600 text-xs capitalize">
                      {it.unit || 'piece'}
                    </td>

                    {/* MRP */}
                    <td className="px-4 py-3.5 text-slate-500 text-xs font-medium">
                      {hasDiscount ? (
                        <span className="line-through text-slate-400">₹{itemMrp.toFixed(2)}</span>
                      ) : (
                        <span>₹{itemMrp.toFixed(2)}</span>
                      )}
                    </td>

                    {/* Editable Selling Price Per Row */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-1">
                          <span className="text-xs font-bold text-slate-400">₹</span>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={it.unitPrice}
                            onChange={(e) => handlePriceChange(idx, e.target.value)}
                            className={`w-20 px-2 py-1 text-sm font-bold border rounded-lg text-slate-900 focus:outline-none focus:ring-2 ${
                              it.unitPrice > itemMrp || it.unitPrice <= 0
                                ? 'border-rose-400 bg-rose-50 focus:ring-rose-500'
                                : 'border-slate-300 focus:ring-amber-500'
                            }`}
                          />
                        </div>
                        {it.isPriceEdited && (
                          <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded mt-1 w-max">
                            Edited
                          </span>
                        )}
                        {it.unitPrice > itemMrp && (
                          <span className="text-[10px] text-rose-600 font-medium mt-0.5">&gt; MRP (₹{itemMrp})</span>
                        )}
                        {it.unitPrice <= 0 && (
                          <span className="text-[10px] text-rose-600 font-medium mt-0.5">Must be &gt; 0</span>
                        )}
                      </div>
                    </td>

                    {/* Line Total */}
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      ₹{Number(it.lineTotal).toFixed(2)}
                    </td>

                    {/* Per-Item Saving */}
                    <td className="px-4 py-3.5">
                      {itemSaving > 0 ? (
                        <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Save ₹{itemSaving.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">₹0.00</span>
                      )}
                    </td>

                    {/* Confidence Badge */}
                    <td className="px-4 py-3.5">
                      {it.confidence === 'high' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <Check className="w-3 h-3 mr-1" /> High
                        </span>
                      ) : it.confidence === 'low' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-3 h-3 mr-1" /> Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          Manual
                        </span>
                      )}
                    </td>

                    {/* Remove Row */}
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ADD ITEM BUTTONS (Always visible, even after all rows deleted!) */}
      <div className="mt-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleOpenAddFromCat}
            className="inline-flex items-center text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add From Catalogue
          </button>
          <button
            type="button"
            onClick={() => handleOpenAddCustomItem(null)}
            className="inline-flex items-center text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Custom Item
          </button>
        </div>

        {recalculating && (
          <span className="text-xs text-amber-600 font-medium flex items-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Recalculating DB prices...
          </span>
        )}
      </div>

      {/* PAYMENT & CONFIRMATION SECTION */}
      <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Payment Intent & Method Selection */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Payment Intent &amp; Amount Received
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <button
              type="button"
              onClick={() => handlePaymentOptionChange('full')}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors ${
                paymentOption === 'full'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Full (100%)
            </button>
            <button
              type="button"
              onClick={() => handlePaymentOptionChange('partial')}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors ${
                paymentOption === 'partial'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Aadha (50%)
            </button>
            <button
              type="button"
              onClick={() => handlePaymentOptionChange('credit')}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors ${
                paymentOption === 'credit'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Udhar (0%)
            </button>
            <button
              type="button"
              onClick={() => setPaymentOption('custom')}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-colors ${
                paymentOption === 'custom'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              Custom
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Paid Now (₹)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max={total}
                value={paidNow}
                onChange={(e) => {
                  setPaymentOption('custom');
                  setPaidNow(Math.max(0, parseFloat(e.target.value) || 0));
                }}
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="simulated_cash">Simulated Cash</option>
                <option value="simulated_upi">Simulated UPI</option>
              </select>
            </div>
          </div>

          {/* Golden Rule 3 Badge */}
          <div className="mt-3 p-2 bg-amber-100/60 border border-amber-200 rounded-lg text-[11px] text-amber-800 font-semibold flex items-center">
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-600 flex-shrink-0" />
            <span>Simulated payment mode active (No real money processed).</span>
          </div>
        </div>

        {/* Totals Summary & Confirm Button */}
        <div className="flex flex-col justify-between">
          <div className="space-y-2 bg-slate-50 p-5 rounded-2xl border border-slate-200">
            {totalMrp > total && (
              <div className="flex justify-between text-xs text-slate-400">
                <span>Total MRP Value:</span>
                <span className="line-through">₹{totalMrp.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-slate-700 font-semibold">
              <span>Order Total (Selling Price):</span>
              <span className="font-bold text-slate-900 text-base">₹{total.toFixed(2)}</span>
            </div>
            {totalSavings > 0 && (
              <div className="flex justify-between text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold">
                <span>Total Customer Savings:</span>
                <span>Save ₹{totalSavings.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-emerald-700">
              <span>Paid Now (Simulated):</span>
              <span className="font-bold">-₹{Number(paidNow).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-black pt-2 border-t border-slate-200 text-slate-900">
              <span>Remaining Balance (Udhar):</span>
              <span className={remainingDue > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                ₹{remainingDue.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="mt-4">
            {hasUnmatched && (
              <p className="text-xs text-rose-600 font-semibold mb-2 flex items-center">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                Resolve all {unmatched.length} unmatched item(s) to enable confirmation
              </p>
            )}

            <button
              type="button"
              disabled={isConfirmDisabled}
              onClick={handleConfirmOrder}
              className="w-full flex items-center justify-center py-3.5 px-6 rounded-xl font-bold text-base text-white bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <span>Deducting Stock &amp; Recording Ledger...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  <span>Confirm Order (₹{total.toFixed(2)})</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Add to Catalogue (for unmatched items) */}
      {isAddCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Add to Catalogue &amp; Attach</h3>
            <p className="text-xs text-slate-500 mb-4">
              Save this item into your store catalogue with MRP and Selling Price so voice recognizes it immediately in future orders.
            </p>

            <form onSubmit={handleSaveToCatalogueAndAttach} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={catFormData.name}
                  onChange={(e) => setCatFormData({ ...catFormData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Category (e.g. atta, tel, dal, masale)
                </label>
                <input
                  type="text"
                  value={catFormData.category}
                  onChange={(e) => setCatFormData({ ...catFormData, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    MRP (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={catFormData.mrp}
                    onChange={(e) => {
                      const newMrp = e.target.value;
                      setCatFormData((prev) => ({
                        ...prev,
                        mrp: newMrp,
                        price: prev.price === '' || prev.price === prev.mrp ? newMrp : prev.price,
                      }));
                    }}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={catFormData.price}
                    onChange={(e) => setCatFormData({ ...catFormData, price: e.target.value })}
                    placeholder="e.g. 48"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={catFormData.stock}
                    onChange={(e) => setCatFormData({ ...catFormData, stock: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Unit
                  </label>
                  <select
                    value={catFormData.unit}
                    onChange={(e) => setCatFormData({ ...catFormData, unit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="packet">packet</option>
                    <option value="kg">kg</option>
                    <option value="litre">litre</option>
                    <option value="piece">piece</option>
                    <option value="dozen">dozen</option>
                    <option value="box">box</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddCatModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow disabled:opacity-50"
                >
                  {catSubmitting ? 'Saving...' : 'Save & Attach to Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add From Catalogue */}
      {isAddFromCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <Plus className="w-4 h-4 mr-1.5 text-amber-600" />
                Add Item From Catalogue
              </h3>
              <button
                type="button"
                onClick={() => setIsAddFromCatModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Search All Products (by Name or Alias)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="e.g. atta, chini, oil, red label, parle..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Product selection list */}
            <div className="mt-3 max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {filteredCatalogue.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No matching products found. Try a different search or use &quot;Add Custom Item&quot;.
                </div>
              ) : (
                filteredCatalogue.map((prod) => {
                  const isSelected = selectedCatProd?._id === prod._id;
                  const mrpVal = prod.mrp !== undefined && prod.mrp !== null ? Number(prod.mrp) : Number(prod.price);
                  return (
                    <div
                      key={prod._id}
                      onClick={() => handleSelectCatProduct(prod)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? 'bg-amber-50/80 border-amber-300' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{prod.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center space-x-2 mt-0.5">
                          <span className="capitalize text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-medium">
                            {prod.category}
                          </span>
                          <span>Unit: {prod.unit}</span>
                          {prod.aliases && prod.aliases.length > 0 && (
                            <span className="text-slate-400 italic">({prod.aliases.slice(0, 2).join(', ')})</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900 text-sm">₹{Number(prod.price).toFixed(2)}</div>
                        {mrpVal > prod.price && (
                          <div className="text-[10px] text-slate-400 line-through">MRP: ₹{mrpVal.toFixed(2)}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected item options form */}
            {selectedCatProd && (
              <form onSubmit={handleAddFromCatSubmit} className="mt-4 pt-3 border-t border-slate-200 space-y-3">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                  <span className="font-semibold text-slate-800">{selectedCatProd.name}</span>
                  <span className="text-slate-500">
                    Catalogue Rate: ₹{Number(selectedCatProd.price).toFixed(2)} | MRP: ₹{Number(selectedCatProd.mrp || selectedCatProd.price).toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Quantity (any number or decimal) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      value={catAddQty}
                      onChange={(e) => setCatAddQty(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Selling Price (₹) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      value={catAddPrice}
                      onChange={(e) => setCatAddPrice(e.target.value)}
                      placeholder={String(selectedCatProd.price)}
                      className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddFromCatModal(false)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow"
                  >
                    Add to Order
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Add Custom Item */}
      {isCustomModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center">
                <Plus className="w-4 h-4 mr-1.5 text-amber-600" />
                Add Custom Item
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCustomItemSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={customForm.name}
                  onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                  placeholder="e.g. Loose Chana Dal"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={customForm.quantity}
                    onChange={(e) => setCustomForm({ ...customForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Unit
                  </label>
                  <select
                    value={customForm.unit}
                    onChange={(e) => setCustomForm({ ...customForm, unit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="packet">packet</option>
                    <option value="kg">kg</option>
                    <option value="litre">litre</option>
                    <option value="piece">piece</option>
                    <option value="dozen">dozen</option>
                    <option value="gm">gram</option>
                    <option value="bottle">bottle</option>
                    <option value="box">box</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={customForm.price}
                    onChange={(e) => setCustomForm({ ...customForm, price: e.target.value })}
                    placeholder="e.g. 85"
                    className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    MRP (₹) <span className="text-slate-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={customForm.mrp}
                    onChange={(e) => setCustomForm({ ...customForm, mrp: e.target.value })}
                    placeholder="Default: price"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Category <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  type="text"
                  value={customForm.category}
                  onChange={(e) => setCustomForm({ ...customForm, category: e.target.value })}
                  placeholder="e.g. dal, snacks, masale"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Optional Checkbox: Also save to catalogue */}
              <div className="pt-2">
                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={customForm.alsoSaveCatalogue}
                    onChange={(e) => setCustomForm({ ...customForm, alsoSaveCatalogue: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                  />
                  <div className="text-xs text-slate-700">
                    <span className="font-semibold">Also save to store catalogue</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Adds this product to your store inventory so voice and future orders recognize it.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 mt-4">
                <button
                  type="button"
                  onClick={() => setIsCustomModal(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={customSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow disabled:opacity-50"
                >
                  {customSubmitting ? 'Saving...' : 'Add Custom Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
