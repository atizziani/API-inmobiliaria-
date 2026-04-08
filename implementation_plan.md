# Plan de Integración: Sistema Unificado Coldwell Banker

## Contexto y Diagnóstico

Tenés **5 proyectos** en el repositorio (no 3). El objetivo es entender qué hace cada uno y cómo unificarlos en un solo sistema coherente.

---

## Los 5 Proyectos Actuales

| Proyecto | Stack | Rol | DB / Auth |
|----------|-------|-----|-----------|
| `coldwell-banker-api` | Node.js + Express + TypeScript + Prisma | API REST — gestión documental, expedientes, mandatos | SQLite/PostgreSQL (Prisma) · JWT |
| `coldwell-banker-web` | React + Vite + TypeScript | Frontend web — expedientes, documentos, actividades, mandatos | Consume la API de arriba |
| `coldwell-banker-mobile` | React Native + Expo | App móvil — mismas funciones que la web (propiedades, mandatos) | Consume la API de arriba |
| `BotOrbe` | Python + FastAPI + Next.js + Telegram | Bot de IA para asesores (CRM, agenda, reservas, KPIs, etc.) | Supabase (PostgreSQL) |
| `lead_sniper` | Python + FastAPI + PostgreSQL | Scraping de Instagram para captura de leads | PostgreSQL propio (Render/Neon) |

---

## Análisis de Superposición y Conflictos

### ⚠️ Problema 1 — Dos backends, dos bases de datos, dos modelos de usuario
- `coldwell-banker-api` tiene su propio modelo de **usuarios** en Prisma (roles: ASESOR / REVISOR / ADMIN) con JWT y bcrypt.
- `BotOrbe` tiene su propio modelo de **agentes** en Supabase (vinculados por email y Telegram chat_id).
- Son entidades **distintas** que representan lo mismo: el asesor.

### ⚠️ Problema 2 — Funcionalidades duplicadas
- `coldwell-banker-api` gestiona expedientes, documentos y mandatos.
- `BotOrbe` gestiona documentos (M5), mandatos (M8) y propiedades (M13) a través de Tokko.
- Ambos tienen concepto de "propiedad" pero con modelos distintos.

### ⚠️ Problema 3 — Lead Sniper fuera de scope
- El propio `FUNCIONALIDADES.md` de BotOrbe dice explícitamente: *"No integra Lead Sniper — diferido"*.
- Tiene su propia DB en Render/Neon, completamente separada.

### ✅ Lo que sí es sinérgico
- `BotOrbe` ya es el cerebro del sistema: Telegram + web Next.js + Supabase.
- `coldwell-banker-api` aporta flujo de **revisión documental** (PENDIENTE → APROBADO/RECHAZADO) que BotOrbe no tiene.
- `coldwell-banker-mobile` es el acceso móvil a la misma API.
- `lead_sniper` puede integrarse como módulo de captación que envía leads al CRM de BotOrbe.

---

## Propuesta de Integración en 3 Fases

### 🏗️ FASE 1 — Definir BotOrbe como sistema central (sin tocar código aún)

**Decisión de arquitectura:**

```
┌─────────────────────────────────────────────────────┐
│                   SISTEMA ORBE                      │
│                                                     │
│  Telegram Bot ←→ FastAPI (Python) ←→ Supabase DB   │
│                        ↑                            │
│              Web App (Next.js)                      │
│              App Móvil (React Native/Expo)          │
│              Lead Sniper (como módulo interno)      │
└─────────────────────────────────────────────────────┘
```

BotOrbe es la **plataforma central**. Los otros proyectos se integran como extensiones.

---

### 📋 FASE 2 — Migrar funcionalidades únicas de `coldwell-banker-api` a BotOrbe

Hay 3 funcionalidades en `coldwell-banker-api` que **no existen** en BotOrbe:

#### 2.1 — Flujo de Revisión Documental con roles (ASESOR/REVISOR/ADMIN)
- En `coldwell-banker-api`: expediente puede estar `EN_PREPARACION → PENDIENTE → APROBADO/RECHAZADO`
- BotOrbe tiene M5 (revisión documental con IA) pero no tiene este flujo de aprobación humana multi-rol
- **Acción**: Migrar este flujo como **M_Expedientes** en BotOrbe (nuevas tablas en Supabase + endpoints en main.py)

#### 2.2 — Historial de cambios de expedientes
- `coldwell-banker-api` tiene modelo `HistorialCambio` con auditoría completa
- **Acción**: Trasladar como tabla `expediente_history` en Supabase

#### 2.3 — Actividades semanales y objetivos anuales
- Existe en `coldwell-banker-api` (modelo `ActividadSemanal` + `ObjetivoConfiguracion`)
- BotOrbe tiene M10 (KPIs) pero sin el desglose semanal con objetivos por tipo de actividad
- **Acción**: Evaluar si M10 ya cubre esto o si hay que migrar la lógica adicional

