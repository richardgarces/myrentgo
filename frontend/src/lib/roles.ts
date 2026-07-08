export const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  manager: 'Gestor',
  accountant: 'Contador',
  viewer: 'Solo lectura',
}

export const ROLE_DESCRIPTIONS: { key: string; label: string; description: string }[] = [
  { key: 'owner', label: 'Propietario', description: 'Control total de la organización y configuración.' },
  { key: 'admin', label: 'Administrador', description: 'Gestión completa de propiedades, arriendos y usuarios.' },
  { key: 'manager', label: 'Gestor', description: 'Operación diaria: arriendos, pagos y mantenciones.' },
  { key: 'accountant', label: 'Contador', description: 'Acceso a finanzas, pagos y reportes.' },
  { key: 'viewer', label: 'Solo lectura', description: 'Consulta de información sin modificar datos.' },
]

export const ALL_ROLES = ['owner', 'admin', 'manager', 'accountant', 'viewer'] as const

export type UserRole = (typeof ALL_ROLES)[number]

export function assignableRoles(currentRole: string): UserRole[] {
  if (currentRole === 'owner') return [...ALL_ROLES]
  if (currentRole === 'admin') return ['admin', 'manager', 'accountant', 'viewer']
  return []
}

export function canManageUsers(role: string): boolean {
  return role === 'owner' || role === 'admin'
}
