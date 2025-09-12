/**
 * Shared type definitions for dental portal extraction
 */

// ============= Patient Types =============

export interface Patient {
  subscriberId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

export interface PatientInfo extends Patient {
  subscriberName?: string;
  groupNumber?: string;
  network?: string;
  planName?: string;
  relationship?: string;
}

// ============= CDT Code Types =============

export interface CDTCode {
  code: string;
  description: string;
  toothNumber?: string;
  serviceDate: string;
  provider?: string;
  amountBilled?: number;
  amountPaid?: number;
  patientPay?: number;
}

// ============= Claims Types =============

export interface Claim {
  number: string;
  serviceDate: string;
  status: string;
  patientName: string;
  patientId?: string;
  dateOfBirth?: string;
  providerName?: string;
  tin?: string;
  billed: number;
  paid: number;
  patientPay?: number;
  services: CDTCode[];
  detailUrl?: string;
  link?: string;
}

export interface ClaimDetail {
  totalBilled?: number;
  totalPaid?: number;
  totalPatientPay?: number;
  payment?: number;
  services: CDTCode[];
  detailUrl?: string;
}

// ============= Eligibility Types =============

export interface Deductible {
  total: number | null;
  met: number | null;
  remaining: number | null;
}

export interface Maximum {
  total: number | null;
  used: number | null;
  remaining: number | null;
}

export interface Eligibility {
  patient?: PatientInfo;
  deductibles?: {
    individual?: Deductible;
    family?: Deductible;
  };
  maximums?: {
    annual?: Maximum;
    orthodontics?: Maximum;
    lifetime?: Maximum;
  };
  network?: string;
  planName?: string;
  planType?: string;
  
  // Legacy fields for backward compatibility
  annualMaximum?: number | null;
  annualMaximumUsed?: number | null;
  annualMaximumRemaining?: number | null;
  deductible?: number | null;
  deductibleMet?: number | null;
  orthodonticsRemaining?: number | null;
  orthodonticsMax?: number | null;
}

// ============= Summary Types =============

export interface ExtractionSummary {
  patientName: string;
  memberId: string;
  planMaximum: string | number;
  maximumUsed: string | number;
  maximumRemaining: string | number;
  deductible: string | number;
  deductibleMet: string | number;
  deductibleRemaining?: string | number;
  network: string;
}

// ============= Result Types =============

export interface ExtractionResult {
  success: boolean;
  summary?: ExtractionSummary;
  eligibility?: Eligibility;
  claims?: Claim[];
  patient?: PatientInfo;
  error?: string;
  timestamp?: string;
}

// ============= Portal Types =============

export type PortalType = 'DNOA' | 'DentaQuest' | 'MetLife' | 'Cigna' | 'Aetna' | 'UnitedHealthcare';

export interface PortalCredentials {
  username: string;
  password: string;
}

export interface PortalTestData {
  firstName: string;
  lastName: string;
  subscriberId: string;
  dateOfBirth: string;
}

// ============= API Types =============

export interface ExtractionRequest {
  portal: PortalType;
  subscriberId: string;
  dateOfBirth: string;
  firstName: string;
  lastName: string;
}

export interface ExtractionResponse {
  success: boolean;
  data?: ExtractionResult;
  error?: string;
}

// ============= Event Types (for SSE) =============

export interface LogEvent {
  message: string;
  timestamp: string;
  level?: 'info' | 'warning' | 'error';
}

export interface OTPEvent {
  required: boolean;
  message?: string;
}

// ============= Utility Types =============

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};