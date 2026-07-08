import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FormSelect } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import {
  isKnownBankName,
  PAYMENT_BANK_OTHER,
  type BankOption,
} from '@/lib/payment-banks'
import { filledControlClass } from '@/lib/utils'

type PaymentBankSelectProps = {
  value: string
  onChange: (value: string) => void
  options: BankOption[]
  placeholder?: string
}

export function PaymentBankSelect({ value, onChange, options, placeholder }: PaymentBankSelectProps) {
  const { t } = useTranslation()
  const isCustomValue = value.trim() !== '' && !isKnownBankName(value, options)
  const [otherMode, setOtherMode] = useState(isCustomValue)

  useEffect(() => {
    if (isCustomValue) setOtherMode(true)
  }, [isCustomValue])

  const selectValue = otherMode
    ? PAYMENT_BANK_OTHER
    : (value.trim() && isKnownBankName(value, options) ? value.trim() : '')

  return (
    <div className="space-y-2">
      <FormSelect
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value
          if (next === PAYMENT_BANK_OTHER) {
            setOtherMode(true)
            onChange(isCustomValue ? value : '')
          } else if (next === '') {
            setOtherMode(false)
            onChange('')
          } else {
            setOtherMode(false)
            onChange(next)
          }
        }}
        className={filledControlClass(selectValue !== '' || (otherMode && value.trim() !== ''))}
      >
        <option value="">—</option>
        {options.map((b) => (
          <option key={b.name} value={b.name}>{b.name}</option>
        ))}
        <option value={PAYMENT_BANK_OTHER}>{t('dividends.paymentBankOther')}</option>
      </FormSelect>
      {otherMode && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('dividends.paymentBankCustomPlaceholder')}
          className={filledControlClass(value.trim() !== '')}
        />
      )}
    </div>
  )
}
