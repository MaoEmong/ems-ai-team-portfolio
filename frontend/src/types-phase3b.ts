import type { Department, Position } from "./types";

export interface JobTitle { id: number; name: string; description?: string }
export interface PersonRef { id: number; employeeNo: string; name: string }
export interface ActorRef { id: number; name: string }
export interface Organization {
  departments: { id: number; name: string; parentId: number | null }[];
  employees: (PersonRef & { department: {id:number;name:string}; position: Position; jobTitle: JobTitle | null; onLeave: boolean })[];
}
export interface SalarySetting { employeeId: number; baseSalary: number; allowance: number; formulaVersion: string; deductionRates: number[] }
export interface PayrollMonth {
  month: string; status: "DRAFT" | "CONFIRMED"; count: number;
  generatedAt: string; generatedBy: ActorRef; confirmedAt: string | null; confirmedBy: ActorRef | null;
  allowedActions: ("RECALCULATE" | "CONFIRM")[];
}
export interface Payslip {
  id: number; month: string; status: "DRAFT" | "CONFIRMED"; employee: PersonRef;
  department: Pick<Department,"id"|"name">; position: Position; jobTitle: JobTitle | null;
  baseSalary: number; allowance: number; grossPay: number;
  deductions: {name:string;rateBps:number;amount:number}[];
  totalDeductions: number; netPay: number; formulaVersion: string;
  generatedAt: string; generatedBy: ActorRef; confirmedAt: string | null; confirmedBy: ActorRef | null; demoNotice: string;
}
export interface PayrollDetail { payroll: PayrollMonth; payslips: Payslip[] }
export interface EvaluationItem { id: number; name: string; sortOrder: number }
export interface EvaluationCycle {
  id:number; name:string; startDate:string; endDate:string; status:"DRAFT"|"OPEN"|"CLOSED";
  items:EvaluationItem[]; assignments:{employeeId:number;reviewerId:number}[];
  allowedActions:("EDIT"|"OPEN"|"CLOSE")[];
}
export interface EvaluationAnswer { itemId:number; score:number|null; comment?:string|null }
export interface EvaluationSummary {
  id:number; cycle:Pick<EvaluationCycle,"id"|"name"|"status"|"startDate"|"endDate">;
  employee:PersonRef; reviewer:PersonRef;
  state:"SELF_DRAFT"|"SELF_SUBMITTED"|"MANAGER_DRAFT"|"FINALIZED";
  incomplete:boolean;
  allowedActions:("SAVE_SELF"|"SUBMIT_SELF"|"SAVE_MANAGER"|"SUBMIT_MANAGER"|"REASSIGN_REVIEWER")[];
}
// v1.1 cycle detail uses public identity references instead of raw assignment IDs.
export interface EvaluationAssignmentSummary {
  evaluationId: number | null;
  employee: PersonRef;
  reviewer: PersonRef;
  state: EvaluationSummary["state"] | null;
  incomplete: boolean;
  allowedActions: "REASSIGN_REVIEWER"[];
}
export interface EvaluationCycleDetail extends Omit<EvaluationCycle,"assignments"> {
  assignments: EvaluationAssignmentSummary[];
}
export interface EvaluationDetail extends EvaluationSummary {
  items:EvaluationItem[]; selfAnswers:EvaluationAnswer[];
  // Privacy contract: these keys are absent from an unfinalized subject response.
  managerAnswers?:EvaluationAnswer[]; finalScore?:number; grade?:string;
}
export const DEMO_PAY_NOTICE = "포트폴리오용 데모 급여 — 실제 세법·4대보험 산정 아님";
