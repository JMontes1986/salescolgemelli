

export type UserRole = 'admin' | 'cashier' | 'seller' | 'auditor';

export type ModulePermission =
  | 'dashboard'
  | 'sales'
  | 'presale'
  | 'self-service'
  | 'products'
  | 'redeem'
  | 'cashbox'
  | 'returns'
  | 'users'
  | 'audit';


export type User = {
  id: string;
  name: string;
  username: string;
  password?: string;
  role: UserRole;
  permissions: ModulePermission[];
  avatarUrl: string;
};

export type NewUser = Omit<User, 'id' | 'permissions'> & {
  permissions?: ModulePermission[];
};
export type UpdatableUser = Partial<Omit<User, 'id' | 'username' | 'password'>>;


export type TicketStatus = 'available' | 'sold' | 'redeemed' | 'void';

export type Ticket = {
  id: string;
  uniqueCode: string;
  qrCodeUrl: string;
  status: TicketStatus;
  price: number;
  issuedAt: string;
  soldAt?: string;
  redeemedAt?: string;
  orderId?: string;
};

export type OrderStatus = 'pending' | 'paid' | 'cancelled';

export type Order = {
  id: string;
  ticketIds: string[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
  sellerId: string;
  sellerName: string;
};

export type CashboxStatus = 'open' | 'closed';

export type CashboxSession = {
  id: string;
  userId: string;
  userName: string;
  status: CashboxStatus;
  openingBalance: number;
  closingBalance?: number;
  openedAt: string;
  closedAt?: string;
  totalSales: number;
};

export type NewCashboxSession = Omit<CashboxSession, 'id'>;


export type AuditLogAction =
  | 'TICKET_ISSUE'
  | 'TICKET_SELL'
  | 'TICKET_REDEEM'
  | 'TICKET_VOID'
  | 'CASHBOX_OPEN'
  | 'CASHBOX_CLOSE'
  | 'USER_ROLE_CHANGE'
  | 'PAYMENT_CONFIRM'
  | 'STOCK_RESTOCK'
  | 'PURCHASE_EDIT'
  | 'USER_LOGIN'
  | 'SELF_SERVICE_PURCHASE'
  | 'SELF_SERVICE_HISTORY'
  | 'SELF_SERVICE_SECURITY_ALERT'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'RETURN_PROCESS'
  | 'AUDIT_LOG_FAILURE';

export type AuditLog = {
  id: string;
  timestamp: string;
  userId: string;
  userName:string;
  action: AuditLogAction;
  details: string;
};

export type NewAuditLog = Omit<AuditLog, 'id' | 'timestamp'>;

export type ProductAvailability = 'pos' | 'self-service' | 'presale' | 'unavailable';

export type Product = {
    id: string;
    name: string;
    price: number;
    stock: number;
    imageUrl: string;
    imageHint: string;
    category?: string;
    availability: ProductAvailability[];
    restockCount?: number;
    preSaleSold?: number;
    position: number;
};

// Represents an item in the shopping cart, stored within a Purchase
export type CartItem = {
  id: string; // Corresponds to Product ID
  name: string;
  price: number;
  quantity: number;
  returned?: boolean; // Flag to indicate if the item has been returned
  deliveredQuantity?: number; // Quantity already handed out by sellers/redeemers
};

export type PurchaseStatus = 'pending' | 'paid' | 'cancelled' | 'delivered' | 'partially-delivered' | 'pre-sale' | 'pre-sale-confirmed';


// Represents a completed purchase record in Supabase
export type Purchase = {
  id: string;
  date: string;
  total: number;
  items: CartItem[];
  cedula: string;
  celular: string;
  sellerId?: string; // ID of the user who made the sale in POS
  sellerName?: string; // Name of the user who made the sale in POS
  status: PurchaseStatus;
  deliveryCode?: string;
  qrPayload?: string;
  reservationExpiresAt?: string;
  modifiedAt?: string;
  modificationCount?: number;
  purchaseSource?: 'self-service' | 'pos' | 'presale';
};

// Type for creating a new purchase
export type NewPurchase = Omit<Purchase, 'id'>;

export type ReturnSource = 'Punto de Venta' | 'Autogestión';

// Represents a record of a product return
export type Return = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  returnedAt: string; // Timestamp of the return
  processedByUserId: string; // Who processed the return
  processedByUserName: string;
  source: ReturnSource; // Where the original sale was made
};

// Type for creating a new return record
export type NewReturn = Omit<Return, 'id'>;
