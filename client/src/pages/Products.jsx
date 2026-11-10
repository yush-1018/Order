import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { ShoppingBag, Plus, Search, Edit2, Trash2, X, Check, AlertCircle, RefreshCw, Tag } from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    aliases: '',
    mrp: '',
    price: '',
    stock: '',
    unit: 'packet',
    active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/products', { params });
      setProducts(res.data.products || []);
    } catch (err) {
      console.error('Failed to load products:', err);
      setError(err.response?.data?.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [search]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      name: '',
      category: '',
      aliases: '',
      mrp: '',
      price: '',
      stock: '50',
      unit: 'packet',
      active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prod) => {
    setEditingId(prod._id);
    const prodMrp = prod.mrp !== undefined && prod.mrp !== null ? prod.mrp : prod.price;
    setFormData({
      name: prod.name,
      category: prod.category || '',
      aliases: (prod.aliases || []).join(', '),
      mrp: prodMrp,
      price: prod.price,
      stock: prod.stock,
      unit: prod.unit || 'piece',
      active: prod.active !== false,
    });
    setIsModalOpen(true);
  };

  const handleMrpChange = (newMrp) => {
    setFormData((prev) => {
      // Default selling price to MRP if selling price was empty or was identical to old MRP
      const shouldUpdatePrice =
        prev.price === '' || prev.price === prev.mrp || Number(prev.price) > Number(newMrp);
      return {
        ...prev,
        mrp: newMrp,
        price: shouldUpdatePrice ? newMrp : prev.price,
      };
    });
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }
    try {
      await api.delete(`/products/${id}`);
      setSuccess(`Deleted product "${name}" successfully.`);
      setTimeout(() => setSuccess(''), 3000);
      fetchProducts();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete product.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numMrp = Number(formData.mrp);
    const numPrice = Number(formData.price);

    if (!formData.name.trim() || formData.mrp === '' || formData.price === '') {
      alert('Product name, MRP, and selling price are required.');
      return;
    }
    if (isNaN(numMrp) || numMrp <= 0) {
      alert('MRP must be greater than 0.');
      return;
    }
    if (isNaN(numPrice) || numPrice <= 0) {
      alert('Selling price must be greater than 0.');
      return;
    }
    if (numPrice > numMrp) {
      alert('Selling price cannot exceed MRP (maximum retail price).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        category: formData.category ? formData.category.trim().toLowerCase() : 'general',
        aliases: formData.aliases,
        mrp: numMrp,
        price: numPrice,
        stock: Number(formData.stock || 0),
        unit: formData.unit,
        active: formData.active,
      };

      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
        setSuccess(`Updated product "${payload.name}" successfully.`);
      } else {
        await api.post('/products', payload);
        setSuccess(`Added new product "${payload.name}" successfully.`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccess(''), 3000);
      fetchProducts();
    } catch (err) {
      console.error('Save product error:', err);
      alert(err.response?.data?.message || 'Error saving product.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center">
            <ShoppingBag className="w-6 h-6 mr-2 text-amber-600" />
            Store Products & Catalogue
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Manage kirana items, pricing, inventory stock, and Hinglish speech aliases.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow transition-colors"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add New Product
        </button>
      </div>

      {/* Notifications */}
      {success && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg flex items-center">
          <Check className="w-4 h-4 mr-2 text-emerald-600" />
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 text-rose-600" />
          {error}
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name or alias (e.g. atta, tel, chini)..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>
        <button
          onClick={fetchProducts}
          disabled={loading}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-600 mb-2" />
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ShoppingBag className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-base font-semibold text-slate-800">No products found</p>
            <p className="text-sm text-slate-500 mt-1">
              {search ? 'Try a different search query' : 'Your store has no products yet. Add some or seed demo items from Dashboard!'}
            </p>
            {!search && (
              <button
                onClick={handleOpenAdd}
                className="mt-4 inline-flex items-center text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3.5 py-2 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add First Product
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Product Name</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Voice Aliases</th>
                  <th className="px-5 py-3">Unit</th>
                  <th className="px-5 py-3">Pricing (₹)</th>
                  <th className="px-5 py-3">Stock</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {products.map((p) => {
                  const mrpVal = p.mrp !== undefined && p.mrp !== null ? Number(p.mrp) : Number(p.price);
                  const priceVal = Number(p.price);
                  const hasDiscount = mrpVal > priceVal;
                  const discountPct = hasDiscount ? Math.round(((mrpVal - priceVal) / mrpVal) * 100) : 0;
                  const savingVal = hasDiscount ? (mrpVal - priceVal).toFixed(2) : 0;

                  return (
                    <tr key={p._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900">
                        {p.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 capitalize">
                          {p.category || 'general'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {p.aliases && p.aliases.length > 0 ? (
                            p.aliases.map((alias, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                <Tag className="w-2.5 h-2.5 mr-1 text-slate-400" />
                                {alias}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 capitalize">
                        {p.unit || 'piece'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900 text-sm">₹{priceVal.toFixed(2)}</span>
                            {hasDiscount && (
                              <span className="text-xs text-slate-400 line-through">₹{mrpVal.toFixed(2)}</span>
                            )}
                          </div>
                          {hasDiscount ? (
                            <div className="flex items-center space-x-1 mt-0.5">
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {discountPct}% off
                              </span>
                              <span className="text-[10px] text-emerald-700 font-medium">Save ₹{savingVal}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">MRP: ₹{mrpVal.toFixed(2)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.stock <= 10
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.stock} in stock
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                            p.active !== false
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {p.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="text-amber-600 hover:text-amber-800 p-1 rounded hover:bg-amber-50 mr-2"
                          title="Edit product"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p._id, p.name)}
                          className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50"
                          title="Delete product"
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
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Product' : 'Add New Kirana Product'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Aashirvaad Atta 5kg"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Category (e.g. atta, tel, chawal, dal, chini, namak, sabun)
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g. atta, tel, dal, masale"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used by voice parser for category-based suggestions when an item is unmatched.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Hinglish Voice Aliases (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.aliases}
                  onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                  placeholder="e.g. ashirvad atta, atta, gehu ka atta"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Helps the voice parser match phonetically similar speech words.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    MRP (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={formData.mrp}
                    onChange={(e) => handleMrpChange(e.target.value)}
                    placeholder="e.g. 320.00"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Maximum Retail Price</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="e.g. 295.00"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Defaults to MRP (Must be &le; MRP)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Inventory Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="50"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Measurement Unit
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="packet">packet / pack</option>
                    <option value="kg">kg (kilogram)</option>
                    <option value="litre">litre / liter</option>
                    <option value="piece">piece / nag</option>
                    <option value="dozen">dozen</option>
                    <option value="bottle">bottle</option>
                    <option value="box">box</option>
                    <option value="gm">gram</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700">Available for Sale</span>
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update Product' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