---

### 📱 FASE 3 — Unificar frontends

#### 3.1 — `coldwell-banker-web` → Absorber en web Next.js de BotOrbe
- Las páginas de `coldwell-banker-web` (expedientes, documentos, mandatos) se convierten en rutas nuevas dentro del Next.js de BotOrbe
- Los componentes de React (Vite) se redesarrollan como componentes Next.js, conectando a los nuevos endpoints de la API unificada

#### 3.2 — `coldwell-banker-mobile` → Mantener como cliente separado pero con una sola API
- La app Expo ya consume `coldwell-banker-api`. Una vez migradas las rutas al backend de BotOrbe, solo hay que redirigir la URL base.
- Agregar pantallas de CRM, Agenda y Reservas al app móvil (aún no existen).

#### 3.3 — `lead_sniper` → Integrar como Módulo M_LeadSniper en BotOrbe
- Lead Sniper ya usa Python y FastAPI (igual que BotOrbe)
- Su DB de PostgreSQL puede migrar las tablas key (`leads`, `competitors`) a Supabase
- Las notificaciones de Telegram del Lead Sniper pasan a usar el mismo bot de Orbe
- Los leads capturados se insertan directamente en la tabla `contacts` de Supabase con `funnel_stage = "Nuevo Lead"`

---

## Estructura Final Propuesta

```
API-inmobiliaria-/
├── orbe-backend/          ← FastAPI Python (BotOrbe actual, expandido)
│   ├── modules/
│   │   ├── m_expedientes.py   ← NUEVO (migrado desde CB-API)
│   │   ├── m_lead_sniper.py   ← NUEVO (migrado desde lead_sniper)
│   │   └── ... (módulos existentes)
│   └── main.py
├── orbe-web/              ← Next.js (BotOrbe web, expandido)
│   └── src/
│       └── app/
│           ├── expedientes/   ← NUEVO (migrado desde CB-web)
│           └── ... (páginas existentes)
├── orbe-mobile/           ← React Native/Expo (CB-mobile, renombrado)
│   └── src/
│       ├── screens/           ← pantallas actuales
│       └── ... (pantallas nuevas CRM/Agenda)
└── README.md
```

---

## Decisiones que Necesito que Confirmes

> [!IMPORTANT]
> **¿Cuáles son los 3 proyectos que querías integrar?**
> Encontré 5 en total. Asumí que son: `coldwell-banker-api`, `BotOrbe`, y `lead_sniper` (con `coldwell-banker-web` y `coldwell-banker-mobile` como satélites de la API). ¿Es correcto?

> [!IMPORTANT]
> **¿BotOrbe es el sistema principal?**
> Mi propuesta usa BotOrbe (Orbe) como núcleo porque ya tiene la mayor cantidad de funcionalidades completas (14 módulos). ¿Estás de acuerdo con esta decisión?

> [!WARNING]
> **¿Querés migrar la DB de `coldwell-banker-api` (Prisma/SQLite) a Supabase?**
> Los datos de expedientes, usuarios y mandatos actuales habría que migrarlos manualmente. ¿Ya hay datos en producción o es un sistema nuevo sin datos reales todavía?

> [!WARNING]
> **¿Querés mantener la app móvil (Expo)?**
> Actualmente solo cubre expedientes/mandatos. ¿Val la pena expandirla para incluir CRM, Agenda y Reservas, o preferís que todo sea web para simplificar?

> [!CAUTION]
> **Lead Sniper y scraping de Instagram**
> El propio FUNCIONALIDADES.md de Orbe dice "No integra Lead Sniper — diferido". ¿Es una decisión de producto o simplemente no se hizo todavía? Integrar el scraping implica mantenimiento constante (bloqueos de cuentas, cambios en Instagram).

---

## Orden de Ejecución (una vez aprobado el plan)

1. **Unificar autenticación** — un solo sistema de login para web, mobile y bot
2. **Migrar tablas de CB-API a Supabase** — expedientes, documentos, historial
3. **Agregar M_Expedientes al backend Python** — flujo de revisión multi-rol
4. **Migrar páginas de CB-web al Next.js de BotOrbe** — expedientes, documentos, mandatos
5. **Integrar Lead Sniper a Supabase + Orbe bot** — tabla contacts + notificaciones Telegram
6. **Actualizar URL base del mobile** — apuntar al nuevo backend unificado
7. **Expandir app mobile** — pantallas CRM, Agenda (opcional)

---

## Verificación Final

- [ ] Login único funciona en web, mobile y Telegram
- [ ] Expedientes se crean desde web/mobile y son visibles en Orbe
- [ ] Leads de Instagram aparecen en el CRM de Orbe como "Nuevo Lead"
- [ ] El brokers ve dashboard unificado de actividad, KPIs y expedientes
- [ ] móvil accede a todas las funciones sin apps separadas
