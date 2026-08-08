const API_URL = import.meta.env.VITE_API_URL || '';

export type Tag = { id: number; name: string };
export type CategoryVariant = { id: number; categoryId: number; name: string; price: number };
export type ItemVariant = { id: number; itemId: number; variantId: number; stock: number; price: number };

export type Category = { id: number; name: string; requiresCircularCrop?: boolean; variants?: CategoryVariant[] };
export type Item = { 
  id: number; categoryId: number; name: string; stock: number; price: number; 
  imageUrl?: string; isArchived?: boolean; isDeletable?: boolean; isCustom?: boolean;
  variants?: ItemVariant[]; tags?: Tag[];
};
export type Bundle = { id: number; categoryId: number; variantId?: number | null; requiredQuantity: number; bundlePrice: number };
export type CartItem = { itemId: number; quantity: number; variantId?: number | null; deductFromStock?: boolean; customImage?: string };

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const headers: any = { ...options?.headers };
  
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const cleanApiUrl = API_URL.replace(/\/+$/, '');
  const res = await fetch(`${cleanApiUrl}/api${endpoint}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'API request failed');
  }
  return res.json();
}

export type OrderItem = {
  id: number;
  quantity: number;
  priceAtTimeOfSale: number;
  name: string;
  imageUrl?: string | null;
  categoryName?: string | null;
  variantName?: string | null;
  customImage?: string | null;
  isPacked?: boolean;
};

export type OrderDetails = {
  id: number;
  totalAmount: number;
  createdAt: string;
  completedAt?: string | null;
  isPreorder?: boolean;
  status?: string;
  isPacked?: boolean;
  isClaimed?: boolean;
  customerName?: string | null;
  orderNumber?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptStatus?: string | null;
  receiptNotes?: string | null;
  items: OrderItem[];
  totalItemsCount: number;
  packedItemsCount: number;
  allPacked: boolean;
};

export const api = {
  getCategories: () => fetcher<Category[]>('/categories'),
  getItems: () => fetcher<Item[]>('/items'),
  getBundles: () => fetcher<Bundle[]>('/bundles'),

  previewCart: (cart: CartItem[]) => fetcher<{ totalAmount: number }>('/transactions/preview', { method: 'POST', body: JSON.stringify({ cart }) }),
  checkout: (cart: CartItem[], isPreorder?: boolean, customerName?: string, notes?: string, isPrepaid?: boolean) => fetcher<{ success: boolean; totalAmount: number; orderNumber?: string }>('/transactions', { method: 'POST', body: JSON.stringify({ cart, isPreorder, customerName, notes, isPrepaid }) }),
  
  lookupOrder: (orderNumber: string) => fetcher<OrderDetails>(`/transactions/lookup/${encodeURIComponent(orderNumber)}`),
  uploadReceipt: (orderNumber: string, receiptUrl: string) => fetcher<{ success: boolean; receiptUrl: string }>(`/transactions/lookup/${encodeURIComponent(orderNumber)}/receipt`, { method: 'POST', body: JSON.stringify({ receiptUrl }) }),

  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return fetch(`${API_URL.replace(/\/+$/, '')}/api/upload`, {
      method: 'POST',
      body: formData,
    }).then(res => {
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ imageUrl: string }>;
    });
  },
};

export const getImageUrl = (path: string) => `${API_URL.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
