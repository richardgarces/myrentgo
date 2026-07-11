const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

function translateApiError(message: string): string {
  const normalized = message.trim().toLowerCase()
  switch (normalized) {
    case 'invalid credentials':
      return 'Credenciales incorrectas. Verifica correo y contraseña.'
    case 'user inactive':
      return 'Tu cuenta está desactivada. Contacta al administrador.'
    case 'email_not_verified':
      return 'EMAIL_NOT_VERIFIED'
    case 'forbidden':
      return 'No tienes permisos para esta acción.'
    case 'rate limit exceeded':
      return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
    case 'missing token':
    case 'invalid token':
    case 'unauthorized':
      return 'Sesión no válida. Inicia sesión nuevamente.'
    default:
      return message
  }
}

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

export type LoginResponse =
  | { access_token: string; refresh_token: string; expires_in?: number; mfa_required?: false }
  | { mfa_required: true; mfa_token: string; access_token?: never; refresh_token?: never }

export function isMfaLoginResponse(res: LoginResponse): res is { mfa_required: true; mfa_token: string } {
  return res.mfa_required === true && typeof res.mfa_token === 'string'
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
      let bodyError = ''
      try {
        const err = await res.json()
        if (typeof err?.error === 'string' && err.error) {
          bodyError = err.error
          message = err.error
        }
      } catch {
        if (res.status === 500) {
          message = 'El servidor no está disponible. Reinicia la API con la opción 12 o 14 del menú myrent.sh.'
        }
      }
      if (res.status === 401) {
        const hadToken = !!token
        this.setToken(null)
        if (hadToken) {
          onUnauthorized?.()
          throw new Error('Sesión expirada. Inicia sesión nuevamente.')
        }
        throw new Error(translateApiError(bodyError || message) || 'Credenciales incorrectas.')
      }
      if (res.status === 403) {
        if (bodyError === 'email_not_verified') {
          throw new Error('EMAIL_NOT_VERIFIED')
        }
        throw new Error(
          bodyError === 'forbidden'
            ? 'No tienes permisos para esta acción.'
            : 'Acceso denegado. Si usas el frontend en el puerto 4000, verifica que CORS_ORIGINS en la API incluya http://localhost:4000.',
        )
      }
      throw new Error(translateApiError(message) || 'Request failed')
    }
    if (res.status === 204) return undefined as T
    return res.json()
  }

  login(email: string, password: string) {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  }

  mfaSetup() {
    return this.request<{ secret: string; otpauth_url: string }>('/auth/mfa/setup', {
      method: 'POST',
    })
  }

  mfaEnable(code: string) {
    return this.request<{ message: string }>('/auth/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  }

  mfaDisable(data: { password: string; code: string }) {
    return this.request<{ message: string }>('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  mfaVerify(mfaToken: string, code: string) {
    return this.request<{ access_token: string; refresh_token: string; expires_in: number }>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfa_token: mfaToken, code }),
    })
  }

  changePassword(data: { current_password: string; new_password: string }) {
    return this.request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  forgotPassword(email: string) {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  resetPassword(data: { email: string; pin: string; new_password: string }) {
    return this.request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  verifyEmail(token: string) {
    const q = new URLSearchParams({ token })
    return this.request<{ valid: boolean; email?: string; first_name?: string }>(`/auth/verify-email?${q}`)
  }

  setPasswordFromInvite(data: { token: string; new_password: string }) {
    return this.request<{ message: string }>('/auth/set-password-from-invite', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  resendVerification(email: string) {
    return this.request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  adminResendVerification(userId: string) {
    return this.request<{ message: string }>(`/users/${userId}/resend-verification`, {
      method: 'POST',
    })
  }

  adminResetUserPassword(userId: string) {
    return this.request<{ message: string }>(`/users/${userId}/reset-password`, {
      method: 'POST',
    })
  }

  register(data: { email: string; password: string; first_name: string; last_name: string; org_name: string }) {
    return this.request<{ access_token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  me() {
    return this.request<UserProfile>('/auth/me')
  }

  getHealth() {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return fetch(`${origin}/health`).then(async (res) => {
      if (!res.ok) throw new Error('API no disponible')
      return res.json() as Promise<{ status: string; service?: string }>
    })
  }

  getDashboard() {
    return this.request<DashboardData>('/dashboard')
  }

  getUF() {
    return this.request<UFIndicator>('/indicators/uf')
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

  getDividends(params?: { page?: number; status?: string; property_id?: string; bank_name?: string; month?: string; limit?: number }) {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.status) q.set('status', params.status)
    if (params?.property_id) q.set('property_id', params.property_id)
    if (params?.bank_name) q.set('bank_name', params.bank_name)
    if (params?.month) q.set('month', params.month)
    const qs = q.toString()
    return this.request<Paginated<DividendPayment>>(`/dividends${qs ? `?${qs}` : ''}`)
  }

  getDividendStats(month?: string) {
    const q = month ? `?month=${encodeURIComponent(month)}` : ''
    return this.request<DividendStats>(`/dividends/stats${q}`)
  }

  getDividendBanks(month?: string) {
    const q = month ? `?month=${encodeURIComponent(month)}` : ''
    return this.request<{ data: BankOption[]; month: string }>(`/dividends/banks${q}`)
  }

  createDividend(data: {
    property_id: string
    bank_id?: string
    bank_name?: string
    payment_bank?: string
    pac_enabled?: boolean
    amount: number
    currency?: string
    due_date: string
    notes?: string
  }) {
    return this.request<DividendPayment>('/dividends', { method: 'POST', body: JSON.stringify(data) })
  }

  updateDividend(id: string, data: {
    bank_id?: string
    bank_name?: string
    payment_bank?: string
    pac_enabled?: boolean
    amount?: number
    currency?: string
    due_date?: string
    notes?: string
  }) {
    return this.request<DividendPayment>(`/dividends/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  markDividendPaid(id: string) {
    return this.request<{ status: string }>(`/dividends/${id}/paid`, { method: 'PATCH' })
  }

  generatePendingDividends(month?: string, dryRun = false) {
    return this.request<{
      month: string
      created?: number
      would_create?: number
      skipped: number
      month_already_generated?: boolean
      dry_run?: boolean
      data?: DividendPayment[]
    }>('/dividends/generate-pending', {
      method: 'POST',
      body: JSON.stringify({ month: month || undefined, dry_run: dryRun }),
    })
  }

  getMortgages(page = 1, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<Mortgage>>(`/mortgages?${q}`)
  }

  createMortgage(data: MortgagePayload) {
    return this.request<Mortgage>('/mortgages', { method: 'POST', body: JSON.stringify(data) })
  }

  updateMortgage(id: string, data: Omit<MortgagePayload, 'property_id'>) {
    return this.request<Mortgage>(`/mortgages/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  deleteMortgage(id: string) {
    return this.request<void>(`/mortgages/${id}`, { method: 'DELETE' })
  }

  getContacts(page = 1, type?: string, limit = 200) {
    const q = new URLSearchParams({ page: String(page) })
    if (type) q.set('type', type)
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<CrmContact>>(`/crm/contacts?${q}`)
  }

  createContact(data: { type: string; name: string; email?: string; phone?: string }) {
    return this.request<CrmContact>('/crm/contacts', { method: 'POST', body: JSON.stringify(data) })
  }

  updateContact(id: string, data: { type: string; name: string; email?: string; phone?: string }) {
    return this.request<CrmContact>(`/crm/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  deleteContact(id: string) {
    return this.request<void>(`/crm/contacts/${id}`, { method: 'DELETE' })
  }

  getMaintenance(page = 1, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<Maintenance>>(`/maintenance?${q}`)
  }

  createMaintenance(data: { property_id: string; title: string; type?: string; scheduled_date: string; cost?: number; notes?: string }) {
    return this.request<Maintenance>('/maintenance', { method: 'POST', body: JSON.stringify(data) })
  }

  updateMaintenance(id: string, data: {
    property_id: string
    title: string
    type: string
    scheduled_date: string
    cost?: number
    status: string
    notes?: string
  }) {
    return this.request<Maintenance>(`/maintenance/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  deleteMaintenance(id: string) {
    return this.request<void>(`/maintenance/${id}`, { method: 'DELETE' })
  }

  notifyMaintenance(id: string) {
    return this.request<MaintenanceNotifyResponse>(`/maintenance/${id}/notify`, { method: 'POST', body: JSON.stringify({}) })
  }

  notifyMaintenanceBulk(maintenanceIds?: string[]) {
    return this.request<MaintenanceNotifyResponse>('/maintenance/notify', {
      method: 'POST',
      body: JSON.stringify({ maintenance_ids: maintenanceIds ?? [] }),
    })
  }

  getTickets(page = 1, status?: string, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (status) q.set('status', status)
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<Ticket>>(`/tickets?${q}`)
  }

  createTicket(data: { property_id: string; title: string; description?: string; priority?: string }) {
    return this.request<Ticket>('/tickets', { method: 'POST', body: JSON.stringify(data) })
  }

  getDocuments(page = 1, opts?: { category?: string; entity_type?: string; entity_id?: string; lease_id?: string; limit?: number; omit_file_data?: boolean }) {
    const q = new URLSearchParams({ page: String(page) })
    if (opts?.category) q.set('category', opts.category)
    if (opts?.entity_type) q.set('entity_type', opts.entity_type)
    if (opts?.entity_id) q.set('entity_id', opts.entity_id)
    if (opts?.lease_id) q.set('lease_id', opts.lease_id)
    if (opts?.limit) q.set('limit', String(opts.limit))
    if (opts?.omit_file_data) q.set('omit_file_data', '1')
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

  async fetchDocumentFile(id: string): Promise<Blob> {
    const headers: Record<string, string> = {}
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`

    let res: Response
    try {
      res = await fetch(`${API_BASE}/documents/${id}/file`, { headers })
    } catch {
      throw new Error('No se pudo conectar con la API. Verifica que el backend esté corriendo.')
    }
    if (!res.ok) {
      let message = res.statusText
      try {
        const err = await res.json()
        if (typeof err?.error === 'string' && err.error) message = err.error
      } catch {
        if (res.status === 413) {
          message = 'El archivo supera el tamaño máximo permitido.'
        }
      }
      throw new Error(message || 'No se pudo descargar el archivo')
    }
    return res.blob()
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

  getReminders(page = 1, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<Reminder>>(`/reminders?${q}`)
  }

  getNotifications(params?: {
    page?: number
    limit?: number
    status?: string
    type?: string
    tenant_id?: string
    from_date?: string
    to_date?: string
  }) {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
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

  getEmailRecipients(page = 1, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<EmailRecipient>>(`/email-recipients?${q}`)
  }

  getEmailNotificationTypes() {
    return this.request<{ data: EmailNotificationType[] }>('/email-recipients/types')
  }

  getSMTPStatus() {
    return this.request<{ configured: boolean }>('/email-recipients/smtp-status')
  }

  getSystemHealth() {
    return this.request<SystemHealth>('/system/health')
  }

  getSystemMetrics() {
    return this.request<SystemMetrics>('/system/metrics')
  }

  getSystemLogs(params?: {
    level?: string
    q?: string
    from_date?: string
    to_date?: string
    page?: number
    limit?: number
  }) {
    const q = new URLSearchParams()
    if (params?.level) q.set('level', params.level)
    if (params?.q) q.set('q', params.q)
    if (params?.from_date) q.set('from_date', params.from_date)
    if (params?.to_date) q.set('to_date', params.to_date)
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return this.request<Paginated<SystemLogEntry>>(`/system/logs${qs ? `?${qs}` : ''}`)
  }

  createEmailRecipient(data: {
    email?: string
    name?: string
    label?: string
    property_id?: string
    enabled?: boolean
    notification_types: string[]
  }) {
    return this.request<EmailRecipient>('/email-recipients', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  updateEmailRecipient(id: string, data: {
    email?: string
    name?: string
    label?: string
    property_id?: string
    enabled?: boolean
    notification_types?: string[]
  }) {
    return this.request<EmailRecipient>(`/email-recipients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  deleteEmailRecipient(id: string) {
    return this.request<void>(`/email-recipients/${id}`, { method: 'DELETE' })
  }

  syncEmailRecipientsFromLeases() {
    return this.request<SyncEmailRecipientsFromLeasesResponse>('/email-recipients/sync-from-leases', {
      method: 'POST',
    })
  }

  getTeamUsers(page = 1, limit?: number) {
    const q = new URLSearchParams({ page: String(page) })
    if (limit) q.set('limit', String(limit))
    return this.request<Paginated<TeamMember>>(`/users?${q}`)
  }

  createTeamUser(data: {
    email: string
    password: string
    first_name: string
    last_name: string
    role?: string
  }) {
    return this.request<TeamMember>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  updateTeamUser(id: string, data: {
    first_name?: string
    last_name?: string
    role?: string
    active?: boolean
    password?: string
  }) {
    return this.request<TeamMember>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  deleteTeamUser(id: string) {
    return this.request<void>(`/users/${id}`, { method: 'DELETE' })
  }

  sendTestEmail(data: { recipient_id?: string; email?: string; all_formats?: boolean }) {
    return this.request<EmailSendResponse>('/notifications/email/test', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  sendEmailNotifications(data?: { notification_id?: string }) {
    return this.request<EmailSendResponse>('/notifications/email/send', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    })
  }

  sendNotification(id: string) {
    return this.request<EmailSendResponse>(`/notifications/${id}/send`, { method: 'POST' })
  }

  getEmailAutomationSettings() {
    return this.request<EmailAutomationSettings>('/email-recipients/automation-settings')
  }

  updateEmailAutomationSettings(rules: Array<{ id: string; enabled: boolean }>) {
    return this.request<EmailAutomationSettings>('/email-recipients/automation-settings', {
      method: 'PATCH',
      body: JSON.stringify({ rules }),
    })
  }

  runEmailScheduler() {
    return this.request<{ message: string; result: EmailSchedulerResult }>('/notifications/email/run-scheduler', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }
}

export interface DashboardData {
  total_properties: number
  rentable_properties: number
  rented_properties: number
  occupancy_rate: number
  monthly_income: number
  monthly_expenses: number
  monthly_expenses_uf?: number
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
  total_original_loan_uf: number
  total_monthly_mortgage_uf: number
  dividend_month: string
  total_dividend_paid_uf: number
  total_dividend_pending_uf: number
  total_dividend_paid_count: number
  total_dividend_pending_count: number
  dividends_by_bank: BankDividendTotal[]
  properties_by_type: Array<{ type: string; count: number }>
  upcoming_expirations: Array<{ id: string; type: string; title: string; expires_at: string; days_left: number }>
  profitability: Array<{ property_id: string; property_name: string; income: number; expenses: number; expenses_uf?: number; profit: number; roi: number }>
}

export interface UFIndicator {
  value: number
  date: string
  source: string
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
  commercial_value_uf?: number
  debt_uf?: number
  original_loan_uf?: number
  monthly_mortgage_uf?: number
  loan_term_years?: number
  installments_paid?: number
  interest_rate?: number
  bank_name?: string
  credit_number?: string
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
  fire_insurance_company?: string
  fire_insurance_amount_uf?: number
  fire_insurance_policy_number?: string
  earthquake_insurance_company?: string
  earthquake_insurance_amount_uf?: number
  earthquake_insurance_policy_number?: string
  desgravamen_insurance_company?: string
  desgravamen_insurance_amount_uf?: number
  desgravamen_insurance_policy_number?: string
  photos?: PropertyPhoto[]
}

export interface UtilityAccount {
  company?: string
  client_code?: string
}

export interface InsurancePolicy {
  company?: string
  amount_uf?: number
  policy_number?: string
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
  insurance?: {
    fire?: InsurancePolicy
    earthquake?: InsurancePolicy
    desgravamen?: InsurancePolicy
  }
  address: { street: string; commune: string; city: string; region?: string; property_rol?: string }
  deed?: { fojas?: string }
  financials: {
    expected_rent?: { amount: number; currency: string }
    value_uf?: number
    commercial_value_uf?: number
    debt_uf?: number
    original_loan_uf?: number
    monthly_mortgage_uf?: number
    loan_term_years?: number
    installments_paid?: number
    interest_rate?: number
    bank_name?: string
    credit_number?: string
    payment_start_date?: string
    pac_enabled?: boolean
    payment_bank?: string
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
  auto_renew?: boolean
  renewal_period_months?: number
  renewal_count?: number
  last_renewed_at?: string
}

export interface Payment {
  id: string
  property_id?: string
  lease_id?: string
  tenant_id?: string
  bank_id?: string
  bank_name?: string
  pac_enabled?: boolean
  payment_bank?: string
  type: string
  status: string
  amount: { amount: number; currency: string }
  due_date: string
  paid_date?: string
  notes?: string
}

export interface DividendPayment extends Payment {
  type: 'dividend'
}

export interface DividendStats {
  month: string
  total_paid_uf: number
  total_pending_uf: number
  total_paid_count: number
  total_pending_count: number
  total_monthly_mortgage_uf?: number
  mortgage_property_count?: number
  by_bank: BankDividendTotal[]
}

export interface BankOption {
  bank_name: string
  bank_id?: string
}

export interface BankDividendTotal {
  bank_name: string
  bank_id?: string
  pending_uf: number
  paid_uf: number
  property_count: number
}

export interface MortgagePayload {
  property_id?: string
  original_loan_uf?: number
  commercial_value_uf?: number
  debt_uf?: number
  monthly_mortgage_uf?: number
  loan_term_years?: number
  installments_paid?: number
  interest_rate?: number
  bank_name?: string
  credit_number?: string
  payment_start_date?: string
  pac_enabled?: boolean
  payment_bank?: string
}

export interface Mortgage {
  id: string
  property_id: string
  property_name: string
  bank_name?: string
  bank_id?: string
  original_loan_uf?: number
  commercial_value_uf?: number
  commercial_value?: { amount: number; currency?: string }
  debt_uf?: number
  monthly_mortgage_uf?: number
  loan_term_years?: number
  installments_paid?: number
  interest_rate?: number
  credit_number?: string
  payment_bank?: string
  pac_enabled?: boolean
  payment_start_date?: string
  loan_amount: { amount: number }
  monthly_payment: { amount: number }
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

export interface UserOrg {
  organization_id: string
  role: string
}

export interface UserProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  avatar_url?: string
  active: boolean
  mfa_enabled: boolean
  organizations: UserOrg[]
  preferences?: { theme?: string; locale?: string }
  current_org_id?: string
  current_role?: string
  current_org_name?: string
}

export interface TeamMember {
  id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  active: boolean
  email_verified: boolean
  role: string
}

export interface Maintenance {
  id: string
  property_id: string
  type: string
  status: string
  title: string
  description?: string
  scheduled_date: string
  completed_date?: string
  technician_id?: string
  cost: { amount: number; currency?: string }
  recurrence_days?: number
  next_due_date?: string
}

export interface Ticket {
  id: string
  property_id: string
  lease_id?: string
  title: string
  description: string
  priority: string
  status: string
  reported_by?: string
  assigned_to?: string
  resolved_at?: string
  comments?: Array<{ id: string; user_id: string; content: string; created_at: string }>
}

export interface Document {
  id: string
  title: string
  category: string
  file_name: string
  file_data?: string
  storage_path?: string
  mime_type?: string
  size_bytes?: number
  entity_type: string
  entity_id: string
  version: number
  active: boolean
  expires_at?: string
  uploaded_by?: string
  tags?: string[]
  created_at?: string
  updated_at?: string
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
  message?: string
  channel: string
  recipient: string
  entity_type?: string
  entity_id?: string
  scheduled_at: string
  status: string
  sent_at?: string
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

export interface EmailRecipient {
  id: string
  organization_id: string
  email: string
  name: string
  label?: string
  property_id?: string
  tenant_id?: string
  enabled: boolean
  notification_types: string[]
  created_at: string
  updated_at: string
}

export interface EmailNotificationType {
  id: string
  label: string
}

export interface SyncEmailRecipientsFromLeasesResult {
  created: number
  updated?: number
  skipped_no_email: number
  already_exists: number
  skipped: number
}

export interface SyncEmailRecipientsFromLeasesResponse {
  message?: string
  result: SyncEmailRecipientsFromLeasesResult
}

export interface EmailSendResponse {
  message?: string
  configured?: boolean
  result?: {
    sent_count: number
    failed_count: number
    recipients?: string[]
    errors?: string[]
  }
  error?: string
}

export interface EmailAutomationRule {
  id: string
  type: string
  label: string
  days_offset: number
  enabled: boolean
}

export interface EmailAutomationSettings {
  id: string
  organization_id: string
  rules: EmailAutomationRule[]
  last_run_at?: string
  last_run_summary?: string
}

export interface EmailSchedulerDetail {
  action: 'created' | 'sent' | 'skipped' | 'failed'
  type: string
  payment_id?: string
  maintenance_id?: string
  maintenance_title?: string
  tenant_name?: string
  property_name?: string
  message?: string
}

export interface EmailSchedulerResult {
  checked_payments: number
  checked_maintenance: number
  checked_leases?: number
  created: number
  sent: number
  skipped: number
  failed: number
  errors?: string[]
  details?: EmailSchedulerDetail[]
}

export interface MaintenanceNotifyResponse {
  message?: string
  result?: {
    created: number
    sent: number
    skipped: number
    failed: number
    errors?: string[]
    details?: EmailSchedulerDetail[]
  }
  error?: string
}

export interface SystemComponentHealth {
  status: string
  message?: string
  detail?: string
}

export interface SystemHealth {
  status: string
  service?: string
  env?: string
  version?: string
  uptime_seconds?: number
  uptime_human?: string
  started_at?: string
  security?: {
    metrics_protected?: boolean
    mongodb_without_auth?: boolean
  }
  components?: {
    api?: SystemComponentHealth
    mongodb?: SystemComponentHealth
    storage?: SystemComponentHealth
  }
}

export interface SystemMetrics {
  uptime_seconds?: number
  uptime_human?: string
  memory?: {
    alloc_mb?: number
    sys_mb?: number
    heap_inuse_mb?: number
    num_goroutines?: number
  }
  counts?: {
    users?: number
    properties?: number
    leases?: number
    active_leases?: number
    pending_payments?: number
    documents?: number
    tenants?: number
  }
}

export interface SystemLogEntry {
  id: string
  level: string
  category: string
  message: string
  timestamp: string
  fields?: Record<string, unknown>
}

export const api = new ApiClient()
