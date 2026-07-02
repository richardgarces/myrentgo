const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

let onUnauthorized: (() => void) | null = null

export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

class ApiClient {
  private token: string | null = null

  setToken(token: string | null) {
    this.token = token
    if (token) localStorage.setItem('access_token', token)
    else localStorage.removeItem('access_token')
  }

  getToken() {
    const t = this.token || localStorage.getItem('access_token')
    return t?.trim() || null
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers })
    } catch {
      throw new Error('No se pudo conectar con la API. Verifica que el backend esté corriendo en el puerto 7070.')
    }
    if (!res.ok) {
      let message = res.statusText
      try {
        const err = await res.json()
        if (typeof err?.error === 'string' && err.error) message = err.error
      } catch {
        if (res.status === 500) {
          message = 'El servidor no está disponible. Reinicia la API con la opción 12 o 14 del menú myrent.sh.'
        }
      }
      if (res.status === 401) {
        this.setToken(null)
        onUnauthorized?.()
        throw new Error('Sesión expirada. Inicia sesión nuevamente.')
      }
      throw new Error(message || 'Request failed')
    }
    if (res.status === 204) return undefined as T
    return res.json()
  }

  login(email: string, password: string) {
    return this.request<{ access_token: string; refresh_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  register(data: { email: string; password: string; first_name: string; last_name: string; org_name: string }) {
    return this.request<{ access_token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  me() {
    return this.request<Record<string, unknown>>('/auth/me')
  }

  getDashboard() {
    return this.request<DashboardData>('/dashboard')
  }

  getProperties(params?: { status?: string; page?: number; type?: string; limit?: number }) {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.type) q.set('type', params.type)
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return this.request<Paginated<Property>>(`/properties${qs ? `?${qs}` : ''}`)
  }

  createProperty(data: PropertyPayload) {
    return this.request<Property>('/properties', { method: 'POST', body: JSON.stringify(data) })
  }

  getProperty(id: string) {
    return this.request<Property>(`/properties/${id}`)
  }

  updateProperty(id: string, data: PropertyPayload) {
    return this.request<Property>(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  deleteProperty(id: string) {
    return this.request<void>(`/properties/${id}`, { method: 'DELETE' })
  }

  getTenants(page = 1, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<Tenant>>(`/tenants?${q}`)
  }

  createTenant(data: { first_name: string; last_name: string; email?: string; phone?: string; tax_id?: string }) {
    return this.request<Tenant>('/tenants', { method: 'POST', body: JSON.stringify(data) })
  }

  getTenant(id: string) {
    return this.request<Tenant>(`/tenants/${id}`)
  }

  updateTenant(id: string, data: { first_name: string; last_name: string; email?: string; phone?: string; tax_id?: string }) {
    return this.request<Tenant>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  deleteTenant(id: string) {
    return this.request<void>(`/tenants/${id}`, { method: 'DELETE' })
  }

  deactivateTenant(id: string) {
    return this.request<{ status: string }>(`/tenants/${id}/deactivate`, { method: 'PATCH' })
  }

  getLeases(page = 1, status?: string, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (status) q.set('status', status)
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<Lease>>(`/leases?${q}`)
  }

  createLease(data: {
    property_id: string; tenant_id: string; start_date?: string; end_date?: string
    monthly_rent: number; ipc_adjustment?: boolean; payment_day?: number
    warehouse_property_id?: string; parking_property_id?: string
  }) {
    return this.request<Lease>('/leases', { method: 'POST', body: JSON.stringify(data) })
  }

  getLease(id: string) {
    return this.request<Lease>(`/leases/${id}`)
  }

  updateLease(id: string, data: {
    property_id: string; tenant_id: string; start_date?: string; end_date?: string
    monthly_rent: number; ipc_adjustment?: boolean; payment_day?: number
    warehouse_property_id?: string; parking_property_id?: string
  }) {
    return this.request<Lease>(`/leases/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  terminateLease(id: string) {
    return this.request<{ status: string }>(`/leases/${id}/terminate`, { method: 'PATCH' })
  }

  getPayments(page = 1, status?: string, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (status) q.set('status', status)
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<Payment>>(`/payments?${q}`)
  }

  createPayment(data: { property_id?: string; lease_id?: string; tenant_id?: string; type: string; amount: number; due_date: string; notes?: string }) {
    return this.request<Payment>('/payments', { method: 'POST', body: JSON.stringify(data) })
  }

  markPaymentPaid(id: string) {
    return this.request<{ status: string }>(`/payments/${id}/paid`, { method: 'PATCH' })
  }

  generatePendingRentPayments(month?: string, dryRun = false) {
    return this.request<{
      month: string
      created?: number
      would_create?: number
      skipped: number
      month_already_generated?: boolean
      dry_run?: boolean
      data?: Payment[]
    }>('/payments/generate-pending', {
      method: 'POST',
      body: JSON.stringify({ month: month || undefined, dry_run: dryRun }),
    })
  }

  getMortgages(page = 1) {
    return this.request<Paginated<Mortgage>>(`/mortgages?page=${page}`)
  }

  getContacts(page = 1, type?: string) {
    const q = new URLSearchParams({ page: String(page) })
    if (type) q.set('type', type)
    return this.request<Paginated<CrmContact>>(`/crm/contacts?${q}`)
  }

  createContact(data: { type: string; name: string; email?: string; phone?: string }) {
    return this.request<CrmContact>('/crm/contacts', { method: 'POST', body: JSON.stringify(data) })
  }

  getMaintenance(page = 1) {
    return this.request<Paginated<Maintenance>>(`/maintenance?page=${page}`)
  }

  createMaintenance(data: { property_id: string; title: string; type?: string; scheduled_date: string; cost?: number }) {
    return this.request<Maintenance>('/maintenance', { method: 'POST', body: JSON.stringify(data) })
  }

  getTickets(page = 1, status?: string) {
    const q = new URLSearchParams({ page: String(page) })
    if (status) q.set('status', status)
    return this.request<Paginated<Ticket>>(`/tickets?${q}`)
  }

  createTicket(data: { property_id: string; title: string; description?: string; priority?: string }) {
    return this.request<Ticket>('/tickets', { method: 'POST', body: JSON.stringify(data) })
  }

  getDocuments(page = 1, opts?: { category?: string; entity_type?: string; entity_id?: string }) {
    const q = new URLSearchParams({ page: String(page) })
    if (opts?.category) q.set('category', opts.category)
    if (opts?.entity_type) q.set('entity_type', opts.entity_type)
    if (opts?.entity_id) q.set('entity_id', opts.entity_id)
    return this.request<Paginated<Document>>(`/documents?${q}`)
  }

  createDocument(data: {
    entity_type: string
    entity_id: string
    category: string
    title: string
    file_name?: string
    file_data?: string
    mime_type?: string
    size_bytes?: number
  }) {
    return this.request<Document>('/documents', { method: 'POST', body: JSON.stringify(data) })
  }

  getDocument(id: string) {
    return this.request<Document>(`/documents/${id}`)
  }

  updateDocument(id: string, data: {
    entity_type: string
    entity_id: string
    category: string
    title: string
    file_name?: string
    file_data?: string
    mime_type?: string
    size_bytes?: number
  }) {
    return this.request<Document>(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  }

  deleteDocument(id: string) {
    return this.request<void>(`/documents/${id}`, { method: 'DELETE' })
  }

  deactivateDocument(id: string) {
    return this.request<{ status: string }>(`/documents/${id}/deactivate`, { method: 'PATCH' })
  }

  getCalendar(days = 60) {
    return this.request<{ data: CalendarEvent[] }>(`/calendar?days=${days}`)
  }

  getReminders(page = 1) {
    return this.request<Paginated<Reminder>>(`/reminders?page=${page}`)
  }

  getNotifications(params?: {
    page?: number
    status?: string
    type?: string
    tenant_id?: string
    from_date?: string
    to_date?: string
  }) {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.status) q.set('status', params.status)
    if (params?.type) q.set('type', params.type)
    if (params?.tenant_id) q.set('tenant_id', params.tenant_id)
    if (params?.from_date) q.set('from_date', params.from_date)
    if (params?.to_date) q.set('to_date', params.to_date)
    const qs = q.toString()
    return this.request<Paginated<TenantNotification>>(`/notifications${qs ? `?${qs}` : ''}`)
  }

  createNotification(data: {
    tenant_id: string
    lease_id?: string
    type: string
    title: string
    message: string
    channel: string
    scheduled_at: string
    metadata?: Record<string, string>
  }) {
    return this.request<TenantNotification>('/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  updateNotificationStatus(id: string, status: 'sent' | 'cancelled' | 'failed') {
    return this.request<TenantNotification>(`/notifications/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  }

  deleteNotification(id: string) {
    return this.request<void>(`/notifications/${id}`, { method: 'DELETE' })
  }
}

export interface DashboardData {
  total_properties: number
  rentable_properties: number
  rented_properties: number
  occupancy_rate: number
  monthly_income: number
  monthly_expenses: number
  net_cash_flow: number
  overdue_payments: number
  pending_payments_count: number
  pending_payments_total: number
  pending_payments: Array<{
    id: string
    tenant_name: string
    property_name: string
    amount: number
    due_date: string
    status: string
    type: string
  }>
  rent_month: string
  total_rent_paid: number
  total_rent_pending: number
  total_rent_paid_count: number
  total_rent_pending_count: number
  active_leases: number
  total_monthly_rent: number
  total_value_uf: number
  total_debt_uf: number
  total_monthly_mortgage_uf: number
  properties_by_type: Array<{ type: string; count: number }>
  upcoming_expirations: Array<{ id: string; type: string; title: string; expires_at: string; days_left: number }>
  profitability: Array<{ property_id: string; property_name: string; income: number; expenses: number; profit: number; roi: number }>
}

export interface PropertyPayload {
  name: string
  type: string
  purpose: string
  purpose_other?: string
  street: string
  commune: string
  city: string
  region: string
  owner_name?: string
  property_rol?: string
  fojas?: string
  parking_property_id?: string
  warehouse_property_id?: string
  value_uf?: number
  debt_uf?: number
  monthly_mortgage_uf?: number
  loan_term_years?: number
  interest_rate?: number
  bank_name?: string
  payment_start_date?: string
  unit_number?: string
  floor?: string
  concierge_email?: string
  concierge_phone?: string
  butler_name?: string
  administration?: string
  administration_email?: string
  administration_phone?: string
  area_m2?: number
  water_company?: string
  water_client_code?: string
  electricity_company?: string
  electricity_client_code?: string
  gas_company?: string
  gas_client_code?: string
  photos?: PropertyPhoto[]
}

export interface UtilityAccount {
  company?: string
  client_code?: string
}

export interface PropertyPhoto {
  url: string
  caption?: string
  is_primary: boolean
}

export interface Property {
  id: string
  name: string
  type: string
  status: string
  purpose?: string
  purpose_other?: string
  owner_name?: string
  parking_property_id?: string
  warehouse_property_id?: string
  /** @deprecated Legacy link on warehouse documents; use warehouse_property_id on apartment. */
  apartment_property_id?: string
  unit_number?: string
  floor?: string
  area_m2?: number
  photos?: PropertyPhoto[]
  concierge?: {
    email?: string
    phone?: string
    butler_name?: string
    administration?: string
    administration_email?: string
    administration_phone?: string
  }
  utility_accounts?: {
    water?: UtilityAccount
    electricity?: UtilityAccount
    gas?: UtilityAccount
  }
  address: { street: string; commune: string; city: string; region?: string; property_rol?: string }
  deed?: { fojas?: string }
  financials: {
    expected_rent?: { amount: number; currency: string }
    value_uf?: number
    debt_uf?: number
    monthly_mortgage_uf?: number
    loan_term_years?: number
    interest_rate?: number
    bank_name?: string
    payment_start_date?: string
  }
}

export interface Tenant {
  id: string
  first_name: string
  last_name: string
  tax_id?: string
  contact: { email?: string; phone?: string }
  active: boolean
}

export interface Lease {
  id: string
  property_id: string
  warehouse_property_id?: string
  parking_property_id?: string
  tenant_id: string
  status: string
  start_date?: string
  end_date?: string
  monthly_rent: { amount: number; currency: string }
  ipc_adjustment: boolean
  payment_day: number
}

export interface Payment {
  id: string
  property_id?: string
  lease_id?: string
  tenant_id?: string
  type: string
  status: string
  amount: { amount: number; currency: string }
  due_date: string
  paid_date?: string
  notes?: string
}

export interface Mortgage {
  id: string
  property_id: string
  bank_id: string
  loan_amount: { amount: number }
  monthly_payment: { amount: number }
  interest_rate: number
  present_value: number
  active: boolean
}

export interface CrmContact {
  id: string
  type: string
  name: string
  contact: { email?: string; phone?: string }
  active: boolean
}

export interface Maintenance {
  id: string
  property_id: string
  type: string
  status: string
  title: string
  scheduled_date: string
  cost: { amount: number }
}

export interface Ticket {
  id: string
  property_id: string
  title: string
  description: string
  priority: string
  status: string
}

export interface Document {
  id: string
  title: string
  category: string
  file_name: string
  file_data?: string
  mime_type?: string
  size_bytes?: number
  entity_type: string
  entity_id: string
  version: number
  active: boolean
}

export interface CalendarEvent {
  id: string
  type: string
  title: string
  date: string
  entity_id: string
}

export interface Reminder {
  id: string
  title: string
  channel: string
  recipient: string
  scheduled_at: string
  status: string
}

export interface TenantNotification {
  id: string
  tenant_id: string
  lease_id?: string
  type: string
  title: string
  message: string
  channel: string
  status: string
  scheduled_at: string
  sent_at?: string
  metadata?: Record<string, string>
  organization_id: string
  created_at: string
  updated_at: string
}

export const api = new ApiClient()
