import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getImageUrl } from './lib/api';
import { ShoppingCart, Plus, Minus, Trash2, Search, ArrowDownUp, ChevronUp, ChevronDown, CheckCircle2, AlertCircle, Copy, Check, X } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from './lib/cropImage';
import './App.css';

export default function App() {
  const [cart, setCart] = useState<{ cartId: string; itemId: number; variantId?: number | null; quantity: number; deductFromStock?: boolean; customImage?: string }[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isPrepaid, setIsPrepaid] = useState(false);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, number>>({});
  
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customStep, setCustomStep] = useState<1 | 2 | 3>(1);
  const [customCatId, setCustomCatId] = useState<number | null>(null);
  const [customVarId, setCustomVarId] = useState<number | null>(null);
  const [customQty, setCustomQty] = useState<number>(1);
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  
  // Cropper State
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [snapped, setSnapped] = useState({ x: false, y: false });

  const SNAP_THRESHOLD = 1.5;
  const handleCropChange = (newCrop: { x: number; y: number }) => {
    const snapX = Math.abs(newCrop.x) < SNAP_THRESHOLD;
    const snapY = Math.abs(newCrop.y) < SNAP_THRESHOLD;
    setSnapped({ x: snapX, y: snapY });
    setCrop({
      x: snapX ? 0 : newCrop.x,
      y: snapY ? 0 : newCrop.y,
    });
  };
  
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: api.getCategories });
  const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: api.getItems });
  
  const [activeCategories, setActiveCategories] = useState<number[]>([]);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('a-z');
  
  let filteredItems = items.filter(item => !item.isArchived && !item.isCustom);
  
  if (activeCategories.length > 0) {
    filteredItems = filteredItems.filter(item => activeCategories.includes(item.categoryId));
  }
  
  if (searchTerm) {
    filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }

  filteredItems.sort((a, b) => {
    switch (sortBy) {
      case 'a-z': return a.name.localeCompare(b.name);
      case 'z-a': return b.name.localeCompare(a.name);
      case 'price-asc': return a.price - b.price;
      case 'price-desc': return b.price - a.price;
      case 'stock-asc': return a.stock - b.stock;
      case 'stock-desc': return b.stock - a.stock;
      default: return 0;
    }
  });

  // Toast notifications state
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Order Success modal state
  const [completedOrder, setCompletedOrder] = useState<{ orderNumber: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const { data: previewData } = useQuery({
    queryKey: ['cart-preview', cart],
    queryFn: () => api.previewCart(cart),
    enabled: cart.length > 0,
  });

  const queryClient = useQueryClient();
  const checkoutMutation = useMutation({
    mutationFn: () => api.checkout(cart, true, customerName, notes, isPrepaid),
    onSuccess: (data) => {
      setCart([]);
      setCustomerName('');
      setNotes('');
      setIsPrepaid(false);
      setIsCartExpanded(false);
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      const orderNum = data?.orderNumber || 'N/A';
      setCompletedOrder({ orderNumber: orderNum });
      showToast(`Preorder #${orderNum} placed successfully!`, 'success');
    },
    onError: (err: any) => {
      showToast(`Preorder failed: ${err.message}`, 'error');
    }
  });

  const addToCart = (itemId: number) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const defaultVid = item.variants && item.variants.length > 0
      ? (item.variants.find((v: any) => v.stock > 0)?.variantId || item.variants[0].variantId)
      : null;
    const variantId = selectedVariants[itemId] || defaultVid;
    
    const variant = item.variants?.find((v: any) => v.variantId === variantId);
    const stock = variant ? variant.stock : item.stock;

    setCart(prev => {
      const existing = prev.find(c => c.itemId === itemId && c.variantId === variantId);
      if (existing) {
        return prev.map(c => {
          if (c.itemId === itemId && c.variantId === variantId) {
            return { ...c, quantity: c.quantity + 1 };
          }
          return c;
        });
      }
      return [...prev, { cartId: `${itemId}-${variantId}-${Date.now()}`, itemId, variantId, quantity: 1, deductFromStock: stock > 0 && !item.isCustom }];
    });
    showToast(`${item.name} added to cart`, 'success');
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId));
    if (cart.length === 1) setIsCartExpanded(false);
  };

  const adjustQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.cartId === cartId) {
        const newQ = c.quantity + delta;
        return newQ > 0 ? { ...c, quantity: newQ } : c;
      }
      return c;
    }));
  };

  const formatPrice = (cents: number) => `₱${(cents / 100).toFixed(2)}`;
  
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = cart.length > 0 ? formatPrice(previewData?.totalAmount || 0) : '₱0.00';

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      
      {/* Header */}
      <div className="w-full z-30 p-4 flex justify-between items-center bg-zinc-950/90 backdrop-blur-md border-b border-white/10 shrink-0 shadow-sm">
        <div className="text-xl font-black tracking-tight text-white flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <ShoppingCart size={20} />
          </div>
          <div>Merch Store <span className="text-blue-500 font-medium">Preorder</span></div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Content: Product Grid */}
        <div className={`flex-1 p-4 md:p-6 flex flex-col gap-5 md:gap-6 overflow-hidden transition-all duration-300 ${isCartExpanded ? 'md:mr-96' : ''}`}>
          
          {/* Filter Bar */}
          <div className="flex flex-col lg:flex-row gap-3 pb-2 shrink-0 z-40 relative">
            <button 
              onClick={() => setIsCustomModalOpen(true)}
              className="w-full lg:w-auto px-5 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl text-white text-sm font-bold shadow-lg shadow-purple-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 border border-white/10"
            >
              <Plus size={18} /> Custom Item Request
            </button>
            
            <div className="flex gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none">
                <button 
                  onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                  className="w-full lg:w-56 px-4 py-3 bg-zinc-900/80 backdrop-blur border border-white/10 hover:border-white/20 rounded-xl text-sm font-medium text-white flex justify-between items-center gap-2 transition-all shadow-sm"
                >
                  <span className="truncate">Categories {activeCategories.length > 0 ? `(${activeCategories.length})` : '(All)'}</span>
                  {isCatDropdownOpen ? <ChevronUp size={16} className="text-zinc-400 shrink-0" /> : <ChevronDown size={16} className="text-zinc-400 shrink-0" />}
                </button>
                
                {isCatDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsCatDropdownOpen(false)}></div>
                    <div className="absolute top-full left-0 mt-2 w-full sm:w-56 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-20 max-h-64 overflow-y-auto">
                      {categories.map((c: any) => (
                        <label key={c.id} className="flex items-center px-4 py-3 hover:bg-zinc-800 cursor-pointer text-sm text-zinc-200 transition-colors">
                          <input 
                            type="checkbox" 
                            className="mr-3 rounded bg-zinc-950 border-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900 shrink-0"
                            checked={activeCategories.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) setActiveCategories([...activeCategories, c.id]);
                              else setActiveCategories(activeCategories.filter(id => id !== c.id));
                            }}
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="relative flex-1 lg:hidden">
                <div className="w-full h-full flex items-center justify-between px-3 bg-zinc-900/80 backdrop-blur border border-white/10 rounded-xl text-white text-sm">
                  <span className="truncate">Sort</span> <ArrowDownUp size={14} className="shrink-0 text-zinc-400" />
                </div>
                <select 
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  <option value="a-z">Name (A-Z)</option>
                  <option value="z-a">Name (Z-A)</option>
                  <option value="price-asc">Price (Low-High)</option>
                  <option value="price-desc">Price (High-Low)</option>
                </select>
              </div>
            </div>

            <div className="relative w-full lg:flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search merchandise..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900/80 backdrop-blur border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 placeholder-zinc-500 transition-all shadow-sm"
              />
            </div>

            <div className="relative shrink-0 hidden lg:block">
              <ArrowDownUp className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="w-full appearance-none bg-zinc-900/80 backdrop-blur border border-white/10 rounded-xl pl-11 pr-10 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 cursor-pointer transition-all shadow-sm"
              >
                <option value="a-z">Name (A-Z)</option>
                <option value="z-a">Name (Z-A)</option>
                <option value="price-asc">Price (Low-High)</option>
                <option value="price-desc">Price (High-Low)</option>
              </select>
            </div>
          </div>

        {/* Item Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-32 md:pb-8 pr-2 no-scrollbar relative">
          
          {/* Floating Toasts (Absolute Upper Right overlay on top of items) */}
          <div className="absolute top-2 right-2 z-50 flex flex-col gap-2 max-w-xs sm:max-w-sm w-full pointer-events-none">
            {toasts.map(toast => (
              <div
                key={toast.id}
                className={`pointer-events-auto flex items-center gap-3 p-3.5 rounded-2xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-top-3 duration-200 text-xs sm:text-sm font-medium ${
                  toast.type === 'success'
                    ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
                    : toast.type === 'error'
                    ? 'bg-red-950/95 border-red-500/40 text-red-200'
                    : 'bg-zinc-900/95 border-white/15 text-zinc-200'
                }`}
              >
                {toast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />}
                {toast.type === 'error' && <AlertCircle size={18} className="text-red-400 shrink-0" />}
                <span className="flex-1 leading-snug">{toast.message}</span>
                <button
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            {filteredItems.map(item => {
              const defaultVid = item.variants && item.variants.length > 0
                ? (item.variants.find((v: any) => v.stock > 0)?.variantId || item.variants[0].variantId)
                : null;
              const activeVid = selectedVariants[item.id] || defaultVid;
              const activeVariant = item.variants?.find((v: any) => v.variantId === activeVid);
              const stock = activeVariant ? activeVariant.stock : item.stock;
              const price = activeVariant ? activeVariant.price : item.price;
              
              return (
                <div key={item.id} className="group flex flex-col rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-white/20 transition-all duration-300 hover:shadow-xl hover:shadow-black/40 hover:-translate-y-1 overflow-hidden h-full">
                  <button
                    onClick={() => addToCart(item.id)}
                    className="flex flex-col items-center p-3 sm:p-4 flex-1 focus:outline-none"
                  >
                    <div className="relative w-full aspect-square shrink-0 mb-4 rounded-xl overflow-hidden bg-zinc-950/80 flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-500 border border-white/5 isolate">
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md z-10 border border-white/10 max-w-[80%]">
                        <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider truncate block">
                          {categories.find(c => c.id === item.categoryId)?.name || 'Merch'}
                        </span>
                      </div>
                      {item.imageUrl ? (
                        <img src={getImageUrl(item.imageUrl)} alt={item.name} className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="text-zinc-700 font-medium text-[10px] tracking-widest uppercase">No Image</div>
                      )}
                    </div>
                    <div className="w-full flex flex-col flex-1">
                      <div className="text-sm font-bold text-zinc-100 leading-snug line-clamp-2 text-left mb-1 break-words">{item.name}</div>
                      <div className="mt-auto pt-1">
                        <div className="flex flex-wrap justify-between items-center gap-1.5">
                          <div className="text-blue-400 font-black text-sm whitespace-nowrap">{formatPrice(price)}</div>
                          {item.isCustom ? (
                            <div className="text-[9px] text-purple-400 uppercase font-bold bg-purple-500/10 px-1.5 py-0.5 rounded-md border border-purple-500/20 whitespace-nowrap">Custom</div>
                          ) : (
                            <div className="text-[9px] text-zinc-500 font-medium whitespace-nowrap">{stock} in stock</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  {item.variants && item.variants.length > 0 && (
                    <div className="p-3 border-t border-white/5 bg-zinc-900/60 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
                      {item.variants.map((v: any) => {
                        const cat = categories.find(c => c.id === item.categoryId);
                        const vName = cat?.variants?.find((cv: any) => cv.id === v.variantId)?.name || 'Var';
                        return (
                          <button
                            key={v.variantId}
                            onClick={(e) => { e.stopPropagation(); setSelectedVariants(p => ({...p, [item.id]: v.variantId})) }}
                            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                              activeVid === v.variantId 
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                            }`}
                          >
                            {vName}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cart Sidebar (Collapsible) */}
      <div 
        className={`absolute md:fixed bg-zinc-900/95 backdrop-blur-2xl border-white/10 flex flex-col z-40 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] md:shadow-[-20px_0_60px_rgba(0,0,0,0.5)] transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          isCartExpanded 
            ? 'right-0 bottom-0 w-full md:w-96 h-[85dvh] md:h-[calc(100dvh-2rem)] md:top-4 md:right-4 border-t md:border rounded-t-3xl md:rounded-3xl' 
            : 'right-0 bottom-0 md:right-6 md:bottom-6 w-full md:w-[340px] h-[88px] md:h-16 border-t md:border rounded-t-3xl md:rounded-2xl'
        }`}
      >
        {/* Collapsed Preview Tab Header */}
        <button 
          onClick={() => setIsCartExpanded(!isCartExpanded)}
          className={`flex items-center justify-between p-4 md:p-5 w-full cursor-pointer hover:bg-white/5 transition-colors shrink-0 outline-none ${isCartExpanded ? 'border-b border-white/10' : ''}`}
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-blue-600/20 text-blue-400 p-2 rounded-xl">
                <ShoppingCart size={22} strokeWidth={2.5} />
              </div>
              {totalItems > 0 && (
                <div className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-lg">
                  {totalItems}
                </div>
              )}
            </div>
            {!isCartExpanded && (
              <div className="flex flex-col items-start md:flex-row md:items-center md:gap-2">
                <span className="font-black text-lg text-white tracking-tight">{totalPrice}</span>
              </div>
            )}
            {isCartExpanded && <h2 className="text-lg font-black text-white tracking-tight">Your Preorder</h2>}
          </div>
          
          <div className="flex items-center gap-4">
            {isCartExpanded && cart.length > 0 && (
              <span 
                onClick={(e) => { e.stopPropagation(); setCart([]); setIsCartExpanded(false); }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                Clear All
              </span>
            )}
            <div className="text-zinc-500">
              {isCartExpanded ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
            </div>
          </div>
        </button>

        {/* Expanded Cart Content */}
        <div className={`flex-1 overflow-hidden flex flex-col transition-opacity duration-300 delay-100 ${isCartExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-4 no-scrollbar">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mb-2">
                  <ShoppingCart size={28} className="text-zinc-600" />
                </div>
                <p className="font-medium text-zinc-400">Your cart is empty</p>
                <p className="text-xs text-zinc-600">Select merchandise to preorder</p>
              </div>
            ) : (
              cart.map(cItem => {
                const item = items.find(i => i.id === cItem.itemId);
                if (!item) return null;
                const cat = categories.find(c => c.id === item.categoryId);
                const variantName = cItem.variantId ? cat?.variants?.find((cv: any) => cv.id === cItem.variantId)?.name : null;
                const activeVariant = item.variants?.find((v: any) => v.variantId === cItem.variantId);
                
                let price = item.price;
                if (activeVariant) {
                  price = activeVariant.price;
                } else if (item.isCustom && cItem.variantId) {
                  const catVariant = cat?.variants?.find((cv: any) => cv.id === cItem.variantId);
                  if (catVariant) {
                    price = catVariant.price;
                  }
                }
                
                return (
                  <div key={cItem.cartId} className="flex flex-col bg-zinc-950/50 p-4 rounded-2xl border border-white/5 gap-3 group">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-3">
                        <div className="flex items-start gap-3 mb-1">
                          {cItem.customImage && (
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10 shadow-sm">
                              <img src={getImageUrl(cItem.customImage)} className="w-full h-full object-cover" alt="Custom" />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-bold text-white line-clamp-2 leading-snug">{item.name}</div>
                            {variantName && <div className="text-xs font-medium text-zinc-400 mt-0.5">{variantName}</div>}
                          </div>
                        </div>
                        <div className="text-sm text-blue-400 font-bold mt-2">{formatPrice(price)} <span className="text-zinc-500 font-normal text-xs">each</span></div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center bg-zinc-900 rounded-xl p-1 border border-white/5 shadow-inner">
                        <button onClick={() => adjustQuantity(cItem.cartId, -1)} className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors"><Minus size={14} strokeWidth={3}/></button>
                        <span className="text-sm font-black w-8 text-center text-white">{cItem.quantity}</span>
                        <button onClick={() => adjustQuantity(cItem.cartId, 1)} className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors"><Plus size={14} strokeWidth={3}/></button>
                      </div>
                      <button onClick={() => removeFromCart(cItem.cartId)} className="text-zinc-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-1 text-xs font-bold">
                        <Trash2 size={14}/> Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-5 bg-zinc-950/80 backdrop-blur-md border-t border-white/5 shrink-0">
            <div className="flex flex-col gap-3 mb-5">
              <input
                type="text"
                placeholder="Full Name (Required for Preorders)"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 placeholder-zinc-500 transition-all"
              />
              <textarea
                placeholder="Special Instructions or Notes (Optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 placeholder-zinc-500 resize-none transition-all"
              />
              <label className="flex items-center gap-3 cursor-pointer mt-2 bg-zinc-900/50 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={isPrepaid}
                  onChange={(e) => setIsPrepaid(e.target.checked)}
                  className="w-4 h-4 rounded bg-zinc-950 border-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950"
                />
                <span className="text-sm text-zinc-300 font-bold select-none">Mark as Prepaid</span>
              </label>
            </div>
            
            <div className="flex justify-between items-end mb-5">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Total Due</span>
                <span className="text-zinc-400 text-xs">Taxes included</span>
              </div>
              <span className="text-3xl font-black text-white tracking-tight">
                {totalPrice}
              </span>
            </div>
            
            <button
              onClick={() => checkoutMutation.mutate()}
              disabled={cart.length === 0 || !customerName.trim() || checkoutMutation.isPending}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 text-white font-black rounded-2xl text-lg transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98] border border-blue-400/20 disabled:border-transparent flex items-center justify-center gap-2"
            >
              {checkoutMutation.isPending ? 'Processing...' : 'Submit Preorder'}
            </button>
          </div>
        </div>
      </div>
      </div>
      
      {/* Custom Item Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsCustomModalOpen(false)}></div>
          <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-2xl flex items-center justify-center mb-4 border border-purple-500/20">
              <Plus size={24} strokeWidth={3} />
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-5">
              {([1, 2, 3] as const).map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full flex-1 transition-all duration-300 ${customStep >= s ? 'bg-purple-500' : 'bg-zinc-700'}`}
                />
              ))}
            </div>

            <h2 className="text-2xl font-black text-white mb-1 tracking-tight">Custom Request</h2>
            <p className="text-sm text-zinc-500 mb-6">
              {customStep === 1 && 'What type of item do you want?'}
              {customStep === 2 && 'Choose your options.'}
              {customStep === 3 && 'Upload your design image.'}
            </p>

            {/* Step 1: Category */}
            {customStep === 1 && (
              <div className="flex flex-col gap-3">
                {categories.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomCatId(c.id);
                      setCustomVarId(null);
                      setCustomStep(2);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-left transition-all duration-150 bg-zinc-950 border-white/10 hover:border-purple-500/50 hover:bg-purple-500/5 text-white font-semibold text-sm"
                  >
                    {c.name}
                    <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                ))}
                <button
                  onClick={() => setIsCustomModalOpen(false)}
                  className="w-full px-4 py-3 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition-colors text-sm font-bold mt-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Step 2: Variant + Quantity */}
            {customStep === 2 && (() => {
              const cat = categories.find((c: any) => c.id === customCatId);
              const hasVariants = (cat?.variants?.length ?? 0) > 0;
              return (
                <div className="flex flex-col gap-5">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider -mb-2">
                    {cat?.name}
                  </div>

                  {hasVariants && (
                    <div>
                      <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Size / Variant</label>
                      <div className="flex flex-col gap-2">
                        {cat?.variants?.map((v: any) => (
                          <button
                            key={v.id}
                            onClick={() => setCustomVarId(v.id)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all duration-150 text-sm font-semibold ${
                              customVarId === v.id
                                ? 'bg-purple-500/15 border-purple-500/60 text-purple-300'
                                : 'bg-zinc-950 border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 text-white'
                            }`}
                          >
                            <span>{v.name}</span>
                            <span className={`text-xs font-bold ${customVarId === v.id ? 'text-purple-400' : 'text-zinc-500'}`}>{formatPrice(v.price)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
                      value={customQty}
                      onChange={e => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setCustomStep(1)}
                      className="flex-1 px-4 py-3 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition-colors text-sm font-bold"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        if (hasVariants && !customVarId) { showToast('Please select a variant option', 'error'); return; }
                        setCustomStep(3);
                      }}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl text-white text-sm font-black shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all border border-white/10"
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Step 3: Image */}
            {customStep === 3 && (
              <div className="flex flex-col gap-5">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Design Image (Optional)</label>
                  <div className="relative group">
                    {customImageFile ? (
                      <div className="flex items-center gap-3 bg-zinc-950 border border-white/10 rounded-xl p-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/10">
                          <img src={URL.createObjectURL(customImageFile)} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate font-medium">{customImageFile.name}</p>
                          <p className="text-[10px] text-zinc-500">Ready for upload</p>
                        </div>
                        <button
                          onClick={() => setCustomImageFile(null)}
                          className="p-2 text-zinc-500 hover:text-red-400 bg-white/5 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="image/*"
                        className="w-full text-sm text-zinc-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-zinc-800 file:text-purple-400 hover:file:bg-zinc-700 hover:file:text-purple-300 transition-all cursor-pointer bg-zinc-950 border border-white/10 rounded-xl"
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            const cat = categories.find((c: any) => c.id === customCatId);
                            if (cat?.requiresCircularCrop) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const src = reader.result as string;
                                // Compute fitZoom: zoom so the image diagonal equals the circle diameter
                                // Formula: zoom = 1 / sqrt(1 + r²) where r = longSide/shortSide
                                const img = new Image();
                                img.onload = () => {
                                  const r = Math.max(img.naturalWidth, img.naturalHeight) / Math.min(img.naturalWidth, img.naturalHeight);
                                  setFitZoom(1 / Math.sqrt(1 + r * r));
                                };
                                img.src = src;
                                setImageSrc(src);
                                setIsCropping(true);
                                setCrop({ x: 0, y: 0 });
                                setZoom(1);
                              };
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            } else {
                              setCustomImageFile(file);
                            }
                          }
                        }}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
                    value={customQty}
                    onChange={e => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setCustomStep(2)}
                    className="flex-1 px-4 py-3 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition-colors text-sm font-bold"
                  >
                    Back
                  </button>
                  <button
                    onClick={async () => {
                      if (!customCatId) return;
                      const customItem = items.find((i: any) => i.categoryId === customCatId && i.isCustom);
                      if (customItem) {
                        setIsAddingCustom(true);
                        let uploadedImageUrl: string | undefined;
                        try {
                          if (customImageFile) {
                            const res = await api.uploadImage(customImageFile);
                            uploadedImageUrl = res.imageUrl;
                          }
                        } catch (e: any) {
                          showToast('Failed to upload image: ' + e.message, 'error');
                          setIsAddingCustom(false);
                          return;
                        }
                        setCart(prev => {
                          // Custom items are ALWAYS added as a new line item (each has a unique image)
                          return [...prev, { cartId: `custom-${customItem.id}-${customVarId || 0}-${Date.now()}`, itemId: customItem.id, variantId: customVarId || null, quantity: customQty, deductFromStock: false, customImage: uploadedImageUrl }];
                        });
                        showToast('Custom item added to cart', 'success');
                        setIsCustomModalOpen(false);
                        setCustomStep(1);
                        setCustomCatId(null);
                        setCustomVarId(null);
                        setCustomQty(1);
                        setCustomImageFile(null);
                        setIsAddingCustom(false);
                        setIsCartExpanded(true);
                      } else {
                        showToast('Custom item not found for this category', 'error');
                      }
                    }}
                    disabled={isAddingCustom}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl text-white text-sm font-black shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 border border-white/10"
                  >
                    {isAddingCustom ? 'Processing...' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}



      {/* Image Cropper Modal */}
      {isCropping && imageSrc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setIsCropping(false)}></div>
          <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl relative z-10 h-[75vh]">
            <div className="p-5 border-b border-white/10 shrink-0 bg-zinc-900/50">
              <h3 className="text-xl font-black text-white">Crop Design</h3>
              <p className="text-sm text-zinc-400 mt-1">Position your image within the circular guide to ensure it looks perfect on a pin.</p>
            </div>
            <div className="relative flex-1 w-full bg-black">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                minZoom={0.1}
                aspect={1}
                cropShape="round"
                showGrid={false}
                restrictPosition={false}
                onCropChange={handleCropChange}
                onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                onZoomChange={setZoom}
              />
              {/* Snap guide lines */}
              {snapped.y && (
                <div className="absolute inset-x-0 top-1/2 -translate-y-px h-px bg-emerald-400/70 pointer-events-none z-10 transition-opacity" />
              )}
              {snapped.x && (
                <div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-emerald-400/70 pointer-events-none z-10 transition-opacity" />
              )}
            </div>
            <div className="p-5 border-t border-white/10 bg-zinc-900/80 shrink-0 flex flex-col gap-4">
              {/* Quick action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setCrop({ x: 0, y: 0 }); setSnapped({ x: true, y: true }); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-colors"
                >
                  ⊕ Center
                </button>
                <button
                  onClick={() => { setZoom(fitZoom); setCrop({ x: 0, y: 0 }); setSnapped({ x: true, y: true }); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-colors"
                >
                  ⤢ Fit
                </button>
                <button
                  onClick={() => { setZoom(1); setCrop({ x: 0, y: 0 }); setSnapped({ x: true, y: true }); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-colors"
                >
                  ↺ Reset
                </button>
              </div>
              <div className="flex items-center gap-4 px-2">
                <span className="text-zinc-400 font-medium text-xs uppercase tracking-wider">Zoom</span>
                <input
                  type="range"
                  value={zoom}
                  min={0.1}
                  max={3}
                  step={0.01}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-emerald-400 transition-colors"
                />
              </div>
              <div className="flex gap-3">
              <button 
                onClick={() => {
                  setIsCropping(false);
                  setImageSrc(null);
                }} 
                className="flex-1 px-4 py-3 rounded-xl text-zinc-400 hover:bg-white/5 hover:text-white transition-colors text-sm font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (croppedAreaPixels && imageSrc) {
                    try {
                      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, 'custom-crop.jpeg');
                      setCustomImageFile(croppedFile);
                      setIsCropping(false);
                    } catch (e) {
                      console.error(e);
                      showToast('Failed to crop image', 'error');
                    }
                  }
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl text-white text-sm font-black shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all border border-white/10"
              >
                Confirm Crop
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Success Modal */}
      {completedOrder && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setCompletedOrder(null)}></div>
          <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 size={36} strokeWidth={2.5} />
            </div>
            
            <h2 className="text-2xl font-black text-white mb-1 tracking-tight">Preorder Placed!</h2>
            <p className="text-xs text-zinc-400 mb-6">Your order has been recorded. Save your order number below:</p>

            <div className="bg-zinc-950 border border-white/10 rounded-2xl p-4 mb-6 relative group flex items-center justify-between">
              <div className="text-left">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Order Number</span>
                <span className="text-2xl font-mono font-black text-emerald-400 tracking-wider">#{completedOrder.orderNumber}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(completedOrder.orderNumber);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/5 active:scale-95"
              >
                {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {isCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <button
              onClick={() => setCompletedOrder(null)}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-950/50 transition-all border border-white/10 active:scale-[0.98]"
            >
              Got it, Thanks!
            </button>
          </div>
        </div>
      )}

      
    </div>
  );
}
