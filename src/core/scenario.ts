/**
 * #39's "safe place to think" — a frozen, editable copy of just the
 * plan-shaping arrays. `planFor` goes through the exact same `buildPlan`
 * the real Money screen uses (via a synthetic AppData), on purpose: two
 * implementations of the plan maths would diverge, and the divergence
 * would be silent.
 */
import type { AppData, Bill, Envelope, Goal, ID, Income, Scenario } from './types'
import { buildPlan, type Plan } from './budget'
import { emptyData } from './seed'
import { todayKey } from './dates'
import { uid } from './store'

export const SCENARIO_CAP = 10
export const SCENARIO_STALE_DAYS = 60

/** A real, independent copy — editing the scenario must never touch the live arrays it was cloned from. */
function clonePlan(data: AppData): Scenario['data'] {
  return {
    incomes: structuredClone(data.incomes),
    bills: structuredClone(data.bills),
    envelopes: structuredClone(data.envelopes),
    goals: structuredClone(data.goals),
  }
}

export function scenarioFrom(data: AppData, label: string): Scenario {
  return { id: uid(), label: label.trim() || 'Untitled scenario', createdAt: todayKey(), data: clonePlan(data) }
}

/** Pushes a new scenario, pruning the oldest past SCENARIO_CAP — the largest storage consumer here if left unchecked. */
export function addScenario(data: AppData, scenario: Scenario): void {
  const next = [...data.scenarios, scenario].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  data.scenarios = next.slice(-SCENARIO_CAP)
}

/** The same buildPlan the real Money screen uses, fed a synthetic AppData built from the scenario's copy — expenses stay empty on purpose (a scenario has no history of its own, only a plan). */
export function planFor(s: Scenario): Plan {
  const synthetic: AppData = { ...emptyData(), ...s.data, expenses: [] }
  return buildPlan(synthetic)
}

export interface PlanDelta {
  key: keyof Plan
  from: number
  to: number
  delta: number
}

export function comparePlans(a: Plan, b: Plan): PlanDelta[] {
  return (Object.keys(a) as (keyof Plan)[]).map((key) => ({ key, from: a[key], to: b[key], delta: b[key] - a[key] }))
}

export function scenarioAge(s: Scenario, today = todayKey()): number {
  return Math.round((new Date(today).getTime() - new Date(s.createdAt).getTime()) / 86_400_000)
}

export function isStale(s: Scenario, today = todayKey()): boolean {
  return scenarioAge(s, today) > SCENARIO_STALE_DAYS
}

/** Replaces the real plan-shaping arrays with the scenario's copy. Call via `store.update(d => commitScenario(d, id))` — that already pushes an undo snapshot before mutating, same as everything else. */
export function commitScenario(data: AppData, id: ID): AppData {
  const s = data.scenarios.find((x) => x.id === id)
  if (!s) return data
  data.incomes = structuredClone(s.data.incomes)
  data.bills = structuredClone(s.data.bills)
  data.envelopes = structuredClone(s.data.envelopes)
  data.goals = structuredClone(s.data.goals)
  return data
}

/* ── Scenario-scoped mutators — operate on one scenario's copy, never the live arrays ── */

function withScenario(data: AppData, id: ID, fn: (s: Scenario) => void): void {
  const s = data.scenarios.find((x) => x.id === id)
  if (s) fn(s)
}

export function addIncome(data: AppData, id: ID, income: Income): void {
  withScenario(data, id, (s) => s.data.incomes.push(income))
}
export function updateIncome(data: AppData, id: ID, incomeId: ID, patch: Partial<Income>): void {
  withScenario(data, id, (s) => Object.assign(s.data.incomes.find((i) => i.id === incomeId) ?? {}, patch))
}
export function removeIncome(data: AppData, id: ID, incomeId: ID): void {
  withScenario(data, id, (s) => { s.data.incomes = s.data.incomes.filter((i) => i.id !== incomeId) })
}

export function addBill(data: AppData, id: ID, bill: Bill): void {
  withScenario(data, id, (s) => s.data.bills.push(bill))
}
export function updateBill(data: AppData, id: ID, billId: ID, patch: Partial<Bill>): void {
  withScenario(data, id, (s) => Object.assign(s.data.bills.find((b) => b.id === billId) ?? {}, patch))
}
export function removeBill(data: AppData, id: ID, billId: ID): void {
  withScenario(data, id, (s) => { s.data.bills = s.data.bills.filter((b) => b.id !== billId) })
}

export function addEnvelope(data: AppData, id: ID, env: Envelope): void {
  withScenario(data, id, (s) => s.data.envelopes.push(env))
}
export function updateEnvelope(data: AppData, id: ID, envelopeId: ID, patch: Partial<Envelope>): void {
  withScenario(data, id, (s) => Object.assign(s.data.envelopes.find((e) => e.id === envelopeId) ?? {}, patch))
}
export function removeEnvelope(data: AppData, id: ID, envelopeId: ID): void {
  withScenario(data, id, (s) => { s.data.envelopes = s.data.envelopes.filter((e) => e.id !== envelopeId) })
}

export function addGoal(data: AppData, id: ID, goal: Goal): void {
  withScenario(data, id, (s) => s.data.goals.push(goal))
}
export function updateGoal(data: AppData, id: ID, goalId: ID, patch: Partial<Goal>): void {
  withScenario(data, id, (s) => Object.assign(s.data.goals.find((g) => g.id === goalId) ?? {}, patch))
}
export function removeGoal(data: AppData, id: ID, goalId: ID): void {
  withScenario(data, id, (s) => { s.data.goals = s.data.goals.filter((g) => g.id !== goalId) })
}

export function removeScenario(data: AppData, id: ID): void {
  data.scenarios = data.scenarios.filter((s) => s.id !== id)
}

export function renameScenario(data: AppData, id: ID, label: string, note?: string): void {
  withScenario(data, id, (s) => {
    s.label = label.trim() || s.label
    s.note = note
  })
}
