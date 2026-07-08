import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, Mail, Pencil, Plus, Power, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormDialog, FormField, FormSelect } from '@/components/ui/form-dialog'
import { PasswordInput } from '@/components/PasswordInput'
import { Input } from '@/components/ui/input'
import { PinConfirmDialog } from '@/components/ui/pin-confirm-dialog'
import { EmptyState, LoadingSkeleton, StatusBadge } from '@/components/ui/page'
import { api, type TeamMember } from '@/lib/api'
import { assignableRoles, canManageUsers, ROLE_LABELS, type UserRole } from '@/lib/roles'
import { cn } from '@/lib/utils'

const defaultForm = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'viewer' as UserRole,
}

function memberName(m: TeamMember): string {
  return `${m.first_name} ${m.last_name}`.trim() || m.email
}

interface TeamUsersSectionProps {
  currentUserId?: string
  currentRole: string
}

export function TeamUsersSection({ currentUserId, currentRole }: TeamUsersSectionProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null)
  const [confirmResend, setConfirmResend] = useState(false)
  const [resendTarget, setResendTarget] = useState<TeamMember | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const roleOptions = useMemo(() => assignableRoles(currentRole), [currentRole])

  const { data, isLoading } = useQuery({
    queryKey: ['team-users'],
    queryFn: () => api.getTeamUsers(1, 100),
    enabled: canManageUsers(currentRole),
  })

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const payload: Parameters<typeof api.updateTeamUser>[1] = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          role: form.role,
        }
        if (form.password.trim()) payload.password = form.password
        return api.updateTeamUser(editing.id, payload)
      }
      return api.createTeamUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-users'] })
      setOpen(false)
      setEditing(null)
      setForm(defaultForm)
      setFeedback(editing ? t('teamUsers.updated') : t('teamUsers.createdWithEmail'))
      setTimeout(() => setFeedback(null), 4000)
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const toggleActive = useMutation({
    mutationFn: (member: TeamMember) =>
      api.updateTeamUser(member.id, { active: !member.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-users'] }),
    onError: (err: Error) => setFeedback(err.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTeamUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-users'] })
      setConfirmDelete(false)
      setDeleteTarget(null)
      setFeedback('Usuario eliminado del equipo.')
      setTimeout(() => setFeedback(null), 4000)
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const resetPassword = useMutation({
    mutationFn: (id: string) => api.adminResetUserPassword(id),
    onSuccess: () => {
      setConfirmReset(false)
      setResetTarget(null)
      setFeedback(t('auth.adminResetSuccess'))
      setTimeout(() => setFeedback(null), 4000)
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const resendVerification = useMutation({
    mutationFn: (id: string) => api.adminResendVerification(id),
    onSuccess: () => {
      setConfirmResend(false)
      setResendTarget(null)
      setFeedback(t('teamUsers.resendSuccess'))
      setTimeout(() => setFeedback(null), 4000)
    },
    onError: (err: Error) => setFeedback(err.message),
  })

  const openCreate = () => {
    setEditing(null)
    setForm({ ...defaultForm, role: roleOptions.includes('viewer') ? 'viewer' : roleOptions[0] })
    setOpen(true)
  }

  const openEdit = (member: TeamMember) => {
    setEditing(member)
    setForm({
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email,
      password: '',
      role: (roleOptions.includes(member.role as UserRole) ? member.role : roleOptions[0]) as UserRole,
    })
    setOpen(true)
  }

  if (!canManageUsers(currentRole)) return null

  const members = data?.data ?? []

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuarios del equipo
            </CardTitle>
            <CardDescription>
              Invita personas a tu organización y asigna roles de acceso.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo usuario
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback && (
            <p className={cn('text-sm', feedback.includes('correctamente') || feedback.includes('actualizado') || feedback.includes('eliminado') || feedback.includes('envió') || feedback.includes('PIN')
              ? 'text-green-600 dark:text-green-400'
              : 'text-destructive')}>
              {feedback}
            </p>
          )}
          {isLoading ? (
            <LoadingSkeleton />
          ) : members.length === 0 ? (
            <EmptyState message="Aún no hay otros usuarios en el equipo. Crea el primero con el botón «Nuevo usuario»." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">Correo</th>
                    <th className="px-3 py-2 font-medium">Rol</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.id === currentUserId
                    return (
                      <tr key={member.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">
                          {memberName(member)}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{member.email}</td>
                        <td className="px-3 py-2">
                          <StatusBadge
                            status={member.role}
                            label={ROLE_LABELS[member.role] ?? member.role}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {member.active ? (
                            member.email_verified ? (
                              <StatusBadge status="active" label={t('teamUsers.statusActive')} />
                            ) : (
                              <StatusBadge status="pending" label={t('teamUsers.statusPendingVerification')} />
                            )
                          ) : (
                            <StatusBadge status="pending" label={t('teamUsers.statusInactive')} />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {!isSelf && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Editar"
                                  onClick={() => openEdit(member)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title={member.active ? 'Desactivar' : 'Activar'}
                                  onClick={() => toggleActive.mutate(member)}
                                  disabled={toggleActive.isPending}
                                >
                                  <Power className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title={t('auth.adminResetPassword')}
                                  onClick={() => {
                                    setResetTarget(member)
                                    setConfirmReset(true)
                                  }}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                {!member.email_verified && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title={t('teamUsers.resendVerification')}
                                    onClick={() => {
                                      setResendTarget(member)
                                      setConfirmResend(true)
                                    }}
                                  >
                                    <Mail className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Eliminar del equipo"
                                  onClick={() => {
                                    setDeleteTarget(member)
                                    setConfirmDelete(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={open}
        onClose={() => {
          setOpen(false)
          setEditing(null)
          setForm(defaultForm)
        }}
        title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        loading={save.isPending}
        submitLabel={editing ? 'Guardar cambios' : 'Crear usuario'}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre">
            <Input
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
              required
            />
          </FormField>
          <FormField label="Apellido">
            <Input
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
              required
            />
          </FormField>
        </div>
        {!editing && (
          <FormField label="Correo electrónico">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}>
          <PasswordInput
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required={!editing}
            minLength={8}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="Rol">
          <FormSelect
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </FormSelect>
        </FormField>
      </FormDialog>

      <PinConfirmDialog
        open={confirmResend}
        onClose={() => {
          setConfirmResend(false)
          setResendTarget(null)
        }}
        title={t('teamUsers.resendVerification')}
        message={
          resendTarget
            ? t('teamUsers.resendConfirm', { name: memberName(resendTarget) })
            : ''
        }
        confirmLabel={t('teamUsers.resendAction')}
        onConfirm={() => resendTarget && resendVerification.mutate(resendTarget.id)}
        loading={resendVerification.isPending}
      />

      <PinConfirmDialog
        open={confirmReset}
        onClose={() => {
          setConfirmReset(false)
          setResetTarget(null)
        }}
        title={t('auth.adminResetPassword')}
        message={
          resetTarget
            ? t('auth.adminResetConfirm', { name: memberName(resetTarget) })
            : ''
        }
        confirmLabel={t('auth.sendPin')}
        onConfirm={() => resetTarget && resetPassword.mutate(resetTarget.id)}
        loading={resetPassword.isPending}
      />

      <PinConfirmDialog
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false)
          setDeleteTarget(null)
        }}
        title="Eliminar usuario del equipo"
        message={
          deleteTarget
            ? `¿Quitar a ${memberName(deleteTarget)} de la organización? Perderá acceso inmediato.`
            : ''
        }
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        loading={remove.isPending}
      />
    </>
  )
}
