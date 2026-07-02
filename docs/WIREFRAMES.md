# Wireframes — MyRent Go

Diseño inspirado en Linear / Notion / Vercel. Responsive: desktop, tablet, móvil.

## Layout general

```
┌─────────────────────────────────────────────────────────────┐
│ [≡] MyRent Go          Administración de propiedades  [🌙] │
├──────────┬──────────────────────────────────────────────────┤
│ Dashboard│  CONTENIDO PRINCIPAL                            │
│ Propied. │                                                  │
│ Arriendos│                                                  │
│ Arrendat.│                                                  │
│ Pagos    │                                                  │
│ Finanzas │                                                  │
│ Docs     │                                                  │
│ Calendar │                                                  │
│ CRM      │                                                  │
│ Mantenc. │                                                  │
│ Tickets  │                                                  │
│ Config   │                                                  │
│          │                                                  │
│ user@... │                                                  │
│ [Logout] │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

Móvil: sidebar colapsable con overlay.

---

## Login

```
┌─────────────────────────┐
│      MyRent Go          │
│   Iniciar sesión        │
│                         │
│  Correo    [________]   │
│  Password  [________]   │
│                         │
│  [    Iniciar sesión  ] │
└─────────────────────────┘
```

---

## Dashboard

```
┌──────────┬──────────┬──────────┬──────────┐
│ Props: 12│ Ocup 83% │ Morosos 2│ Caja $X  │
└──────────┴──────────┴──────────┴──────────┘

┌─────────────────────┐ ┌─────────────────────┐
│  Flujo de caja      │ │  Ocupación (pie)    │
│  [Bar chart]        │ │  [Pie chart]        │
└─────────────────────┘ └─────────────────────┘

┌─────────────────────────────────────────────┐
│  Próximos vencimientos                      │
│  • Contrato Depto 401 — 15 días             │
│  • Dividendo Casa LR — 8 días               │
└─────────────────────────────────────────────┘
```

---

## Propiedades (lista)

```
┌─────────────────────────────────────────────┐
│ Propiedades                    12 total     │
├─────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐           │
│ │ Depto Prov. │ │ Casa Reina  │  ...       │
│ │ [arrendada] │ │ [arrendada] │           │
│ │ Providencia │ │ La Reina    │           │
│ │ $450.000/mes│ │ $850.000/mes│           │
│ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────┘
```

---

## Propiedad (detalle)

```
┌─────────────────────────────────────────────┐
│ ← Depto Providencia 401        [Editar]     │
├─────────────────────────────────────────────┤
│ [Foto principal]  │ Tipo: Departamento      │
│ [Galería thumbs]  │ Estado: Arrendada       │
│                   │ Dirección: Av. Prov...  │
├───────────────────┴─────────────────────────┤
│ [General] [Finanzas] [Arriendos] [Docs]     │
│                                             │
│  Valor compra: $85.000.000                  │
│  Valor comercial: $95.000.000               │
│  Arriendo: $450.000/mes                     │
│  ROI: 5.2%                                  │
└─────────────────────────────────────────────┘
```

---

## Arriendos

```
┌─────────────────────────────────────────────┐
│ Arriendos              [+ Nuevo contrato]   │
├──────┬──────────┬──────────┬────────┬───────┤
│ Prop │ Arrendat.│ Inicio   │ Fin    │ Renta │
├──────┼──────────┼──────────┼────────┼───────┤
│ 401  │ M.González│ 01/2024 │12/2025 │450k  │
└──────┴──────────┴──────────┴────────┴───────┘
```

---

## Finanzas / Flujo de caja

```
┌─────────────────────────────────────────────┐
│ Flujo de caja — Marzo 2026                  │
├─────────────────────────────────────────────┤
│ Ingresos:  $1.380.000    ████████████       │
│ Gastos:    $  520.000    ████               │
│ Neto:      $  860.000                       │
├─────────────────────────────────────────────┤
│ Rentabilidad por propiedad                  │
│ Depto 401    +$320.000   ROI 4.8%           │
│ Casa Reina   +$540.000   ROI 6.1%           │
└─────────────────────────────────────────────┘
```

---

## Calendario de vencimientos

```
┌─────────────────────────────────────────────┐
│     < Marzo 2026 >                          │
│ Lu Ma Mi Ju Vi Sa Do                        │
│                 1  2                        │
│  3  4  5 [6] 7  8  9   ← Dividendo          │
│ 10 11 12 13 14 15 16   ← Contrato vence     │
│ ...                                         │
├─────────────────────────────────────────────┤
│ 15 Mar: Vence contrato Depto 401            │
│ 20 Mar: Dividendo hipoteca Casa Reina       │
└─────────────────────────────────────────────┘
```

---

## CRM

```
┌─────────────────────────────────────────────┐
│ CRM    [Inmobiliarias] [Bancos] [Técnicos]  │
├─────────────────────────────────────────────┤
│ + Agregar contacto                          │
│ ┌─────────────────────────────────────────┐ │
│ │ Inmobiliaria XYZ — comisión 2%          │ │
│ │ contacto@xyz.cl                         │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## Configuración / Multiempresa

```
┌─────────────────────────────────────────────┐
│ Organización activa: [Demo Inmobiliaria ▼]  │
├─────────────────────────────────────────────┤
│ Usuarios y permisos                         │
│ ┌──────────┬──────────┬─────────┐           │
│ │ Usuario  │ Rol      │ MFA     │           │
│ │ demo@... │ Owner    │ Off     │           │
│ └──────────┴──────────┴─────────┘           │
│                                             │
│ Tema: ( ) Claro (•) Oscuro ( ) Sistema      │
│ Idioma: [Español ▼]                         │
└─────────────────────────────────────────────┘
```
