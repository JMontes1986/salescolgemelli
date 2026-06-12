
import type { ModulePermission, UserRole } from './types';

const permissions: Record<UserRole, ModulePermission[]> = {
  admin: [
    'dashboard',
    'sales',
    'presale',
    'self-service',
    'products',
    'redeem',
    'cashbox',
    'returns',
    'users',
    'audit',
  ],
  cashier: [
    'dashboard',
    'sales',
    'presale',
    'redeem',
    'cashbox',
    'returns',
  ],
  seller: [
    'redeem',
  ],
  auditor: [
    'dashboard',
    'audit',
  ],
};

export const getPermissionsForRole = (role: UserRole): ModulePermission[] => {
  return permissions[role] || [];
};
