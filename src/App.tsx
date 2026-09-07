import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getImageUrl, type OrderDetails } from './lib/api';
import { ShoppingCart, Plus, Minus, Trash2, Search, ArrowDownUp, ChevronUp, ChevronDown, CheckCircle2, AlertCircle, Copy, Check, X, Clock, Package, CreditCard, Upload, ExternalLink, QrCode, RefreshCw } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from './lib/cropImage';
import './App.css';

export default function App() {
  const [cart, setCart] = useState<{ cartId: string; itemId: number; variantId?: number | null; quantity: number; deductFromStock?: boolean; customImage?: string }[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, number>>({});
  
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customStep, setCustomStep] = useState<1 | 2 | 3>(1);
  const [customCatId, setCustomCatId] = useState<number | null>(null);
  const [customVarId, setCustomVarId] = useState<number | null>(null);
  const [customQty, setCustomQty] = useState<number>(1);
  const [customQtyRaw, setCustomQtyRaw] = useState<string>('1');
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
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });
  const [cropHasWhiteSpace, setCropHasWhiteSpace] = useState(false);
  // Stores the crop circle's size in screen pixels — derived in onCropComplete and used
  // to recompute OOB status when crop/zoom change programmatically (button clicks).
  const cropSizeScreenPxRef = useRef(0);
  const idempotencyKeyRef = useRef('');

  // Recompute whitespace whenever crop position, zoom, or image size changes.
  // This fires even when buttons (Center / Reset / Fit) change state without a user drag.
  useEffect(() => {
    const S = cropSizeScreenPxRef.current;
    if (S <= 0 || imgNaturalSize.w <= 0) return;
    // Derive croppedAreaPixels from first principles:
    //   capX = imgW/2 - S/(2*zoom) - crop.x/zoom
    //   capY = imgH/2 - S/(2*zoom) - crop.y/zoom
    //   capW = capH = S/zoom
    const capW = S / zoom;
    const capX = imgNaturalSize.w / 2 - S / (2 * zoom) - crop.x / zoom;
    const capY = imgNaturalSize.h / 2 - S / (2 * zoom) - crop.y / zoom;
    setCropHasWhiteSpace(
      capX < 0 || capY < 0 ||
      capX + capW > imgNaturalSize.w ||
      capY + capW > imgNaturalSize.h
    );
  }, [crop, zoom, imgNaturalSize]);

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
  
  let filteredItems = items.filter(item => {
    if (item.isArchived || item.isCustom) return false;
    // Hide items whose category uses variants but this item has no variant rows configured
    // (i.e. all variants were removed in the editor)
    const cat = categories.find(c => c.id === item.categoryId);
    if (cat?.variants && cat.variants.length > 0 && (!item.variants || item.variants.length === 0)) {
      return false;
    }
    // If preorders are disabled (allowPreorder === false), hide out-of-stock items
    const allowPreorder = item.allowPreorder ?? true;
    if (!allowPreorder) {
      const isOutOfStock = item.variants && item.variants.length > 0
        ? item.variants.every(v => v.stock <= 0)
        : item.stock <= 0;
      if (isOutOfStock) return false;
    }
    return true;
  });
  
  if (activeCategories.length > 0) {
    filteredItems = filteredItems.filter(item => activeCategories.includes(item.categoryId));
  }
  
  if (searchTerm) {
    filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }

  // Helper: true if every variant (or the base stock) is 0
  const isAllOutOfStock = (item: typeof items[0]) => {
    if (item.variants && item.variants.length > 0) {
      return item.variants.every(v => v.stock <= 0);
    }
    return item.stock <= 0;
  };

  filteredItems.sort((a, b) => {
    // Always push fully-out-of-stock items to the bottom
    const aOos = isAllOutOfStock(a);
    const bOos = isAllOutOfStock(b);
    if (aOos !== bOos) return aOos ? 1 : -1;

    // Within each group apply the user's chosen sort
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

  // Track Order modal state
  const [isTrackOrderModalOpen, setIsTrackOrderModalOpen] = useState(false);
  const [trackOrderInput, setTrackOrderInput] = useState('');
  const [activeOrderDetails, setActiveOrderDetails] = useState<OrderDetails | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [paymentMethodTab, setPaymentMethodTab] = useState<'gcash' | 'maya'>('gcash');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isQrExpanded, setIsQrExpanded] = useState(false);

  const isAnyModalOpen = isCustomModalOpen || isCropping || !!completedOrder || isTrackOrderModalOpen || isQrExpanded;

  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAnyModalOpen]);

  const handleLookupOrder = async (orderNumToSearch?: string) => {
    const queryNum = (orderNumToSearch !== undefined ? orderNumToSearch : trackOrderInput).trim();
    if (!queryNum) {
      setLookupError('Please enter an order number');
      return;
    }
    setIsLookupLoading(true);
    setLookupError(null);
    try {
      const data = await api.lookupOrder(queryNum);
      setActiveOrderDetails(data);
    } catch (err: any) {
      setLookupError(err.message || 'Order not found. Please check your order number.');
      setActiveOrderDetails(null);
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleUploadReceipt = async () => {
    if (!receiptFile || !activeOrderDetails || !activeOrderDetails.orderNumber) return;
    setIsUploadingReceipt(true);
    try {
      const { imageUrl } = await api.uploadImage(receiptFile);
      await api.uploadReceipt(activeOrderDetails.orderNumber, imageUrl);
      showToast('Payment receipt uploaded successfully!', 'success');
      setReceiptFile(null);
      handleLookupOrder(activeOrderDetails.orderNumber);
    } catch (err: any) {
      showToast(`Receipt upload failed: ${err.message}`, 'error');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const { data: previewData } = useQuery({
    queryKey: ['cart-preview', cart],
    queryFn: () => api.previewCart(cart),
    enabled: cart.length > 0,
  });

  const queryClient = useQueryClient();
  const checkoutMutation = useMutation({
    mutationFn: () => {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `key-${Date.now()}-${Math.random()}`;
      }
      return api.checkout(cart, true, customerName, notes, false, idempotencyKeyRef.current);
    },
    onSuccess: (data) => {
      idempotencyKeyRef.current = '';
      setCart([]);
      setCustomerName('');
      setNotes('');
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
    <div className="flex flex-col h-screen h-[100dvh] bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      
      {/* Header */}
      <div className="w-full z-30 p-4 flex justify-between items-center bg-zinc-950/90 backdrop-blur-md border-b border-white/10 shrink-0 shadow-sm">
        <div className="text-xl font-black tracking-tight text-white flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <ShoppingCart size={20} />
          </div>
          <div>Merch Store <span className="text-blue-500 font-medium">Preorder</span></div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTrackOrderModalOpen(true)}
            className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-95 cursor-pointer"
          >
            <Clock size={15} className="text-blue-400" />
            <span>Track Order</span>
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Content: Product Grid */}
        <div className={`flex-1 p-4 md:p-6 flex flex-col gap-5 md:gap-6 overflow-hidden transition-all duration-300 ${isCartExpanded ? 'md:mr-96' : ''}`}>
          
          {/* Filter Bar */}
          <div className="flex flex-col gap-2.5 pb-2 shrink-0 z-40 relative">
            {/* Row 1: Custom Request (left) + Search (fills right) */}
            <div className="flex gap-2">
              <button 
                onClick={() => setIsCustomModalOpen(true)}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl text-white text-sm font-bold shadow-lg shadow-purple-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 border border-white/10"
              >
                <Plus size={18} />
                <span className="whitespace-nowrap">Custom Request</span>
              </button>

              <div className="relative flex-1 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                <input 
                  type="text" 
                  placeholder="Search merchandise..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-900/80 backdrop-blur border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 placeholder-zinc-500 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Row 2: Sort (left) + Category filter (fills right) */}
            <div className="flex gap-2">
              {/* Sort — leftmost to avoid top-right toast overlap */}
              <div className="relative shrink-0">
                <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={15} />
                <select 
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="appearance-none bg-zinc-900/80 backdrop-blur border border-white/10 rounded-xl pl-9 pr-8 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 cursor-pointer transition-all shadow-sm"
                >
                  <option value="a-z">A–Z</option>
                  <option value="z-a">Z–A</option>
                  <option value="price-asc">$ Low</option>
                  <option value="price-desc">$ High</option>
                </select>
              </div>

              <div className="relative flex-1">
                <button 
                  onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900/80 backdrop-blur border border-white/10 hover:border-white/20 rounded-xl text-sm font-medium text-white flex justify-between items-center gap-2 transition-all shadow-sm"
                >
                  <span className="truncate text-left">
                    {activeCategories.length > 0 ? `Categories (${activeCategories.length})` : 'All Categories'}
                  </span>
                  {isCatDropdownOpen ? <ChevronUp size={15} className="text-zinc-400 shrink-0" /> : <ChevronDown size={15} className="text-zinc-400 shrink-0" />}
                </button>
                
                {isCatDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsCatDropdownOpen(false)}></div>
                    <div className="absolute top-full left-0 mt-2 w-full min-w-[180px] bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-20 max-h-64 overflow-y-auto">
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
            </div>
          </div>

        {/* Item Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-32 md:pb-8 pr-2 no-scrollbar">

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
                    className="flex flex-col items-center p-2.5 sm:p-4 flex-1 focus:outline-none active:bg-white/5 transition-colors"
                  >
                    <div className="relative w-full aspect-square shrink-0 mb-2.5 sm:mb-4 rounded-xl overflow-hidden bg-zinc-950/80 flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-500 border border-white/5 isolate">
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
                          ) : stock > 0 ? (
                            <div className="text-[9px] text-zinc-500 font-medium whitespace-nowrap">{stock} in stock</div>
                          ) : (
                            <div className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20 whitespace-nowrap">Out of Stock (2-day prep)</div>
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
        className={`fixed bg-zinc-900/95 backdrop-blur-2xl border-white/10 flex flex-col z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] md:shadow-[-20px_0_60px_rgba(0,0,0,0.5)] transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          isCartExpanded 
            ? 'right-0 bottom-0 w-full md:w-96 h-[85dvh] md:h-[calc(100dvh-2rem)] md:top-4 md:right-4 border-t md:border rounded-t-3xl md:rounded-3xl' 
            : 'right-0 bottom-0 md:right-6 md:bottom-6 w-full md:w-[340px] h-[72px] md:h-16 border-t md:border rounded-t-3xl md:rounded-2xl overflow-hidden'
        }`}
      >
        {/* Collapsed Preview Tab Header */}
        <button 
          onClick={() => setIsCartExpanded(!isCartExpanded)}
          className={`flex items-center justify-between px-5 w-full cursor-pointer hover:bg-white/5 transition-colors shrink-0 outline-none ${
            isCartExpanded ? 'h-16 border-b border-white/10' : 'h-full'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0 flex items-center justify-center">
              <div className="w-10 h-10 bg-blue-600/20 text-blue-400 rounded-xl flex items-center justify-center">
                <ShoppingCart size={20} strokeWidth={2.5} />
              </div>
              {totalItems > 0 && (
                <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-black min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-full shadow-md border-2 border-zinc-900 leading-none">
                  {totalItems}
                </div>
              )}
            </div>
            {!isCartExpanded && (
              <span className="font-black text-lg text-white tracking-tight leading-none">{totalPrice}</span>
            )}
            {isCartExpanded && <h2 className="text-lg font-black text-white tracking-tight leading-none">Your Preorder</h2>}
          </div>
          
          <div className="flex items-center gap-3">
            {isCartExpanded && cart.length > 0 && (
              <span 
                onClick={(e) => { e.stopPropagation(); setCart([]); setIsCartExpanded(false); }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                Clear All
              </span>
            )}
            <div className="text-zinc-400 flex items-center justify-center">
              {isCartExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
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
                            {(!item.isCustom && ((activeVariant ? activeVariant.stock : item.stock) <= 0)) && (
                              <div className="text-[10px] font-bold text-amber-400 flex items-center gap-1 mt-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 w-fit">
                                <Clock size={11} className="shrink-0" /> Takes 2+ days to make
                              </div>
                            )}
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
            {cart.some(cItem => {
              const item = items.find(i => i.id === cItem.itemId);
              if (!item || item.isCustom) return false;
              const variant = item.variants?.find((v: any) => v.variantId === cItem.variantId);
              const stock = variant ? variant.stock : item.stock;
              return stock <= 0;
            }) && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium mb-3">
                <Clock size={16} className="shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <span className="font-bold block text-amber-200">Production Time Notice</span>
                  Your cart includes out-of-stock item(s). These will take at least 2 days to make before your order is ready.
                </div>
              </div>
            )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 isolate">
          <div className="absolute inset-0 bg-black/75 sm:bg-black/60 sm:backdrop-blur-sm" onClick={() => setIsCustomModalOpen(false)}></div>
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
                    <div className="flex items-center bg-zinc-900 rounded-xl border border-white/10 shadow-inner overflow-hidden">
                      <button
                        type="button"
                        onClick={() => { const n = Math.max(1, customQty - 1); setCustomQty(n); setCustomQtyRaw(String(n)); }}
                        className="px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 active:bg-zinc-700 transition-colors text-lg font-bold shrink-0 select-none"
                      >−</button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="flex-1 bg-transparent text-white text-center text-sm font-black focus:outline-none py-3 min-w-0"
                        value={customQtyRaw}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setCustomQtyRaw(raw);
                          if (raw !== '') setCustomQty(Math.max(1, parseInt(raw)));
                        }}
                        onBlur={() => {
                          const clamped = Math.max(1, parseInt(customQtyRaw) || 1);
                          setCustomQty(clamped);
                          setCustomQtyRaw(String(clamped));
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => { const n = customQty + 1; setCustomQty(n); setCustomQtyRaw(String(n)); }}
                        className="px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 active:bg-zinc-700 transition-colors text-lg font-bold shrink-0 select-none"
                      >+</button>
                    </div>
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
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Design Image</label>
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Required</span>
                  </div>
                  <div className="relative group">
                    {customImageFile ? (
                      <div className="flex items-center gap-3 bg-zinc-950 border border-emerald-500/30 rounded-xl p-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/10">
                          <img src={URL.createObjectURL(customImageFile)} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate font-medium">{customImageFile.name}</p>
                          <p className="text-[10px] text-emerald-400 font-medium">Ready for upload</p>
                        </div>
                        <button
                          onClick={() => setCustomImageFile(null)}
                          className="p-2 text-zinc-500 hover:text-red-400 bg-white/5 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 w-full py-6 px-4 bg-zinc-950 border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 rounded-xl cursor-pointer transition-all group/upload">
                        <Upload size={24} className="text-purple-400 group-hover/upload:scale-110 transition-transform" />
                        <div className="text-center">
                          <p className="text-sm font-bold text-white">Tap to choose your design</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">PNG, JPG, or any image format</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              const cat = categories.find((c: any) => c.id === customCatId);
                              if (cat?.requiresCircularCrop) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const src = reader.result as string;
                                  const img = new Image();
                                  img.onload = () => {
                                    const r = Math.max(img.naturalWidth, img.naturalHeight) / Math.min(img.naturalWidth, img.naturalHeight);
                                    setFitZoom(1 / Math.sqrt(1 + r * r));
                                    setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                                    cropSizeScreenPxRef.current = Math.min(img.naturalWidth, img.naturalHeight);
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
                      </label>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Quantity</label>
                  <div className="flex items-center bg-zinc-900 rounded-xl border border-white/10 shadow-inner overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { const n = Math.max(1, customQty - 1); setCustomQty(n); setCustomQtyRaw(String(n)); }}
                      className="px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 active:bg-zinc-700 transition-colors text-lg font-bold shrink-0 select-none"
                    >−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="flex-1 bg-transparent text-white text-center text-sm font-black focus:outline-none py-3 min-w-0"
                      value={customQtyRaw}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        setCustomQtyRaw(raw);
                        if (raw !== '') setCustomQty(Math.max(1, parseInt(raw)));
                      }}
                      onBlur={() => {
                        const clamped = Math.max(1, parseInt(customQtyRaw) || 1);
                        setCustomQty(clamped);
                        setCustomQtyRaw(String(clamped));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => { const n = customQty + 1; setCustomQty(n); setCustomQtyRaw(String(n)); }}
                      className="px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 active:bg-zinc-700 transition-colors text-lg font-bold shrink-0 select-none"
                    >+</button>
                  </div>
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
                      if (isAddingCustom) return;
                      if (!customCatId) return;
                      if (!customImageFile) { showToast('Please upload a design image first', 'error'); return; }
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
                        setCustomQtyRaw('1');
                        setCustomImageFile(null);
                        setIsAddingCustom(false);
                        setIsCartExpanded(true);
                      } else {
                        showToast('Custom item not found for this category', 'error');
                      }
                    }}
                    disabled={isAddingCustom || !customImageFile}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-xl text-white text-sm font-black shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-white/10"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 isolate">
          <div className="absolute inset-0 bg-black/90 sm:backdrop-blur-sm" onClick={() => setIsCropping(false)}></div>
          <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl relative z-10 h-[75vh] animate-in fade-in zoom-in-95 duration-200">
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
                onCropComplete={(_, cap) => {
                  setCroppedAreaPixels(cap);
                  // Store the crop circle size in screen pixels for use in the useEffect.
                  cropSizeScreenPxRef.current = cap.width * zoom;
                  // Warn if the crop circle extends outside the original image bounds in any direction
                  const oob =
                    cap.x < 0 ||
                    cap.y < 0 ||
                    cap.x + cap.width  > imgNaturalSize.w ||
                    cap.y + cap.height > imgNaturalSize.h;
                  setCropHasWhiteSpace(oob);
                }}
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
            <div className="p-5 border-t border-white/10 bg-zinc-900/80 shrink-0 flex flex-col gap-3">
              {cropHasWhiteSpace && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium animate-in fade-in duration-200">
                  <AlertCircle size={14} className="shrink-0 text-amber-400" />
                  <span>Image doesn't fill the circle — empty space will be filled with white background.</span>
                </div>
              )}
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
                      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, 'custom-crop.png');
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 isolate">
          <div className="absolute inset-0 bg-black/80 sm:backdrop-blur-md" onClick={() => setCompletedOrder(null)}></div>
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

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  const orderNum = completedOrder.orderNumber;
                  setCompletedOrder(null);
                  setTrackOrderInput(orderNum);
                  setIsTrackOrderModalOpen(true);
                  handleLookupOrder(orderNum);
                }}
                className="w-full py-3 bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 font-bold text-xs rounded-xl border border-blue-500/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Clock size={16} /> Track Order & Send Payment Receipt
              </button>

              <button
                onClick={() => setCompletedOrder(null)}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-xl shadow-lg shadow-emerald-950/50 transition-all border border-white/10 active:scale-[0.98]"
              >
                Got it, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track Order Modal */}
      {isTrackOrderModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 isolate">
          <div className="absolute inset-0 bg-black/80 sm:backdrop-blur-md" onClick={() => setIsTrackOrderModalOpen(false)}></div>
          
          <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-zinc-950/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/30">
                  <Package size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-tight">Track Your Order</h2>
                  <p className="text-xs text-zinc-400">Check item progress and upload payment receipts</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsTrackOrderModalOpen(false);
                  setLookupError(null);
                }}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-6 no-scrollbar">
              
              {/* Search Bar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                  <input
                    type="text"
                    placeholder="Enter Order # (e.g., ABC123)"
                    value={trackOrderInput}
                    onChange={e => setTrackOrderInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleLookupOrder(); }}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 font-mono tracking-wider uppercase placeholder-zinc-600"
                  />
                </div>
                <button
                  onClick={() => handleLookupOrder()}
                  disabled={isLookupLoading}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-950 flex items-center justify-center gap-2 shrink-0 active:scale-95"
                >
                  {isLookupLoading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                  <span>{isLookupLoading ? 'Searching...' : 'Check Status'}</span>
                </button>
              </div>

              {/* Error Alert */}
              {lookupError && (
                <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-2xl flex items-center gap-3 text-red-200 text-xs font-medium">
                  <AlertCircle size={18} className="text-red-400 shrink-0" />
                  <span>{lookupError}</span>
                </div>
              )}

              {/* Order Details Display */}
              {activeOrderDetails && (
                <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                  
                  {/* Top Status Card */}
                  <div className="bg-zinc-950 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap justify-between items-start gap-2 border-b border-white/5 pb-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Order Reference</div>
                        <div className="text-xl font-mono font-black text-emerald-400">#{activeOrderDetails.orderNumber}</div>
                        {activeOrderDetails.customerName && (
                          <div className="text-xs text-zinc-300 mt-0.5">Customer: <span className="font-semibold text-white">{activeOrderDetails.customerName}</span></div>
                        )}
                        <div className="text-[11px] text-zinc-500 mt-0.5">{new Date(activeOrderDetails.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-white">{formatPrice(activeOrderDetails.totalAmount)}</div>
                        <div className="mt-1 flex justify-end gap-1.5 flex-wrap">
                          {activeOrderDetails.status === 'cancelled' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">Cancelled</span>
                          ) : (
                            <>
                              {activeOrderDetails.status === 'paid' ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Paid</span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Unpaid</span>
                              )}
                              {activeOrderDetails.isClaimed || activeOrderDetails.completedAt ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">Completed</span>
                              ) : activeOrderDetails.allPacked ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Ready for Pickup</span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Preparing</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar Header */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-zinc-300 flex items-center gap-1.5">
                          {activeOrderDetails.allPacked ? (
                            <CheckCircle2 size={16} className="text-emerald-400" />
                          ) : (
                            <Clock size={16} className="text-amber-400" />
                          )}
                          {activeOrderDetails.allPacked ? 'All Items Ready!' : 'Item Preparation Status'}
                        </span>
                        <span className="text-zinc-400 font-mono">
                          {activeOrderDetails.packedItemsCount} / {activeOrderDetails.totalItemsCount} Ready
                        </span>
                      </div>
                      
                      <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
                        <div
                          className={`h-full transition-all duration-500 ${
                            activeOrderDetails.allPacked
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : 'bg-gradient-to-r from-amber-500 to-blue-500'
                          }`}
                          style={{
                            width: `${
                              activeOrderDetails.totalItemsCount > 0
                                ? (activeOrderDetails.packedItemsCount / activeOrderDetails.totalItemsCount) * 100
                                : 0
                            }%`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Cancelled Order Warning Card */}
                  {activeOrderDetails.status === 'cancelled' && (
                    <div className="p-4 bg-red-950/60 border border-red-500/40 rounded-2xl flex items-center gap-3 text-xs text-red-200">
                      <AlertCircle size={20} className="text-red-400 shrink-0" />
                      <div>
                        <div className="font-bold text-red-400 text-sm">Order Cancelled</div>
                        <p className="text-red-300 mt-0.5">This order has been cancelled by store cashiers. Item preparation has stopped and payment uploads are disabled.</p>
                      </div>
                    </div>
                  )}

                  {/* Items List */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
                      <Package size={14} /> Items in Order
                    </h3>
                    <div className="flex flex-col gap-2.5">
                      {activeOrderDetails.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 bg-zinc-950/60 border border-white/5 rounded-2xl flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                              {item.customImage ? (
                                <img src={getImageUrl(item.customImage)} alt={item.name} className="w-full h-full object-cover" />
                              ) : item.imageUrl ? (
                                <img src={getImageUrl(item.imageUrl)} alt={item.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package size={18} className="text-zinc-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-white leading-tight line-clamp-1">{item.name}</div>
                              <div className="text-[11px] text-zinc-400 mt-0.5">
                                {item.quantity}x • {formatPrice(item.priceAtTimeOfSale)}
                                {item.variantName ? ` • ${item.variantName}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {item.isPacked ? (
                              <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 size={12} /> Ready
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                                <Clock size={12} /> Preparing
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment & Receipt Section */}
                  {activeOrderDetails.status === 'cancelled' ? (
                    <div className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl text-center text-xs text-zinc-400 font-medium">
                      Payment QR codes and receipt submission are unavailable for cancelled orders.
                    </div>
                  ) : (
                    <div className="bg-zinc-950/80 border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                          <CreditCard size={14} className="text-blue-400" /> Payment & QR Codes
                        </h3>
                        {activeOrderDetails.status === 'paid' ? (
                          <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 size={14} /> Payment Verified
                          </span>
                        ) : (
                          <span className="text-xs text-amber-400 font-bold flex items-center gap-1">
                            <AlertCircle size={14} /> Pending Payment
                          </span>
                        )}
                      </div>

                      {/* Payment Method Selector Tabs */}
                      <div className="flex flex-col gap-3">
                        <div className="flex p-1 bg-zinc-900 rounded-xl border border-white/5 gap-1">
                          <button
                            onClick={() => setPaymentMethodTab('gcash')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                              paymentMethodTab === 'gcash'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                            }`}
                          >
                            <span>GCash</span>
                          </button>
                          <button
                            onClick={() => setPaymentMethodTab('maya')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                              paymentMethodTab === 'maya'
                                ? 'bg-purple-600 text-white shadow-md'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                            }`}
                          >
                            <span>Maya</span>
                          </button>
                        </div>

                        {/* QR Display Card */}
                        <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                          <div 
                            onClick={() => setIsQrExpanded(true)}
                            className="w-32 h-32 bg-white p-2 rounded-xl shrink-0 flex flex-col items-center justify-center shadow-md relative overflow-hidden group cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all"
                            title="Click to Expand QR Code"
                          >
                            <img
                              src={paymentMethodTab === 'gcash' 
                                ? (import.meta.env.VITE_GCASH_QR_CLEAN_URL || `${import.meta.env.BASE_URL}gcash_qr_clean.jpg`)
                                : (import.meta.env.VITE_MAYA_QR_CLEAN_URL || `${import.meta.env.BASE_URL}maya_qr_clean.jpg`)
                              }
                              alt={`${paymentMethodTab} Clean QR Code`}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                // Fallback to original image if clean image is not present
                                const target = e.currentTarget as HTMLImageElement;
                                const baseUrl = import.meta.env.BASE_URL || '/';
                                if (paymentMethodTab === 'gcash' && !target.src.includes('gcash_qr.jpg')) {
                                  target.src = `${baseUrl}gcash_qr.jpg`;
                                } else if (paymentMethodTab === 'maya' && !target.src.includes('maya_qr.jpg')) {
                                  target.src = `${baseUrl}maya_qr.jpg`;
                                } else {
                                  target.style.display = 'none';
                                  const fallback = target.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }
                              }}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-[1px]">
                              🔍 Expand
                            </div>
                            <div className="w-full h-full border-2 border-dashed border-zinc-400 rounded flex flex-col items-center justify-center p-1 text-center hidden">
                              <QrCode size={40} className={paymentMethodTab === 'gcash' ? 'text-blue-600' : 'text-purple-600'} />
                              <span className="text-[8px] font-black tracking-tighter uppercase text-zinc-800 mt-1">
                                {paymentMethodTab === 'gcash' ? 'GCash Pay' : 'Maya Pay'}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 flex flex-col gap-1.5">
                            <div className="text-sm font-bold text-white">
                              {paymentMethodTab === 'gcash' ? 'GCash Express Pay' : 'Maya Wallet'}
                            </div>
                            <div className="text-xs text-zinc-300">
                              Account Name: <span className="font-semibold text-white">{import.meta.env.VITE_PAYMENT_NAME || 'Godwin I. Florendo'}</span>
                            </div>
                            <div className="text-xs text-zinc-300">
                              Number: <span className="font-mono font-bold text-emerald-400">
                                {paymentMethodTab === 'gcash' 
                                  ? (import.meta.env.VITE_GCASH_NUMBER || '09503876551') 
                                  : (import.meta.env.VITE_MAYA_NUMBER || '09943926826')
                                }
                              </span>
                            </div>
                            
                            <div className="flex gap-2 mt-1">
                              <a
                                href={paymentMethodTab === 'gcash' ? `${import.meta.env.BASE_URL}gcash_qr.jpg` : `${import.meta.env.BASE_URL}maya_qr.jpg`}
                                download={`${paymentMethodTab}_full_card.jpg`}
                                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-bold transition-all border border-white/10 flex items-center justify-center gap-1.5 active:scale-95"
                              >
                                <ExternalLink size={12} className="text-blue-400" />
                                <span>Download Full QR Card</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Receipt Upload Box */}
                      <div className="pt-2 border-t border-white/5 flex flex-col gap-3">
                        <div className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                          <Upload size={14} className="text-purple-400" /> Send Proof of Payment (Receipt Image)
                        </div>

                        {activeOrderDetails.receiptStatus === 'rejected' && (
                          <div className="p-3.5 bg-red-950/60 border border-red-500/40 rounded-xl flex flex-col gap-1 text-xs text-red-200">
                            <div className="flex items-center gap-2 font-bold text-red-400">
                              <AlertCircle size={16} className="shrink-0" />
                              <span>Payment Receipt Rejected</span>
                            </div>
                            <p className="text-[11px] leading-snug text-red-300">
                              Reason: {activeOrderDetails.receiptNotes || 'Your payment receipt could not be verified by cashiers.'}
                            </p>
                            <div className="text-[11px] font-semibold text-zinc-300 mt-1">
                              Please re-upload a clear receipt screenshot or re-send payment via GCash/Maya below:
                            </div>
                          </div>
                        )}

                        {activeOrderDetails.receiptUrl && activeOrderDetails.receiptStatus !== 'rejected' ? (
                          <div className="p-3.5 bg-purple-950/30 border border-purple-500/30 rounded-xl flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                              <span className="text-xs text-purple-200 truncate">
                                {activeOrderDetails.receiptStatus === 'verified' || activeOrderDetails.status === 'paid' 
                                  ? 'Payment Verified!' 
                                  : 'Receipt submitted! Awaiting cashier verification.'}
                              </span>
                            </div>
                            <a
                              href={getImageUrl(activeOrderDetails.receiptUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1"
                            >
                              <ExternalLink size={12} /> View Receipt
                            </a>
                          </div>
                        ) : (
                          /* Only show file upload controls if receipt is missing or was rejected */
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => {
                                if (e.target.files && e.target.files[0]) {
                                  setReceiptFile(e.target.files[0]);
                                }
                              }}
                              className="flex-1 text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-blue-400 hover:file:bg-zinc-700 cursor-pointer"
                            />
                            <button
                              onClick={handleUploadReceipt}
                              disabled={!receiptFile || isUploadingReceipt}
                              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 shrink-0"
                            >
                              {isUploadingReceipt ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                              <span>{isUploadingReceipt ? 'Uploading...' : activeOrderDetails.receiptStatus === 'rejected' ? 'Re-submit Receipt' : 'Submit Receipt'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded QR Modal */}
      {isQrExpanded && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 isolate">
          <div className="absolute inset-0 bg-black/90 sm:backdrop-blur-md" onClick={() => setIsQrExpanded(false)}></div>
          
          <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md p-6 flex flex-col items-center gap-5 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200 text-center">
            
            {/* Header */}
            <div className="w-full flex justify-between items-center border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-left">
                <QrCode size={20} className={paymentMethodTab === 'gcash' ? 'text-blue-400' : 'text-purple-400'} />
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">
                    {paymentMethodTab === 'gcash' ? 'GCash QR Code' : 'Maya QR Code'}
                  </h3>
                  <p className="text-[11px] text-zinc-400">Scan using your mobile banking app</p>
                </div>
              </div>
              <button
                onClick={() => setIsQrExpanded(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* High Res Flush Clean QR Display */}
            <div className="w-64 h-64 sm:w-72 sm:h-72 bg-white p-3 rounded-2xl shadow-2xl flex items-center justify-center border-4 border-white/20">
              <img
                src={paymentMethodTab === 'gcash'
                  ? (import.meta.env.VITE_GCASH_QR_CLEAN_URL || `${import.meta.env.BASE_URL}gcash_qr_clean.jpg`)
                  : (import.meta.env.VITE_MAYA_QR_CLEAN_URL || `${import.meta.env.BASE_URL}maya_qr_clean.jpg`)
                }
                alt={`${paymentMethodTab} Expanded QR Code`}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Account Info Card */}
            <div className="w-full p-3.5 bg-zinc-950/80 border border-white/10 rounded-2xl flex flex-col gap-1 text-xs">
              <div className="text-zinc-400">Account Name: <span className="font-semibold text-white">{import.meta.env.VITE_PAYMENT_NAME || 'Godwin I. Florendo'}</span></div>
              <div className="text-zinc-400 flex items-center justify-center gap-2">
                <span>Number:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {paymentMethodTab === 'gcash' 
                    ? (import.meta.env.VITE_GCASH_NUMBER || '09503876551') 
                    : (import.meta.env.VITE_MAYA_NUMBER || '09943926826')
                  }
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="w-full flex gap-3">
              <a
                href={paymentMethodTab === 'gcash' ? `${import.meta.env.BASE_URL}gcash_qr.jpg` : `${import.meta.env.BASE_URL}maya_qr.jpg`}
                download={`${paymentMethodTab}_full_card.jpg`}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <ExternalLink size={14} className="text-blue-400" /> Download Full Card
              </a>
              <button
                onClick={() => setIsQrExpanded(false)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Toast Notifications — fixed at viewport level, top-right on desktop, above cart bar on mobile */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-auto md:top-[72px] right-3 md:right-6 z-[90] flex flex-col gap-2 max-w-[calc(100vw-1.5rem)] sm:max-w-sm w-full pointer-events-none"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 p-3.5 rounded-2xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-3 md:slide-in-from-top-3 duration-200 text-xs sm:text-sm font-medium ${
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

    </div>
  );
}
