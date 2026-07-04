export const dashboardMetricHelp = {
  totalProperties:
    'Cuenta todas las propiedades registradas en tu organización, sin filtrar por tipo ni estado.',
  occupancy:
    'Porcentaje = (propiedades arrendadas ÷ divisor) × 100. Arrendadas: cada propiedad con al menos un contrato en estado Activo. Divisor: propiedades con destino Para arrendar; si no hay arrendables, se usa el total de propiedades.',
  overdue:
    'Cantidad de pagos con estado Vencido, o estado Pendiente cuya fecha de vencimiento ya pasó. Incluye cualquier tipo de pago (Arriendo, Gasto, Dividendo hipotecario, etc.).',
  pendingPayments:
    'Cantidad de arriendos del mes actual sin cobrar. Por cada contrato Activo sin pago de Arriendo del mes se suma 1 y su monto (el pago pendiente registrado o el Arriendo mensual del contrato). El subtítulo muestra el total en pesos de arriendo pendiente.',
  cashFlow:
    'Flujo neto del mes = ingresos − gastos. Ingresos: pagos en estado Pagado con fecha de pago en el mes actual, de tipo Arriendo o Depósito. Gastos: demás tipos pagados en el mismo período (Gasto, Gasto común, Impuesto, Dividendo hipotecario, etc.).',
  portfolioTotals:
    'Resumen financiero de todas tus propiedades. Los montos en UF se muestran también en pesos usando el valor UF del día.',
  activeLeases:
    'Número de contratos de arriendo con estado Activo.',
  totalMonthlyRent:
    'Suma del Arriendo mensual (CLP) de todos los contratos en estado Activo. Representa el ingreso mensual esperado por arriendos vigentes.',
  totalValueUF:
    'Suma del campo Valor en UF de todas las propiedades. El equivalente en pesos usa el valor UF del día.',
  totalDebtUF:
    'Suma del campo Deuda UF a la fecha de todas las propiedades (saldo hipotecario actual).',
  totalOriginalLoanUF:
    'Suma del Monto original del crédito (UF) de todas las propiedades.',
  totalMortgageUF:
    'Suma del Dividendo mensual (UF) configurado en cada propiedad.',
  ufIndicator:
    'Valor de la UF al día, obtenido desde mindicador.cl. Solo se usa para mostrar el equivalente aproximado en pesos; los totales del portafolio se guardan en UF.',
  propertiesByType:
    'Agrupa todas las propiedades por Tipo (Casa, Departamento, Bodega, etc.) y muestra cuántas hay de cada una, ordenadas de mayor a menor.',
  cashFlowChart:
    'Gráfico del mes actual: barra de ingresos (Arriendo y Depósito pagados), barra de gastos (otros tipos pagados) y barra neta (ingresos − gastos). Misma lógica que la tarjeta Flujo de caja.',
  rentPaidVsPending:
    'Mes calendario actual. Pagado: pagos de Arriendo en estado Pagado, cobrados o con vencimiento en el mes. Pendiente: contratos Activos sin pago de arriendo del mes; usa el monto del pago pendiente o el Arriendo mensual del contrato.',
  dividendsPaidVsPending:
    'Mes calendario actual. Dividendos hipotecarios con vencimiento en el mes. Pagado: estado Pagado. Pendiente: estado Pendiente o Vencido. Montos en UF.',
  occupancyChart:
    'Distribución de propiedades con destino Para arrendar. Arrendadas: con contrato Activo. Disponibles: sin contrato Activo.',
  pendingPaymentsList:
    'Lista de hasta 10 arriendos del mes sin cobrar, ordenados por vencimiento. El total al pie suma todos los pendientes del mes, no solo los mostrados aquí.',
  expirations:
    'Próximos 5 contratos en estado Activo con fecha de Fin definida y futura, ordenados por término del contrato. Muestra los días restantes hasta el vencimiento.',
} as const

export type DashboardMetricHelpKey = keyof typeof dashboardMetricHelp
